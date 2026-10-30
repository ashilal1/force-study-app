"use client";

import { useEffect, useState, useTransition } from "react";
import { addStudyPhoto } from "@/actions/study-photos";
import { actionButtonVariants } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { FieldError } from "@/components/form/submit-button";
import { uploadEvidence } from "@/lib/evidence-client";
import { formatJstTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export type StudyPhotoView = { id: string; kind: string; url: string | null; takenAt: string };

/** At most this many photos while studying a day (add_study_photo). */
const MAX_STUDY_PHOTOS = 6;

/**
 * Photos taken while studying (F4c): the start photo first (passphrase with the blank page or the
 * opened book), then, if the member wants, progress photos photo_gap_minutes apart. The server
 * stamps the time; the clock here only decides when to offer the button.
 */
export function StudyPhotos({
  live,
  photos,
  gapMinutes,
  required,
  open,
}: {
  /** Today's log and where the photos go. Omitted in the /preview gallery (nothing is uploaded). */
  live?: { logId: string; userId: string; date: string };
  photos: StudyPhotoView[];
  gapMinutes: number;
  /** The group needs the start photo before submitting. */
  required: boolean;
  /** The day still takes photos (pending, before its deadline, nothing being judged). */
  open: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const last = photos.at(-1);
  const nextAt = last ? new Date(last.takenAt).getTime() + gapMinutes * 60_000 : null;
  const now = useNow(nextAt);
  const canAdd = open && photos.length < MAX_STUDY_PHOTOS && (nextAt === null || now >= nextAt);

  function take(file: File | undefined) {
    if (!file || !live) return;
    setError(undefined);
    startTransition(async () => {
      try {
        const { imagePaths, thumbPath } = await uploadEvidence(live.userId, live.date, [file]);
        const result = await addStudyPhoto({ logId: live.logId, imagePath: imagePaths[0], thumbPath });
        if (result.error) setError(result.error);
      } catch {
        setError("アップロードに失敗しました。電波の良いところでもう一度試してください");
      }
    });
  }

  if (photos.length === 0) {
    if (!open) return null;
    return (
      <Sticker tone="tape" className="grid gap-2.5 px-4 py-3.5">
        <b>まず、始めの写真を撮る</b>
        <span className="text-sm font-medium">
          合言葉を書いた紙と、これからやるノート・教材を一緒に撮ります。撮った時刻が記録され、AI とメンバーが最後の提出と比べます。
          {required ? "このグループでは、始めの写真がないと提出できません。" : "撮らなくても提出できますが、「ちゃんとやった」の証拠になります。"}
        </span>
        <CameraButton label={pending ? "アップロード中…" : "始めの写真を撮る"} disabled={pending} onPick={take} tone="mint" />
        <FieldError id="study-photo-error" message={error} />
      </Sticker>
    );
  }

  return (
    <section className="grid gap-2">
      <h2 className="m-0 font-sans text-base font-black">勉強の記録</h2>
      <div className="grid grid-cols-3 gap-2">
        {photos.map((photo) => (
          <figure key={photo.id} className="m-0 grid gap-1">
            <Sticker shadow="sm" className="grid aspect-square place-items-center overflow-hidden">
              {photo.url ? (
                <a href={photo.url} target="_blank" rel="noreferrer" className="block size-full">
                  {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed URL from Supabase Storage */}
                  <img src={photo.url} alt={photo.kind === "start" ? "始めの写真" : "途中の写真"} className="size-full object-cover" />
                </a>
              ) : (
                <span className="text-xs text-sub">保存期間が過ぎました</span>
              )}
            </Sticker>
            <figcaption className="text-center text-xs font-bold">
              {photo.kind === "start" ? "始め" : "途中"} {formatJstTime(photo.takenAt)}
            </figcaption>
          </figure>
        ))}
      </div>
      {open && photos.length < MAX_STUDY_PHOTOS ? (
        canAdd ? (
          <CameraButton
            label={pending ? "アップロード中…" : "途中の写真を足す（なくてもいい）"}
            disabled={pending}
            onPick={take}
            tone="white"
          />
        ) : nextAt !== null ? (
          <p className="m-0 text-xs font-bold text-sub">
            次の写真は {formatJstTime(new Date(nextAt).toISOString())} から撮れます。スマホは置いて、勉強に戻りましょう。
          </p>
        ) : null
      ) : null}
      <FieldError id="study-photo-error" message={error} />
    </section>
  );
}

/** Opens the camera (the device may still offer the gallery). */
function CameraButton({
  label,
  disabled,
  onPick,
  tone,
}: {
  label: string;
  disabled: boolean;
  onPick: (file: File | undefined) => void;
  tone: "mint" | "white";
}) {
  return (
    <label
      className={cn(
        actionButtonVariants({ tone }),
        "cursor-pointer",
        tone === "white" && "py-2 text-base",
        disabled && "pointer-events-none opacity-50",
      )}
    >
      {label}
      <input
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          onPick(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
    </label>
  );
}

/** The current time, ticking until `until` has passed (then it stops). */
function useNow(until: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (until === null || now >= until) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(until - now + 500, 60_000));
    return () => clearTimeout(timer);
  }, [until, now]);
  return now;
}
