import Phaser from 'phaser';
import { W, H } from './config';

// Heart of the Hollow's backdrops (level 15): no stars anywhere, only layers
// of the hive that drift by at their own speeds, so the dark seems to go a
// long way down. Each locale is its own set of layers, faded in over the last.
// - chasm: a vast cavern. Haze far down, creatures moving in the deep, ridges
//   of the cavern closer in.
// - cave: a cave tunnel. Rock close behind, strands of growth nearer.
// - spore: the cavern again, thick with gas clouds and webbing, a haze over the
//   action and spores drifting through it.
// - storm: outside, in a green and purple storm. Clouds whip by from right to
//   left, faster in the strong winds, with wisps over the action.
// - abyss: the way to the Mind. Something swirls far below, lit by lightning,
//   with membranes drifting over it and sinews that settle into place round
//   the arena.
export type BgTheme = 'chasm' | 'cave' | 'spore' | 'storm' | 'abyss';

// A tiling layer: how fast it drifts down (and left), in px/s at full speed.
interface Layer { ts: Phaser.GameObjects.TileSprite; vy: number; vx: number }
interface Creature { img: Phaser.GameObjects.Image; vx: number; t: number }
interface Sinew { img: Phaser.GameObjects.Image; y: number; f: number } // y: where it settles; f: how fast it drifts, as a share
interface Bolt { pts: { x: number; y: number }[]; t: number }
interface Locale {
  theme: BgTheme;
  root: Phaser.GameObjects.Container;
  layers: Layer[];
  creatures: Creature[];
  swirl: Phaser.GameObjects.Graphics | null;
  flash: Phaser.GameObjects.Rectangle | null;
  sinews: Sinew[];
  over: Phaser.GameObjects.GameObject[]; // over the action, outside the root
  fg: Layer[]; // wisps over the action
}

export type Px = (x: number, y: number, c: number) => void;

export const rng = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// A texture drawn pixel by pixel; x and y wrap, so tiles join up.
export function paint(scene: Phaser.Scene, key: string, w: number, h: number, draw: (px: Px, rand: () => number) => void) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const px: Px = (x, y, c) => {
    const xx = ((Math.round(x) % w) + w) % w, yy = ((Math.round(y) % h) + h) % h;
    const i = (yy * w + xx) * 4;
    d[i] = c >> 16; d[i + 1] = (c >> 8) & 0xff; d[i + 2] = c & 0xff; d[i + 3] = 255;
  };
  let seed = 0;
  for (const ch of key) seed = seed * 31 + ch.charCodeAt(0);
  draw(px, rng(seed));
  ctx.putImageData(img, 0, 0);
  tex.refresh();
}

// A soft dithered blob: denser toward its middle.
export function blob(px: Px, cx: number, cy: number, r: number, cols: number[], density = 1, sy = 1) {
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d = Math.hypot(x, y / sy) / r;
      if (d > 1) continue;
      const xx = Math.round(cx + x), yy = Math.round(cy + y);
      const k = (1 - d) * density;
      if (k > 0.55 || (k > 0.3 && (xx + yy) % 2 === 0) || (k > 0.12 && (xx * 3 + yy) % 5 === 0)) px(xx, yy, cols[d < 0.45 ? 0 : 1] ?? cols[0]);
    }
  }
}

// A wavy strand from (x0, y0) to (x1, y1), sagging by `sag`.
function strand(px: Px, x0: number, y0: number, x1: number, y1: number, sag: number, thick: number, col: number, hi: number, rand: () => number) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
  const ph = rand() * 6;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    const x = x0 + (x1 - x0) * k, y = y0 + (y1 - y0) * k + Math.sin(k * Math.PI) * sag + Math.sin(k * 9 + ph) * 1.5;
    const th = thick * (0.7 + 0.3 * Math.sin(k * 13 + ph));
    for (let j = 0; j < th; j++) px(x, y + j, j === 0 ? hi : col);
  }
}

