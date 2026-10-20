"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createSubmission, judgeMySubmission } from "@/actions/submissions";
import { ActionButton } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { FieldLabel, TextArea } from "@/components/form/fields";
import { FieldError } from "@/components/form/submit-button";
import { uploadEvidence } from "@/lib/evidence-client";
import { cn } from "@/lib/utils";
import { PhotoPicker, type PickedPhoto } from "./photo-picker";

type Props = {
  goal: string;
  passphrase: string;
  attemptsLeft: number;
  /** Live submission: today's log and where the photos go. Omitted in the /preview gallery. */
  live?: { logId: string; userId: string; date: string };
  /** Heading over the declaration ("今日の宣言", or "補習の宣言" for a makeup session). */
  goalLabel?: string;
};

type Phase = "idle" | "uploading" | "saving" | "judging";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "提出する",
  uploading: "写真を圧縮・アップロード中…",
  saving: "提出を記録中…",
  judging: "AI が判定中…（数秒〜数十秒）",
};

export function SubmitForm({ goal, passphrase, attemptsLeft, live, goalLabel = "今日の宣言" }: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [learned, setLearned] = useState("");
  const [struggled, setStruggled] = useState("");
  const [rating, setRating] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  const busy = phase !== "idle";
  const ready = photos.length > 0 && learned.trim() && struggled.trim() && rating > 0 && !busy;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!live || !ready) return;
    setError(undefined);
    startTransition(async () => {
      try {
        setPhase("uploading");
        const uploaded = await uploadEvidence(
          live.userId,
          live.date,
          photos.map((photo) => photo.file),
        );
        setPhase("saving");
        const created = await createSubmission({ logId: live.logId, ...uploaded, learned, struggled, rating });
        if ("error" in created) {
          setError(created.error);
          return;
        }
        setPhase("judging");
        await judgeMySubmission(created.submissionId);
        router.refresh();
      } catch {
        setError("アップロードに失敗しました。電波の良いところでもう一度試してください");
      } finally {
        setPhase("idle");
      }
    });
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      <Sticker tone="tape" shadow="sm" className="grid gap-1 px-3.5 py-3">
        <span className="text-xs">{goalLabel}</span>
        <span className="text-base">{goal}</span>
        <span className="text-sm">
          写真の 1 枚に合言葉 <strong className="font-hand text-lg">{passphrase}</strong> を写してください
        </span>
      </Sticker>

      <div data-tip="submit_photos">
        <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />
      </div>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="learned">学んだこと</FieldLabel>
        <TextArea
          id="learned"
          value={learned}
          maxLength={2000}
          onChange={(e) => setLearned(e.target.value)}
          placeholder="例: 固有値の出し方と対角化の手順"
        />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="struggled">できなかったこと・あいまいな所</FieldLabel>
        <TextArea
          id="struggled"
          value={struggled}
          maxLength={2000}
          onChange={(e) => setStruggled(e.target.value)}
          placeholder="例: 重解のときの対角化"
        />
      </div>

      <fieldset className="m-0 grid gap-2 border-0 p-0">
        <legend className="mb-2 font-sans text-base font-black">自己評価</legend>
        <div className="flex gap-2">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={rating === value}
              onClick={() => setRating(value)}
              className={cn(
                "th-cell grid size-12 place-items-center rounded-xl border-[3px] border-ink font-en text-lg shadow-hard-sm",
                rating >= value ? "bg-tape" : "bg-card",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <FieldError id="submit-error" message={error} />
      <ActionButton type="submit" disabled={!ready} hint={busy ? undefined : `AI が採点します ・ 残り ${attemptsLeft} 回`}>
        {PHASE_LABEL[phase]}
      </ActionButton>
    </form>
  );
}
