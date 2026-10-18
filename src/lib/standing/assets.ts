// Images the owner draws (docs/visual-assets.md). Until a file lands in public/, the app draws a
// stand-in; when it does, add its id here so the real image is used.

/** Title and rank badges in public/badges/<id>.png (rank badges are "rank-<rank id>"). */
export const BADGE_IMAGES = new Set<string>([]);

/** Rank theme images in public/theme/. */
export const THEME_IMAGES = {
  crown: false,
  concrete: false,
  crack: false,
  tape: false,
  stain: false,
  siren: false,
  bars: false,
  orPenalty: false,
} as const satisfies Record<string, boolean>;
