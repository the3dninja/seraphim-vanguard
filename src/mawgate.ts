import Phaser from 'phaser';
import { W, H, COLOR } from './config';
import { text } from './ui';
import type { FoeKind } from './data/enemies';
import type { GameScene } from './scenes/GameScene';

// Maw Gate (level 14): the gate's own structure, drawn every frame.
// - The way in: open space first, then the outer hull with a narrow mouth,
//   and a passage of girders and pillars jutting from the walls and up the
//   middle. It hurts the ship but lets shots through.
// - Warp rings: every warp-in comes inside a huge ring that drifts down, wider
//   than the screen, with a gap top and bottom to fly through. The enemies warp
//   in once the ship is inside.
// - The last gate: a grander ring with glowing runes and rings behind it, all
//   drifting to a stop around a gas giant. Dialog, an alarm, three waves of
//   warp-ins, then the rings spin up, a vortex opens and pulls the ship in.

const SPEED = 32; // px per second the structure scrolls
const R = 140; // a warp ring's radius
const GAP = 100; // the gap top and bottom
const BAND = 5; // a ring's half thickness, for hits
const STOP_Y = 148; // where the last gate comes to rest
const FINAL_D = 560; // how far the last gate travels to get there
const DECEL = 4.3; // px/s² it slows down by at the end
const BACK = [{ r: 112, f: 0.8, dir: 1 }, { r: 88, f: 0.68, dir: -1 }, { r: 64, f: 0.56, dir: 1 }, { r: 42, f: 0.46, dir: -1 }]; // the rings behind (f: how fast they drift, as a share)
const PLANET_F = 0.4;
const PR = 56; // the gas giant's radius
const RING_FOES: FoeKind[] = ['tendril', 'tendril', 'mimic', 'mimic', 'spore'];
// The last gate's three waves, each in bursts a beat apart.
const FINAL_WAVES: { kinds: FoeKind[]; big: boolean }[][] = [
  [{ kinds: ['tendril', 'mimic', 'spore', 'tendril', 'mimic', 'spore', 'tendril', 'mimic'], big: false }],
  [
    { kinds: ['husk', 'tendril', 'mimic', 'husk', 'tendril', 'mimic', 'spore'], big: false },
    { kinds: ['brood', 'husk', 'mimic', 'brood', 'tendril', 'spore'], big: false },
  ],
  [
    { kinds: ['husk', 'mimic', 'tendril', 'husk', 'mimic', 'tendril', 'brood', 'spore'], big: true },
    { kinds: ['brood', 'husk', 'mimic', 'brood', 'husk', 'tendril', 'mimic', 'spore'], big: true },
    { kinds: ['husk', 'husk', 'mimic', 'mimic', 'brood', 'brood'], big: true },
  ],
];
const BURST_GAP = 1700; // ms between a wave's bursts
const PULSES = 3; // red alarm pulses before each of the last gate's waves
const PULSE = 520; // ms from one pulse to the next
const PULSE_ON = 340; // ms each pulse is lit

type Pt = [number, number];
// Wall edges along the way in: [track position, x]. Off screen before and after.
const L_KEYS: Pt[] = [[250, -40], [272, 62], [318, 62], [344, 24], [1070, 24], [1170, -50]];
const R_KEYS: Pt[] = L_KEYS.map(([u, x]) => [u, W - x]);
const MOUTH: [number, number] = [262, 330]; // the outer hull, around the mouth
const ENTRY_END = 1170;
const mirror = (pts: Pt[]): Pt[] => pts.map(([x, du]) => [W - x, du]);
// Girders and pillars: [x, height above u] around their track position u.
const girder = (tip: number): Pt[] => [[20, 0], [tip - 26, 3], [tip - 4, 8], [tip, 12], [tip - 4, 16], [tip - 26, 21], [20, 24]];
const PIECES: { u: number; pts: Pt[] }[] = [
  { u: 420, pts: girder(86) },
  { u: 530, pts: mirror(girder(100)) },
  { u: 640, pts: [[90, 0], [108, 20], [106, 44], [90, 64], [74, 44], [72, 20]] },
  { u: 770, pts: girder(100) },
  { u: 840, pts: mirror(girder(100)) },
  { u: 930, pts: [[90, 0], [96, 16], [114, 22], [96, 28], [90, 46], [84, 28], [66, 22], [84, 16]] },
  { u: 1010, pts: [[20, 0], [62, 6], [64, 12], [62, 18], [20, 24]] },
  { u: 1010, pts: mirror([[20, 0], [62, 6], [64, 12], [62, 18], [20, 24]]) },
];
// Runes: 3x4 pixel glyphs.
const GLYPHS = [
  [0b111, 0b010, 0b010, 0b111], [0b101, 0b111, 0b101, 0b101], [0b110, 0b011, 0b110, 0b011],
  [0b010, 0b111, 0b010, 0b101], [0b111, 0b101, 0b001, 0b011], [0b100, 0b111, 0b001, 0b111],
];

