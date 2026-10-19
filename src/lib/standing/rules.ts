// Titles (F13), XP and ranks (F14), computed from the records every time (nothing is stored:
// ADR-005, ADR-037, ADR-039). Pure so it can be tested; lib/standing/load.ts reads the records.

import type { DayKind } from "@/lib/chart-colors";
import { addDays, jstDateString, weekdayOf } from "@/lib/time";

// ---------------------------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------------------------

export type StandingDay = {
  /** JST study date. */
  date: string;
  kind: DayKind;
  inTrial: boolean;
  /** Score of the passing submission (null when it passed without an AI verdict). */
  finalScore: number | null;
  /** Regular submissions, Gemini errors excluded. */
  attempts: number;
  failureCategory: string | null;
  declaredAt: string | null;
  targetEndTime: string | null;
  /** When the passing submission was sent. */
  passedSubmittedAt: string | null;
  completedAt: string | null;
  /** 「怪しい」 on this day's submission. */
  flaggedAt: string[];
};

export type StandingPenalty = { reason: string; at: string; waived: boolean };

export type StandingSettlement = { periodEnd: string; amount: number; status: string; late: boolean };

export type StandingMakeup = {
  /** Confirmed sessions (completed_at). */
  completedAt: string[];
  /** Passed or confirmed sessions (passed_at), for 完済者. */
  passedAt: string[];
  debts: { reason: string; count: number; waived: boolean; dueAt: string; createdAt: string }[];
  /** Past-due sessions still owed now (makeup_summary.overdue). */
  overdue: number;
};

export type StandingInput = {
  memberId: string;
  /** JST date the membership began. */
  joinedOn: string;
  trialEndsAt: string;
  /** daily_history, in date order. */
  days: StandingDay[];
  penalties: StandingPenalty[];
  /** 「宣言が妥当じゃなかった」 reports that cost no money yet (P3 before the streak): reported_at. */
  freeUnrealisticAt: string[];
  settlements: StandingSettlement[];
  makeup: StandingMakeup;
};

export type StandingContext = {
  /** JST today. */
  today: string;
  /** Server time (ms). */
  now: number;
  /** The latest weekly close that has passed: its Saturday and the moment (ms). */
  lastClose: { date: string; at: number } | null;
  unrealisticStreakThreshold: number;
};

// ---------------------------------------------------------------------------------------------
// XP and ranks (F14, ADR-039)
// ---------------------------------------------------------------------------------------------

export type XpEvent = { date: string; points: number; label: string };

const PENALTY_XP: Record<string, number> = {
  no_declaration: -15,
  unrevised: -15,
  unrealistic_streak: -15,
  excuse_rejected: -15,
  excuse_expired: -15,
  fake_evidence: -20,
  slacked: -25,
  not_reported: -25,
  late_payment: -10,
};

const PENALTY_LABEL: Record<string, string> = {
  no_declaration: "宣言なし",
  unrevised: "書き直しなし",
  unrealistic_streak: "妥当じゃない宣言の連続",
  excuse_rejected: "理由の却下",
  excuse_expired: "理由の却下",
  fake_evidence: "証拠不認定",
  slacked: "サボり",
  not_reported: "理由を申告しなかった",
  late_payment: "未払い",
};

/** Days that neither extend nor break a run. */
const NEUTRAL: DayKind[] = ["rest", "leave", "pending", "none"];
const FAILED: DayKind[] = ["missed", "no_declaration", "invalidated"];

const jst = (iso: string) => jstDateString(new Date(iso));

/** Every XP gain and loss, dated when it happened (JST). Trial days don't count. */
export function xpEvents(input: StandingInput, today: string): XpEvent[] {
  const events: XpEvent[] = [];
  let run = 0;
  for (const day of input.days) {
    if (NEUTRAL.includes(day.kind)) continue;
    if (day.kind !== "completed") {
      run = 0;
      continue;
    }
    run += 1;
    const date = day.completedAt ? jst(day.completedAt) : day.date;
    events.push({ date, points: 10, label: "達成" });
    if (day.finalScore !== null && day.finalScore >= 90) events.push({ date, points: 3, label: "90 点以上" });
    if (run % 7 === 0) events.push({ date, points: 20, label: `${run} 日連続` });
  }
  for (const month of perfectMonths(input, today)) {
    events.push({ date: `${nextMonth(month)}-01`, points: 50, label: "皆勤賞" });
  }
  for (const at of input.makeup.completedAt) events.push({ date: jst(at), points: 5, label: "補習を返した" });
  for (const penalty of input.penalties) {
    const points = PENALTY_XP[penalty.reason];
    if (penalty.waived || points === undefined) continue;
    events.push({ date: jst(penalty.at), points, label: PENALTY_LABEL[penalty.reason] ?? penalty.reason });
  }
  for (const at of input.freeUnrealisticAt) events.push({ date: jst(at), points: -5, label: "宣言が妥当じゃなかった" });
  for (const debt of input.makeup.debts) {
    if (debt.reason === "overdue" && !debt.waived) events.push({ date: jst(debt.createdAt), points: -10, label: "補習から逃走" });
  }
  const trialEnd = jst(input.trialEndsAt);
  return events.filter((event) => event.date >= trialEnd && event.date >= input.joinedOn).sort((a, b) => a.date.localeCompare(b.date));
}

