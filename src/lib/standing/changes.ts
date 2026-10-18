// What changed in a group's titles, ranks and crown since the last snapshot (F13, F14, ADR-041).
// Pure: lib/standing/record.ts loads the snapshot, computes the standings and records the result.

import { RANKS, type RankId, type Standing, type TitleId } from "./rules";

export type Snapshot = {
  members: Record<string, { rank: RankId; titles: TitleId[] }>;
  crown: string[];
};

export type StandingChange = {
  type: "title_awarded" | "title_removed" | "rank_changed" | "crown_moved";
  actor_id: string;
  payload: Record<string, unknown>;
};

/** Today's snapshot. Trial-only titles (「本番なら」) aren't real, so they aren't recorded. */
export function snapshotOf(standings: Map<string, Standing>): Snapshot {
  const members: Snapshot["members"] = {};
  const crown: string[] = [];
  for (const [id, standing] of standings) {
    members[id] = { rank: standing.rank.id, titles: standing.titles.filter((title) => !title.trial).map((title) => title.id) };
    if (standing.crown) crown.push(id);
  }
  return { members, crown: crown.sort() };
}

/**
 * The changes from `previous` to `current`. Without a previous snapshot (the first run) nothing
 * is announced, and a member new to the snapshot starts quietly too.
 */
export function diffStandings(previous: Snapshot | null, current: Snapshot): StandingChange[] {
  if (!previous) return [];
  const changes: StandingChange[] = [];
  const order = (rank: RankId) => RANKS.findIndex((candidate) => candidate.id === rank);
  for (const [id, now] of Object.entries(current.members)) {
    const before = previous.members[id];
    if (!before) continue;
    for (const title of now.titles) {
      if (!before.titles.includes(title)) changes.push({ type: "title_awarded", actor_id: id, payload: { title } });
    }
    for (const title of before.titles) {
      if (!now.titles.includes(title)) changes.push({ type: "title_removed", actor_id: id, payload: { title } });
    }
    if (before.rank !== now.rank) {
      changes.push({
        type: "rank_changed",
        actor_id: id,
        // RANKS runs from the top, so a smaller index is a higher rank.
        payload: { from: before.rank, to: now.rank, up: order(now.rank) < order(before.rank) },
      });
    }
  }
  for (const id of current.crown) {
    if (!previous.crown.includes(id)) changes.push({ type: "crown_moved", actor_id: id, payload: { from: previous.crown } });
  }
  return changes;
}

export function sameSnapshot(a: Snapshot | null, b: Snapshot): boolean {
  return a !== null && JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function normalize(snapshot: Snapshot) {
  return {
    crown: [...snapshot.crown].sort(),
    members: Object.keys(snapshot.members)
      .sort()
      .map((id) => [id, snapshot.members[id].rank, [...snapshot.members[id].titles].sort()]),
  };
}
