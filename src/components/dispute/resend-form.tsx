"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resendEvidence } from "@/actions/disputes";
import { judgeMySubmission } from "@/actions/submissions";
import { ActionButton } from "@/components/brand/action-button";
import { FieldLabel, TextArea } from "@/components/form/fields";
import { FieldError } from "@/components/form/submit-button";
import { PhotoPicker, type PickedPhoto } from "@/components/submit/photo-picker";
import { uploadEvidence } from "@/lib/evidence-client";

/** F5b: more evidence (with the passphrase) while the dispute is open; as many times as needed. */
export function ResendForm({ logId, userId, date }: { logId: string; userId: string; date: string }) {
  const router = useRouter();
  const [photos, setPhotos] = useState<PickedPhoto[]>([]);
  const [explanation, setExplanation] = useState("");
  const [phase, setPhase] = useState<"idle" | "uploading" | "judging">("idle");
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();
  const busy = phase !== "idle";

  function send() {
    setError(undefined);
    startTransition(async () => {
      try {
        setPhase("uploading");
        const uploaded = await uploadEvidence(
          userId,
          date,
          photos.map((photo) => photo.file),
        );
        const created = await resendEvidence({ logId, ...uploaded, explanation });
        if ("error" in created) {
          setError(created.error);
          return;
        }
        setPhase("judging");
        await judgeMySubmission(created.submissionId);
        setPhotos([]);
        setExplanation("");
        router.refresh();
      } catch {
        setError("アップロードに失敗しました。もう一度試してください");
      } finally {
        setPhase("idle");
      }
    });
  }

  return (
    <div className="grid gap-4">
      <PhotoPicker photos={photos} onChange={setPhotos} disabled={busy} />
      <div className="grid gap-1.5">
        <FieldLabel htmlFor="explanation">説明</FieldLabel>
        <TextArea
          id="explanation"
          value={explanation}
          maxLength={1000}
          onChange={(event) => setExplanation(event.target.value)}
          placeholder="例: 途中の計算ノートと、合言葉を書いた紙を一緒に撮り直しました"
        />
      </div>
      <FieldError id="resend-error" message={error} />
      <ActionButton type="button" tone="orange" disabled={busy || photos.length === 0 || !explanation.trim()} onClick={send}>
        {phase === "uploading" ? "アップロード中…" : phase === "judging" ? "AI が確認中…" : "証拠を送り直す"}
      </ActionButton>
    </div>
  );
}
