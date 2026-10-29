import Phaser from 'phaser';
import { W, H } from './config';
import type { EnemyData, GameScene } from './scenes/GameScene';
import { Backdrop, blob, paint, type BgTheme } from './hivebg';
import { BAND as RING_BAND, GAP as RING_GAP, R as RING_R, ringArt } from './mawgate';

// Heart of the Hollow (level 15): the way through the hive, part by part.
// The walls are one track that scrolls down the screen. Track position u runs
// along it; screen row y shows u = s - y, where s is how far it has scrolled.
// Each part of the level lays its own stretch of track (a section) from where
// the screen's top is when it begins. A section shapes each row of track as
// the open spans between its walls; past its end it keeps its last shape, so
// a part can run on while its waves finish, and the next part picks up from
// there.
//  0. A great ring like Maw Gate's last gate, in a vast cavern, then a tunnel.
//  1. The tunnel winds, opens into chambers, and tentacles lash out of it.
//  2. It widens to walls down the sides in a spore cavern, then opens up for the Sporeheart.
//  3. The tunnel splits, joins and splits again. Further on, gates shut off one
//     way or the other, then it opens out into the storm.
//  4. The storm: strong winds from the right, organic debris, Lancers.
//  5. A wall a third of the way across, with a vent gate at its start that
//     opens for a moment now and then. Missed, the wall curves away and the
//     next comes on the other side, over and over, the storm getting worse
//     each time. Through one, the wall curves the other way and shuts the storm
//     out: a short tunnel thick with spores.
//  6. The tunnel again, wider, with growths hiding eggs and two tentacles at
//     once, then a room full of eggs and the twin Brood Wyrms.
//  7. A short, menacing tunnel to the arena, where everything slows to a stop.

const SPEED = 30; // px per second the track scrolls
const CX = W / 2;
const TUBE = 46; // the tunnel's half width between parts
const OPEN = 130; // a half width that puts the walls off screen
const ROW = 2; // px per drawn row
const TOP = -6; // the first row cached, above the screen
const ROWS = Math.ceil((H - TOP + 8) / ROW);
const TILE = 380; // px of track per vent wall in part 5
const VENT_U = 12; // how far along its tile a vent gate is
const VENT_SHUT = 3600, VENT_TURN = 150, VENT_OPEN = 700; // ms shut, opening or closing, open
const VENT_CYCLE = VENT_SHUT + VENT_TURN * 2 + VENT_OPEN;
const WALL_X = W / 3; // a vent wall's distance from the side it's on
const WALL_TH = 6; // its half thickness
const STOP_DECEL = 4.2; // px/s² the arena slows down by
const GUST_WARN = 1000, GUST_BLOW = 3000, GUST_FORCE = 64;

type Span = [number, number]; // an open stretch of a row, x from and to
interface Section {
  u0: number;
  len: number;
  row: (lu: number, u: number) => Span[];
  teeth?: (lu: number) => number; // 0 to 1: how far teeth stand out of the walls
}
interface Row { sp: Span[]; teeth: number }
// A gate across one branch of a fork in part 3; it shuts when the fork's tip
// is well down the screen.
interface ForkGate { u: number; tip: number; branch: 0 | 1; k: number; closing: boolean; rel: number }
// A vent wall in part 5. side: -1, the wall is a third in from the left (the
// pocket behind the vent is on the left); 1, from the right.
interface Vent { u0: number; side: -1 | 1; t: number; passed: boolean; gassed: boolean; rel: number }
interface Puff { x: number; y: number; t: number; r: number }
interface Clump { img: Phaser.Physics.Arcade.Image; vx: number }

const smooth = (t: number) => { const k = Phaser.Math.Clamp(t, 0, 1); return k * k * (3 - 2 * k); };
const clamp01 = (t: number) => Phaser.Math.Clamp(t, 0, 1);
const lerp = Phaser.Math.Linear;
const hash = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
// Wobble along an edge, 0 to 1.
const wob = (u: number, seed: number) => 0.5 + 0.5 * (Math.sin(u / 23 + seed) * 0.5 + Math.sin(u / 9.7 + seed * 2.3) * 0.3 + Math.sin(u / 41 + seed * 0.7) * 0.2);
// Lumps that stand out of an edge here and there, 0 to 1.
function lump(u: number, seed: number) {
  const cell = 56;
  const c0 = Math.floor(u / cell);
  let m = 0;
  for (let c = c0 - 1; c <= c0 + 1; c++) {
    const r = hash(c * 7.13 + seed);
    if (r < 0.5) continue;
    const d = (u - (c + 0.25 + 0.5 * hash(c * 3.1 + seed)) * cell) / (10 + 14 * hash(c * 1.7 + seed * 5));
    if (Math.abs(d) < 1) m = Math.max(m, (1 - d * d) ** 2 * (0.5 + 0.5 * r));
  }
  return m;
}
// Fangs along an edge, in px.
function tooth(u: number, seed: number) {
  const p = u + seed * 7;
  const c = Math.floor(p / 22);
  return Math.max(0, 7 - Math.abs(p - c * 22 - 11) * 1.4) * (0.6 + 0.4 * hash(c + seed));
}
// A tunnel row from l to r, its edges roughened (amp: wobble, la: lumps, fang: teeth).
function tube(u: number, l: number, r: number, amp = 4, la = 10, fang = 0): Span {
  return [l + amp * wob(u, 1) + la * lump(u, 1) + fang * tooth(u, 1), r - amp * wob(u, 2) - la * lump(u, 2) - fang * tooth(u, 2)];
}
const tubeAt = (u: number, cx: number, half: number, amp?: number, la?: number, fang?: number) => [tube(u, cx - half, cx + half, amp, la, fang)];

