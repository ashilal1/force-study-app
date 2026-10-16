-- Core schema. Design notes: docs/database.md
-- Points are integer yen (1pt = 1円). All "dates" are JST calendar dates.

create extension if not exists pg_trgm with schema extensions;

-- Internal helpers live outside the API-exposed public schema.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

-- ---------------------------------------------------------------------------
-- Time helpers (JST)
-- ---------------------------------------------------------------------------

create function private.jst_today()
returns date
language sql
stable
set search_path = ''
as $$
  select (now() at time zone 'Asia/Tokyo')::date;
$$;

-- JST calendar date + wall-clock time -> absolute timestamp. Every deadline is computed with this.
create function private.day_at(d date, t time)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select (d + t) at time zone 'Asia/Tokyo';
$$;

-- Trial ends at the first Sunday 00:00 JST after `ts` (a Sunday sign-up gets the following Sunday).
create function private.trial_end_for(ts timestamptz)
returns timestamptz
language sql
stable
set search_path = ''
as $$
  select private.day_at(
    (ts at time zone 'Asia/Tokyo')::date + (7 - extract(dow from (ts at time zone 'Asia/Tokyo')::date)::int),
    time '00:00'
  );
$$;

-- ---------------------------------------------------------------------------
-- Group settings (single row)
-- ---------------------------------------------------------------------------

create table public.group_settings (
  id boolean primary key default true check (id),
  declaration_cutoff time not null default '12:00',
  last_declaration_reminder time not null default '11:00',
  submit_deadline_max time not null default '21:00',
  dispute_cutoff time not null default '22:00',
  resend_cutoff time not null default '23:00',
  report_deadline time not null default '23:00',
  review_deadline time not null default '23:59',
  report_reminder_times time[] not null default '{22:00,22:45}',
  review_reminder_times time[] not null default '{22:00,23:00,23:30}',
  rest_days_per_week int not null default 1 check (rest_days_per_week >= 0),
  passing_score int not null default 70 check (passing_score between 0 and 100),
  max_attempts int not null default 3 check (max_attempts >= 1),
  judge_grace_minutes int not null default 60 check (judge_grace_minutes >= 0),
  flag_window_hours int not null default 3 check (flag_window_hours >= 0),
  revision_minutes int not null default 60 check (revision_minutes > 0),
  dispute_window_hours int not null default 3 check (dispute_window_hours >= 0),
  resend_minutes int not null default 60 check (resend_minutes > 0),
  penalty_no_declaration int not null default 500 check (penalty_no_declaration >= 0),
  penalty_slacked int not null default 700 check (penalty_slacked >= 0),
  penalty_unrealistic_streak int not null default 500 check (penalty_unrealistic_streak >= 0),
  unrealistic_streak_threshold int not null default 4 check (unrealistic_streak_threshold >= 1),
  penalty_excuse_rejected int not null default 500 check (penalty_excuse_rejected >= 0),
  penalty_unrevised int not null default 500 check (penalty_unrevised >= 0),
  penalty_late_payment int not null default 500 check (penalty_late_payment >= 0),
  penalty_fake_evidence int not null default 200 check (penalty_fake_evidence >= 0),
  min_explanation_chars int not null default 30 check (min_explanation_chars >= 0),
  settlement_weekday int not null default 6 check (settlement_weekday between 0 and 6),
  settlement_time time not null default '23:59',
  image_retention_days int not null default 60 check (image_retention_days >= 1),
  storage_soft_limit_mb int not null default 800 check (storage_soft_limit_mb > 0),
  updated_at timestamptz not null default now()
);

insert into public.group_settings default values;

-- ---------------------------------------------------------------------------
-- Members
-- ---------------------------------------------------------------------------

-- No ON DELETE CASCADE anywhere: history must survive (ADR-020). Members are deactivated, never deleted.
create table public.profiles (
  id uuid primary key references auth.users (id),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 30),
  avatar_url text,
  paypay_link text check (paypay_link is null or paypay_link ~ '^https://'),
  payee_id uuid references public.profiles (id),
  is_admin boolean not null default false,
  trial_ends_at timestamptz not null,
  notifications_verified_at timestamptz,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  check (payee_id is null or payee_id <> id)
);

-- Anyone with a Google account can create an auth user, but only people who entered the invite
-- code have a profile, and only profiles count as members (ADR-025).
create function private.is_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and deactivated_at is null
  );
$$;

-- Called by the join Server Action after it has checked the invite code. The first member is admin.
create function public.join_group(p_user_id uuid, p_display_name text, p_avatar_url text)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  joined public.profiles;
begin
  perform pg_advisory_xact_lock(hashtext('join_group'));

  select * into joined from public.profiles where id = p_user_id;
  if found then
    return joined;
  end if;

  insert into public.profiles (id, display_name, avatar_url, is_admin, trial_ends_at)
  values (
    p_user_id,
    btrim(p_display_name),
    p_avatar_url,
    not exists (select 1 from public.profiles),
    private.trial_end_for(now())
  )
  returning * into joined;

  return joined;
