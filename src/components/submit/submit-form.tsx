"use client";

import { useState } from "react";
import { ActionButton } from "@/components/brand/action-button";
import { Sticker } from "@/components/brand/sticker";
import { Tape } from "@/components/brand/tape";
import { FieldLabel, TextArea } from "@/components/form/fields";
import { cn } from "@/lib/utils";

const MAX_PHOTOS = 3;

type Props = {
  goal: string;
  passphrase: string;
  attemptsLeft: number;
};

export function SubmitForm({ goal, passphrase, attemptsLeft }: Props) {
  const [photos, setPhotos] = useState<{ file: File; url: string }[]>([]);
  const [learned, setLearned] = useState("");
  const [struggled, setStruggled] = useState("");
  const [rating, setRating] = useState(0);

  const ready = photos.length > 0 && learned.trim() && struggled.trim() && rating > 0;

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const next = [...files].slice(0, MAX_PHOTOS - photos.length).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPhotos((current) => [...current, ...next]);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].url);
      return current.filter((_, i) => i !== index);
    });
  }

  return (
    <form className="grid gap-5" onSubmit={(event) => event.preventDefault()}>
      <Sticker tone="tape" shadow="sm" className="grid gap-1 px-3.5 py-3">
        <span className="text-xs">今日の宣言</span>
        <span className="text-base">{goal}</span>
        <span className="text-sm">
          写真の 1 枚に合言葉 <strong className="font-hand text-lg">{passphrase}</strong> を写してください
        </span>
      </Sticker>

      <section className="grid gap-2">
        <span className="font-sans text-base font-black">
          証拠の写真（{photos.length} / {MAX_PHOTOS}）
        </span>
        <div className="grid grid-cols-3 gap-3">
          {photos.map((photo, index) => (
            <Sticker key={photo.url} shadow="sm" className="relative aspect-square overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
              <img src={photo.url} alt={`写真 ${index + 1}`} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(index)}
                className="absolute top-1 right-1 rounded-full border-2 border-ink bg-card px-1.5 text-xs"
                aria-label={`写真 ${index + 1} を外す`}
              >
                ✕
              </button>
            </Sticker>
          ))}
          {photos.length < MAX_PHOTOS ? (
            <label
              className={cn(
                "relative grid aspect-square cursor-pointer place-items-center rounded-[14px] border-[3px] border-dashed border-ink bg-card text-center text-sm",
                photos.length === 0 && "col-span-3 aspect-[16/9]",
              )}
            >
              {photos.length === 0 ? <Tape className="-top-3 left-1/2 -ml-9" /> : null}
              <span>
                ＋ 写真を撮る
                <br />
                <span className="text-xs text-sub">ノート・画面など</span>
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                className="sr-only"
                onChange={(event) => addPhotos(event.target.files)}
              />
            </label>
          ) : null}
        </div>
      </section>

      <div className="grid gap-1.5">
        <FieldLabel htmlFor="learned">学んだこと</FieldLabel>
        <TextArea id="learned" value={learned} onChange={(e) => setLearned(e.target.value)} placeholder="例: 固有値の出し方と対角化の手順" />
      </div>
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="struggled">できなかったこと・あいまいな所</FieldLabel>
        <TextArea id="struggled" value={struggled} onChange={(e) => setStruggled(e.target.value)} placeholder="例: 重解のときの対角化" />
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
                "grid size-12 place-items-center rounded-xl border-[3px] border-ink font-en text-lg shadow-hard-sm",
                rating >= value ? "bg-tape" : "bg-card",
              )}
            >
              {value}
            </button>
          ))}
        </div>
      </fieldset>

      <ActionButton type="submit" disabled={!ready} hint={`AI が採点します ・ 残り ${attemptsLeft} 回`}>
        提出する
      </ActionButton>
    </form>
  );
}