function makeWallArt(g: Phaser.Scene) {
  // Veins shared by the menacing walls and their glow.
  const veins: [number, number][][] = [];
  let seed = 7;
  const r = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let i = 0; i < 16; i++) {
    let x = r() * W, y = r() * H, a = r() * Math.PI * 2;
    const pts: [number, number][] = [];
    for (let s = 0; s < 60; s++) { a += (r() - 0.5) * 0.7; x += Math.cos(a); y += Math.sin(a); pts.push([x, y]); }
    veins.push(pts);
  }
  // The hive's flesh: a less saturated red, blotched with circles, some purple.
  paint(g, 'hivewall', W, H, (px, rand) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, (x + y) % 7 === 0 ? 0x421820 : 0x4a1c26);
    const cols = [[0x5c2430, 0x4e1e2a], [0x683040, 0x582834], [0x3a1626, 0x30101e], [0x48205c, 0x3c1a4c], [0x5c2c70, 0x4a2460], [0x2c0c18, 0x220812]];
    for (let i = 0; i < 110; i++) {
      const x = rand() * W, y = rand() * H, rr = 3 + rand() * 11;
      const c = cols[Math.floor(rand() * cols.length)];
      blob(px, x, y, rr + 1, [0x30101a, 0x30101a], 2.5);
      blob(px, x, y, rr, [c[0], c[1]], 2.5);
      if (rr > 5) { px(x - rr * 0.4, y - rr * 0.4, 0x8a4858); px(x - rr * 0.4 + 1, y - rr * 0.4, 0x7a3c4c); }
    }
  });
  paint(g, 'hivewall_maw', W, H, (px, rand) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) px(x, y, (x * 3 + y) % 5 === 0 ? 0x1c040a : 0x24060e);
    for (let i = 0; i < 80; i++) {
      const x = rand() * W, y = rand() * H, rr = 3 + rand() * 10;
      blob(px, x, y, rr, rand() < 0.3 ? [0x2c0a24, 0x220818] : [0x34081a, 0x2a0614], 2);
    }
    for (const v of veins) for (const [x, y] of v) px(x, y, 0x5c0c10);
  });
  // The glow of those veins, pulsing over them.
  if (!g.textures.exists('hivewall_vein')) {
    const tex = g.textures.createCanvas('hivewall_vein', W, H)!;
    const ctx = tex.getContext();
    ctx.fillStyle = '#d82800';
    for (const v of veins) for (const [x, y] of v) ctx.fillRect(((Math.round(x) % W) + W) % W, ((Math.round(y) % H) + H) % H, 1, 1);
    tex.refresh();
  }
}

export class Hive {
  s = 0; // px scrolled since the level began
  private t = 0;
  private v = SPEED; // px/s it scrolls right now
  private secs: Section[] = [];
  private rows: Row[] = [];
  private events: { u: number; fn: () => void }[] = [];
  private seg = -1;
  private segU = 0; // where this part's track began
  private doneU = Infinity; // done once the screen's top passes this
  private braked = false;
  private stopU: number | null = null; // where the arena stops
  bg: Backdrop;
  private mask: Phaser.GameObjects.Graphics;
  private flesh: Phaser.GameObjects.TileSprite;
  private maw: Phaser.GameObjects.TileSprite;
  private veinGlow: Phaser.GameObjects.TileSprite;
  private gfx: Phaser.GameObjects.Graphics; // edges, gates, the ring
  private glow: Phaser.GameObjects.Graphics; // light, added on
  private mawK = 0; // 0: flesh walls, 1: the menacing ones
  private ring: { u: number; vortex: number } | null = null;
  private forkGates: ForkGate[] = [];
  private shutSaid = false;
  private vents: Vent[] = [];
  private passed = 0; // vents gone by in part 5
  private entered = false;
  private gas: Phaser.GameObjects.Particles.ParticleEmitter;
  private puffs: Puff[] = [];
  // Spawners this level runs itself.
  private larvaIn = 2000;
  private sporeIn = 1500;
  private podIn = 2500;
  private sporesFrom = Infinity; // spore clouds come thick and fast while the screen's top is in [from, to)
  private sporesTo = -Infinity;
  private larvaFrom = Infinity;
  private larvaTo = -Infinity;
  private calmFrom = Infinity; // no hazards once the screen's top passes this
  // The storm.
  private storm = false;
  private gust = -1; // ms into a gust, -1 when none is blowing
  private gustIn = 5000;
  private clumpIn = 1500;
  private lancerIn = 6000;
  private blow = 0; // 0 to 1: how hard it's blowing
  private clumps: Clump[] = [];

  constructor(private g: GameScene, startSeg: number, index: number) {
    makeWallArt(g);
    this.bg = new Backdrop(g, index);
    this.mask = g.make.graphics({}, false);
    const geo = this.mask.createGeometryMask();
    this.flesh = g.add.tileSprite(0, 0, W, H, 'hivewall').setOrigin(0).setMask(geo);
    this.maw = g.add.tileSprite(0, 0, W, H, 'hivewall_maw').setOrigin(0).setMask(geo).setAlpha(0);
    this.veinGlow = g.add.tileSprite(0, 0, W, H, 'hivewall_vein').setOrigin(0).setMask(geo).setAlpha(0);
    this.gfx = g.add.graphics();
    this.glow = g.add.graphics().setBlendMode(Phaser.BlendModes.ADD);
    [this.flesh, this.maw, this.veinGlow, this.gfx, this.glow].forEach((o, i) => g.children.moveTo(o, index + 1 + i));
    this.gas = g.add.particles(0, 0, 'px', {
      speedX: { min: -25, max: 25 }, speedY: { min: -60, max: 60 }, lifespan: { min: 500, max: 1200 }, scale: { start: 2, end: 0.5 },
      alpha: { start: 0.8, end: 0 }, tint: [0xf878f8, 0xfcc4fc, 0xd800cc], emitting: false,
    }).setDepth(9.6);
    this.beginSegment(startSeg, true);
  }

  // --- Building the track ------------------------------------------------------

  private add(u0: number, len: number, row: Section['row'], teeth?: Section['teeth']) {
    const s = { u0, len, row, teeth };
    this.secs.push(s);
    return s;
  }

  private at(u: number, fn: () => void) { this.events.push({ u, fn }); }

  private theme(t: BgTheme, fade = 2500) { this.bg.set(t, fade); }

