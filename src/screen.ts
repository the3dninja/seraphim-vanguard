import Phaser from 'phaser';
import { W, H } from './config';

// The play area is always W x H game pixels, so every screen plays the same.
// The canvas fills the whole screen around it, and everything outside the play
// area is solid black. When there's room above and below (tall phones), the
// HUD moves out of the play area into those strips; otherwise it stays over the
// play area and the black is just bars.

// Game pixels the HUD takes above and below the play area when it moves out.
export const HUD_TOP = 22;
export const HUD_BOTTOM = 40;
// The play area may shrink to this fraction of its largest size to make room for the HUD.
const MAX_SHRINK = 0.85;

export const layout = {
  x: 0, y: 0, // where the play area's top left sits on the canvas, in game pixels
  width: W, height: H, // the canvas, in game pixels
  strips: false, // the HUD sits above and below the play area
};

let probe: HTMLDivElement | null = null;

// The notch and home bar, in CSS pixels.
function safeInsets() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;'
      + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
    document.body.appendChild(probe);
  }
  const s = getComputedStyle(probe);
  const px = (v: string) => parseFloat(v) || 0;
  return { t: px(s.paddingTop), r: px(s.paddingRight), b: px(s.paddingBottom), l: px(s.paddingLeft) };
}

export function measure() {
  const el = document.getElementById('game');
  const vw = el?.clientWidth || window.innerWidth;
  const vh = el?.clientHeight || window.innerHeight;
  const ins = safeInsets();
  const sw = Math.max(1, vw - ins.l - ins.r);
  const sh = Math.max(1, vh - ins.t - ins.b);
  const fit = Math.min(sw / W, sh / H);
  const withHud = Math.min(sw / W, sh / (H + HUD_TOP + HUD_BOTTOM));
  const strips = withHud >= fit * MAX_SHRINK;
  const s = strips ? withHud : fit; // CSS pixels per game pixel
  const blockH = H + (strips ? HUD_TOP + HUD_BOTTOM : 0);
  layout.strips = strips;
  layout.width = Math.ceil(vw / s);
  layout.height = Math.ceil(vh / s);
  layout.x = Math.round((ins.l + (sw - W * s) / 2) / s);
  layout.y = Math.round((ins.t + (sh - blockH * s) / 2) / s) + (strips ? HUD_TOP : 0);
}

// Keeps the canvas fitted to the screen as it turns or the browser bars come and go.
export function watchScreen(game: Phaser.Game) {
  let queued = false;
  const update = () => {
    queued = false;
    const { width, height, x, y, strips } = layout;
    // Phaser only re-reads the screen size while the game runs, so with the
    // game paused (the Tuner open) it would fit the canvas to a stale size.
    const resized = game.scale.getParentBounds();
    measure();
    if (layout.width === width && layout.height === height && layout.x === x && layout.y === y && layout.strips === strips) {
      if (resized) game.scale.refresh();
      return;
    }
    game.scale.setGameSize(layout.width, layout.height);
    game.events.emit('layout');
  };
  const queue = () => { if (!queued) { queued = true; requestAnimationFrame(update); } };
  window.addEventListener('resize', queue);
  window.addEventListener('orientationchange', queue);
  window.visualViewport?.addEventListener('resize', queue);
}

// Lines a scene's camera up so the play area sits where the layout puts it.
// With `coverDepth`, black covers everything outside the play area from that
// depth down, so things just off the edges (spawning enemies, side hazards)
// stay hidden; the game's HUD draws above them. `onLayout` runs on each change.
export function fitScene(scene: Phaser.Scene, coverDepth?: number, onLayout?: () => void) {
  if (coverDepth !== undefined) {
    const big = 2000;
    const cover = (x: number, y: number, w: number, h: number) =>
      scene.add.rectangle(x, y, w, h, 0x000000).setOrigin(0).setDepth(coverDepth);
    cover(-big, -big, W + big * 2, big); // above
    cover(-big, H, W + big * 2, big); // below
    cover(-big, 0, big, H); // left
    cover(W, 0, big, H); // right
  }
  const apply = () => {
    scene.cameras.main.setScroll(-layout.x, -layout.y);
    onLayout?.();
  };
  apply();
  scene.game.events.on('layout', apply);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.game.events.off('layout', apply));
}

// A pointer's position in the play area (pointer.x and .y are on the canvas).
export const pointerAt = (p: Phaser.Input.Pointer) => ({ x: p.x - layout.x, y: p.y - layout.y });