end;
$$;

create table public.rest_days (
  user_id uuid not null references public.profiles (id),
  date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, date)
);

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  start_date date not null,
  end_date date not null,
  reason text not null,
  status text not null default 'under_review'
    check (status in ('under_review', 'approved', 'rejected', 'cancelled')),
  review_due_at timestamptz not null,
  approved_at timestamptz,
  resolved_at timestamptz,
  cancelled_from date,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  check ((status = 'approved') = (approved_at is not null) or status = 'cancelled')
);

-- ---------------------------------------------------------------------------
-- Study days
-- ---------------------------------------------------------------------------

create table public.study_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  date date not null,
  status text not null
    check (status in ('pending', 'passed', 'completed', 'missed', 'no_declaration', 'invalidated')),
  declaration text,
  target_end_time timestamptz,
  passphrase text,
  original_declaration text,
  revision_due_at timestamptz,
  revised_at timestamptz,
  declared_at timestamptz,
  passed_at timestamptz,
  dispute_window_ends_at timestamptz,
  completed_at timestamptz,
  missed_at timestamptz,
  invalidated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, date),
  unique (id, user_id),
  -- Every status except "no declaration" has a full declaration. (A P6 log keeps its declaration text.)
  check (
    status = 'no_declaration'
    or (declaration is not null and target_end_time is not null and passphrase is not null and declared_at is not null)
  ),
  check (target_end_time is null or declared_at is null or target_end_time > declared_at),
  check (status not in ('passed', 'completed') or (passed_at is not null and dispute_window_ends_at is not null)),
  check (status <> 'completed' or completed_at is not null),
  check (status <> 'missed' or missed_at is not null),
  check (status <> 'invalidated' or invalidated_at is not null),
  check (original_declaration is null or revision_due_at is not null)
);

create index study_logs_date_idx on public.study_logs (date);
create index study_logs_open_idx on public.study_logs (status) where status in ('pending', 'passed');
create index study_logs_declaration_trgm_idx on public.study_logs using gin (declaration extensions.gin_trgm_ops);

create table public.declaration_flags (
  study_log_id uuid not null references public.study_logs (id),
  flagger_id uuid not null references public.profiles (id),
  comment text not null check (char_length(btrim(comment)) > 0),
  created_at timestamptz not null default now(),
  primary key (study_log_id, flagger_id)
);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  study_log_id uuid not null,
  user_id uuid not null,
  kind text not null check (kind in ('regular', 'resend')),
  attempt_no int check (attempt_no >= 1),
  image_paths text[] not null,
  thumb_path text,
  learned_text text,
  struggled_text text,
  explanation text,
  self_rating int check (self_rating between 1 and 5),
  status text not null default 'judging' check (status in ('judging', 'passed', 'rejected', 'error')),
  reject_reason text check (reject_reason in ('no_passphrase', 'low_score')),
  ai_score int check (ai_score between 0 and 100),
  ai_passphrase_found boolean,
  ai_feedback text,
  ai_model text,
  judge_error text,
  elapsed_minutes int check (elapsed_minutes >= 0),
  submitted_at timestamptz not null default now(),
  judged_at timestamptz,
  images_purged_at timestamptz,
  foreign key (study_log_id, user_id) references public.study_logs (id, user_id),
  unique (study_log_id, attempt_no),
  check ((kind = 'regular') = (attempt_no is not null)),
  check (kind <> 'regular' or (learned_text is not null and struggled_text is not null and self_rating is not null)),
  -- 1-3 images while stored; emptied when purged after the retention period.
  check (cardinality(image_paths) between 1 and 3 or images_purged_at is not null),
  check ((status = 'rejected') = (reject_reason is not null))
);

create index submissions_study_log_idx on public.submissions (study_log_id);
create index submissions_pending_judge_idx on public.submissions (submitted_at) where status in ('judging', 'error');
create index submissions_learned_trgm_idx on public.submissions using gin (learned_text extensions.gin_trgm_ops);
create index submissions_struggled_trgm_idx on public.submissions using gin (struggled_text extensions.gin_trgm_ops);

create table public.submission_flags (
  study_log_id uuid not null references public.study_logs (id),
  flagger_id uuid not null references public.profiles (id),
  comment text not null check (char_length(btrim(comment)) > 0),
  created_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  primary key (study_log_id, flagger_id)
);

create table public.submission_disputes (
  study_log_id uuid primary key references public.study_logs (id),
  status text not null default 'resending'
    check (status in ('resending', 'final_review', 'upheld', 'invalidated')),
  first_flagged_at timestamptz not null default now(),
  resend_due_at timestamptz not null,
  review_due_at timestamptz,
  resolved_at timestamptz,
  check (status <> 'final_review' or review_due_at is not null),
  check ((status in ('upheld', 'invalidated')) = (resolved_at is not null))
);