// Sum of sines that wrap across the tile: cycles across (cx) and down (cy).
const wave = (x: number, y: number, terms: [number, number, number, number][]) =>
  terms.reduce((n, [cx, cy, a, ph]) => n + a * Math.sin(2 * Math.PI * ((cx * x) / W + (cy * y) / H) + ph), 0);

export function makeHiveArt(scene: Phaser.Scene) {
  // The chasm, far down: haze in dark purples and reds.
  paint(scene, 'hb_chasm1', W, H, (px, rand) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, 0x050208);
    for (let i = 0; i < 9; i++) blob(px, rand() * W, rand() * H, 26 + rand() * 30, [0x120618, 0x0c0410], 0.8);
    for (let i = 0; i < 40; i++) px(rand() * W, rand() * H, rand() < 0.5 ? 0x1c0a24 : 0x180810);
  });
  // The cavern's ridges, further down both sides.
  paint(scene, 'hb_chasm2', W, H, (px, rand) => {
    for (let y = 0; y < H; y++) {
      const t = (y / H) * Math.PI * 2;
      const wl = 22 + 12 * Math.sin(t * 2 + 1) + 7 * Math.sin(t * 5);
      const wr = 22 + 12 * Math.sin(t * 3 + 4) + 7 * Math.sin(t * 7 + 2);
      for (let x = 0; x < wl; x++) if (x < wl - 3 || (x + y) % 2 === 0) px(x, y, x > wl - 6 ? 0x1c0816 : 0x12050e);
      for (let x = W - 1; x > W - wr; x--) if (x > W - wr + 3 || (x + y) % 2 === 0) px(x, y, x < W - wr + 6 ? 0x1c0816 : 0x12050e);
    }
    // Veins over them.
    for (let i = 0; i < 10; i++) {
      let x = i % 2 ? W - 6 : 6, y = rand() * H, a = i % 2 ? Math.PI : 0;
      for (let s = 0; s < 40; s++) { a += (rand() - 0.5) * 0.6; x += Math.cos(a) * 0.7; y += Math.sin(a) + 0.4; px(x, y, 0x240a1c); }
    }
  });
  // Outcrops closer in.
  paint(scene, 'hb_chasm3', W, H, (px) => {
    for (let y = 0; y < H; y++) {
      const t = (y / H) * Math.PI * 2;
      const wl = Math.max(0, 4 + 16 * Math.sin(t * 3 + 2) + 6 * Math.sin(t * 8));
      const wr = Math.max(0, 4 + 16 * Math.sin(t * 2 + 5) + 6 * Math.sin(t * 9 + 1));
      for (let x = 0; x < wl; x++) px(x, y, x > wl - 2 ? 0x44142c : 0x2a0c1c);
      for (let x = W - 1; x > W - wr; x--) px(x, y, x < W - wr + 2 ? 0x44142c : 0x2a0c1c);
    }
  });
  // Something huge moving far below: a long finned shape, barely lighter than the dark.
  paint(scene, 'hb_beast', 72, 26, (px) => {
    for (let x = 0; x < 72; x++) {
      const k = x / 71;
      const half = 2 + 9 * Math.sin(Math.min(1, k * 1.3) * Math.PI) ** 0.8;
      for (let y = -half; y <= half; y++) px(x, 13 + y + Math.sin(k * 6) * 1.5, Math.abs(y) > half - 1.5 ? 0x0c0612 : 0x150a1e);
      // Fins.
      if (x > 22 && x < 34) for (let f = 0; f < (34 - x) * 0.8; f++) { px(x + f * 0.4, 13 - half - f, 0x10081a); px(x + f * 0.4, 13 + half + f, 0x10081a); }
    }
    px(8, 11, 0x5c1c4c); px(8, 15, 0x5c1c4c); px(9, 11, 0x3c0c3c); px(9, 15, 0x3c0c3c);
  });
  paint(scene, 'hb_worm', 90, 14, (px) => {
    for (let x = 0; x < 90; x++) {
      const k = x / 89;
      const half = 1.5 + 4 * Math.sin(k * Math.PI);
      const cy = 7 + Math.sin(k * Math.PI * 3) * 2.5;
      for (let y = -half; y <= half; y++) px(x, cy + y, x % 6 === 0 ? 0x0e0614 : 0x170b1a);
    }
    px(2, 6, 0x5c1c4c);
  });
  // The cave: rock close behind, dense with blotches.
  paint(scene, 'hb_cave1', W, H, (px, rand) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, 0x0c0408);
    for (let i = 0; i < 70; i++) blob(px, rand() * W, rand() * H, 6 + rand() * 16, rand() < 0.35 ? [0x180a20, 0x120616] : [0x1c0a12, 0x14060c], 0.9);
    for (let i = 0; i < 90; i++) px(rand() * W, rand() * H, 0x241018);
  });
  // Strands of growth nearer in, mostly down the sides.
  paint(scene, 'hb_cave2', W, H, (px, rand) => {
    for (let i = 0; i < 14; i++) {
      const left = i % 2 === 0;
      const x0 = left ? -4 : W + 4, y0 = rand() * H;
      const x1 = left ? 20 + rand() * 50 : W - 20 - rand() * 50, y1 = y0 + 30 + rand() * 60;
      strand(px, x0, y0, x1, y1, 6, 2 + rand() * 2, 0x2c0c18, 0x3c1424, rand);
    }
    for (let i = 0; i < 4; i++) strand(px, -4, rand() * H, W + 4, rand() * H, 20 + rand() * 20, 1.5, 0x220a14, 0x2c0c18, rand);
  });
  // The spore cavern: haze far down, gas clouds, webbing and growths.
  paint(scene, 'hb_spore1', W, H, (px, rand) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, 0x040806);
    for (let i = 0; i < 10; i++) blob(px, rand() * W, rand() * H, 24 + rand() * 30, rand() < 0.6 ? [0x0c1a10, 0x08120c] : [0x140c1c, 0x0c0812], 0.8);
  });
  paint(scene, 'hb_spore2', W, H, (px, rand) => {
    for (let i = 0; i < 12; i++) blob(px, rand() * W, rand() * H, 14 + rand() * 22, rand() < 0.6 ? [0x16301c, 0x10241a] : [0x221432, 0x180e24], 0.7, 0.7);
  });
  paint(scene, 'hb_spore3', W, H, (px, rand) => {
    // Webbing strung between points, and lumpy growths where it meets.
    const pts = Array.from({ length: 9 }, () => [rand() * W, rand() * H]);
    for (let i = 0; i < pts.length; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1 + Math.floor(rand() * 3)) % pts.length];
      if (Math.abs(y1 - y0) > H / 2) continue;
      strand(px, x0, y0, x1, y1, 8, 1, 0x2a3a2c, 0x3a4a3a, rand);
    }
    for (const [x, y] of pts) {
      blob(px, x, y, 4 + rand() * 4, [0x3c5c34, 0x2c4424], 1.4);
      px(x - 1, y - 1, 0x58783c);
    }
    for (let i = 0; i < 5; i++) strand(px, rand() * W, rand() * H, rand() * W, rand() * H, 4, 1, 0x2a2238, 0x3a2a48, rand);
  });
  paint(scene, 'hb_spore4', W, H, (px, rand) => {
    for (let i = 0; i < 6; i++) blob(px, rand() * W, rand() * H, 10 + rand() * 12, [0x3c5c3c, 0x24402a], 0.5, 0.6);
  });
  // The storm: banks of cloud far, middle and near, streaming sideways, wrapping both ways.
  const storm = (key: string, terms: [number, number, number, number][], cols: number[], cut: number) => paint(scene, key, W, H, (px) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = wave(x, y, terms) * (0.65 + 0.35 * wave(x, y, [[1, 1, 1, 0.3], [2, -1, 0.5, 1.9]]));
      const g = wave(x, y, [[1, 2, 1, 0.7], [2, -1, 0.6, 2.1]]) > 0; // green or purple
      if (v > cut + 0.7) px(x, y, g ? cols[0] : cols[1]);
      else if (v > cut + 0.3 && (x + y) % 2 === 0) px(x, y, g ? cols[2] : cols[3]);
      else if (v > cut && (x * 3 + y) % 4 === 0) px(x, y, g ? cols[2] : cols[3]);
    }
  });
  storm('hb_storm1', [[1, 4, 1, 0], [2, 7, 0.6, 1.3], [1, 11, 0.35, 2.2]], [0x0c2410, 0x180a2c, 0x08160a, 0x10061e], -0.2);
  storm('hb_storm2', [[1, 8, 1, 1], [2, 13, 0.6, 2.5], [1, 5, 0.5, 0.2], [3, 17, 0.25, 1.7]], [0x16441e, 0x26124c, 0x0e2c14, 0x1a0c36], 0.35);
  storm('hb_storm3', [[1, 12, 1, 2], [1, 19, 0.6, 0.5], [2, 9, 0.4, 1.1], [3, 23, 0.25, 2.9]], [0x2c6c34, 0x3c1c6c, 0x1c4c24, 0x2c1450], 0.75);
  // Wisps of wind, laid over the action at low opacity.
  paint(scene, 'hb_wind', W, H, (px, rand) => {
    for (let i = 0; i < 26; i++) {
      const x = rand() * W, y = rand() * H, len = 20 + rand() * 50, col = rand() < 0.5 ? 0xd8b8f8 : 0xb8f818;
      for (let k = 0; k < len; k++) if (rand() > 0.15) px(x + k, y + Math.sin(k / 9) * 1.5, col);
    }
  });
  // The abyss: membranes and tendrils drifting over the swirl below.
  paint(scene, 'hb_abyss2', W, H, (px, rand) => {
    for (let i = 0; i < 8; i++) blob(px, rand() * W, rand() * H, 16 + rand() * 18, [0x1c040a, 0x140306], 0.6, 0.5);
    for (let i = 0; i < 8; i++) strand(px, rand() * W - 40, rand() * H, rand() * W + 40, rand() * H, 14, 2, 0x24040c, 0x34081a, rand);
  });
  paint(scene, 'hb_abyss3', W, H, (px, rand) => {
    for (let i = 0; i < 10; i++) {
      const left = i % 2 === 0;
      strand(px, left ? -4 : W + 4, rand() * H, left ? 30 + rand() * 40 : W - 30 - rand() * 40, rand() * H, 10, 3, 0x3a0814, 0x5c1020, rand);
    }
  });
  // Sinews strung across the arena, each a different shape.
  for (let k = 0; k < 3; k++) {
    paint(scene, `hb_sinew${k}`, W, 64, (px, rand) => {
      const n = 3 + k;
      for (let i = 0; i < n; i++) {
        const y0 = 6 + rand() * 30, y1 = 6 + rand() * 30;
        strand(px, -2, y0, W + 2, y1, 10 + rand() * 18, 3 + rand() * 3, k === 2 ? 0x2c0410 : 0x4c0c1c, k === 2 ? 0x44081a : 0x7c2030, rand);
      }
      // Knots of tendon where they cross, and roots at the edges.
      for (let i = 0; i < 4; i++) blob(px, rand() * W, 14 + rand() * 30, 3 + rand() * 2, [0xa88870, 0x6c4c40], 1.5);
      for (const x of [0, W - 1]) blob(px, x, 30, 14, [0x3c0814, 0x2c0410], 1.3, 2);
    });
  }
  // Clumps of organic debris torn loose by the storm.
  const clump = (key: string, w: number, h: number, parts: [number, number, number, number[]][]) => paint(scene, key, w, h, (px, rand) => {
    for (const [x, y, r] of parts) blob(px, x, y, r + 1, [0x1c0c14, 0x1c0c14], 3, 0.85);
    for (const [x, y, r, c] of parts) blob(px, x, y, r, c, 3, 0.85);
    for (const [x, y, r] of parts) { px(x - r * 0.4, y - r * 0.5, 0xb88898); px(x - r * 0.4 + 1, y - r * 0.5, 0x9c6c7c); }
    for (let i = 0; i < 6; i++) px(4 + rand() * (w - 8), 4 + rand() * (h - 8), rand() < 0.5 ? 0x58d854 : 0xa40080);
  });
  clump('hb_clump1', 20, 16, [[9, 8, 6, [0x7c4c5c, 0x5c3444]], [14, 9, 4, [0x4c6c34, 0x34502c]]]);
  clump('hb_clump2', 30, 24, [[12, 12, 9, [0x7c4c5c, 0x5c3444]], [21, 10, 6, [0x4c6c34, 0x34502c]], [18, 17, 5, [0x6c3c6c, 0x4c2c4c]]]);
}

