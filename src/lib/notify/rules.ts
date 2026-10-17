import { formatJstDay, formatJstTime } from "@/lib/time";

// Who hears about an event, and what it says (requirements N1). Pure so it can be tested without
// a database: lib/notify/index.ts loads the event and the members and records what this returns.
// Event types without a rule yet produce no notifications; each milestone adds its own.

export type ActivityEvent = {
  id: string;
  type: string;
  actor_id: string | null;
  payload: Record<string, unknown>;
};

export type MemberName = { id: string; display_name: string };

export type NotificationDraft = {
  recipientId: string;
  title: string;
  body: string;
  /** Opened when the notification is tapped. Same-site path. */
  url: string;
  /** Stays on screen until tapped (requireInteraction) because the recipient has to act. */
  requiresAction: boolean;
};

type Rule = (event: ActivityEvent, members: MemberName[]) => NotificationDraft[];

const nameOf = (members: MemberName[], id: unknown) =>
  members.find((member) => member.id === id)?.display_name ?? "メンバー";

const everyoneExcept = (members: MemberName[], ...ids: unknown[]) =>
  members.filter((member) => !ids.includes(member.id));

const text = (value: unknown) => (typeof value === "string" ? value : "");

/** "500 円" or, during the trial week, "本番なら 500 円". */
const yen = (payload: Record<string, unknown>) => {
  const points = Number(payload.points ?? 0);
  return payload.waived === "trial" ? `お試し期間なので本番なら ${points.toLocaleString()} 円` : `${points.toLocaleString()} 円`;
};

const period = (payload: Record<string, unknown>) =>
  `${formatJstDay(text(payload.start_date))}〜${formatJstDay(text(payload.end_date))}`;