const edgeAt = (keys: Pt[], u: number) => {
  if (u <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (u <= keys[i][0]) {
      const [u0, x0] = keys[i - 1], [u1, x1] = keys[i];
      return x0 + ((u - u0) / (u1 - u0)) * (x1 - x0);
    }
  }
  return keys[keys.length - 1][1];
};

const inPoly = (x: number, y: number, pts: { x: number; y: number }[]) => {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
};

interface Ring { u: number; inside: boolean }
type Stage = 'approach' | 'talk' | 'waves' | 'spin';

export class MawGate {
  private s = 0; // px scrolled since the level began
  private t = 0;
  private rings: Ring[] = [];
  private entry: boolean;
  private entered = false; // the mouth has passed the ship
  private saidIn = false;
  private gfx: Phaser.GameObjects.Graphics; // walls, girders, rings, the vortex
  private back: Phaser.GameObjects.Graphics; // the rings behind the last gate
  private glow: Phaser.GameObjects.Graphics; // its light, added on
  private planet: Phaser.GameObjects.Image | null = null;
  private planetTex: Phaser.Textures.CanvasTexture | null = null;
  private planetPx: ImageData | null = null;
  private stormFlash = 0;
  // The last gate.
  private fin: {
    stage: Stage; d: number; v: number; t: number; said: number; wave: number; burst: number; next: number;
    alarmUntil: number; spin: number; angles: number[]; glow: number; vortex: number; sucked: boolean;
  } | null = null;
  private wash: Phaser.GameObjects.Rectangle | null = null; // the alarm's red over the whole screen
  private alarmText: Phaser.GameObjects.Text | null = null;
  calm = false; // no hazards (in the passage, and once the last gate spins up)

  constructor(private g: GameScene, private scenery: Phaser.GameObjects.TileSprite | null, entry: boolean, index: number) {
    this.entry = entry;
    this.back = g.add.graphics();
    this.glow = g.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    this.gfx = g.add.graphics();
    // Under everything that flies, just above the scenery.
    g.children.moveTo(this.back, index);
    g.children.moveTo(this.glow, index + 1);
    g.children.moveTo(this.gfx, index + 2);
    if (entry) scenery?.setAlpha(0); // open space until the ship is inside
    else this.s = ENTRY_END + H + 1;
  }

  // How fast the background scrolls, as a share: the last gate brings it to a stop.
  get bgK() { return this.fin ? this.fin.v / SPEED : 1; }

  // Nothing of the gate on screen or on its way: a new warp ring can come.
  get idle() { return this.rings.length === 0 && !this.inEntry; }

  private get inEntry() { return this.entry && this.s < ENTRY_END + H; }

  get finale() { return !!this.fin; }

  // A warp ring, drifting in from above once the way is clear.
  ring() {
    const top = Math.max(this.s + R + 2, ...this.rings.map((r) => r.u + 2 * R + 30), this.entry ? ENTRY_END + R + 40 : 0);
    this.rings.push({ u: top, inside: false });
  }

  clearRings() { this.rings = []; }

  // Walls at screen row y: everything left of l and right of r is solid.
  at(y: number) {
    if (!this.inEntry) return { l: -99, r: W + 99 };
    const u = this.s - y;
    return { l: edgeAt(L_KEYS, u) + this.wob(u), r: edgeAt(R_KEYS, u) - this.wob(u + 40) };
  }

  private wob(u: number) {
    return u > 344 && u < 1070 ? Math.sin(u / 29) * 2 + Math.max(0, Math.sin(u / 71)) * 4 : 0;
  }

  // A piece's corners on screen right now.
  private piecePts(p: { u: number; pts: Pt[] }) {
    return p.pts.map(([x, du]) => ({ x, y: this.s - p.u - du }));
  }

  solidAt(x: number, y: number) {
    const { l, r } = this.at(y);
    if (x < l || x > r) return true;
    return this.inEntry && PIECES.some((p) => inPoly(x, y, this.piecePts(p)));
  }

