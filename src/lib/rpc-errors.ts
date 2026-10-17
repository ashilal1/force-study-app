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
  flag_closed: "指摘できる時間は過ぎています",
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
  // Submissions
  already_passed: "今日はもう合格しています",
  not_open: "今日の提出は受け付けていません",
  deadline_passed: "提出締切を過ぎています",
  judging_in_progress: "前の提出を判定中です。結果が出てからもう一度提出してください",
  no_attempts_left: "今日の提出回数を使い切りました",
  invalid_images: "写真を 1〜3 枚選んでください",
  invalid_reflection: "学んだこと・できなかったことを書いてください",
  invalid_rating: "自己評価を選んでください",
  // Disputes (怪しい)
  own_submission: "自分の提出には指摘できません",
  resend_closed: "証拠を送り直せる時間は過ぎています",
  invalid_explanation: "何を送り直したのか説明を書いてください",
  withdraw_closed: "もう取り下げられません",
  not_flagged: "この提出には指摘していません",
  comment_required: "却下するときは理由を書いてください",
  // Reason reports
  already_reported: "この日の理由はもう申告しています",
  report_closed: "理由申告の期限を過ぎています",
  invalid_category: "理由を選んでください",
  reason_too_long: "2000 文字以内にしてください",
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
