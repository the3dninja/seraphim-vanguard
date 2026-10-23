// Base resolution: a narrow NES-like portrait screen, scaled up to fit the phone.
export const W = 180;
export const H = 320;
// The flight HUD's buttons (px, tall and wide), in one row along the bottom,
// and the lowest the ship flies, clear of them.
export const HUD_BTN = 33;
export const HUD_BTN_W = 43;
export const SHIP_MAX_Y = H - 44;

export const FONT = '"Press Start 2P"';

// NES-ish colors used by UI code (sprites use the palette in art.ts).
export const COLOR = {
  white: '#fcfcfc',
  gray: '#7c7c7c',
  dim: '#3c3c3c',
  yellow: '#f8b800',
  red: '#d82800',
  cyan: '#3cbcfc',
  green: '#58d854',
};
