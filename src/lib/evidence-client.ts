import imageCompression from "browser-image-compression";
import { createClient } from "@/lib/supabase/client";

// Browser side of evidence photos (F4b): compress to WebP before upload (long side 1200px,
// ~250KB; thumbnail 320px, ~30KB), then upload to the member's own folder in Storage.
// Import from client components only.

const BUCKET = "study-evidence";

async function toWebp(file: File, maxSide: number, maxSizeMB: number): Promise<Blob> {
  return imageCompression(file, {
    maxWidthOrHeight: maxSide,
    maxSizeMB,
    fileType: "image/webp",
    initialQuality: 0.82,
    useWebWorker: true,
  });
}

export type UploadedEvidence = { imagePaths: string[]; thumbPath: string | null };

/** Compresses and uploads the photos; paths are "{user_id}/{date}/{uuid}.webp". */
export async function uploadEvidence(userId: string, date: string, files: File[]): Promise<UploadedEvidence> {
  const supabase = createClient();
  const upload = async (blob: Blob, name: string) => {
    const path = `${userId}/${date}/${name}.webp`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: "image/webp", upsert: false });
    if (error) throw error;
    return path;
  };

  const imagePaths = await Promise.all(files.map(async (file) => upload(await toWebp(file, 1200, 0.25), crypto.randomUUID())));
  let thumbPath: string | null = null;
  try {
    const thumbName = `${crypto.randomUUID()}_thumb`;
    thumbPath = await upload(await toWebp(files[0], 320, 0.03), thumbName);
  } catch {
    // The thumbnail is only for history views; a failure must not block the submission.
  }
  return { imagePaths, thumbPath };
}