// The backdrop, under everything that flies. `index` is where it goes in the
// scene's display list (just above the hidden stars).
export class Backdrop {
  private sets: Locale[] = [];
  private root: Phaser.GameObjects.Container;
  private t = 0;
  speedK = 1; // the arena brings it all to a stop
  windK = 1; // the storm's strong winds speed the clouds up
  gustK = 0; // 0 to 1: how hard the wind blows, for the wisps over the action

  constructor(private g: Phaser.Scene, index: number) {
    makeHiveArt(g);
    this.root = g.add.container(0, 0);
    g.children.moveTo(this.root, index);
  }

  get theme() { return this.sets[this.sets.length - 1]?.theme ?? null; }

  // Fades in a new locale over `fade` ms, then drops the old ones.
  set(theme: BgTheme, fade = 2500) {
    if (this.theme === theme) return;
    const g = this.g;
    const root = g.add.container(0, 0);
    this.root.add(root);
    const s: Locale = { theme, root, layers: [], creatures: [], swirl: null, flash: null, sinews: [], over: [], fg: [] };
    const layer = (key: string, vy: number, vx = 0, alpha = 1) => {
      const ts = g.add.tileSprite(0, 0, W, H, key).setOrigin(0).setAlpha(alpha);
      root.add(ts);
      s.layers.push({ ts, vy, vx });
      return ts;
    };
    const base = (c: number) => root.add(g.add.rectangle(0, 0, W, H, c).setOrigin(0));
    switch (theme) {
      case 'chasm':
        layer('hb_chasm1', 3);
        for (let i = 0; i < 3; i++) {
          const img = g.add.image(Phaser.Math.Between(0, W), Phaser.Math.Between(20, H - 20), i === 1 ? 'hb_worm' : 'hb_beast').setAlpha(0.85);
          const vx = (i % 2 ? -1 : 1) * Phaser.Math.Between(5, 9);
          img.setFlipX(vx > 0);
          root.add(img);
          s.creatures.push({ img, vx, t: Math.random() * 9 });
        }
        layer('hb_chasm2', 9);
        layer('hb_chasm3', 17);
        break;
      case 'cave':
        layer('hb_cave1', 11);
        layer('hb_cave2', 20);
        break;
      case 'spore': {
        layer('hb_spore1', 3);
        layer('hb_spore2', 7, 1.5);
        layer('hb_spore3', 12);
        layer('hb_spore4', 20, -2, 0.5);
        // A haze over the action (under shots and the ship), and spores drifting through it.
        const fog = g.add.tileSprite(0, 0, W, H, 'fog').setOrigin(0).setDepth(9.55).setAlpha(0.13);
        const motes = g.add.particles(0, 0, 'px', {
          x: { min: 0, max: W }, y: -4, lifespan: 9000, speedY: { min: 14, max: 30 }, speedX: { min: -6, max: 6 },
          alpha: { start: 0.8, end: 0.2 }, tint: [0xb8f818, 0x58d854, 0xfce0a8, 0x9878f8], frequency: 80,
        }).setDepth(9.5);
        s.over.push(fog, motes);
        s.fg.push({ ts: fog, vy: 6, vx: -2 });
        break;
      }
      case 'storm': {
        base(0x080412);
        layer('hb_storm1', 5, 26);
        s.flash = g.add.rectangle(0, 0, W, H, 0x9878f8, 0).setOrigin(0);
        root.add(s.flash);
        layer('hb_storm2', 9, 55);
        layer('hb_storm3', 14, 100, 0.85);
        for (const [a, vx, vy, d] of [[0.13, 150, 10, 9.65], [0.08, 230, 16, 9.7]] as const) {
          const ts = g.add.tileSprite(0, 0, W, H, 'hb_wind').setOrigin(0).setDepth(d).setAlpha(a);
          ts.tilePositionX = Math.random() * W;
          ts.setData('a', a);
          s.over.push(ts);
          s.fg.push({ ts, vy, vx });
        }
        break;
      }
      case 'abyss': {
        base(0x070004);
        s.swirl = g.add.graphics();
        root.add(s.swirl);
        s.flash = g.add.rectangle(0, 0, W, H, 0xd800cc, 0).setOrigin(0);
        root.add(s.flash);
        layer('hb_abyss2', 8, 0, 0.9);
        layer('hb_abyss3', 16);
        // Sinews strung across, settling round the arena: the deeper, the slower.
        const at = [[150, 0.55, 2], [36, 1.1, 0], [250, 1.5, 1]] as const;
        for (const [y, f, k] of at) {
          const img = g.add.image(W / 2, -200, `hb_sinew${k}`).setAlpha(k === 2 ? 0.8 : 1);
          root.add(img);
          s.sinews.push({ img, y, f });
        }
        break;
      }
    }
    this.sets.push(s);
    if (this.sets.length === 1 || fade <= 0) { this.dropOld(); return; }
    root.setAlpha(0);
    for (const o of s.over) (o as unknown as Phaser.GameObjects.Components.Alpha).setAlpha?.(0);
    g.tweens.add({ targets: root, alpha: 1, duration: fade, onComplete: () => this.dropOld() });
    for (const o of s.over) {
      const a = (o.getData?.('a') as number | undefined) ?? (o instanceof Phaser.GameObjects.TileSprite ? 0.13 : 1);
      g.tweens.add({ targets: o, alpha: a, duration: fade });
    }
    // The old one's layers over the action fade out with it.
    for (const old of this.sets.slice(0, -1)) {
      for (const o of old.over) {
        if (o instanceof Phaser.GameObjects.Particles.ParticleEmitter) o.stop();
        else g.tweens.add({ targets: o, alpha: 0, duration: fade });
      }
    }
  }

