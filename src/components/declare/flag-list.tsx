import { formatJstTime } from "@/lib/time";
import type { Flag } from "@/lib/today";

/** Who flagged a declaration as too light, and why (visible to everyone, F3b). */
export function FlagList({ flags }: { flags: Flag[] }) {
  if (flags.length === 0) return null;
  return (
    <ul className="m-0 grid list-none gap-1.5 p-0">
      {flags.map((flag) => (
        <li key={flag.flaggerId} className="rounded-[10px] border-2 border-red bg-white px-3 py-2 text-sm">
          <b className="text-red">軽すぎる</b>
          <span className="text-sub">
            {" "}
            ・ {flag.flaggerName} ・ {formatJstTime(flag.createdAt)}
          </span>
          <p className="m-0 mt-0.5 font-medium">{flag.comment}</p>
        </li>
      ))}
    </ul>
  );
}
