import { SETTING_FIELDS } from "@/lib/group-settings";
import { RANKS, TITLES, type TitleId } from "@/lib/standing/rules";
import { formatJstDateTime, formatJstDay, formatJstTime } from "@/lib/time";

// Who hears about an event, and what it says (requirements N1). Pure so it can be tested without
// a database: lib/notify/index.ts loads the event and the members and records what this returns.
// Event types without a rule yet produce no notifications; each milestone adds its own.

export type ActivityEvent = {
  id: string;
  type: string;
  actor_id: string | null;
  study_log_id?: string | null;
  payload: Record<string, unknown>;
  /** The event's study_logs row is a makeup session (補習, F8b), not a study day. Set by the loader. */
  makeup?: boolean;
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

/** The member the event is about (actor), e.g. for their own reminders. */
const self = (members: MemberName[], event: ActivityEvent) => members.filter((member) => member.id === event.actor_id);

const reportUrl = (event: ActivityEvent) => (event.study_log_id ? `/reports/${event.study_log_id}` : "/");

const logUrl = (event: ActivityEvent) => (event.study_log_id ? `/logs/${event.study_log_id}` : "/");

const MAKEUP_URL = "/makeup";

/** Where the member acts on their own day ("/declare", "/submit") or makeup session ("/makeup"). */
const ownUrl = (event: ActivityEvent, dayUrl: string) => (event.makeup ? MAKEUP_URL : dayUrl);

/** "提出" or "補習の提出". */
const submissionWord = (event: ActivityEvent) => (event.makeup ? "補習の提出" : "提出");

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

  // --- Groups (M10) ------------------------------------------------------------------------
  group_renamed: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `グループ名が「${text(event.payload.name)}」になりました`,
      `${nameOf(members, event.actor_id)} さんが変えました`,
      "/settings",
    ),

  admin_changed: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      event.payload.is_admin
        ? `${nameOf(members, event.payload.user_id)} さんが管理者になりました`
        : `${nameOf(members, event.payload.user_id)} さんが管理者ではなくなりました`,
      `${nameOf(members, event.actor_id)} さんが変えました`,
      "/settings",
    ),

  member_left: (event, members) =>
    draft(everyoneExcept(members, event.actor_id), `${nameOf(members, event.actor_id)} さんがグループを退会しました`, "", "/"),

  member_removed: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんがグループから外れました`,
      `${nameOf(members, event.payload.removed_by)} さんが外しました`,
      "/",
    ),

  payee_cleared: (event, members) => {
    const admins = Array.isArray(event.payload.admin_ids) ? event.payload.admin_ids : [];
    const former = nameOf(members, event.payload.former_payee_id);
    return [
      ...draft(self(members, event), "支払先がいなくなりました", `${former} さんが抜けたので、管理者に新しい支払先を決めてもらってください`, "/settlements"),
      ...draft(
        members.filter((member) => admins.includes(member.id) && member.id !== event.actor_id),
        `${nameOf(members, event.actor_id)} さんの支払先を決めてください`,
        `${former} さんが抜けたので、支払先が空になりました`,
        "/settlements",
        true,
      ),
    ];
  },

  // --- Declarations (F3, F3b) -------------------------------------------------------------
  declared: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが宣言しました`,
      `「${text(event.payload.declaration)}」（締切 ${formatJstDateTime(text(event.payload.target_end_time))}）`,
      "/",
    ),

  declaration_flagged: (event, members) => {
    const owner = event.payload.owner_id;
    const flagger = nameOf(members, event.actor_id);
    const comment = text(event.payload.comment);
    return [
      ...draft(
        members.filter((member) => member.id === owner),
        event.makeup ? `${flagger} さんが補習の宣言を「軽すぎる」と指摘しました` : `${flagger} さんが「軽すぎる」と指摘しました`,
        `${comment} ／ ${formatJstTime(text(event.payload.revision_due_at))} までに書き直してください`,
        ownUrl(event, "/declare"),
        true,
      ),
      ...draft(
        everyoneExcept(members, owner, event.actor_id),
        `${flagger} さんが ${nameOf(members, owner)} さんの${event.makeup ? "補習の" : ""}宣言に指摘しました`,
        comment,
        "/",
      ),
    ];
  },

  declaration_revised: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが${event.makeup ? "補習の" : ""}宣言を書き直しました`,
      `「${text(event.payload.declaration)}」`,
      "/",
    ),

  reminder_revision_due: (event, members) =>
    draft(
      members.filter((member) => member.id === event.actor_id),
      "書き直しの期限まであと 15 分",
      event.makeup
        ? "書き直さないとこの補習は取り消しになります（借りは減りません）"
        : "書き直さないと宣言なしになり、ペナルティが付きます",
      ownUrl(event, "/declare"),
      true,
    ),

  revision_expired: (event, members) =>
    draft(members, `${nameOf(members, event.actor_id)} さんが宣言を書き直しませんでした`, yen(event.payload), "/"),

  // --- Submissions and AI judgement (F4b, F5) ---------------------------------------------
  submitted: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが${event.makeup ? "補習を" : ""}提出しました`,
      `宣言から ${duration(Number(event.payload.elapsed_minutes ?? 0))}`,
      "/",
    ),

  judged_passed: (event, members) => {
    if (event.payload.kind === "resend") return [];
    const name = nameOf(members, event.actor_id);
    const until = formatJstDateTime(text(event.payload.dispute_window_ends_at));
    return [
      ...draft(
        members.filter((member) => member.id === event.actor_id),
        `${event.makeup ? "補習が" : ""}合格しました（${event.payload.score} 点）`,
        event.makeup
          ? `${until} まで「怪しい」がなければ、補習を 1 回返したことになります`
          : `${until} まで「怪しい」がなければ達成で確定します`,
        ownUrl(event, "/submit"),
      ),
      ...draft(
        everyoneExcept(members, event.actor_id),
        `${name} さん${event.makeup ? "の補習" : ""}が合格しました（${event.payload.score} 点）`,
        `怪しければ ${until} までに指摘できます`,
        "/",
      ),
    ];
  },

  // ADR-033: the AI couldn't judge, so the day passed provisionally and the members check it.
  judged_unverified: (event, members) => {
    const until = formatJstDateTime(text(event.payload.dispute_window_ends_at));
    return [
      ...draft(
        self(members, event),
        "AI が判定できなかったので、仮の合格にしました",
        `${until} までにメンバーが写真を確認します。「怪しい」と言われたら証拠を送り直せます`,
        logUrl(event),
      ),
      ...draft(
        everyoneExcept(members, event.actor_id),
        `${nameOf(members, event.actor_id)} さんの${submissionWord(event)}を確認してください（AI 未判定）`,
        `AI が判定できなかったので仮の合格です。合言葉と内容を見て、おかしければ ${until} までに「怪しい」を`,
        logUrl(event),
        true,
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
        `${event.makeup ? "補習は" : ""}不合格でした（${event.payload.score} 点）`,
        `${reason}${text(event.payload.feedback)} ／ ${
          left > 0
            ? `残り ${left} 回（締切 ${formatJstDateTime(text(event.payload.deadline))}）`
            : event.makeup
              ? "提出回数を使い切りました。この補習は数えられないので、別の日にもう一度宣言してください"
              : "提出回数を使い切りました。宣言の画面で「できなかった」を押して、理由を申告してください"
        }`,
        ownUrl(event, "/submit"),
        left > 0,
      ),
      ...draft(
        everyoneExcept(members, event.actor_id),
        `${name} さんの${submissionWord(event)}は不合格（${event.payload.score} 点）`,
        left > 0 ? `残り ${left} 回` : "提出回数を使い切りました",
        "/",
      ),
    ];
  },

  // --- 「怪しい」 (F5b) -----------------------------------------------------------------------
  submission_flagged: (event, members) => {
    const owner = event.payload.owner_id;
    const flagger = nameOf(members, event.actor_id);
    return [
      ...draft(
        members.filter((member) => member.id === owner),
        `${flagger} さんが「怪しい」と指摘しました`,
        `${text(event.payload.comment)} ／ ${formatJstDateTime(text(event.payload.resend_due_at))} までなら何度でも証拠を送り直せます`,
        logUrl(event),
        true,
      ),
      ...draft(
        everyoneExcept(members, owner, event.actor_id),
        `${flagger} さんが ${nameOf(members, owner)} さんの${submissionWord(event)}に「怪しい」を押しました`,
        text(event.payload.comment),
        logUrl(event),
      ),
    ];
  },

  evidence_resent: (event, members) => {
    const flaggers = Array.isArray(event.payload.flagger_ids) ? event.payload.flagger_ids : [];
    const found = event.payload.passphrase_found ? "合言葉あり" : "合言葉なし";
    return draft(
      members.filter((member) => flaggers.includes(member.id)),
      `${nameOf(members, event.actor_id)} さんが証拠を送り直しました`,
      `AI: ${event.payload.score} 点・${found}。納得したら取り下げてください`,
      logUrl(event),
      true,
    );
  },

  flag_withdrawn: (event, members) =>
    draft(
      members.filter((member) => member.id === event.payload.owner_id),
      `${nameOf(members, event.actor_id)} さんが指摘を取り下げました（${event.payload.withdrawn}/${event.payload.total}）`,
      "",
      logUrl(event),
    ),

  reminder_resend_due: (event, members) =>
    draft(
      members.filter((member) => member.id === event.actor_id),
      "証拠を送り直せるのはあと 1 時間",
      "取り下げがそろわないと、全員の最終審査になります",
      logUrl(event),
      true,
    ),

  dispute_final_review_started: (event, members) => {
    const reviewers = Array.isArray(event.payload.reviewer_ids) ? event.payload.reviewer_ids : [];
    const owner = nameOf(members, event.actor_id);
    return [
      ...draft(
        members.filter((member) => reviewers.includes(member.id)),
        `${owner} さんの${submissionWord(event)}を最終審査してください`,
        `${formatJstDateTime(text(event.payload.review_due_at))} まで。却下するときは理由が必要です`,
        logUrl(event),
        true,
      ),
      ...draft(
        members.filter((member) => member.id === event.actor_id),
        `あなたの${submissionWord(event)}は最終審査になりました`,
        "理由付きの却下が 1 人でもあれば証拠不認定です",
        logUrl(event),
      ),
    ];
  },

  dispute_upheld: (event, members) =>
    draft(
      members,
      `${nameOf(members, event.actor_id)} さんの${event.makeup ? "補習" : "達成"}が認められました`,
      "",
      logUrl(event),
    ),

  dispute_invalidated: (event, members) =>
    draft(
      members,
      `${nameOf(members, event.actor_id)} さんの証拠は不認定になりました`,
      `${nameOf(members, event.payload.rejected_by)} さん: ${text(event.payload.comment)} ／ ${
        event.makeup ? "この補習は数えません" : yen(event.payload)
      }`,
      logUrl(event),
    ),

  // --- Scheduled (F9): reminders and the day's outcomes -----------------------------------
  // previous_open: yesterday still has to be finished before declaring (ADR-032).
  // reminder_declare_midnight is the morning one (first_declaration_reminder, 7:00); it was sent
  // at 0:00 until ADR-047 and keeps its name so the deployed code renders it.
  reminder_declare_midnight: (event, members) =>
    draft(
      self(members, event),
      event.payload.previous_open
        ? "昨日の分を済ませてから、今日の宣言をしましょう"
        : `今日の宣言をしましょう（${formatJstTime(text(event.payload.cutoff))} まで）`,
      event.payload.previous_open === "pending"
        ? `昨日の分を提出して合格するか「できなかった」を押すと宣言できます（${formatJstTime(text(event.payload.cutoff))} まで）`
        : event.payload.previous_open
          ? `昨日の分の理由を申告すると宣言できます（${formatJstTime(text(event.payload.cutoff))} まで）`
          : "宣言すると今日の合言葉が出ます",
      "/declare",
      true,
    ),

  reminder_declare_last_call: (event, members) =>
    draft(
      self(members, event),
      `宣言の締切まであと 1 時間（${formatJstTime(text(event.payload.cutoff))}）`,
      event.payload.previous_open === "pending"
        ? `昨日の分がまだです。このままだと昨日は未達成、今日は宣言なし（${yen(event.payload)}）になります`
        : event.payload.previous_open
          ? `先に昨日の分の理由を申告してください。過ぎると宣言なしで ${yen(event.payload)}`
          : `過ぎると宣言なしになり、${yen(event.payload)}`,
      "/declare",
      true,
    ),

  no_declaration: (event, members) =>
    draft(members, `${nameOf(members, event.actor_id)} さんが宣言しませんでした`, yen(event.payload), "/"),

  reminder_submit: (event, members) =>
    draft(
      self(members, event),
      `${event.makeup ? "補習の" : ""}提出締切まであと 1 時間`,
      `締切 ${formatJstDateTime(text(event.payload.deadline))}。まだ合格していません`,
      ownUrl(event, "/submit"),
      true,
    ),

  missed: (event, members) => [
    ...draft(
      self(members, event),
      event.payload.gave_up ? "未達成にしました" : "未達成でした",
      `${formatJstDateTime(text(event.payload.report_due_at))} までに理由を申告してください。申告しないとサボり扱いです`,
      reportUrl(event),
      true,
    ),
    ...draft(everyoneExcept(members, event.actor_id), `${nameOf(members, event.actor_id)} さんが未達成でした`, "", logUrl(event)),
  ],

  // --- Reason reports and excuse reviews (F6, F7) -----------------------------------------
  reported: (event, members) => {
    const name = nameOf(members, event.actor_id);
    const category = event.payload.category;
    if (category === "sudden_plan" || category === "other") return []; // review_requested covers it
    const title =
      category === "slacked"
        ? `${name} さん: サボった（${yen(event.payload)}）`
        : `${name} さん: 宣言が妥当じゃなかった（${event.payload.streak} 回連続${Number(event.payload.points) > 0 ? `・${yen(event.payload)}` : ""}）`;
    return draft(everyoneExcept(members, event.actor_id), title, text(event.payload.text), reportUrl(event));
  },

  review_requested: (event, members) => {
    const reviewers = Array.isArray(event.payload.reviewer_ids) ? event.payload.reviewer_ids : [];
    return draft(
      members.filter((member) => reviewers.includes(member.id)),
      `${nameOf(members, event.actor_id)} さんの理由を審査してください（${formatJstDateTime(text(event.payload.review_due_at))} まで）`,
      text(event.payload.text),
      reportUrl(event),
      true,
    );
  },

  review_approved: (event, members) =>
    draft(members, `${nameOf(members, event.actor_id)} さんの理由は承認されました`, "ペナルティなし", reportUrl(event)),

  review_rejected: (event, members) =>
    draft(
      members,
      `${nameOf(members, event.actor_id)} さんの理由は却下されました`,
      `${event.payload.expired ? "期限までに全員の納得がそろいませんでした。" : ""}${yen(event.payload)}`,
      reportUrl(event),
    ),

  report_expired: (event, members) =>
    draft(members, `${nameOf(members, event.actor_id)} さんが理由を申告しませんでした`, `サボり扱い・${yen(event.payload)}`, reportUrl(event)),

  reminder_report_due: (event, members) =>
    draft(
      self(members, event),
      `理由申告の期限は ${formatJstDateTime(text(event.payload.report_due_at))} です`,
      `申告しないとサボり扱いで ${yen(event.payload)}`,
      reportUrl(event),
      true,
    ),

  completion_confirmed: (event, members) =>
    draft(self(members, event), "達成が確定しました", "おつかれさまでした", logUrl(event)),

  reminder_review_due: (event, members) => {
    const owner = nameOf(members, event.payload.owner_id);
    const due = formatJstDateTime(text(event.payload.review_due_at));
    if (event.payload.subject_type === "excuse") {
      return draft(self(members, event), `${owner} さんの理由の審査の期限が近づいています`, `${due} まで`, reportUrl(event), true);
    }
    return event.payload.subject_type === "dispute"
      ? draft(self(members, event), `${owner} さんの最終審査の期限が近づいています`, `${due} まで`, logUrl(event), true)
      : draft(self(members, event), `${owner} さんの休会の審査の期限が近づいています`, `${due} まで`, "/leave", true);
  },

  trial_ending: (event, members) =>
    draft(self(members, event), "お試し期間は今日までです", "明日 0:00 から、ペナルティが本番の金額で付きます", "/"),

  // --- Settlement (F8, P7) ---------------------------------------------------------------
  payee_assigned: (event, members) =>
    draft(
      members,
      `支払先が変わりました: ${nameOf(members, event.payload.user_id)} → ${nameOf(members, event.payload.payee_id)}`,
      "",
      "/settlements",
    ),

  // No payee yet: the week's amount carries over to the next settlement (F8). Admins set it; the
  // member is told too (an admin who is the member gets the admin's notice).
  payee_missing: (event, members) => {
    const admins = Array.isArray(event.payload.admin_ids) ? event.payload.admin_ids : [];
    return [
      ...draft(
        members.filter((member) => admins.includes(member.id)),
        `${nameOf(members, event.actor_id)} さんの支払先が未設定です`,
        "今週の分は次の精算に持ち越します。支払先を入力してください",
        "/settlements",
        true,
      ),
      ...draft(
        members.filter((member) => member.id === event.actor_id && !admins.includes(member.id)),
        "あなたの支払先がまだ決まっていません",
        "今週の分は次の精算に持ち越します。管理者に支払先を決めてもらってください",
        "/settlements",
      ),
    ];
  },

  settlement_created: (event, members) => {
    const amount = `${Number(event.payload.amount).toLocaleString()} 円`;
    return [
      ...draft(self(members, event), `${nameOf(members, event.payload.payee_id)} さんに ${amount} 送ってください`, "送ったら「送金した」を押してください", "/settlements", true),
      ...draft(
        members.filter((member) => member.id === event.payload.payee_id),
        `${nameOf(members, event.actor_id)} さんから ${amount} 届きます`,
        "",
        "/settlements",
      ),
    ];
  },

  weekly_summary: (event, members) => {
    const ranking = Array.isArray(event.payload.ranking) ? (event.payload.ranking as { user_id: string; amount: number }[]) : [];
    const body =
      ranking.length === 0
        ? "今週はペナルティなし！"
        : ranking.map((row) => `${nameOf(members, row.user_id)} ${Number(row.amount).toLocaleString()}円`).join("、");
    return draft(members, "今週のペナルティ結果", body, "/settlements");
  },

  settlement_sent: (event, members) =>
    draft(
      members.filter((member) => member.id === event.payload.payee_id),
      `${nameOf(members, event.actor_id)} さんが ${Number(event.payload.amount).toLocaleString()} 円を送金しました`,
      "受け取ったら「受け取った」を押してください",
      "/settlements",
      true,
    ),

  settlement_completed: (event, members) =>
    draft(
      members.filter((member) => member.id === event.payload.debtor_id),
      `${nameOf(members, event.actor_id)} さんが受け取りを確認しました`,
      "精算が完了しました",
      "/settlements",
    ),

  settlement_not_received: (event, members) =>
    draft(
      members.filter((member) => member.id === event.payload.debtor_id),
      `${nameOf(members, event.actor_id)} さんに届いていません`,
      "もう一度確かめて送金してください",
      "/settlements",
      true,
    ),

  late_payment: (event, members) =>
    draft(members, `${nameOf(members, event.actor_id)} さんが未払いで追加されました`, yen(event.payload), "/settlements"),

  reminder_late_payment: (event, members) =>
    draft(
      self(members, event),
      "精算がまだです",
      `${formatJstDateTime(text(event.payload.due_at))} までに「送金した」を押さないと ${yen(event.payload)} 追加されます`,
      "/settlements",
      true,
    ),

  // --- Weekly review (F12) ----------------------------------------------------------------
  weekly_review_created: (event, members) =>
    draft(
      self(members, event),
      `今週の振り返りができました（達成 ${event.payload.completed ?? 0}/${event.payload.counted ?? 0}）`,
      "AI のまとめと、来週へのメモを書き足せます",
      `/members/${event.actor_id}/weeks/${text(event.payload.week_end)}`,
    ),

  // --- Makeup study (補習, F8b, P9, P10) ------------------------------------------------------
  makeup_warning: (event, members) =>
    draft(
      self(members, event),
      `サボりが ${event.payload.streak} 回続いています`,
      event.payload.trial
        ? "次もサボると、本番なら補習が付きます（お試し期間なので付きません）"
        : `次もサボると補習が ${event.payload.count} 回付きます`,
      "/declare",
    ),

  makeup_assigned: (event, members) => {
    const name = nameOf(members, event.actor_id);
    const count = Number(event.payload.count ?? 1);
    if (event.payload.waived === "trial") {
      return draft(
        members,
        `${name} さんがサボり ${event.payload.streak} 連続`,
        `お試し期間なので本番なら補習 ${count} 回`,
        "/",
      );
    }
    const due = formatJstDateTime(text(event.payload.due_at));
    return [
      ...draft(self(members, event), `補習が ${count} 回付きました（サボり ${event.payload.streak} 連続）`, `${due} までに返してください`, MAKEUP_URL, true),
      ...draft(everyoneExcept(members, event.actor_id), `${name} さんがサボり ${event.payload.streak} 連続。補習 ${count} 回`, `期限 ${due}`, "/"),
    ];
  },

  makeup_declared: (event, members) =>
    draft(
      everyoneExcept(members, event.actor_id),
      `${nameOf(members, event.actor_id)} さんが補習を宣言しました`,
      `「${text(event.payload.declaration)}」（締切 ${formatJstDateTime(text(event.payload.target_end_time))}）`,
      "/",
    ),

  makeup_failed: (event, members) => {
    const cause = event.payload.cause;
    const title =
      cause === "unrevised" ? "補習を取り消しました（書き直しがありませんでした）" : cause === "gave_up" ? "補習をやめました" : "補習の提出締切を過ぎました";
    return [
      ...draft(self(members, event), title, "借りは減っていません。別の日にもう一度宣言してください", MAKEUP_URL),
      ...draft(everyoneExcept(members, event.actor_id), `${nameOf(members, event.actor_id)} さんの補習は数えられませんでした`, "", "/"),
    ];
  },

  makeup_completed: (event, members) => [
    ...draft(self(members, event), "補習を 1 回返しました", "おつかれさまでした", MAKEUP_URL),
    ...draft(everyoneExcept(members, event.actor_id), `${nameOf(members, event.actor_id)} さんが補習を 1 回返しました`, "", "/"),
  ],

  makeup_overdue: (event, members) => {
    const count = Number(event.payload.count ?? 1);
    return [
      ...draft(
        self(members, event),
        `補習の期限を過ぎたので +${count} 回`,
        `期限切れが ${event.payload.overdue} 回あります。返し終わるまで毎週増えます`,
        MAKEUP_URL,
        true,
      ),
      ...draft(everyoneExcept(members, event.actor_id), `${nameOf(members, event.actor_id)} さんが補習から逃走。+${count} 回`, "", "/"),
    ];
  },

  makeup_due: (event, members) => {
    const overdue = Number(event.payload.overdue ?? 0);
    return draft(
      self(members, event),
      `補習が ${event.payload.remaining} 回あります`,
      `${formatJstDateTime(text(event.payload.next_due_at))} までに返してください${overdue > 0 ? `（期限切れ ${overdue} 回）` : ""}`,
      MAKEUP_URL,
      true,
    );
  },

  reminder_makeup_due: (event, members) =>
    draft(
      self(members, event),
      `補習の期限まであと ${Number(event.payload.hours_left ?? 24)} 時間`,
      `残り ${event.payload.remaining} 回。${formatJstDateTime(text(event.payload.due_at))} を過ぎると +1 回`,
      MAKEUP_URL,
      true,
    ),

  // --- Titles, ranks and the crown (F13, F14) --------------------------------------------------
  title_awarded: (event, members) => {
    const title = TITLES[event.payload.title as TitleId];
    if (!title) return [];
    return draft(
      members,
      `${nameOf(members, event.actor_id)} さんに称号「${title.name}」`,
      `${title.how}（${title.until}）`,
      `/members/${event.actor_id}`,
    );
  },

  title_removed: (event, members) => {
    const title = TITLES[event.payload.title as TitleId];
    if (!title) return [];
    return draft(members, `${nameOf(members, event.actor_id)} さんの「${title.name}」が外れました`, "", `/members/${event.actor_id}`);
  },

  rank_changed: (event, members) => {
    const to = RANKS.find((rank) => rank.id === event.payload.to);
    if (!to) return [];
    return draft(
      members,
      `${nameOf(members, event.actor_id)} さんが「${to.name}」に${event.payload.up ? "上がりました" : "下がりました"}`,
      "ランクは直近 28 日の XP で決まります",
      `/members/${event.actor_id}`,
    );
  },

  crown_moved: (event, members) =>
    draft(members, `王冠が ${nameOf(members, event.actor_id)} さんに移りました`, "直近 28 日の XP でグループ 1 位", `/members/${event.actor_id}`),

  // --- Group settings (F11) ---------------------------------------------------------------
  settings_changed: (event, members) => {
    const changes = (event.payload.changes ?? {}) as Record<string, unknown>;
    const lines = Object.entries(changes).map(([key, value]) => {
      if (key === "makeup_since") return value ? `補習: 使う（${formatJstDay(String(value))} から）` : "補習: 使わない";
      const field = SETTING_FIELDS.find((candidate) => candidate.key === key);
      const shown = field?.type === "time" ? String(value).slice(0, 5) : `${value}${field?.unit ?? ""}`;
      return `${field?.label ?? key}: ${shown}`;
    });
    if (lines.length === 0) return [];
    return draft(members, "グループ設定が変わりました", lines.join("、"), "/settings");
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
    if (event.payload.subject_type === "excuse") {
      const verdict = event.payload.verdict === "accept" ? "納得しました" : "納得できないを押しました";
      return draft(
        members.filter((member) => member.id === event.payload.owner_id),
        `${nameOf(members, event.actor_id)} さんが${verdict}（${event.payload.accepted}/${event.payload.total}）`,
        text(event.payload.comment),
        reportUrl(event),
      );
    }
    if (event.payload.subject_type === "dispute") {
      const verdict = event.payload.verdict === "accept" ? "認めました" : "却下しました";
      return draft(
        members.filter((member) => member.id === event.payload.owner_id),
        `${nameOf(members, event.actor_id)} さんが最終審査で${verdict}`,
        text(event.payload.comment),
        logUrl(event),
      );
    }
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
