"use server";

import { refresh } from "next/cache";
import { requireMember } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPickableTheme, type PickableThemeId } from "@/lib/theme/themes";

export type ThemeState = { error?: string };

/**
 * 「見た目のテーマ」 (F16): the caller's own pick (null = 標準) and whether the seasonal themes take
 * over. Only the member's own screens change, so nobody is notified.
 */
export async function setUiTheme(theme: PickableThemeId | null, seasonThemes: boolean): Promise<ThemeState> {
  if (theme !== null && !isPickableTheme(theme)) return { error: "このテーマは選べません" };
  const member = await requireMember();
  const { error } = await createAdminClient().rpc("set_ui_theme", {
    p_user_id: member.id,
    // Generated types mark every argument non-null; null is 標準.
    p_theme: theme as string,
    p_season_themes: Boolean(seasonThemes),
  });
  if (error) {
    console.error("set_ui_theme failed", error);
    return { error: "保存できませんでした。時間をおいてもう一度試してください" };
  }
  refresh();
  return {};
}
