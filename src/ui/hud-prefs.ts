/** Head-up display preferences and their limits. */
export const defaultHUD = {
  timer: true,
  delta: true,
  splits: true,
  checkpoint: true,
  speed: true,
  ghost: true,
  scale: 1,
  safe: 24,
};
export type HUDPrefs = typeof defaultHUD;
export const HUD_SCALE = { min: 0.75, max: 1.4 };
export const HUD_SAFE_ZONE = { min: 8, max: 64 };
export const GHOST_OPACITY = { min: 0.2, max: 1 };