/** The 28 most recent days (JST) up to today, skipping leave days (ADR-039). */
export function xpWindow(days: StandingDay[], today: string): Set<string> {
  const leave = new Set(days.filter((day) => day.kind === "leave").map((day) => day.date));
  const window = new Set<string>();
  for (let date = today, guard = 0; window.size < 28 && guard < 400; date = addDays(date, -1), guard += 1) {
    if (!leave.has(date)) window.add(date);
  }
  return window;
}

export type RankId = "tensai" | "yuutousei" | "yareba-dekiru" | "mikka-bouzu" | "doushiyou-mo-nai";

export const RANKS: { id: RankId; name: string; min: number }[] = [
  { id: "tensai", name: "天才", min: 300 },
  { id: "yuutousei", name: "優等生", min: 150 },
  { id: "yareba-dekiru", name: "やればできる", min: 50 },
  { id: "mikka-bouzu", name: "三日坊主", min: -49 },
  { id: "doushiyou-mo-nai", name: "どうしようもない", min: -Infinity },
];

export function rankOf(xp: number): (typeof RANKS)[number] {
  return RANKS.find((rank) => xp >= rank.min)!;
}

/** The next rank up and how far along the gauge is (0-1), or null at the top. */
export function nextRank(xp: number): { name: string; needed: number; progress: number } | null {
  const index = RANKS.findIndex((rank) => xp >= rank.min);
  if (index === 0) return null;
  const next = RANKS[index - 1];
  const floor = Number.isFinite(RANKS[index].min) ? RANKS[index].min : next.min - 100;
  return { name: next.name, needed: next.min - xp, progress: Math.max(0, Math.min(1, (xp - floor) / (next.min - floor))) };
}

// ---------------------------------------------------------------------------------------------
// Titles (F13)
// ---------------------------------------------------------------------------------------------

export type TitleId =
  | "mitatsu-king"
  | "saborer"
  | "tousousha"
  | "binbounin"
  | "nebosuke"
  | "keikaku-daore"
  | "iiwake-master"
  | "sagishi-giwaku"
  | "girigiri"
  | "kakin-king"
  | "kaikin"
  | "mukakin"
  | "keizoku"
  | "shukan-oni"
  | "densetsu"
  | "ippatsuya"
  | "high-scorer"
  | "asagata"
  | "keppaku"
  | "kansai"
  | "mvp";

type TitleDef = {
  name: string;
  good: boolean;
  /** Held while a state lasts (shown first among the bad ones). */
  state?: boolean;
  /** How it is earned and how it goes away (shown when tapped). */
  how: string;
  until: string;
};

