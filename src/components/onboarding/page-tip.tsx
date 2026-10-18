import { requireMember } from "@/lib/auth";
import { pickTip, type TipCandidate } from "@/lib/tips";
import { CoachMark } from "./coach-mark";

/**
 * The screen's coach mark (F15): the first of `candidates` the member hasn't closed, if any. Put it
 * where the page already knows its state; the element it points at carries `data-tip`.
 */
export async function PageTip({ candidates }: { candidates: TipCandidate[] }) {
  const me = await requireMember();
  const tip = pickTip(me.seen_tips, candidates);
  return tip ? <CoachMark tip={tip[0]} text={tip[1]} /> : null;
}