  // A new part of the level begins at the screen's top (`fresh`: the level
  // starts here, after a Rewind Beacon or the Cheat Menu too).
  beginSegment(seg: number, fresh = false) {
    const g = this.g;
    this.seg = seg;
    const u0 = this.s;
    this.segU = u0;
    this.events = [];
    this.calmFrom = Infinity;
    const fade = fresh ? 0 : 2500;
    switch (seg) {
      case 0: {
        const len = 460;
        // The cavern's walls only show where they bulge in at the edges, then a tunnel closes in.
        this.add(u0, len, (lu, u) => {
          const k = smooth((lu - 200) / 240);
          return tubeAt(u, CX, lerp(W / 2 + 10, TUBE, k), lerp(7, 4, k), lerp(18, 10, k));
        });
        this.theme('chasm', fade);
        // The ring the ship came through, with the vortex closing behind it.
        this.ring = { u: u0 - 200, vortex: fresh ? 1 : 0 };
        if (fresh) this.emerge();
        this.at(u0 + 300, () => this.theme('cave'));
        this.doneU = u0 + len;
        break;
      }
      case 1: {
        const len = 1800, chambers = [420, 900, 1380], cl = 260;
        const chamber = (lu: number) => chambers.reduce((m, c) => Math.max(m, smooth((lu - c + 50) / 50) * smooth((c + cl + 50 - lu) / 50)), 0);
        this.add(u0, len, (lu, u) => {
          lu = Math.max(0, lu);
          const k = smooth(lu / 200) * smooth((len - lu) / 200);
          const ch = chamber(lu);
          return tubeAt(u, CX + Math.sin(lu / 140) * 26 * k * (1 - ch), lerp(TUBE, lerp(36, 72, ch), k));
        });
        this.theme('cave', fade);
        this.doneU = u0 + len;
        break;
      }
      case 2: {
        const len = 1300;
        this.add(u0, len, (lu, u) => {
          lu = Math.max(0, lu);
          const a = smooth(lu / 300), b = smooth((lu - 950) / 300);
          return tubeAt(u, CX + Math.sin(lu / 200) * 10 * a * (1 - b), lerp(lerp(TUBE, 74, a), OPEN, b), 5, 14);
        });
        this.theme('spore', fade);
        // More and more spores on the way to the Sporeheart.
        this.sporesFrom = u0 + 850;
        this.sporesTo = u0 + 1500;
        this.doneU = u0 + len;
        break;
      }
      case 3: this.branches(u0, fade); break;
      case 4: {
        const len = 1350;
        this.add(u0, len, () => [[-99, W + 99]]);
        this.theme('storm', fade);
        this.storm = true;
        this.doneU = u0 + len;
        break;
      }
      case 5:
        this.theme('storm', fade);
        this.storm = true;
        this.vents = [];
        this.passed = 0;
        this.entered = false;
        this.addVent(u0 + 40, -1);
        this.doneU = Infinity;
        break;
      case 6: this.eggs(u0, fade); break;
      case 7: {
        // In, a short way between fangs, out into the arena, and a stop once
        // the walls are off the bottom of the screen.
        const len = 380 + H + 10;
        const fangs = (lu: number) => smooth((lu - 40) / 80) * smooth((330 - lu) / 80);
        this.add(u0, len, (lu, u) => {
          lu = Math.max(0, lu);
          const half = lu < 110 ? lerp(OPEN, 50, smooth(lu / 110)) : lu < 260 ? 50 : lerp(50, OPEN, smooth((lu - 260) / 120));
          return tubeAt(u, CX + Math.sin(lu / 60) * 5 * fangs(lu), half, 5, 10, fangs(lu));
        }, fangs);
        this.theme('abyss', fresh ? 0 : 3000);
        g.tweens.add({ targets: this, mawK: 1, duration: fresh ? 0 : 1500 });
        this.stopU = u0 + len;
        this.doneU = Infinity;
        break;
      }
    }
  }

  // Part 3: the tunnel splits and joins again, then gates shut off one way or the
  // other, and at last it opens out into the storm.
  private branches(u0: number, fade: number) {
    const parts: ['in' | 'tube' | 'fork' | 'gate' | 'out', number][] = [
      ['in', 260], ['tube', 100], ['fork', 220], ['tube', 80], ['fork', 220], ['tube', 80],
      ['gate', 340], ['tube', 80], ['gate', 340], ['tube', 80], ['gate', 340], ['out', 240],
    ];
    const starts: number[] = [];
    let total = 0;
    for (const [, len] of parts) { starts.push(total); total += len; }
    const fork = (p: number, fl: number, u: number): Span[] => {
      const half = TUBE + 32 * smooth(p / 60) * smooth((fl - p) / 60);
      const dw = 15 * Math.sqrt(clamp01((p - 40) / 40)) * Math.sqrt(clamp01((fl - 40 - p) / 40));
      const [l, r] = tube(u, CX - half, CX + half);
      if (dw < 1) return [[l, r]];
      return [[l, CX - dw - 3 * wob(u, 5) - 4 * lump(u, 5)], [CX + dw + 3 * wob(u, 6) + 4 * lump(u, 6), r]];
    };
    this.add(u0, total, (lu, u) => {
      if (lu >= total) return [[-99, W + 99]];
      lu = Math.max(0, lu);
      let i = parts.length - 1;
      while (i > 0 && starts[i] > lu) i--;
      const [kind, len] = parts[i];
      const p = lu - starts[i];
      if (kind === 'in') return tubeAt(u, CX, lerp(OPEN, TUBE, smooth(p / len)));
      if (kind === 'out') return tubeAt(u, CX, lerp(TUBE, OPEN, smooth(p / len)));
      if (kind === 'tube') return tubeAt(u, CX, TUBE);
      return fork(p, len, u);
    });
    this.forkGates = [];
    parts.forEach(([kind], i) => {
      if (kind === 'gate') this.forkGates.push({ u: u0 + starts[i] + 170, tip: u0 + starts[i] + 40, branch: Math.random() < 0.5 ? 0 : 1, k: 0, closing: false, rel: 1 });
    });
    this.theme('spore', fade);
    this.at(u0 + 120, () => this.theme('cave'));
    this.larvaFrom = u0 + 300;
    this.larvaTo = u0 + total - 260;
    // Out into the storm.
    this.at(u0 + total - 200, () => {
      this.theme('storm', 3000);
      this.g.radio('REYES: WE\'RE OUTSIDE?!\nLOOK AT THAT STORM!');
    });
    this.doneU = u0 + total;
  }