/** "4 時間 12 分" / "35 分". */
function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} 時間 ${minutes % 60} 分` : `${minutes} 分`;
}

function draft(recipients: MemberName[], title: string, body: string, url: string, requiresAction = false) {
  return recipients.map((member) => ({ recipientId: member.id, title, body, url, requiresAction }));
}

const RULES: Record<string, Rule> = {
  member_joined: (event, members) => {
    const name = nameOf(members, event.actor_id);
    const inviter = event.payload.invited_by;
    return everyoneExcept(members, event.actor_id).map((member) => ({
      recipientId: member.id,
      title: `${name} さんが参加しました`,
      body: typeof inviter === "string" ? `${nameOf(members, inviter)} さんの招待です` : "",
      url: "/",
      requiresAction: false,
    }));
  },

  // --- Declarations (F3, F3b) -------------------------------------------------------------
  declared: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが宣言しました`,
      `「${text(event.payload.declaration)}」（締切 ${formatJstTime(text(event.payload.target_end_time))}）`,
      "/",
    ),

  declaration_flagged: (event, members) => {
    const owner = event.payload.owner_id;
    const flagger = nameOf(members, event.actor_id);
    const comment = text(event.payload.comment);
    return [
      ...draft(
        members.filter((member) => member.id === owner),
        `${flagger} さんが「軽すぎる」と指摘しました`,
        `${comment} ／ ${formatJstTime(text(event.payload.revision_due_at))} までに書き直してください`,
        "/declare",
        true,
      ),
      ...draft(
        everyoneExcept(members, owner, event.actor_id),
        `${flagger} さんが ${nameOf(members, owner)} さんの宣言に指摘しました`,
        comment,
        "/",
      ),
    ];
  },

  declaration_revised: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが宣言を書き直しました`,
      `「${text(event.payload.declaration)}」`,
      "/",
    ),

  reminder_revision_due: (event, members) =>
    draft(
      members.filter((member) => member.id === event.actor_id),
      "書き直しの期限まであと 15 分",
      "書き直さないと宣言なしになり、ペナルティが付きます",
      "/declare",
      true,
    ),

  revision_expired: (event, members) =>
    draft(members, `${nameOf(members, event.actor_id)} さんが宣言を書き直しませんでした`, yen(event.payload), "/"),

  // --- Submissions and AI judgement (F4b, F5) ---------------------------------------------
  submitted: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが提出しました`,
      `宣言から ${duration(Number(event.payload.elapsed_minutes ?? 0))}`,
      "/",
    ),

  judged_passed: (event, members) => {
    if (event.payload.kind === "resend") return [];
    const name = nameOf(members, event.actor_id);
    const until = formatJstTime(text(event.payload.dispute_window_ends_at));
    return [
      ...draft(
        members.filter((member) => member.id === event.actor_id),
        `合格しました（${event.payload.score} 点）`,
        `${until} まで「怪しい」がなければ達成で確定します`,
        "/submit",
      ),
      ...draft(
        everyoneExcept(members, event.actor_id),
        `${name} さんが合格しました（${event.payload.score} 点）`,
        `怪しければ ${until} までに指摘できます`,
        "/",
      ),
    ];
  },

  judged_rejected: (event, members) => {
    if (event.payload.kind === "resend") return [];
    const name = nameOf(members, event.actor_id);
    const left = Number(event.payload.attempts_left ?? 0);
    const reason = event.payload.passphrase_found === false ? "合言葉が見つかりませんでした。" : "";
    return [
      ...draft(
        members.filter((member) => member.id === event.actor_id),
        `不合格でした（${event.payload.score} 点）`,
        `${reason}${text(event.payload.feedback)} ／ ${
          left > 0 ? `残り ${left} 回（締切 ${formatJstTime(text(event.payload.deadline))}）` : "今日の提出回数を使い切りました"
        }`,
        "/submit",
        left > 0,
      ),
      ...draft(
        everyoneExcept(members, event.actor_id),
        `${name} さんの提出は不合格（${event.payload.score} 点）`,
        left > 0 ? `残り ${left} 回` : "提出回数を使い切りました",
        "/",
      ),
    ];
  },

  // --- Rest days (F2) ---------------------------------------------------------------------
  rest_day_registered: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが ${formatJstDay(text(event.payload.date))} を休息日にしました`,
      "",
      "/",
    ),

  // --- Leave (F2b) ------------------------------------------------------------------------
  leave_requested: (event, members) => {
    const reviewers = Array.isArray(event.payload.reviewer_ids) ? event.payload.reviewer_ids : [];
    return draft(
      members.filter((member) => reviewers.includes(member.id)),
      `${nameOf(members, event.actor_id)} さんが ${period(event.payload)} の休会を申請しました`,
      `${text(event.payload.reason)}（今日 ${formatJstTime(text(event.payload.review_due_at))} までに審査してください）`,
      "/leave",
      true,
    );
  },

  review_vote_cast: (event, members) => {
    if (event.payload.subject_type !== "leave") return [];
    const verdict = event.payload.verdict === "accept" ? "承認" : "却下";
    return draft(
      members.filter((member) => member.id === event.payload.owner_id),
      `${nameOf(members, event.actor_id)} さんが休会を${verdict}しました（${event.payload.accepted}/${event.payload.total}）`,
      text(event.payload.comment),
      "/leave",
    );
  },

  leave_approved: (event, members) =>
    draft(members, `${nameOf(members, event.actor_id)} さんの休会が決まりました`, period(event.payload), "/leave"),

  leave_rejected: (event, members) =>
    draft(
      members,
      `${nameOf(members, event.actor_id)} さんの休会は不成立でした`,
      event.payload.expired ? "期限までに全員の承認がそろいませんでした" : "却下されました",
      "/leave",
    ),

  leave_cancelled: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが休会を取りやめました`,
      `${formatJstDay(text(event.payload.cancelled_from))} からは通常どおりです`,
      "/leave",
    ),
};

export function draftNotifications(event: ActivityEvent, members: MemberName[]): NotificationDraft[] {
  return RULES[event.type]?.(event, members) ?? [];
}