  update(dt: number) {
    const g = this.g;
    this.t += dt * 1000;
    const f = this.fin;
    if (f) this.runFinale(dt, f);
    else this.s += SPEED * dt;
    this.calm = this.inEntry && this.s > 200 || (!!f && f.stage === 'spin');

    // Into the gate: its own scenery fades in once the mouth passes the ship.
    if (this.entry && !this.entered && this.s - MOUTH[1] > g.player.y) {
      this.entered = true;
      if (this.scenery) g.tweens.add({ targets: this.scenery, alpha: 1, duration: 2500 });
    }
    if (this.entry && !this.saidIn && this.s > 330) { this.saidIn = true; g.radio('REYES: GOING IN. MIND\nTHE STRUTS!'); }

    this.gfx.clear();
    this.back.clear();
    this.glow.clear();
    if (this.inEntry) this.drawEntry();
    for (const rg of this.rings.slice()) {
      const cy = this.s - rg.u;
      if (cy - R > H + 12) { this.rings.splice(this.rings.indexOf(rg), 1); continue; }
      this.drawRing(W / 2, cy, false);
      this.hitRing(W / 2, cy);
      // The ship is inside, near the bottom: they warp in.
      if (!rg.inside && (cy + R > g.player.y + 14 || cy + R > H - 6) && g.phase === 'action') {
        rg.inside = true;
        g.warpEnemies(5, false, { x: W / 2, y: cy, r: R }, RING_FOES);
      }
    }
    if (f) this.drawFinale(f);
    if (g.phase === 'action' && this.inEntry) this.hitEntry();
    if (g.phase === 'action') this.blockShots();
  }

  // --- The way in ---------------------------------------------------------------

