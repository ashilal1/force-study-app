// Coach marks (F15・ADR-038): one bubble the first time a member reaches a moment. The keys live
// here; the database only remembers which ones a member has closed (profiles.seen_tips, '*' = all).
// Adding one: a key and its text here, a data-tip on the element it points at, and the page lists it
// among its candidates. No migration.

export const TIP_KEYS = [
  "home_todo",
  "declare_input",
  "passphrase",
  "submit_photos",
  "give_up",
  "judge_result",
  "peer_buttons",
  "flagged",
  "report",
  "review",
  "settlement",
] as const;

export type TipKey = (typeof TIP_KEYS)[number];

export function isTipKey(value: unknown): value is TipKey {
  return typeof value === "string" && (TIP_KEYS as readonly string[]).includes(value);
}

const yen = (value: number) => `${value.toLocaleString()} 円`;

/** What each bubble says. The ones with numbers take them from the group's settings or the day. */
export const TIPS = {
  home_todo: "やることは全部ここに出ます。迷ったら、ここだけ見れば OK です。",
  declare_input:
    "AI はこの文と成果物を照らし合わせます。「英単語 50 個を覚えて小テスト」のように具体的に。「英語をやる」だと「軽すぎる」と言われます。",
  passphrase: "この合言葉を紙に書いて、成果物と一緒に写してください。写っていないと不合格です。",
  submit_photos: "1 枚以上に合言葉を。ノートや画面と、合言葉を書いた紙を一緒に撮ってください。",
  give_up: "間に合わないときはこれ。押して理由を申告すると、次の日の宣言ができます。",
  judge_result: ({ passed, attemptsLeft, disputeHours }: { passed: boolean; attemptsLeft: number; disputeHours: number }) =>
    passed
      ? `合格です。${disputeHours} 時間「怪しい」が押されなければ達成で確定します。`
      : attemptsLeft > 0
        ? `合格点に届きませんでした。締切まで、あと ${attemptsLeft} 回出し直せます。講評を読んで撮り直しましょう。`
        : "提出回数を使い切りました。ちゃんとやったのなら、この画面からメンバーに判定を頼めます。そうでなければ宣言の画面で「できなかった」を押して、理由を申告してください。",
  peer_buttons: "中身が軽すぎる・証拠が怪しいと思ったら押せます。理由を書く必要があります。",
  flagged: ({ target, dueAt }: { target: "declaration" | "submission"; dueAt: string }) =>
    target === "declaration"
      ? `${dueAt} までに書き直せば、ペナルティは付きません。書き直せるのは 1 回だけです。`
      : `${dueAt} までなら何度でも証拠を送り直せます。指摘した人が全員納得すれば達成です。`,
  report: ({ excuseRejected }: { excuseRejected: number }) =>
    `選ぶ理由で金額が変わります。「急遽予定ができた」「その他」は、ほかの全員が納得すれば 0 円、1 人でも納得しなければ ${yen(excuseRejected)}です。`,
  review: ({ target, yen: amount }: { target: "excuse" | "dispute"; yen: number }) =>
    target === "excuse"
      ? `期限までに全員の「納得」がそろわないと、相手に ${yen(amount)}付きます。1 人でも「納得できない」なら、その場で却下です。`
      : `証拠を見て決めます。却下するときは理由を書きます。理由付きの却下が 1 人でもあれば証拠不認定（${yen(amount)}）です。`,
  settlement: ({ lateYen }: { lateYen: number }) =>
    `PayPay で送ったら「送金した」を押してください。次の締めまでに押さないと ${yen(lateYen)}追加です。`,
} satisfies Record<TipKey, string | ((params: never) => string)>;

/** A candidate for the screen: the key and its finished text, or false when it doesn't apply. */
export type TipCandidate = readonly [TipKey, string] | false | null | undefined;

export function hasSeenTip(seen: readonly string[], key: TipKey): boolean {
  return seen.includes("*") || seen.includes(key);
}

/** The screen's first candidate the member hasn't closed yet; one bubble at a time. */
export function pickTip(seen: readonly string[], candidates: TipCandidate[]): readonly [TipKey, string] | null {
  for (const candidate of candidates) {
    if (candidate && !hasSeenTip(seen, candidate[0])) return candidate;
  }
  return null;
}