export const TITLES: Record<TitleId, TitleDef> = {
  "mitatsu-king": { name: "未達の王", good: false, how: "できなかった日（未達成・宣言なし・証拠不認定）が 5 回連続", until: "1 回達成したら外れる" },
  saborer: { name: "サボラー", good: false, how: "今月サボり（宣言なし・サボった・申告なし・書き直しなし）が 5 回以上", until: "月が変わったら外れる" },
  tousousha: { name: "逃走者", good: false, state: true, how: "補習の期限切れが残っている", until: "補習を返したら外れる" },
  binbounin: { name: "貧乏人", good: false, state: true, how: "期限までに払わなかった精算がある", until: "「送金した」を押したら外れる" },
  nebosuke: { name: "寝坊助", good: false, how: "今月宣言しなかった日が 3 回以上", until: "月が変わったら外れる" },
  "keikaku-daore": { name: "計画倒れ", good: false, how: "「宣言が妥当じゃなかった」が 4 回連続", until: "1 回達成したら外れる" },
  "iiwake-master": { name: "言い訳マスター", good: false, how: "今月、理由の審査で却下が 2 回以上", until: "月が変わったら外れる" },
  "sagishi-giwaku": { name: "詐欺師疑惑", good: false, how: "今月、証拠が認められなかった", until: "月が変わったら外れる" },
  girigiri: { name: "ギリギリ星人", good: false, how: "今月、締切 1 時間前を切ってから合格が 5 回以上", until: "月が変わったら外れる" },
  "kakin-king": { name: "今週の課金王", good: false, how: "先週の支払いがグループでいちばん多い", until: "次の土曜の締めまで" },
  kaikin: { name: "皆勤賞", good: true, how: "先月の宣言をすべて達成", until: "今月のあいだ" },
  mukakin: { name: "無課金勢", good: true, how: "先週の支払いが 0 円", until: "次の土曜の締めまで" },
  keizoku: { name: "継続は力なり", good: true, how: "7 日連続で達成", until: "連続が切れたら外れる" },
  "shukan-oni": { name: "習慣の鬼", good: true, how: "30 日連続で達成", until: "連続が切れたら外れる" },
  densetsu: { name: "生ける伝説", good: true, how: "100 日連続で達成", until: "連続が切れたら外れる" },
  ippatsuya: { name: "一発屋", good: true, how: "1 回目の提出で合格した日が 10 日連続", until: "2 回目の提出が要る日が出たら外れる" },
  "high-scorer": { name: "ハイスコアラー", good: true, how: "直近 7 回の合格の平均が 90 点以上", until: "下回ったら外れる" },
  asagata: { name: "朝型人間", good: true, how: "9:00 より前の宣言が 7 日連続", until: "連続が切れたら外れる" },
  keppaku: { name: "潔白", good: true, how: "28 日間「怪しい」を押されていない", until: "押されたら外れる" },
  kansai: { name: "完済者", good: true, how: "先週が期限の補習を、期限の 3 日前までに返し終えた", until: "次の土曜の締めまで" },
  mvp: { name: "今週の MVP", good: true, how: "先週の XP の増え方がグループでいちばん大きい", until: "次の土曜の締めまで" },
};

/** A held title. `trial`: only counts trial days, so it shows as 「本番なら」. */
export type Title = { id: TitleId; trial: boolean };

const monthOf = (date: string) => date.slice(0, 7);

function nextMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

function daysInMonth(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return new Date(Date.UTC(year, m, 0)).getUTCDate();
}

