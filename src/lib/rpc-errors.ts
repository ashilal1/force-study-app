// Messages for the business-rule errors the RPCs raise (raise exception '<code>'). Anything not
// listed is unexpected: callers log it and show a generic message.
const MESSAGES: Record<string, string> = {
  not_a_member: "メンバーだけが使えます",
  not_found: "見つかりませんでした。ページを開き直してください",
  // Declarations
  declaration_closed: "今日の宣言の締切を過ぎています",
  rest_day: "今日は休息日です",
  on_leave: "その日は休会中です",
  already_declared: "今日はもう宣言しています",
  invalid_declaration: "宣言の内容を 1〜500 文字で書いてください",
  invalid_deadline: "提出締切は、今から 30 分以降・21:00 までにしてください",
  own_declaration: "自分の宣言には指摘できません",
  already_revised: "書き直した宣言には指摘できません",
  flag_closed: "この宣言に指摘できる時間は過ぎています",
  invalid_comment: "指摘の理由を 1〜300 文字で書いてください",
  already_flagged: "この宣言にはもう指摘しています",
  no_revision_needed: "書き直しは必要ありません",
  revision_expired: "書き直しの期限を過ぎています",
  unchanged: "内容を変えてください",
  // Rest days
  rest_day_too_soon: "休息日は明日以降の日だけ登録・取り消しできます",
  rest_day_too_far: "休息日は 60 日先まで登録できます",
  already_rest_day: "その日はもう休息日です",
  rest_day_limit: "休息日はその週（日〜土）にもう登録しています",
  rest_day_locked: "当日以降の休息日は取り消せません",
  // Leave
  leave_too_soon: "休会は明日以降の日から申請できます",
  invalid_period: "終了日は開始日以降にしてください",
  reason_too_short: "理由をもう少し詳しく書いてください",
  leave_overlaps: "その期間と重なる休会の申請がすでにあります",
  leave_closed: "この休会はもう終わっています",
  leave_finished: "取り消せる日が残っていません",
  // Reviews
  invalid_verdict: "承認か却下を選んでください",
  not_a_reviewer: "この審査に加わっていません",
  already_reviewed: "もう審査しています",
  review_closed: "この審査は締め切られています",
};

export function rpcErrorMessage(error: { message: string } | null | undefined): string | null {
  if (!error) return null;
  return MESSAGES[error.message] ?? null;
}

export const GENERIC_ERROR = "うまくいきませんでした。時間をおいてもう一度試してください";