  private drawEntry() {
    const gx = this.gfx;
    const pulse = 0.55 + 0.45 * Math.sin(this.t / 260);
    for (let y = -2; y < H + 3; y += 3) {
      const u = this.s - y;
      const { l, r } = this.at(y);
      if (l <= -2 && r >= W + 2) continue;
      const mouth = u > MOUTH[0] && u < MOUTH[1];
      const plate = Math.floor(u / 14) % 2 === 0;
      for (const [x0, x1, edge] of [[0, l, l], [r, W, r]] as const) {
        if (x1 <= x0) continue;
        const inner = edge === l ? 1 : -1;
        gx.fillStyle(mouth ? (plate ? 0x2c0838 : 0x24062c) : plate ? 0x1c0418 : 0x160314, 1).fillRect(x0, y, x1 - x0, 3);
        // A glowing seam along the inner edge, and a living vein just behind it.
        gx.fillStyle(0xa40080, 1).fillRect(edge === l ? l - 2 : r, y, 2, 3);
        gx.fillStyle(0xf878f8, 0.5 + 0.5 * pulse).fillRect(edge === l ? l - 1 : r, y, 1, Math.floor(u / 3) % 4 === 0 ? 3 : 1);
        const vx = edge - inner * (9 + Math.round(Math.sin(u / 17) * 3));
        if (vx > x0 && vx < x1) gx.fillStyle(0x4c0040, 1).fillRect(vx, y, 2, 3);
        // Ribs across the wall where the plates meet.
        if (Math.floor(u) % 14 < 3) gx.fillStyle(0x3c1c7c, 1).fillRect(x0, y, x1 - x0, 1);
      }
    }
    // Runes set into the walls, and around the mouth.
    for (let u = Math.ceil((this.s - H) / 46) * 46; u < this.s + 10; u += 46) {
      const y = this.s - u;
      const { l, r } = this.at(y);
      const k = Math.floor(u / 46);
      if (l > 14) this.glyph(gx, l - 10, y, k, 0xd800cc, 0.35 + 0.6 * pulse);
      if (r < W - 14) this.glyph(gx, r + 7, y, k + 3, 0x3cbcfc, 0.35 + 0.6 * (1 - pulse));
    }
    const my = this.s - (MOUTH[0] + MOUTH[1]) / 2;
    if (my > -40 && my < H + 40) {
      // The mouth: a ring of runes framing the opening, lit from inside.
      for (const [a0, a1] of [[Math.PI * 1.16, Math.PI * 1.84], [Math.PI * 0.16, Math.PI * 0.84]]) {
        gx.lineStyle(2, 0xa40080, 1).beginPath().arc(W / 2, my, 40, a0, a1).strokePath();
        gx.lineStyle(1, 0xf878f8, 0.4 + 0.6 * pulse).beginPath().arc(W / 2, my, 43, a0, a1).strokePath();
      }
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * (1.2 + (i % 7) * 0.1) + (i >= 7 ? -Math.PI : 0);
        this.glyph(gx, W / 2 + Math.cos(a) * 49 - 1, my + Math.sin(a) * 49 - 2, i, i % 2 ? 0x3cbcfc : 0xd800cc, 0.5 + 0.5 * Math.sin(this.t / 200 + i));
      }
      for (const x of [8, 26, W - 31, W - 13]) this.glyph(gx, x, my - 2, x, 0xd800cc, 0.4 + 0.5 * pulse);
    }
    // Girders and pillars.
    for (const p of PIECES) {
      const pts = this.piecePts(p);
      if (pts.every((q) => q.y > H + 4) || pts.every((q) => q.y < -4)) continue;
      gx.fillStyle(0x24062c, 1).fillPoints(pts, true);
      gx.lineStyle(1, 0xa40080, 1).strokePoints(pts, true, true);
      const cx = pts.reduce((n, q) => n + q.x, 0) / pts.length, cy = pts.reduce((n, q) => n + q.y, 0) / pts.length;
      // A brighter spine, a rune, and a living knot at the root.
      gx.lineStyle(1, 0x3c1c7c, 1).lineBetween(pts[0].x, pts[0].y, cx, cy);
      this.glyph(gx, cx - 1, cy - 2, p.u, 0x3cbcfc, 0.5 + 0.5 * Math.sin(this.t / 180 + p.u));
      const root = pts[0].x < W / 2 ? 20 : W - 20;
      if (Math.abs(pts[0].x - root) < 1) {
        gx.fillStyle(0x4c0040, 1).fillCircle(root + (root < W / 2 ? 4 : -4), cy, 6);
        gx.fillStyle(0xa40080, 1).fillCircle(root + (root < W / 2 ? 3 : -3), cy - 2, 2);
      }
    }
  }

  private hitEntry() {
    const g = this.g;
    const p = g.player;
    const { l, r } = this.at(p.y);
    if (p.x - 3 < l || p.x + 3 > r) {
      g.hurt();
      p.x = Phaser.Math.Clamp(p.x, l + 6, r - 6);
      g.tipOnce('gatewall', 'DON\'T TOUCH THE\nGATE STRUCTURE');
      return;
    }
    for (const pc of PIECES) {
      const pts = this.piecePts(pc);
      if (![[0, 0], [-2, -3], [2, -3], [-2, 3], [2, 3]].some(([dx, dy]) => inPoly(p.x + dx, p.y + dy, pts))) continue;
      g.hurt();
      g.tipOnce('gatewall', 'DON\'T TOUCH THE\nGATE STRUCTURE');
      // Shoved out sideways, toward whichever side is nearer.
      const xs = pts.map((q) => q.x);
      const lo = Math.min(...xs) - 6, hi = Math.max(...xs) + 6;
      p.x = Phaser.Math.Clamp(p.x - lo < hi - p.x && lo > l + 6 ? lo : hi < r - 6 ? hi : lo, 6, W - 6);
      return;
    }
  }

  // The structure stops the ship's shots (the Wave Beam passes through), but
  // lets enemy shots by.
  private blockShots() {
    const g = this.g;
    const bands = this.rings.map((rg) => this.s - rg.u);
    if (this.fin) bands.push(STOP_Y - this.fin.d);
    const onBand = (x: number, y: number) => bands.some((cy) => {
      const dx = x - W / 2;
      return Math.abs(dx) > GAP / 2 && Math.abs(Math.hypot(dx, y - cy) - R) < BAND + 1;
    });
    for (const b of g.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      const fx = b.getData('fx');
      if (!b.active || fx === 'wave' || fx === 'probe' || fx === 'blast') continue; // Mine Layer's unseen shots too
      if (!(this.inEntry && this.solidAt(b.x, b.y)) && !onBand(b.x, b.y)) continue;
      g.tink(b.x, b.y);
      b.destroy();
    }
  }

  // --- Rings ----------------------------------------------------------------------

  private glyph(gx: Phaser.GameObjects.Graphics, x: number, y: number, k: number, color: number, alpha: number) {
    const rows = GLYPHS[((Math.round(k) % GLYPHS.length) + GLYPHS.length) % GLYPHS.length];
    gx.fillStyle(color, Phaser.Math.Clamp(alpha, 0, 1));
    rows.forEach((bits, ry) => {
      for (let rx = 0; rx < 3; rx++) if (bits & (4 >> rx)) gx.fillRect(Math.round(x) + rx, Math.round(y) + ry, 1, 1);
    });
  }

  // A warp ring around (cx, cy). The last gate's is grander, with a second
  // circle of runes outside it, which flash red with the alarm.
  private drawRing(cx: number, cy: number, grand: boolean) {
    const gx = this.gfx;
    const half = Math.asin(GAP / 2 / R);
    const spans: [number, number][] = [[Math.PI / 2 + half, Math.PI * 1.5 - half], [-Math.PI / 2 + half, Math.PI / 2 - half]];
    const alarm = this.alarmK() > 0.3;
    const spinning = this.fin?.stage === 'spin';
    const th = grand ? 12 : 10;
    for (const [a0, a1] of spans) {
      gx.lineStyle(th + 2, 0x0c0010, 1).beginPath().arc(cx, cy, R, a0, a1).strokePath();
      gx.lineStyle(th - 2, grand ? 0x3c1c7c : 0x2c0838, 1).beginPath().arc(cx, cy, R, a0, a1).strokePath();
      gx.lineStyle(2, grand ? 0x6844fc : 0x4c0040, 1).beginPath().arc(cx, cy, R - 1, a0, a1).strokePath();
      gx.lineStyle(1, 0xa40080, 1).beginPath().arc(cx, cy, R - th / 2, a0, a1).strokePath();
      gx.lineStyle(1, grand ? 0xf878f8 : 0x6844fc, 1).beginPath().arc(cx, cy, R + th / 2, a0, a1).strokePath();
      // Plates, living knots on the outside, and runes along the band.
      for (let a = a0 + 0.05; a < a1; a += 0.09) {
        const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        if (y < -12 || y > H + 12 || x < -12 || x > W + 12) continue;
        const k = Math.round(a / 0.09);
        gx.lineStyle(1, 0x0c0010, 1).lineBetween(cx + Math.cos(a) * (R - th / 2 + 1), cy + Math.sin(a) * (R - th / 2 + 1), cx + Math.cos(a) * (R + th / 2 - 1), cy + Math.sin(a) * (R + th / 2 - 1));
        if (k % 3 === 0) {
          gx.fillStyle(0x4c0040, 1).fillCircle(cx + Math.cos(a) * (R + th / 2 + 2), cy + Math.sin(a) * (R + th / 2 + 2), 3);
          gx.fillStyle(0xa40080, 1).fillRect(cx + Math.cos(a) * (R + th / 2 + 2) - 1, cy + Math.sin(a) * (R + th / 2 + 2) - 1, 1, 1);
        }
        if (k % 2 === 0) {
          const lit = 0.4 + 0.6 * Math.max(0, Math.sin(this.t / 300 - k * 0.7));
          this.glyph(gx, x - 1, y - 2, k, alarm ? 0xd82800 : grand ? 0x3cbcfc : 0xd800cc, spinning ? 1 : lit);
        }
      }
      // Red lights round the inner edge, once the alarm has gone off.
      const red = grand ? this.redK() : 0;
      if (red > 0) {
        for (let a = a0 + 0.1; a < a1 - 0.05; a += 0.27) {
          const x = cx + Math.cos(a) * (R - th / 2 - 4), y = cy + Math.sin(a) * (R - th / 2 - 4);
          if (y < -8 || y > H + 8 || x < -8 || x > W + 8) continue;
          this.redLight(x, y, red, a * 6);
        }
      }
      if (grand) {
        // A second circle of runes outside, glowing.
        for (let a = a0; a < a1; a += 0.075) {
          const x = cx + Math.cos(a) * (R + 14), y = cy + Math.sin(a) * (R + 14);
          if (y < -6 || y > H + 6 || x < -6 || x > W + 6) continue;
          const k = Math.round(a / 0.075);
          const lit = spinning ? 1 : 0.3 + 0.7 * Math.max(0, Math.sin(this.t / 220 + k * 0.5));
          const col = alarm ? 0xd82800 : k % 3 === 0 ? 0xf878f8 : 0xd800cc;
          this.glyph(gx, x - 1, y - 2, k * 7, col, lit);
          this.glow.fillStyle(col, 0.18 * lit).fillCircle(x, y, 4);
        }
      }
    }
    // Pylons at each side of both gaps, with blinking lights.
    for (const a of [Math.PI / 2 + half, Math.PI * 1.5 - half, -Math.PI / 2 + half, Math.PI / 2 - half]) {
      const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
      if (y < -12 || y > H + 12) continue;
      gx.fillStyle(0x0c0010, 1).fillCircle(x, y, grand ? 8 : 7);
      gx.fillStyle(0x2c0838, 1).fillCircle(x, y, grand ? 6 : 5);
      const on = Math.floor(this.t / 300) % 2 === 0;
      const col = alarm ? 0xd82800 : grand ? 0x3cbcfc : 0xd800cc;
      gx.fillStyle(on ? col : 0x4c0040, 1).fillCircle(x, y, 2);
      if (on) this.glow.fillStyle(col, 0.35).fillCircle(x, y, 6);
    }
  }

  // The band hurts the ship, and shoves it off to whichever side it's on.
  private hitRing(cx: number, cy: number) {
    const g = this.g;
    if (g.phase !== 'action') return;
    const p = g.player;
    const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
    if (Math.abs(d - R) > BAND + 3 || Math.abs(dx) < GAP / 2 - 4) return;
    g.hurt();
    g.tipOnce('gatering', 'FLY THROUGH THE\nGAPS IN THE RINGS');
    const k = (d < R ? R - BAND - 8 : R + BAND + 8) / Math.max(d, 1);
    p.setPosition(Phaser.Math.Clamp(cx + dx * k, 6, W - 6), Phaser.Math.Clamp(cy + dy * k, 24, H - 30));
  }

  // --- The last gate --------------------------------------------------------------

  startFinale() {
    if (this.fin) return;
    this.rings = [];
    this.fin = {
      stage: 'approach', d: FINAL_D, v: SPEED, t: 0, said: 0, wave: -1, burst: 0, next: 0,
      alarmUntil: 0, spin: 0, angles: BACK.map(() => 0), glow: 0, vortex: 0, sucked: false,
    };
    this.makePlanet();
    this.wash = this.g.add.rectangle(0, 0, W, H, 0xd82800).setOrigin(0).setDepth(950).setAlpha(0); // fully filled; its alpha is the wash
  }

  private runFinale(dt: number, f: NonNullable<MawGate['fin']>) {
    const g = this.g;
    const ms = dt * 1000;
    f.t += ms;
    if (f.stage === 'approach') {
      // Drifting in, slowing to a stop with everything lined up.
      f.v = Math.min(SPEED, Math.sqrt(2 * DECEL * f.d));
      f.d = Math.max(0, f.d - Math.max(f.v, 1.5) * dt);
      if (f.d < 230 && f.said === 0) { f.said = 1; g.radio('VOSS: THE FINAL GATE.\nTHE HIVE LIES WITHIN\nTHAT WORLD.'); }
      if (f.d <= 0) { f.v = 0; f.stage = 'talk'; f.t = 0; }
      this.scenery?.setAlpha(Math.min(this.scenery.alpha, 0.35 + 0.65 * (f.d / FINAL_D)));
      return;
    }
    if (f.stage === 'talk') {
      if (f.t > 1400 && f.said === 1) { f.said = 2; g.radio('REYES: BENEATH THAT\nSTORM? THEN WE GO\nTHROUGH IT.'); }
      if (f.t > 6200 && f.said === 2) { f.said = 3; this.alarm('WARNING\nINCOMING!'); g.radio('VEX: HERE THEY COME!'); }
      if (f.t > 8800) { f.stage = 'waves'; f.wave = 0; f.burst = 0; f.next = 0; f.t = 0; }
      return;
    }
    if (f.stage === 'waves') {
      const wave = FINAL_WAVES[f.wave];
      if (f.burst < wave.length) {
        f.next -= ms;
        if (f.next > 0) return;
        const b = wave[f.burst++];
        g.warpEnemies(b.kinds.length, b.big, { x: W / 2, y: STOP_Y, r: R }, b.kinds);
        f.next = BURST_GAP;
        f.t = 0;
        return;
      }
      // Cleared: a beat, then the next wave (with the alarm again), or the end.
      if (g.foesLeft() > 0) { f.t = 0; return; }
      if (f.t < 1500) return;
      f.wave++;
      f.burst = 0;
      f.t = 0;
      if (f.wave < FINAL_WAVES.length) {
        f.next = 1800;
        this.alarm(f.wave === FINAL_WAVES.length - 1 ? 'FINAL WAVE!' : 'MORE INCOMING!');
      } else {
        f.stage = 'spin';
        g.gateCalm();
        g.radio('REYES: THE GATE...\nIT\'S OPENING!');
      }
      return;
    }
    // The rings spin up, light gathers in the middle, and a vortex opens.
    f.spin = Math.min(1, f.t / 3200);
    f.angles.forEach((_a, i) => { f.angles[i] += BACK[i].dir * (0.3 + 4.5 * f.spin * f.spin) * (1 + i * 0.35) * dt; });
    f.glow = Phaser.Math.Clamp((f.t - 700) / 2600, 0, 1);
    f.vortex = Phaser.Math.Clamp((f.t - 2900) / 1500, 0, 1);
    if (f.t > 3900 && !f.sucked) { f.sucked = true; g.gateVortex(W / 2, STOP_Y); }
  }

  // How bright the alarm is right now, 0 to 1: three pulses, then nothing.
  private alarmK() {
    const f = this.fin;
    if (!f || f.alarmUntil === 0 || this.t >= f.alarmUntil) return 0;
    const into = (this.t - (f.alarmUntil - PULSES * PULSE)) % PULSE;
    return into < PULSE_ON ? Math.sin((Math.PI * into) / PULSE_ON) : 0;
  }

  // How bright the last gate's red lights are: off until the first alarm,
  // pulsing on and off with it, full as the gate spins up, dim through the waves.
  private redK() {
    const f = this.fin;
    if (!f || f.alarmUntil === 0) return 0;
    if (f.stage === 'spin') return 1;
    return this.t < f.alarmUntil ? this.alarmK() : 0.4;
  }

  // One red light, pulsing (`phase` staggers neighbours).
  private redLight(x: number, y: number, k: number, phase: number) {
    const lit = 0.55 + 0.45 * Math.sin(this.t / 250 + phase);
    this.glow.fillStyle(0xd82800, 0.45 * lit * k).fillCircle(x, y, 2 + 5 * k);
    this.gfx.fillStyle(0x4c0010, 1).fillCircle(x, y, 2.5);
    this.gfx.fillStyle(lit * k > 0.6 ? 0xfc7460 : 0xd82800, 0.5 + 0.5 * k).fillCircle(x, y, 1.5);
  }

  // Red lights flash, and a warning blinks in the middle.
  // The wash and the lights follow alarmK, so the lights seem to light the place up.
  private alarm(msg: string) {
    const g = this.g;
    if (!this.fin) return;
    this.fin.alarmUntil = this.t + PULSES * PULSE;
    this.alarmText?.destroy();
    const t = text(g, W / 2, H / 2 - 10, msg, COLOR.red).setOrigin(0.5).setAlign('center').setDepth(1000)
      .setBackgroundColor('#000000').setPadding(3, 3, 3, 3);
    this.alarmText = t;
    g.time.delayedCall(PULSES * PULSE, () => { t.destroy(); if (this.alarmText === t) this.alarmText = null; });
  }

  private drawFinale(f: NonNullable<MawGate['fin']>) {
    const pulse = this.alarmK();
    this.wash?.setAlpha(0.3 * pulse);
    this.alarmText?.setAlpha(0.35 + 0.65 * pulse);
    const cx = W / 2;
    const cy = STOP_Y - f.d;
    // The gas giant, furthest back.
    if (this.planet) {
      const py = STOP_Y - f.d * PLANET_F;
      this.planet.setPosition(cx, Math.round(py));
      if (Math.floor(this.t / 33) !== Math.floor((this.t - 16) / 33)) this.paintPlanet();
      this.back.lineStyle(1, 0x9878f8, 0.35).strokeCircle(cx, py, PR + 1.5);
      this.back.lineStyle(1, 0x6844fc, 0.2).strokeCircle(cx, py, PR + 3);
    }
    // The rings behind, drifting slower the further back they are.
    BACK.forEach((b, i) => {
      const y = STOP_Y - f.d * b.f;
      const gx = this.back;
      const col = i % 2 ? 0x3cbcfc : 0x9878f8;
      const n = 10 + i * 2;
      for (let k = 0; k < n; k++) {
        const a = f.angles[i] + (k / n) * Math.PI * 2;
        gx.lineStyle(2, i % 2 ? 0x0c3c5c : 0x3c1c7c, 0.9).beginPath().arc(cx, y, b.r, a, a + (Math.PI * 2) / n * 0.62).strokePath();
        gx.lineStyle(1, col, 0.35 + 0.5 * f.spin).beginPath().arc(cx, y, b.r, a, a + (Math.PI * 2) / n * 0.3).strokePath();
        this.glyph(gx, cx + Math.cos(a - 0.12) * b.r - 1, y + Math.sin(a - 0.12) * b.r - 2, k + i, col, 0.4 + 0.6 * f.spin);
      }
    });
    // Red lights on the first ring behind, turning with it.
    const red = this.redK();
    if (red > 0) {
      const b = BACK[0], y = STOP_Y - f.d * b.f, n = 10;
      for (let k = 0; k < n; k++) {
        const a = f.angles[0] + ((k + 0.81) / n) * Math.PI * 2;
        this.redLight(cx + Math.cos(a) * b.r, y + Math.sin(a) * b.r, red, k * 1.3);
      }
    }
    // Light gathering in the middle.
    if (f.glow > 0) {
      const pulse = 1 + 0.08 * Math.sin(this.t / 90);
      for (const [k, col, a] of [[1, 0x6844fc, 0.25], [0.7, 0xd800cc, 0.3], [0.45, 0xf878f8, 0.4], [0.22, 0xfcfcfc, 0.7]] as const) {
        this.glow.fillStyle(col, a * f.glow).fillCircle(cx, cy, (8 + 70 * f.glow) * k * pulse);
      }
    }
    // The vortex: spiral arms whirling in.
    if (f.vortex > 0) {
      const gx = this.gfx;
      const rad = 10 + 64 * f.vortex;
      const spin = this.t / 160;
      for (let arm = 0; arm < 6; arm++) {
        for (let i = 0; i < 34; i++) {
          const k = i / 34;
          const a = spin + (arm / 6) * Math.PI * 2 + k * 3.4;
          const col = k < 0.25 ? 0xfcfcfc : k < 0.55 ? 0xf878f8 : k < 0.8 ? 0xd800cc : 0x6844fc;
          gx.fillStyle(col, f.vortex * (1 - k * 0.5)).fillRect(Math.round(cx + Math.cos(a) * rad * k) - 1, Math.round(cy + Math.sin(a) * rad * k) - 1, 2, 2);
        }
      }
      // Streaks pulled in from all round.
      for (let i = 0; i < 8 * f.vortex; i++) {
        const a = Math.random() * Math.PI * 2, d = Phaser.Math.Between(50, 150);
        const x = cx + Math.cos(a) * d, y = cy + Math.sin(a) * d;
        this.glow.lineStyle(1, 0xf878f8, 0.6).lineBetween(x, y, x - Math.cos(a) * 14, y - Math.sin(a) * 14);
      }
    }
    this.drawRing(cx, cy, true);
    if (f.stage === 'approach' || f.stage === 'talk' || f.stage === 'waves') this.hitRing(cx, cy);
  }

  // --- The gas giant --------------------------------------------------------------

  private makePlanet() {
    const g = this.g;
    const size = PR * 2 + 1;
    const key = 'gasgiant';
    this.planetTex = g.textures.exists(key) ? (g.textures.get(key) as Phaser.Textures.CanvasTexture) : g.textures.createCanvas(key, size, size);
    this.planetPx = this.planetTex!.getContext().createImageData(size, size);
    this.planet = g.add.image(W / 2, -200, key);
    g.children.moveTo(this.planet, g.children.getIndex(this.back));
    this.paintPlanet();
  }

  // Green and purple bands swirling round a sphere, with a storm raging in
  // them. The planet turns, so the storms pan across its face.
  private paintPlanet() {
    const tex = this.planetTex, img = this.planetPx;
    if (!tex || !img) return;
    const size = PR * 2 + 1;
    const data = img.data;
    const t = this.t / 1000;
    const rot = t * 0.05;
    if (Math.random() < 0.012) this.stormFlash = 4;
    const flash = this.stormFlash > 0;
    if (flash) this.stormFlash--;
    // Each palette runs light to dark.
    const GREEN = [0xb8f818, 0x58d854, 0x00a800, 0x005800, 0x002c00];
    const PURPLE = [0xd8b8f8, 0x9878f8, 0x6844fc, 0x3c1c7c, 0x1c0c3c];
    const STORM = [0xfcfcfc, 0xf878f8, 0xd800cc, 0xa40080, 0x4c0040];
    const BANDS: [number[], number][] = [[GREEN, 1], [PURPLE, 2], [GREEN, 2], [PURPLE, 1], [GREEN, 3], [PURPLE, 2], [GREEN, 1], [PURPLE, 3]];
    const STORMS = [{ lat: 0.32, lon: 0.4, r: 0.42 }, { lat: -0.45, lon: 3.6, r: 0.28 }];
    const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
    let i = 0;
    for (let py = 0; py < size; py++) {
      for (let px = 0; px < size; px++, i += 4) {
        const nx = (px - PR) / PR, ny = (py - PR) / PR;
        const rr = nx * nx + ny * ny;
        if (rr > 1) { data[i + 3] = 0; continue; }
        const nz = Math.sqrt(1 - rr);
        const lat = Math.asin(ny), lon = Math.atan2(nx, nz) + rot;
        const b = lat * 5.2 + 0.4 * Math.sin(lon * 2 + lat * 6 + t * 0.4) + 0.18 * Math.sin(lon * 6 - t * 0.7 + lat * 14);
        const band = BANDS[((Math.floor(b + 40) % BANDS.length) + BANDS.length) % BANDS.length];
        let pal = band[0], lvl = band[1];
        // Lighter streaks at the band edges.
        if (b - Math.floor(b) < 0.12) lvl = Math.max(0, lvl - 1);
        for (const s of STORMS) {
          const dLon = wrap(lon - s.lon) * Math.cos(lat), dLat = lat - s.lat;
          const d = Math.hypot(dLon, dLat * 1.5);
          if (d > s.r) continue;
          const edge = d / s.r;
          if (edge > 0.8 && ((px + py) & 1)) continue; // dithered into the bands
          const swirl = Math.sin(Math.atan2(dLat, dLon) * 2 + d * 26 - t * 2.2);
          pal = STORM;
          lvl = edge < 0.16 ? 4 : swirl > 0.35 ? 1 : swirl > -0.3 ? 2 : 3;
          if (flash && s === STORMS[0] && edge < 0.6 && swirl > 0) lvl = 0;
        }
        // Lit from the upper left; dithered steps into the dark side.
        const lit = -nx * 0.5 - ny * 0.45 + nz * 0.74;
        const dith = ((px + py) & 1) * 0.12;
        const shade = lit + dith > 0.55 ? 0 : lit + dith > 0.25 ? 1 : lit + dith > -0.05 ? 2 : 3;
        const c = pal[Math.min(4, lvl + shade)];
        data[i] = c >> 16; data[i + 1] = (c >> 8) & 0xff; data[i + 2] = c & 0xff; data[i + 3] = 255;
      }
    }
    tex.getContext().putImageData(img, 0, 0);
    tex.refresh();
  }

  destroy() {
    this.gfx.destroy();
    this.back.destroy();
    this.glow.destroy();
    this.planet?.destroy();
    this.wash?.destroy();
  }
}