function previousMonth(month: string): string {
  const [year, m] = month.split("-").map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, "0")}`;
}

/** Whole months (before the current one) in which every study day was achieved (皆勤賞). */
export function perfectMonths(input: StandingInput, today: string): string[] {
  const months = new Map<string, StandingDay[]>();
  for (const day of input.days) {
    const month = monthOf(day.date);
    if (month >= monthOf(today)) continue;
    months.set(month, [...(months.get(month) ?? []), day]);
  }
  return [...months]
    .filter(
      ([month, days]) =>
        input.joinedOn <= `${month}-01` &&
        days.length === daysInMonth(month) &&
        days.every((day) => day.kind === "completed" || day.kind === "rest" || day.kind === "leave") &&
        days.some((day) => day.kind === "completed"),
    )
    .map(([month]) => month);
}

const slacked = (day: StandingDay) =>
  day.kind === "no_declaration" || (day.kind === "missed" && (day.failureCategory === "slacked" || day.failureCategory === "not_reported"));

/** Current run (most recent days) of days matching `hit`, skipping `skip`, broken by anything else. */
function currentRun(days: StandingDay[], hit: (day: StandingDay) => boolean, skip: (day: StandingDay) => boolean): number {
  let run = 0;
  for (const day of days) {
    if (skip(day)) continue;
    run = hit(day) ? run + 1 : 0;
  }
  return run;
}

/** The bad titles that come from study days, counting trial days or not. */
function dayTitles(input: StandingInput, ctx: StandingContext, withTrial: boolean): TitleId[] {
  const days = withTrial ? input.days : input.days.filter((day) => !day.inTrial);
  const thisMonth = days.filter((day) => monthOf(day.date) === monthOf(ctx.today));
  const titles: TitleId[] = [];
  const neutral = (day: StandingDay) => NEUTRAL.includes(day.kind);

  if (currentRun(days, (day) => FAILED.includes(day.kind), neutral) >= 5) titles.push("mitatsu-king");
  if (thisMonth.filter(slacked).length >= 5) titles.push("saborer");
  if (thisMonth.filter((day) => day.kind === "no_declaration").length >= 3) titles.push("nebosuke");
  const unrealistic = currentRun(
    days,
    (day) => day.kind === "missed" && day.failureCategory === "unrealistic",
    (day) => neutral(day) || day.kind === "no_declaration",
  );
  if (unrealistic >= ctx.unrealisticStreakThreshold) titles.push("keikaku-daore");
  if (thisMonth.some((day) => day.kind === "invalidated")) titles.push("sagishi-giwaku");
  const lastMinute = thisMonth.filter(
    (day) =>
      day.passedSubmittedAt !== null &&
      day.targetEndTime !== null &&
      new Date(day.targetEndTime).getTime() - new Date(day.passedSubmittedAt).getTime() < 3_600_000,
  );
  if (lastMinute.length >= 5) titles.push("girigiri");
  const rejected = input.penalties.filter(
    (penalty) =>
      (penalty.reason === "excuse_rejected" || penalty.reason === "excuse_expired") &&
      (withTrial || !penalty.waived) &&
      monthOf(jst(penalty.at)) === monthOf(ctx.today),
  );
  if (rejected.length >= 2) titles.push("iiwake-master");
  return titles;
}

/** Group-wide winners of the last closed week (課金王・無課金勢・MVP・完済者). */
export type WeeklyWinners = { kakinKing: Set<string>; mukakin: Set<string>; mvp: Set<string>; kansai: Set<string> };

export function weeklyWinners(inputs: StandingInput[], ctx: StandingContext): WeeklyWinners {
  const winners: WeeklyWinners = { kakinKing: new Set(), mukakin: new Set(), mvp: new Set(), kansai: new Set() };
  const close = ctx.lastClose;
  if (!close) return winners;
  const weekStart = addDays(close.date, -6);
  const inWeek = (date: string) => date >= weekStart && date <= close.date;

  const paid = new Map(inputs.map((input) => [input.memberId, input.settlements.find((s) => s.periodEnd === close.date)?.amount ?? 0]));
  const most = Math.max(0, ...paid.values());
  for (const input of inputs) {
    const amount = paid.get(input.memberId)!;
    if (most > 0 && amount === most) winners.kakinKing.add(input.memberId);
    const played = input.days.some((day) => inWeek(day.date) && !day.inTrial && (day.kind === "completed" || FAILED.includes(day.kind)));
    if (amount === 0 && played && new Date(input.trialEndsAt).getTime() <= close.at) winners.mukakin.add(input.memberId);

    // 完済者: what was due at this close was paid back three days before it.
    const owedByClose = input.makeup.debts
      .filter((debt) => !debt.waived && new Date(debt.dueAt).getTime() <= close.at)
      .reduce((sum, debt) => sum + debt.count, 0);
    const dueNow = input.makeup.debts.some((debt) => !debt.waived && new Date(debt.dueAt).getTime() === close.at);
    const early = input.makeup.passedAt.filter((at) => new Date(at).getTime() <= close.at - 3 * 86_400_000).length;
    if (dueNow && early >= owedByClose) winners.kansai.add(input.memberId);
  }

  const gained = new Map(
    inputs.map((input) => [input.memberId, xpEvents(input, ctx.today).filter((event) => inWeek(event.date)).reduce((sum, event) => sum + event.points, 0)]),
  );
  const best = Math.max(0, ...gained.values());
  for (const [id, xp] of gained) if (best > 0 && xp === best) winners.mvp.add(id);
  return winners;
}

/** One member's titles, bad ones first (states, then the rest), then good ones. */
export function titlesOf(input: StandingInput, ctx: StandingContext, weekly: WeeklyWinners): Title[] {
  const real = new Set<TitleId>(dayTitles(input, ctx, false));
  if (input.makeup.overdue > 0) real.add("tousousha");
  if (input.settlements.some((settlement) => settlement.late && settlement.status === "open")) real.add("binbounin");
  if (weekly.kakinKing.has(input.memberId)) real.add("kakin-king");

  const counted = input.days.filter((day) => !day.inTrial);
  const neutral = (day: StandingDay) => NEUTRAL.includes(day.kind);
  const streak = currentRun(counted, (day) => day.kind === "completed", neutral);
  // Tiers: only the highest of a family shows.
  if (streak >= 100) real.add("densetsu");
  else if (streak >= 30) real.add("shukan-oni");
  else if (streak >= 7) real.add("keizoku");
  if (currentRun(counted, (day) => day.kind === "completed" && day.attempts === 1, neutral) >= 10) real.add("ippatsuya");
  const scored = counted.filter((day) => day.kind === "completed" && day.finalScore !== null).slice(-7);
  if (scored.length === 7 && scored.reduce((sum, day) => sum + day.finalScore!, 0) / 7 >= 90) real.add("high-scorer");
  const morning = currentRun(
    counted,
    (day) => day.declaredAt !== null && Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Tokyo", hour: "numeric", hourCycle: "h23" }).format(new Date(day.declaredAt))) < 9,
    (day) => day.kind === "rest" || day.kind === "leave" || day.kind === "none" || (day.kind === "pending" && day.declaredAt === null),
  );
  if (morning >= 7) real.add("asagata");
  const since = addDays(ctx.today, -27);
  const recent = input.days.filter((day) => day.date >= since);
  if (
    input.joinedOn <= since &&
    recent.some((day) => day.passedSubmittedAt !== null) &&
    !recent.some((day) => day.flaggedAt.length > 0)
  ) {
    real.add("keppaku");
  }
  if (perfectMonths(input, ctx.today).includes(previousMonth(monthOf(ctx.today)))) real.add("kaikin");
  if (weekly.mukakin.has(input.memberId)) real.add("mukakin");
  if (weekly.kansai.has(input.memberId)) real.add("kansai");
  if (weekly.mvp.has(input.memberId)) real.add("mvp");

  // During the trial, bad titles earned only by trial days show as 「本番なら」.
  const inTrial = new Date(input.trialEndsAt).getTime() > ctx.now;
  const trial = inTrial ? dayTitles(input, ctx, true).filter((id) => !real.has(id)) : [];

  const order = (Object.keys(TITLES) as TitleId[]).sort((a, b) => weight(a) - weight(b));
  return [
    ...order.filter((id) => real.has(id)).map((id) => ({ id, trial: false })),
    ...order.filter((id) => trial.includes(id)).map((id) => ({ id, trial: true })),
  ];
}

function weight(id: TitleId): number {
  const title = TITLES[id];
  return title.good ? 2 : title.state ? 0 : 1;
}

// ---------------------------------------------------------------------------------------------
// Everyone at once
// ---------------------------------------------------------------------------------------------

export type Standing = {
  memberId: string;
  xp: number;
  totalXp: number;
  rank: (typeof RANKS)[number];
  next: ReturnType<typeof nextRank>;
  titles: Title[];
  /** Group's XP leader (2+ members, not everyone equal, 1 XP or more). */
  crown: boolean;
  /** Group's lowest XP (2+ members, not everyone equal). */
  last: boolean;
  events: XpEvent[];
  /** The dates in the 28-day window (leave days skipped). */
  window: string[];
};

/** The 28-day window of a computed standing, as a set. */
export function xpWindowDates(standing: Standing): Set<string> {
  return new Set(standing.window);
}

export function computeStandings(inputs: StandingInput[], ctx: StandingContext): Map<string, Standing> {
  const weekly = weeklyWinners(inputs, ctx);
  const rows = inputs.map((input): Standing => {
    const events = xpEvents(input, ctx.today);
    const window = xpWindow(input.days, ctx.today);
    const xp = events.filter((event) => window.has(event.date)).reduce((sum, event) => sum + event.points, 0);
    return {
      memberId: input.memberId,
      xp,
      totalXp: events.reduce((sum, event) => sum + event.points, 0),
      rank: rankOf(xp),
      next: nextRank(xp),
      titles: titlesOf(input, ctx, weekly),
      crown: false,
      last: false,
      events,
      window: [...window],
    };
  });
  const values = rows.map((row) => row.xp);
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  if (rows.length >= 2 && top !== bottom) {
    for (const row of rows) {
      row.crown = row.xp === top && top >= 1;
      row.last = row.xp === bottom;
    }
  }
  return new Map(rows.map((row) => [row.memberId, row]));
}

/** The latest weekly close that has passed (settlement weekday and time, JST). */
export function lastCloseOf(today: string, now: number, weekday: number, time: string): { date: string; at: number } {
  let date = addDays(today, -((weekdayOf(today) - weekday + 7) % 7));
  let at = new Date(`${date}T${time.slice(0, 5)}:00+09:00`).getTime();
  if (now < at) {
    date = addDays(date, -7);
    at -= 7 * 86_400_000;
  }
  return { date, at };
}
