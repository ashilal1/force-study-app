// Images the owner draws (docs/visual-assets.md). Until a file lands in public/, the app draws a
// stand-in; when it does, add its id here so the real image is used.

/** Title and rank badges in public/badges/<id>.png (rank badges are "rank-<rank id>"). */
export const BADGE_IMAGES = new Set<string>([]);

/**
 * Rank theme images in public/theme/ that replace a drawn stand-in. The textures, cracks, tape,
 * crown and gold title from the design (grain, blotch, crack-*, tape-*, crown, title-gold) are
 * always there and need no entry.
 */
export const THEME_IMAGES = {
  crown: true,
  siren: false,
  bars: false,
} as const satisfies Record<string, boolean>;
