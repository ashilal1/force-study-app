-- History is append-only (ADR-020): rows are never deleted, and only state/timestamp columns change.
-- These triggers apply to every role, including service_role. To fix bad data, drop the trigger
-- explicitly in a migration.

create function private.forbid_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'append-only: rows in %.% cannot be deleted', tg_table_schema, tg_table_name
    using errcode = 'P0001';
end;
$$;

-- Trigger arguments name the columns that may change; every other column is frozen.
create function private.restrict_update()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  allowed text[] := coalesce(tg_argv, '{}'::text[]);
begin
  if (to_jsonb(old) - allowed) is distinct from (to_jsonb(new) - allowed) then
    raise exception 'append-only: %.% may only update %', tg_table_schema, tg_table_name, allowed
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'leave_requests', 'study_logs', 'declaration_flags', 'submissions',
    'submission_flags', 'submission_disputes', 'failure_reports', 'peer_reviews',
    'settlements', 'penalties', 'activity_events', 'weekly_reviews'
  ] loop
    execute format(
      'create trigger forbid_delete before delete on public.%I for each row execute function private.forbid_delete()',
      t
    );
    execute format(
      'create trigger forbid_truncate before truncate on public.%I for each statement execute function private.forbid_delete()',
      t
    );
  end loop;
end;
$$;

create trigger restrict_update before update on public.leave_requests
  for each row execute function private.restrict_update('status', 'approved_at', 'resolved_at', 'cancelled_from');

-- `declaration` changes once, on a rewrite; the original is kept in `original_declaration`.
create trigger restrict_update before update on public.study_logs
  for each row execute function private.restrict_update(
    'status', 'declaration', 'original_declaration', 'revision_due_at', 'revised_at', 'passed_at',
    'dispute_window_ends_at', 'completed_at', 'missed_at', 'invalidated_at'
  );

create trigger restrict_update before update on public.declaration_flags
  for each row execute function private.restrict_update();

-- `image_paths` is only emptied when originals are purged; `thumb_path` stays forever.
create trigger restrict_update before update on public.submissions
  for each row execute function private.restrict_update(
    'status', 'reject_reason', 'ai_score', 'ai_passphrase_found', 'ai_feedback', 'ai_model',
    'judge_error', 'judged_at', 'image_paths', 'images_purged_at'
  );

create trigger restrict_update before update on public.submission_flags
  for each row execute function private.restrict_update('withdrawn_at');

create trigger restrict_update before update on public.submission_disputes
  for each row execute function private.restrict_update('status', 'review_due_at', 'resolved_at');

create trigger restrict_update before update on public.failure_reports
  for each row execute function private.restrict_update(
    'status', 'category', 'reason_text', 'next_plan_text', 'unrealistic_streak', 'reported_at',
    'review_due_at', 'outcome', 'resolved_at'
  );

create trigger restrict_update before update on public.peer_reviews
  for each row execute function private.restrict_update('verdict', 'comment', 'decided_at');

create trigger restrict_update before update on public.settlements
  for each row execute function private.restrict_update('status', 'sent_at', 'completed_at');

create trigger restrict_update before update on public.penalties
  for each row execute function private.restrict_update('settlement_id');

create trigger restrict_update before update on public.activity_events
  for each row execute function private.restrict_update();

create trigger restrict_update before update on public.weekly_reviews
  for each row execute function private.restrict_update('ai_summary', 'ai_model', 'self_note', 'self_note_updated_at');

-- Free text written by people is set once and then frozen, even inside the allowed columns.
create function private.freeze_written_text()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'failure_reports' then
    if old.category is not null and (
      new.category is distinct from old.category
      or new.reason_text is distinct from old.reason_text
      or new.next_plan_text is distinct from old.next_plan_text
    ) then
      raise exception 'append-only: a filed report cannot be changed' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'peer_reviews' then
    if old.verdict is not null then
      raise exception 'append-only: a cast vote cannot be changed' using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'study_logs' then
    if old.original_declaration is not null and new.declaration is distinct from old.declaration then
      raise exception 'append-only: a declaration can be rewritten only once' using errcode = 'P0001';
    end if;
    if old.declaration is not null and new.declaration is distinct from old.declaration
       and new.original_declaration is distinct from old.declaration then
      raise exception 'append-only: rewriting a declaration must keep the original' using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;

create trigger freeze_written_text before update on public.failure_reports
  for each row execute function private.freeze_written_text();
create trigger freeze_written_text before update on public.peer_reviews
  for each row execute function private.freeze_written_text();
create trigger freeze_written_text before update on public.study_logs
  for each row execute function private.freeze_written_text();
