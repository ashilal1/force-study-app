// View models for the dashboard. Built from Supabase rows on the server (later) or from sample data (preview).

export type MemberStatus =
  | { kind: "undeclared"; declarationCutoff: string }
  | { kind: "pending"; goal: string; deadline: string }
  | { kind: "passed"; goal: string; score: number; disputeWindowEndsAt: string }
  | { kind: "disputed"; goal: string; flagCount: number }
  | { kind: "completed"; goal: string; score: number }
  | { kind: "awaiting_report"; goal: string }
  | { kind: "under_review"; goal: string }
  | { kind: "penalized"; goal: string | null; label: string; points: number }
  | { kind: "rest" }
  | { kind: "leave" };

export type MemberToday = {
  id: string;
  name: string;
  avatarUrl: string | null;
  colorIndex: number;
  status: MemberStatus;
};

export type MyToday = {
  status: MemberStatus;
  passphrase: string | null;
  attemptsUsed: number;
  maxAttempts: number;
};

export type WeeklyPenaltyRow = {
  memberId: string;
  name: string;
  failedDays: number;
  amountYen: number;
};

export type DashboardData = {
  weekLabel: string;
  daysToSettlement: number;
  me: MyToday;
  members: MemberToday[];
  ranking: WeeklyPenaltyRow[];
  isTrial: boolean;
};
