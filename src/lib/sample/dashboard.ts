import type { DashboardData } from "@/components/dashboard/types";

// Sample data for /preview only. Not real members or numbers.
export const sampleDashboard: DashboardData = {
  weekLabel: "WEEK 42",
  daysToSettlement: 2,
  isTrial: false,
  me: {
    status: { kind: "pending", goal: "線形代数 3 章の演習 10 問", deadline: "2026-10-16T21:00:00+09:00" },
    passphrase: "さくら 47",
    attemptsUsed: 0,
    maxAttempts: 3,
  },
  members: [
    {
      id: "m1",
      name: "みさき",
      avatarUrl: null,
      colorIndex: 0,
      status: { kind: "completed", goal: "数Ⅲ 5 問", score: 85 },
    },
    {
      id: "m2",
      name: "ケンタ",
      avatarUrl: null,
      colorIndex: 1,
      status: { kind: "penalized", goal: "TOEIC 単語 100", label: "サボり確定", points: 700 },
    },
    {
      id: "m3",
      name: "りょう",
      avatarUrl: null,
      colorIndex: 2,
      status: { kind: "undeclared", declarationCutoff: "2026-10-16T12:00:00+09:00" },
    },
    {
      id: "m4",
      name: "ゆい",
      avatarUrl: null,
      colorIndex: 3,
      status: { kind: "disputed", goal: "簿記 2 級 仕訳 30 問", flagCount: 1 },
    },
  ],
  ranking: [
    { memberId: "m2", name: "ケンタ", failedDays: 3, amountYen: 1700 },
    { memberId: "m3", name: "りょう", failedDays: 1, amountYen: 500 },
    { memberId: "m4", name: "ゆい", failedDays: 0, amountYen: 0 },
    { memberId: "m1", name: "みさき", failedDays: 0, amountYen: 0 },
  ],
};