  private dropOld() {
    const keep = this.sets[this.sets.length - 1];
    for (const s of this.sets) {
      if (s === keep) continue;
      s.root.destroy();
      for (const o of s.over) {
        if (o instanceof Phaser.GameObjects.Particles.ParticleEmitter) this.g.time.delayedCall(9000, () => o.destroy());
        else o.destroy();
      }
    }
    this.sets = [keep];
  }

  // `stopIn`: px the arena still has to scroll before it stops (the sinews settle as it does).
  update(dt: number, stopIn: number | null = null) {
    this.t += dt * 1000;
    const k = this.speedK;
    for (const s of this.sets) {
      for (const l of s.layers) {
        l.ts.tilePositionY -= l.vy * k * dt;
        l.ts.tilePositionX += l.vx * (s.theme === 'storm' ? this.windK : 1) * dt;
      }
      for (const l of s.fg) {
        l.ts.tilePositionY -= l.vy * dt;
        l.ts.tilePositionX += l.vx * this.windK * dt;
        const a = l.ts.getData('a') as number | undefined;
        if (a !== undefined && s.root.alpha >= 1) l.ts.setAlpha(a * (1 + this.gustK * 1.6));
      }
      for (const c of s.creatures) {
        c.t += dt;
        c.img.x += c.vx * dt;
        c.img.y += (5 * k + Math.sin(c.t * 0.7) * 2) * dt;
        if (c.img.x < -60 || c.img.x > W + 60 || c.img.y > H + 20) {
          c.vx = (Math.random() < 0.5 ? -1 : 1) * Phaser.Math.Between(5, 9);
          c.img.setFlipX(c.vx > 0).setPosition(c.vx > 0 ? -50 : W + 50, Phaser.Math.Between(-10, H - 60));
        }
        // Now and then its eyes catch some light.
        c.img.setAlpha(0.75 + 0.1 * Math.sin(c.t * 1.3));
      }
      if (s.flash) {
        // Lightning in the clouds, or far down in the swirl.
        if (Math.random() < dt * (s.theme === 'storm' ? 0.45 : 0.35)) {
          s.flash.setFillStyle(s.theme === 'abyss' ? 0xd800cc : Math.random() < 0.5 ? 0x9878f8 : 0x58d854, 0.22);
          if (s.swirl) this.bolt(s);
        }
        s.flash.fillAlpha = Math.max(0, s.flash.fillAlpha - dt * 0.9);
      }
      if (s.swirl) this.drawSwirl(s);
      for (const sn of s.sinews) {
        // They drift in from above and settle where they belong as the arena stops.
        const y = stopIn === null ? sn.y - 600 * sn.f : sn.y - stopIn * sn.f;
        sn.img.setY(Math.round(y + Math.sin(this.t / 900 + sn.f * 3) * 1.5));
      }
    }
  }