  // Part 6: wider tunnel, growths hiding eggs, then a room full of eggs and an
  // open space for the Wyrms.
  private eggs(u0: number, fade: number) {
    const len = 2200, room = 1650, roomEnd = 1950;
    this.add(u0, len, (lu, u) => {
      lu = Math.max(0, lu);
      let half = lerp(TUBE, 66, smooth(lu / 200));
      half = lerp(half, 84, smooth((lu - room + 60) / 60));
      half = lerp(half, OPEN, smooth((lu - roomEnd) / 220));
      const cx = CX + Math.sin(lu / 190) * 8 * smooth(lu / 200) * (1 - smooth((lu - room + 120) / 120));
      return tubeAt(u, cx, half, 5, 12);
    });
    this.theme('cave', fade);
    this.calmFrom = u0 + room - 100;
    // The room: rows of eggs, nothing in front of them.
    this.at(u0 + room, () => {
      const g = this.g;
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 3; c++) {
          const y = -12 - r * 48 - Phaser.Math.Between(0, 16);
          const span = this.spanAt(0);
          const x = lerp(span[0] + 18, span[1] - 18, (c + 0.5) / 3) + Phaser.Math.Between(-10, 10) + (r % 2 ? 12 : -12);
          const e = g.spawnEgg(x, y, SPEED);
          // They hatch once they're down the screen, a few at a time.
          (e.getData('e') as EnemyData).hold = 5500 + (-y / SPEED) * 1000 + Phaser.Math.Between(0, 5000);
        }
      }
      g.radio('VEX: IT\'S A NEST!\nBURN THEM ALL!');
    });
    this.doneU = u0 + len - 100;
  }

  // --- Part 5: the vents -----------------------------------------------------------

  private addVent(u0: number, side: -1 | 1) {
    const v: Vent = { u0, side, t: Phaser.Math.Between(0, 1200), passed: false, gassed: false, rel: 1 };
    this.vents.push(v);
    const wx0 = side < 0 ? WALL_X : W - WALL_X;
    const away = side < 0 ? -18 : W + 18; // past the screen's edge, on the vent's side
    this.add(u0, TILE, (lu, u) => {
      if (lu < 0 || lu >= TILE) return [[-99, W + 99]];
      const th = WALL_TH * Math.sqrt(smooth(lu / 14));
      const wx = lerp(wx0, away, smooth((lu - (TILE - 90)) / 70));
      // Smooth on the vent's side, lumpy and wobbly on the other.
      const smoothSide = 1.5 * wob(u, 8);
      const rough = th > 1 ? 3 * wob(u, 9) + 12 * lump(u, 9) : 0;
      return side < 0 ? [[-99, wx - th - smoothSide], [wx + th + rough, W + 99]] : [[-99, wx - th - rough], [wx + th + smoothSide, W + 99]];
    });
  }

  // How open a vent is, 0 to 1.
  private ventOpen(v: Vent) {
    const c = v.t % VENT_CYCLE;
    if (c < VENT_SHUT) return 0;
    if (c < VENT_SHUT + VENT_TURN) return (c - VENT_SHUT) / VENT_TURN;
    if (c < VENT_SHUT + VENT_TURN + VENT_OPEN) return 1;
    return Math.max(0, 1 - (c - VENT_SHUT - VENT_TURN - VENT_OPEN) / VENT_TURN);
  }

  // The vent gate's span across its pocket, and its screen row.
  private ventSpan(v: Vent): { x0: number; x1: number; y: number } {
    const wx0 = v.side < 0 ? WALL_X : W - WALL_X;
    return { x0: v.side < 0 ? -4 : wx0 + WALL_TH - 1, x1: v.side < 0 ? wx0 - WALL_TH + 1 : W + 4, y: this.s - (v.u0 + VENT_U) };
  }

  // Through a vent: the wall curves the other way and shuts the storm out, and
  // the pocket behind opens into a tunnel thick with spores.
  private enter(v: Vent) {
    const g = this.g;
    this.entered = true;
    this.storm = false;
    // Walls further on are dropped.
    const pu0 = v.u0 + TILE - 90;
    this.secs = this.secs.filter((s) => s.u0 <= v.u0);
    this.vents = this.vents.filter((o) => o.u0 <= v.u0);
    const wx0 = v.side < 0 ? WALL_X : W - WALL_X;
    const far = v.side < 0 ? W + 24 : -24;
    const len = 560;
    this.add(pu0, len, (lu, u) => {
      lu = Math.max(0, lu);
      const wx = lerp(wx0, far, smooth(lu / 80));
      const tk = smooth((lu - 50) / 220);
      const half = lerp(58, TUBE, smooth((lu - 400) / 160));
      const l = lerp(-30, CX - half, tk), r = lerp(W + 30, CX + half, tk);
      const [tl, tr] = tube(u, l, r, 4 * tk, 10 * tk);
      const rough = 3 * wob(u, 9) + 12 * lump(u, 9);
      if (v.side < 0) {
        const sp: Span[] = [[tl, Math.min(tr, wx - WALL_TH - 1.5 * wob(u, 8))]];
        if (wx + WALL_TH + rough < W + 4) sp.push([wx + WALL_TH + rough, W + 99]);
        return sp;
      }
      const sp: Span[] = [];
      if (wx - WALL_TH - rough > -4) sp.push([-99, wx - WALL_TH - rough]);
      sp.push([Math.max(tl, wx + WALL_TH + 1.5 * wob(u, 8)), tr]);
      return sp;
    });
    this.theme('chasm', 3000);
    this.bg.windK = 1;
    this.bg.gustK = 0;
    this.blow = 0;
    this.gust = -1;
    g.radio('REYES: WE\'RE IN!\nSPORES, EVERYWHERE...');
    this.sporesFrom = pu0 + 60;
    this.sporesTo = pu0 + 480;
    this.doneU = pu0 + len;
  }

  // --- Each frame ------------------------------------------------------------------

  // Done: this part's track has gone by (and, in part 5, the ship got back in;
  // in part 7, the arena has stopped).
  get done() { return this.seg === 7 ? this.braked : this.s >= this.doneU; }

  // No level hazards (the egg room, the arena).
  get calm() { return this.s >= this.calmFrom || this.seg === 7; }

  // How far the wind pushes the ship this frame.
  pull(dt: number) { return { x: -GUST_FORCE * this.blow * dt, y: 0 }; }

  private spansOf(u: number): Row {
    let sec = this.secs[0];
    for (let i = this.secs.length - 1; i >= 0; i--) if (this.secs[i].u0 <= u) { sec = this.secs[i]; break; }
    if (!sec) return { sp: [[-99, W + 99]], teeth: 0 };
    return { sp: sec.row(u - sec.u0, u), teeth: sec.teeth?.(u - sec.u0) ?? 0 };
  }

  // Row y's open spans.
  spans(y: number) {
    const i = Phaser.Math.Clamp(Math.round((y - TOP) / ROW), 0, ROWS - 1);
    return this.rows[i]?.sp ?? [[-99, W + 99]];
  }

  // The open span nearest x on row y.
  nearest(x: number, y: number): Span {
    let best: Span = [-99, W + 99], d = Infinity;
    for (const sp of this.spans(y)) {
      if (sp[1] - sp[0] < 1) continue;
      const dd = x < sp[0] ? sp[0] - x : x > sp[1] ? x - sp[1] : 0;
      if (dd < d) { d = dd; best = sp; }
    }
    return best;
  }

  // The widest open span on row y.
  spanAt(y: number): Span {
    return this.spans(y).reduce((b, sp) => (sp[1] - sp[0] > b[1] - b[0] ? sp : b), [0, 0] as Span);
  }

  private wallAt(x: number, y: number) {
    return !this.spans(y).some(([a, b]) => x >= a && x <= b);
  }

  // Gates that are shut, as boxes.
  private gateBoxes() {
    const out: { x0: number; x1: number; y: number }[] = [];
    for (const fg of this.forkGates) {
      if (fg.k <= 0) continue;
      const y = this.s - fg.u;
      if (y < -10 || y > H + 10) continue;
      const sp = this.spans(y);
      if (sp.length < 2) continue;
      const [a, b] = sp[fg.branch];
      const w = ((b - a) / 2) * fg.k;
      if (fg.k >= 1) out.push({ x0: a - 3, x1: b + 3, y });
      else { out.push({ x0: a - 3, x1: a + w, y }); out.push({ x0: b - w, x1: b + 3, y }); }
    }
    for (const v of this.vents) {
      const o = this.ventOpen(v);
      const { x0, x1, y } = this.ventSpan(v);
      if (y < -10 || y > H + 10) continue;
      if (o < 0.6) out.push({ x0, x1, y });
      else {
        // Open: just the stubs at each end.
        const w = ((x1 - x0) / 2) * (1 - o);
        out.push({ x0, x1: x0 + w, y }, { x0: x1 - w, x1, y });
      }
    }
    return out;
  }

  // Whether a point is inside the walls or a shut gate.
  solidAt(x: number, y: number) {
    return this.wallAt(x, y) || this.gateBoxes().some((b) => Math.abs(y - b.y) < 5 && x > b.x0 && x < b.x1);
  }

  // An x for something entering at the top, from 0 to 1 across the open track
  // (across both ways, where it splits).
  mapX(x01: number) {
    const sp = this.spans(0).map(([a, b]) => [Math.max(a, 8), Math.min(b, W - 8)] as Span).filter(([a, b]) => b - a > 14);
    if (!sp.length) return x01 * W;
    const total = sp.reduce((n, [a, b]) => n + (b - a - 14), 0);
    let at = Phaser.Math.Clamp(x01, 0, 1) * total;
    for (const [a, b] of sp) {
      const w = b - a - 14;
      if (at <= w) return a + 7 + at;
      at -= w;
    }
    return sp[sp.length - 1][1] - 7;
  }

  // Where an enemy at (x, y) is kept: inside the open span nearest it.
  keepIn(x: number, y: number) {
    const [a, b] = this.nearest(x, y);
    if (b - a <= 16) return x;
    return Phaser.Math.Clamp(x, a + 7, b - 7);
  }

  // The ship flies out of the vortex at the start.
  private emerge() {
    const g = this.g;
    const p = g.player;
    if (!p) { g.time.delayedCall(0, () => this.emerge()); return; }
    const to = { x: p.x, y: p.y };
    p.setPosition(CX, 200).setScale(0.1).setAngle(-540);
    g.tweens.add({ targets: p, x: to.x, y: to.y, scale: 1, angle: 0, duration: 1300, ease: 'Quad.easeOut' });
  }

  update(dt: number, moving: boolean) {
    const g = this.g;
    const ms = dt * 1000;
    this.t += ms;
    // The arena slows to a stop.
    if (this.stopU !== null) {
      const left = this.stopU - this.s;
      this.v = left <= 0.3 ? 0 : Math.min(SPEED, Math.max(1.5, Math.sqrt(2 * STOP_DECEL * left)));
      if (this.v === 0 && !this.braked) { this.braked = true; this.s = this.stopU; }
    } else this.v = SPEED;
    if (moving) this.s += this.v * dt;
    this.bg.speedK = this.v / SPEED;
    this.bg.update(dt, this.stopU !== null ? Math.max(0, this.stopU - this.s) : null);
    for (const e of this.events.slice()) if (this.s >= e.u) { this.events.splice(this.events.indexOf(e), 1); e.fn(); }
    // Sections well below the screen go.
    while (this.secs.length > 1 && this.secs[1].u0 < this.s - H - 40) this.secs.shift();
    for (let i = 0; i < ROWS; i++) this.rows[i] = this.spansOf(this.s - (TOP + i * ROW));

    const live = g.phase === 'action';
    if (this.seg === 5 && !this.entered) this.runVents(ms, live);
    if (this.seg === 3) this.runForkGates(ms);
    if (moving) this.spawners(ms);
    this.runStorm(ms, live && moving);

    this.draw();
    if (live) this.collide();
    else this.blockShots();
  }

  private runVents(ms: number, live: boolean) {
    const g = this.g;
    const last = this.vents[this.vents.length - 1];
    if (last && this.s > last.u0 + TILE - 140) this.addVent(last.u0 + TILE, last.side < 0 ? 1 : -1);
    const p = g.player;
    for (const v of this.vents) {
      const { x0, x1, y } = this.ventSpan(v);
      if (y > -20 && y < H + 20) {
        v.t += ms;
        const o = this.ventOpen(v);
        if (o > 0 && !v.gassed) {
          v.gassed = true;
          // A blast of pink gas, both ways, like a steam vent.
          for (let i = 0; i < 46; i++) {
            const x = Phaser.Math.FloatBetween(Math.max(0, x0), Math.min(W, x1));
            this.gas.emitParticleAt(x, y + Phaser.Math.Between(-3, 3));
          }
          for (let i = 0; i < 4; i++) this.puffs.push({ x: lerp(Math.max(4, x0), Math.min(W - 4, x1), (i + 0.5) / 4), y, t: -i * 60, r: Phaser.Math.Between(9, 14) });
          g.tipOnce('vent', 'SLIP THROUGH THE\nVENT WHEN IT OPENS');
        }
        if (o === 0) v.gassed = false;
        // Through it, and it shut behind: back inside the hive.
        const inPocket = v.side < 0 ? p.x < x1 : p.x > x0;
        if (live && o === 0 && inPocket && p.y < y - 6 && y > 0 && y < H + 6) { this.enter(v); return; }
      }
      if (!v.passed && y > H + 8) {
        v.passed = true;
        this.passed++;
        if (this.passed === 2) g.radio('VEX: THE VENTS! SLIP\nIN WHEN ONE OPENS!');
        if (this.passed === 5) g.radio('REYES: IT\'S TEARING US\nAPART OUT HERE!');
      }
    }
    this.vents = this.vents.filter((v) => this.s - (v.u0 + VENT_U) < H + 60);
  }

  private runForkGates(ms: number) {
    const g = this.g;
    for (const fg of this.forkGates) {
      // It shuts once the tip of the fork is well down the screen: anyone in the
      // wrong branch has room to drop back and cross over.
      if (!fg.closing && this.s - fg.tip >= 190) {
        fg.closing = true;
        if (!this.shutSaid) { this.shutSaid = true; g.radio('VEX: THEY\'RE SHUTTING\nUS OUT OF THE HIVE!'); }
      }
      if (fg.closing) fg.k = Math.min(1, fg.k + ms / 700);
    }
  }

  private spawners(ms: number) {
    const g = this.g;
    if (g.phase !== 'action') return;
    // Hatchlings scattered through the branching tunnel.
    if (this.s >= this.larvaFrom && this.s < this.larvaTo) {
      this.larvaIn -= ms;
      if (this.larvaIn <= 0) {
        this.larvaIn = Phaser.Math.Between(1300, 2400);
        const x = this.mapX(Math.random());
        for (let i = 0, n = Phaser.Math.Between(1, 3); i < n; i++) g.spawn('larva', x + (i - 1) * 7, -6 - i * 6);
      }
    }
    // Spore clouds, thick and fast.
    if (this.s >= this.sporesFrom && this.s < this.sporesTo) {
      const k = (this.s - this.sporesFrom) / (this.sporesTo - this.sporesFrom);
      this.sporeIn -= ms;
      if (this.sporeIn <= 0) {
        this.sporeIn = Phaser.Math.Between(1200, 2000) * (1 - 0.3 * k);
        g.hazardNow('spores');
      }
      this.podIn -= ms;
      if (this.podIn <= 0) {
        this.podIn = Phaser.Math.Between(2200, 3400);
        g.spawn('spore', this.mapX(Math.random()), -10);
      }
    }
  }

  // The storm: strong winds from the right, debris and Lancers, more of all of
  // it the longer it goes (and with each vent missed).
  private runStorm(ms: number, live: boolean) {
    const g = this.g;
    if (this.storm && live) {
      const heat = this.seg === 5 ? 1.5 + 0.5 * this.passed : 1 + 0.5 * clamp01((this.s - this.segU) / 1350);
      if (this.gust < 0) {
        this.gustIn -= ms;
        if (this.gustIn <= 0) { this.gust = 0; g.tipOnce('wind', 'STRONG WINDS FROM\nTHE RIGHT!'); }
      } else {
        this.gust += ms;
        if (this.gust > GUST_WARN + GUST_BLOW) { this.gust = -1; this.gustIn = Phaser.Math.Between(6500, 10000) / heat; }
      }
      this.clumpIn -= ms * (1 + this.blow);
      if (this.clumpIn <= 0) {
        this.clumpIn = Phaser.Math.Between(2400, 4000) / heat;
        const big = Math.random() < 0.4;
        const vx = -Phaser.Math.Between(20, 32) * (1 + 0.12 * this.passed);
        const img = g.clump(W + 14, Phaser.Math.Between(30, H - 70), vx, Phaser.Math.Between(6, 14), big);
        this.clumps.push({ img, vx });
      }
      this.lancerIn -= ms;
      if (this.lancerIn <= 0) {
        this.lancerIn = Phaser.Math.Between(9000, 13000) / heat;
        g.spawn('lancer', this.mapX(Math.random()), -10);
      }
    } else if (!this.storm) this.gust = -1;
    // The wind: a warning as the clouds pick up, then a blow that eases in and out.
    const gu = this.gust;
    const warnK = gu < 0 ? 0 : Math.min(1, gu / GUST_WARN);
    const blowK = gu < GUST_WARN ? 0 : Math.min(1, (gu - GUST_WARN) / 400) * Math.min(1, (GUST_WARN + GUST_BLOW - gu) / 400);
    this.blow = blowK;
    if (this.storm || this.bg.windK > 1) {
      this.bg.windK = 1 + 0.4 * warnK * (1 - blowK) + 1.8 * blowK;
      this.bg.gustK = Math.max(warnK * 0.4, blowK);
    }
    // Debris speeds up in the wind.
    this.clumps = this.clumps.filter((c) => c.img.active);
    for (const c of this.clumps) c.img.setVelocityX(c.vx * (1 + 0.9 * blowK));
  }

  // --- Drawing --------------------------------------------------------------------

  private draw() {
    const m = this.mask.clear().fillStyle(0xffffff);
    const gx = this.gfx.clear();
    const gl = this.glow.clear();
    const maw = this.mawK;
    for (const ts of [this.flesh, this.maw, this.veinGlow]) ts.tilePositionY = -this.s;
    this.maw.setAlpha(maw);
    this.flesh.setAlpha(1 - maw * 0.999);
    this.veinGlow.setAlpha(maw * (0.35 + 0.35 * Math.sin(this.t / 280)));
    const edge = maw > 0.5 ? 0x881400 : 0x8a3444;
    const shine = maw > 0.5 ? 0xfc7460 : 0xd07080;
    const dark = maw > 0.5 ? 0x0c0004 : 0x1c0408;
    let prev: Row | null = null;
    for (let i = ROWS - 1; i >= 0; i--) {
      const y = TOP + i * ROW;
      const row = this.rows[i];
      const u = this.s - y;
      // The walls: everything outside the open spans.
      let x = -2;
      for (const [a, b] of row.sp) {
        if (a > x) m.fillRect(x, y, a - x, ROW);
        x = Math.max(x, b);
      }
      if (x < W + 2) m.fillRect(x, y, W + 2 - x, ROW);
      // A dark line and a glistening edge along every wall, joined up between rows.
      row.sp.forEach(([a, b], k) => {
        const pa = prev && prev.sp.length === row.sp.length ? prev.sp[k] : null;
        for (const [e, inward, pe] of [[a, -1, pa?.[0]], [b, 1, pa?.[1]]] as const) {
          if (e < -4 || e > W + 4) continue;
          const lo = pe !== undefined && Math.abs(pe - e) < 30 ? Math.min(pe, e) : e, hi = pe !== undefined && Math.abs(pe - e) < 30 ? Math.max(pe, e) : e;
          gx.fillStyle(dark, 1).fillRect(lo + (inward < 0 ? -3 : 1), y, hi - lo + 2, ROW);
          gx.fillStyle(edge, 1).fillRect(lo + (inward < 0 ? -2 : 0), y, hi - lo + 2, ROW);
          if (Math.floor(u / 3) % 3 === 0) gx.fillStyle(shine, 0.85).fillRect(inward < 0 ? lo - 1 : hi, y, 1, ROW);
          // Fangs: bone out of the wall.
          if (row.teeth > 0.05) {
            const f = row.teeth * tooth(u, inward < 0 ? 1 : 2);
            if (f > 1) {
              const x0 = inward < 0 ? e - f : e;
              gx.fillStyle(0xd8c8a8, 1).fillRect(x0, y, f, ROW);
              gx.fillStyle(0x7c6c5c, 1).fillRect(inward < 0 ? x0 : x0 + f - 1, y, 1, ROW);
            }
          }
        }
      });
      // Menacing walls glow red along their edges.
      if (maw > 0.5 && i % 2 === 0) {
        const pulse = 0.12 + 0.1 * Math.sin(this.t / 260 + u / 30);
        for (const [a, b] of row.sp) {
          if (a > -4) gl.fillStyle(0xd82800, pulse).fillRect(a, y, 6, ROW);
          if (b < W + 4) gl.fillStyle(0xd82800, pulse).fillRect(b - 6, y, 6, ROW);
        }
      }
      prev = row;
    }
    this.drawRing();
    this.drawForkGates();
    this.drawVents();
  }

  private drawRing() {
    const r = this.ring;
    if (!r) return;
    const cy = this.s - r.u;
    if (cy - RING_R > H + 20) { this.ring = null; return; }
    // The vortex the ship came out of, closing.
    if (r.vortex > 0) {
      r.vortex = Math.max(0, r.vortex - 0.016 / 2.2);
      const rad = 10 + 64 * r.vortex;
      const spin = this.t / 160;
      for (let arm = 0; arm < 6; arm++) {
        for (let i = 0; i < 34; i++) {
          const k = i / 34;
          const a = spin + (arm / 6) * Math.PI * 2 + k * 3.4;
          const col = k < 0.25 ? 0xfcfcfc : k < 0.55 ? 0xf878f8 : k < 0.8 ? 0xd800cc : 0x6844fc;
          this.gfx.fillStyle(col, r.vortex * (1 - k * 0.5)).fillRect(Math.round(CX + Math.cos(a) * rad * k) - 1, Math.round(cy + Math.sin(a) * rad * k) - 1, 2, 2);
        }
      }
      this.glow.fillStyle(0xf878f8, 0.3 * r.vortex).fillCircle(CX, cy, rad * 0.8);
    }
    ringArt(this.gfx, this.glow, this.t, CX, cy, true);
  }

  // A sphincter of flesh across [x0, x1] at row y, `shut` 0 (open) to 1.
  private sphincter(x0: number, x1: number, y: number, shut: number, th: number) {
    const gx = this.gfx;
    const w = ((x1 - x0) / 2) * shut;
    for (const [a, b] of [[x0, x0 + w], [x1 - w, x1]]) {
      if (b - a < 0.5) continue;
      gx.fillStyle(0x3c0424, 1).fillRect(a, y - th / 2 - 1, b - a, th + 2);
      gx.fillStyle(0x6c0c3c, 1).fillRect(a, y - th / 2, b - a, th);
      gx.fillStyle(0xa40080, 1).fillRect(a, y - 1, b - a, 2);
      for (let x = Math.ceil(a / 4) * 4; x < b; x += 4) gx.fillStyle(0x4c0040, 1).fillRect(x, y - th / 2, 1, th);
      gx.fillStyle(0xf878f8, 1).fillRect(a, y - th / 2, b - a, 1);
    }
    // Knots of muscle where it meets the walls.
    for (const x of [x0, x1]) {
      gx.fillStyle(0x3c0424, 1).fillCircle(x, y, th / 2 + 3);
      gx.fillStyle(0x881440, 1).fillCircle(x, y, th / 2 + 1);
      gx.fillStyle(0xd85c9c, 1).fillRect(x - 1, y - 2, 2, 1);
    }
  }

  private drawForkGates() {
    for (const fg of this.forkGates) {
      const y = this.s - fg.u;
      if (y < -12 || y > H + 12) continue;
      const sp = this.spans(y);
      if (sp.length < 2) continue;
      // Both ways have a gate; only one shuts.
      sp.forEach(([a, b], k) => this.sphincter(a - 2, b + 2, y, k === fg.branch ? fg.k : 0.08, 8));
    }
  }

  private drawVents() {
    const gx = this.gfx;
    for (const v of this.vents) {
      const { x0, x1, y } = this.ventSpan(v);
      if (y < -14 || y > H + 14) continue;
      const o = this.ventOpen(v);
      // The throat behind, glowing pink while it's open.
      if (o > 0) this.glow.fillStyle(0xf878f8, 0.35 * o).fillRect(Math.max(0, x0), y - 4, Math.min(W, x1) - Math.max(0, x0), 8);
      this.sphincter(x0, x1, y, 1 - o, 10);
      // Lit warning nubs that flicker as it's about to open.
      const c = v.t % VENT_CYCLE;
      const soon = c > VENT_SHUT - 700 && c < VENT_SHUT;
      if (soon && Math.floor(c / 90) % 2 === 0) {
        for (let x = Math.max(4, x0 + 6); x < Math.min(W - 4, x1 - 6); x += 8) gx.fillStyle(0xfcc4fc, 1).fillRect(x, y - 1, 2, 2);
      }
    }
    for (const pf of this.puffs.slice()) {
      pf.t += 16;
      if (pf.t > 900) { this.puffs.splice(this.puffs.indexOf(pf), 1); continue; }
      if (pf.t < 0) continue;
      const k = pf.t / 900;
      for (const dir of [-1, 1]) this.glow.fillStyle(0xf878f8, 0.35 * (1 - k)).fillCircle(pf.x, pf.y + dir * k * 22, pf.r * (0.4 + k));
    }
  }

  // --- Hits -----------------------------------------------------------------------

  // Shots stop at the walls and shut gates (the Wave Beam passes through).
  private blockShots() {
    const g = this.g;
    const boxes = this.gateBoxes();
    const hit = (x: number, y: number) => this.wallAt(x, y) || boxes.some((b) => Math.abs(y - b.y) < 5 && x > b.x0 && x < b.x1);
    for (const group of [g.playerBullets, g.enemyBullets]) {
      for (const b of group.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
        if (!b.active || b.getData('fx') === 'wave') continue;
        if (b.y < -4 || b.y > H + 4 || !hit(b.x, b.y)) continue;
        if (group === g.playerBullets) g.tink(b.x, b.y);
        b.destroy();
      }
    }
  }

  private collide() {
    const g = this.g;
    this.blockShots();
    const p = g.player;
    // The ring's band, at the start.
    if (this.ring) {
      const cy = this.s - this.ring.u;
      const dx = p.x - CX, dy = p.y - cy, d = Math.hypot(dx, dy);
      if (Math.abs(d - RING_R) <= RING_BAND + 3 && Math.abs(dx) >= RING_GAP / 2 - 4) {
        g.hurt();
        g.tipOnce('gatering', 'FLY THROUGH THE\nGAPS IN THE RINGS');
        const k = (d < RING_R ? RING_R - RING_BAND - 8 : RING_R + RING_BAND + 8) / Math.max(d, 1);
        p.setPosition(Phaser.Math.Clamp(CX + dx * k, 6, W - 6), Phaser.Math.Clamp(cy + dy * k, 24, H - 30));
      }
    }
    // The walls hurt, and shove the ship back into the open.
    if ([[-4, 0], [4, 0], [0, -3], [0, 3]].some(([dx, dy]) => this.wallAt(p.x + dx, p.y + dy))) {
      g.hurt();
      const [a, b] = this.nearest(p.x, p.y);
      p.x = b - a < 12 ? (a + b) / 2 : Phaser.Math.Clamp(p.x, a + 6, b - 6);
      g.tipOnce('hivewall', 'DON\'T TOUCH THE\nWALLS OF THE HIVE');
    }
    // Shut gates push the ship back the way it came, and crush it against the bottom.
    const gates: { y: number; x0: number; x1: number; o: { rel: number; side?: -1 | 1 } }[] = [];
    for (const fg of this.forkGates) {
      if (fg.k <= 0) continue;
      const y = this.s - fg.u;
      for (const b of this.gateBoxes().filter((bx) => Math.abs(bx.y - y) < 0.5)) gates.push({ ...b, o: fg });
    }
    for (const v of this.vents) {
      const o = this.ventOpen(v);
      const { x0, x1, y } = this.ventSpan(v);
      if (o < 0.6) gates.push({ x0, x1, y, o: v });
      else {
        const w = ((x1 - x0) / 2) * (1 - o);
        gates.push({ x0, x1: x0 + w, y, o: v }, { x0: x1 - w, x1, y, o: v });
      }
    }
    for (const gt of gates) {
      const over = Math.abs(p.y - gt.y) < 9 && p.x + 3 > gt.x0 && p.x - 3 < gt.x1;
      if (!over) { if (Math.abs(p.y - gt.y) >= 9) gt.o.rel = Math.sign(p.y - gt.y) || 1; continue; }
      if (gt.o.rel < 0) p.y = gt.y - 9;
      else {
        p.y = gt.y + 9;
        if (p.y > H - 30) {
          // Crushed against the bottom: hurt, and squeezed out past the end of
          // a vent (never through it).
          p.y = H - 30;
          g.hurt();
          if (gt.o.side) p.x = gt.o.side < 0 ? WALL_X + WALL_TH + 10 : W - WALL_X - WALL_TH - 10;
        }
      }
    }
  }

  destroy() {
    for (const o of [this.mask, this.flesh, this.maw, this.veinGlow, this.gfx, this.glow, this.gas]) o.destroy();
  }
}
