// The group settings an admin can change (F11), in display order. Shared by the form and the
// Server Action; update_group_settings validates every value again.

export type SettingField = {
  key: string;
  label: string;
  type: "time" | "number";
  unit?: string;
  section: "時刻" | "ペナルティ（円）" | "判定と指摘" | "精算・その他";
};

export const SETTING_FIELDS: SettingField[] = [
  { key: "last_declaration_reminder", label: "宣言のリマインド", type: "time", section: "時刻" },
  { key: "declaration_cutoff", label: "宣言の締切", type: "time", section: "時刻" },
  { key: "submit_deadline_max", label: "提出締切の上限", type: "time", section: "時刻" },
  { key: "dispute_cutoff", label: "「怪しい」の受付の上限", type: "time", section: "時刻" },
  { key: "resend_cutoff", label: "証拠の送り直しの上限", type: "time", section: "時刻" },
  { key: "report_deadline", label: "理由申告の期限", type: "time", section: "時刻" },
  { key: "review_deadline", label: "審査の期限", type: "time", section: "時刻" },
  { key: "penalty_no_declaration", label: "宣言なし（P1）", type: "number", section: "ペナルティ（円）" },
  { key: "penalty_slacked", label: "サボり・申告なし（P2・P5）", type: "number", section: "ペナルティ（円）" },
  { key: "penalty_unrealistic_streak", label: "妥当じゃない宣言の連続（P3）", type: "number", section: "ペナルティ（円）" },
  { key: "unrealistic_streak_threshold", label: "P3 が始まる連続回数", type: "number", unit: "回", section: "ペナルティ（円）" },
  { key: "penalty_excuse_rejected", label: "理由の却下（P4）", type: "number", section: "ペナルティ（円）" },
  { key: "penalty_unrevised", label: "書き直しなし（P6）", type: "number", section: "ペナルティ（円）" },
  { key: "penalty_late_payment", label: "未払い（P7、毎週）", type: "number", section: "ペナルティ（円）" },
  { key: "penalty_fake_evidence", label: "証拠不認定（P8）", type: "number", section: "ペナルティ（円）" },
  { key: "passing_score", label: "合格点", type: "number", unit: "点", section: "判定と指摘" },
  { key: "max_attempts", label: "1 日の提出回数", type: "number", unit: "回", section: "判定と指摘" },
  { key: "judge_grace_minutes", label: "判定待ちの猶予", type: "number", unit: "分", section: "判定と指摘" },
  { key: "flag_window_hours", label: "「軽すぎる」を押せる時間", type: "number", unit: "時間", section: "判定と指摘" },
  { key: "revision_minutes", label: "書き直しの期限", type: "number", unit: "分", section: "判定と指摘" },
  { key: "dispute_window_hours", label: "「怪しい」を押せる時間", type: "number", unit: "時間", section: "判定と指摘" },
  { key: "resend_minutes", label: "証拠の送り直しの期限", type: "number", unit: "分", section: "判定と指摘" },
  { key: "min_explanation_chars", label: "理由・次の計画の最小文字数", type: "number", unit: "字", section: "判定と指摘" },
  { key: "settlement_weekday", label: "精算の曜日（0 = 日〜6 = 土）", type: "number", section: "精算・その他" },
  { key: "settlement_time", label: "精算の時刻", type: "time", section: "精算・その他" },
  { key: "rest_days_per_week", label: "週の休息日", type: "number", unit: "日", section: "精算・その他" },
  { key: "max_members", label: "メンバーの上限", type: "number", unit: "人", section: "精算・その他" },
  { key: "invite_minutes", label: "招待コードの有効時間", type: "number", unit: "分", section: "精算・その他" },
  { key: "image_retention_days", label: "証拠写真の保持日数", type: "number", unit: "日", section: "精算・その他" },
];
