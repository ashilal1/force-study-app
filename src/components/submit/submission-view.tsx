import { Sticker } from "@/components/brand/sticker";
import { Tape } from "@/components/brand/tape";

/** A submitted entry, read-only: the taped-up photo and the two reflection fields. */
export function SubmissionView({
  photo,
  learned,
  struggled,
}: {
  photo: React.ReactNode;
  learned: string;
  struggled: string;
}) {
  return (
    <div className="grid gap-4">
      <Sticker className="relative">
        <Tape className="-top-3 left-1/2 -ml-9" />
        <div className="overflow-hidden rounded-[11px]">{photo}</div>
      </Sticker>
      <section className="grid gap-1.5">
        <h3 className="m-0 font-sans text-base font-black">学んだこと</h3>
        <Sticker shadow="sm" className="px-3 py-2.5">
          {learned}
        </Sticker>
      </section>
      <section className="grid gap-1.5">
        <h3 className="m-0 font-sans text-base font-black">できなかったこと</h3>
        <Sticker shadow="sm" className="px-3 py-2.5">
          {struggled}
        </Sticker>
      </section>
    </div>
  );
}