  private bolts: Bolt[] = [];

  private bolt(s: Locale) {
    const cx = W / 2, cy = 120;
    const a = Math.random() * Math.PI * 2;
    const pts = [{ x: cx + Math.cos(a) * 10, y: cy + Math.sin(a) * 8 }];
    for (let i = 1; i < 8; i++) {
      const r = 10 + i * 14;
      pts.push({ x: cx + Math.cos(a + (Math.random() - 0.5) * 0.5) * r, y: cy + Math.sin(a + (Math.random() - 0.5) * 0.5) * r * 0.8 });
    }
    this.bolts.push({ pts, t: 0 });
    void s;
  }

  // Far below: arms of dim light swirling round a red glow, lightning crawling through it.
  private drawSwirl(s: Locale) {
    const gx = s.swirl!.clear();
    const cx = W / 2, cy = 120;
    const spin = this.t / 2600;
    // A glow far down, dithered rings fading out from it.
    for (let r = 72; r > 6; r -= 4) {
      const k = 1 - r / 72;
      gx.fillStyle(k > 0.8 ? 0x881400 : k > 0.55 ? 0x4c0010 : k > 0.3 ? 0x2c000a : 0x180005, 0.35 + 0.4 * k).fillCircle(cx, cy, r + Math.sin(this.t / 400 + r) * 1.5);
    }
    for (let arm = 0; arm < 5; arm++) {
      for (let i = 0; i < 60; i++) {
        const k = i / 60;
        const a = spin + (arm / 5) * Math.PI * 2 + k * 4.2;
        const r = 12 + k * 150;
        const col = k < 0.25 ? 0x881400 : k < 0.55 ? 0x5c1028 : 0x3c0c3c;
        gx.fillStyle(col, 1 - k * 0.6).fillRect(Math.round(cx + Math.cos(a) * r), Math.round(cy + Math.sin(a) * r * 0.8), k < 0.4 ? 2 : 1, 1);
      }
    }
    for (const b of this.bolts.slice()) {
      b.t += 16;
      if (b.t > 220) { this.bolts.splice(this.bolts.indexOf(b), 1); continue; }
      const on = b.t < 80 || (b.t > 130 && b.t < 180);
      if (!on) continue;
      gx.lineStyle(3, 0xd800cc, 0.5).strokePoints(b.pts);
      gx.lineStyle(1, 0xfcfcfc, 0.9).strokePoints(b.pts);
    }
  }
}
