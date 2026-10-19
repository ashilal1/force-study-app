// Short explanations of the app's own words, for the 「？」 next to them (F15, components/onboarding/term-help).

export const TERMS = {
  passphrase: {
    label: "合言葉",
    text: "宣言すると出る、その日だけの言葉です。紙に手書きして、成果物と一緒に写します。昔の写真やネットの画像を使えないようにするためのものです。",
  },
  trial: {
    label: "お試し期間",
    text: "参加した日から次の日曜 0:00 までです。判定・通知・審査は本番どおりで、ペナルティだけ付きません（「本番なら 〇円」と出ます）。2 つ目のグループにはありません。",
  },
  awaiting: {
    label: "確定待ち",
    text: "合格したあと、ほかのメンバーが「怪しい」を押せる間のことです。押されないまま時間が過ぎると「達成」で確定します。",
  },
  provisional: {
    label: "仮合格",
    text: "混雑などで AI が判定できなかったときの、仮の合格です。点数はありません。ほかのメンバーが写真を見て確かめ、おかしければ「怪しい」を押します。",
  },
  rest_vs_leave: {
    label: "休息日と休会",
    text: "休息日は、宣言しなくていい 1 日。前の日までに自分で決められます（週の上限まで）。休会は、テストや旅行で何日も休むとき。ほかの全員の承認が要り、その間は審査にも加わりません。",
  },
} as const;

export type TermKey = keyof typeof TERMS;

export const TERM_KEYS = Object.keys(TERMS) as TermKey[];
