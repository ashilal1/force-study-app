"use client";

import { Sticker } from "@/components/brand/sticker";
import { Tape } from "@/components/brand/tape";
import { cn } from "@/lib/utils";

export const MAX_PHOTOS = 3;

export type PickedPhoto = { file: File; url: string };

/** 1-3 evidence photos: take or choose (the device offers both), preview, remove. */
export function PhotoPicker({
  photos,
  onChange,
  disabled = false,
}: {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  disabled?: boolean;
}) {
  function add(files: FileList | null) {
    if (!files) return;
    const next = [...files]
      .filter((file) => file.type.startsWith("image/"))
      .slice(0, MAX_PHOTOS - photos.length)
      .map((file) => ({ file, url: URL.createObjectURL(file) }));
    onChange([...photos, ...next]);
  }

  function remove(index: number) {
    URL.revokeObjectURL(photos[index].url);
    onChange(photos.filter((_, i) => i !== index));
  }

  return (
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
              onClick={() => remove(index)}
              disabled={disabled}
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
              ＋ 写真を撮る・選ぶ
              <br />
              <span className="text-xs text-sub">ノート・画面など</span>
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={disabled}
              className="sr-only"
              onChange={(event) => {
                add(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        ) : null}
      </div>
    </section>
  );
}