create table public.failure_reports (
  study_log_id uuid primary key,
  user_id uuid not null,
  status text not null default 'awaiting_report'
    check (status in ('awaiting_report', 'under_review', 'resolved')),
  category text check (category in ('unrealistic', 'slacked', 'sudden_plan', 'other', 'not_reported')),
  reason_text text,
  next_plan_text text,
  unrealistic_streak int check (unrealistic_streak >= 1),
  report_due_at timestamptz not null,
  reported_at timestamptz,
  review_due_at timestamptz,
  outcome text check (outcome in ('no_penalty', 'penalized')),
  resolved_at timestamptz,
  foreign key (study_log_id, user_id) references public.study_logs (id, user_id),
  check ((status = 'awaiting_report') = (category is null)),
  check (category <> 'unrealistic' or (next_plan_text is not null and unrealistic_streak is not null)),
  check (category not in ('sudden_plan', 'other') or reason_text is not null),
  check (status <> 'under_review' or review_due_at is not null),
  check ((status = 'resolved') = (outcome is not null and resolved_at is not null))
);

-- Shared by excuse reviews, leave reviews and the final review of a dispute.
-- subject_id points at study_logs (excuse, dispute) or leave_requests (leave); the RPC that opens
-- the review keeps it consistent, so there is no foreign key.
create table public.peer_reviews (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('excuse', 'leave', 'dispute')),
  subject_id uuid not null,
  reviewer_id uuid not null references public.profiles (id),
  verdict text check (verdict in ('accept', 'reject')),
  comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (subject_type, subject_id, reviewer_id),
  check ((verdict is null) = (decided_at is null)),
  -- Rejecting a dispute must say why.
  check (subject_type <> 'dispute' or verdict is distinct from 'reject' or char_length(btrim(coalesce(comment, ''))) > 0)
);

create index peer_reviews_subject_idx on public.peer_reviews (subject_type, subject_id);
create index peer_reviews_open_idx on public.peer_reviews (reviewer_id) where verdict is null;

-- ---------------------------------------------------------------------------
-- Money
-- ---------------------------------------------------------------------------

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  debtor_id uuid not null references public.profiles (id),
  payee_id uuid not null references public.profiles (id),
  period_end date not null,
  amount_yen int not null check (amount_yen > 0),
  status text not null default 'open' check (status in ('open', 'sent', 'completed')),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  completed_at timestamptz,
  unique (debtor_id, period_end),
  check (debtor_id <> payee_id),
  check (status <> 'completed' or completed_at is not null)
);

create table public.penalties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  study_log_id uuid references public.study_logs (id),
  late_settlement_id uuid references public.settlements (id),
  dedupe_key text not null unique,
  points int not null check (points > 0),
  reason text not null check (reason in (
    'no_declaration', 'unrevised', 'slacked', 'not_reported', 'unrealistic_streak',
    'excuse_rejected', 'excuse_expired', 'fake_evidence', 'late_payment'
  )),
  waived text check (waived in ('trial')),
  settlement_id uuid references public.settlements (id),
  created_at timestamptz not null default now(),
  check ((reason = 'late_payment') = (late_settlement_id is not null)),
  check (reason = 'late_payment' or study_log_id is not null),
  check (waived is null or settlement_id is null)
);

create index penalties_user_idx on public.penalties (user_id, created_at);
create index penalties_unsettled_idx on public.penalties (user_id) where settlement_id is null and waived is null;

-- ---------------------------------------------------------------------------
-- Timeline, notifications, push
-- ---------------------------------------------------------------------------

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type ~ '^[a-z_]+$'),
  actor_id uuid references public.profiles (id),
  study_log_id uuid references public.study_logs (id),
  submission_id uuid references public.submissions (id),
  settlement_id uuid references public.settlements (id),
  leave_request_id uuid references public.leave_requests (id),
  payload jsonb not null default '{}',
  dedupe_key text unique,
  created_at timestamptz not null default now()
);

create index activity_events_created_idx on public.activity_events (created_at desc);
create index activity_events_actor_idx on public.activity_events (actor_id, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id),
  event_id uuid not null references public.activity_events (id),
  title text not null,
  body text not null default '',
  url text,
  requires_action boolean not null default false,
  read_at timestamptz,
  pushed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (recipient_id, event_id)
);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- ---------------------------------------------------------------------------
-- Retrospective
-- ---------------------------------------------------------------------------

create table public.weekly_reviews (
  user_id uuid not null references public.profiles (id),
  week_end date not null,
  stats jsonb not null,
  ai_summary text,
  ai_model text,
  self_note text,
  created_at timestamptz not null default now(),
  self_note_updated_at timestamptz,
  primary key (user_id, week_end),
  check (extract(dow from week_end) = 6)
);
