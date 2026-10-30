"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireMember } from "@/lib/auth";
import { GENERIC_ERROR, rpcErrorMessage } from "@/lib/rpc-errors";
import { createAdminClient } from "@/lib/supabase/admin";

// Photos taken while studying (F4c): the start photo, then progress photos. The browser uploads the
// compressed photo to the member's own folder first; the server stamps the time.

const photoSchema = z.object({
  logId: z.uuid(),
  imagePath: z.string().max(200),
  thumbPath: z.string().max(200).nullable(),
});

export async function addStudyPhoto(input: z.input<typeof photoSchema>): Promise<{ error?: string }> {
  const member = await requireMember();
  const parsed = photoSchema.safeParse(input);
  if (!parsed.success) return { error: GENERIC_ERROR };
  const { error } = await createAdminClient().rpc("add_study_photo", {
    p_user_id: member.id,
    p_study_log_id: parsed.data.logId,
    p_image_path: parsed.data.imagePath,
    // Generated types mark every argument non-null; the function accepts a missing thumbnail.
    p_thumb_path: parsed.data.thumbPath as string,
  });
  if (error) {
    const message = rpcErrorMessage(error);
    if (!message) console.error("add_study_photo failed", error);
    return { error: message ?? GENERIC_ERROR };
  }
  refresh();
  return {};
}
