import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { ENEMY_STATS } from '../data/enemies';
import { segmentEnd, type LevelDef, type LevelEvent, type Theme, type Wave } from '../data/levels';
import { corruptFormation, isCorrupt } from '../corrupt';
import { addScenery, type Scenery } from '../scenery';
import { fitScene } from '../screen';
import { starfield, text } from '../ui';
import { eventTime, segEvents, segName } from './model';

// The Level Editor's scroll view: the level laid out as one long strip, with
// every wave drawn where it comes in and frozen there. Time runs up the
// screen: a wave sits on the play line at the moment it spawns, later waves
// are above it and earlier ones below. Dragging scrolls through the level,
// and the backdrop scrolls with it the way it does in the game.

export const PX = 0.02; // game pixels per ms of level time
export const LINE_Y = 128; // the play line: the moment the readout shows, and where PLAY starts
const TAIL = 3000; // room after a segment's last wave, before its end
const GAP = 2500; // room between one segment's end and the next one's start

export interface WaveSpot { seg: number; i: number; t: number }
export interface Timeline {
  segs: { start: number; end: number }[];
  waves: WaveSpot[][]; // by segment
  end: number; // where the level's END mark is
}

// Every wave's moment on the strip. The game doesn't know how long a
// WAIT FOR CLEAR wave waits, so it shows as its delay alone.
export function timeline(def: LevelDef): Timeline {
  const segs: Timeline['segs'] = [];
  const waves: WaveSpot[][] = [];
  let at = 0;
  def.segments.forEach((list, seg) => {
    const start = at;
    let t = start;
    waves.push(list.map((w, i) => { t += w.delay; return { seg, i, t }; }));
    segs.push({ start, end: t + TAIL });
    at = t + TAIL + GAP;
  });
  return { segs, waves, end: at };
}

// The segment a moment falls in: the last one started by then.
export function segAt(tl: Timeline, t: number) {
  let s = 0;
  tl.segs.forEach((g, i) => { if (g.start <= t) s = i; });
  return s;
}

// Where each ship of a wave appears, as GameScene.spawnWave puts them, from
// the point it enters: y 0 is the entry line and above it is negative.
// Drillers slide in from the sides instead.
export function formation(w: Wave): { x: number; y: number }[] {
  const n = w.count ?? 1;
  const cx = (w.x ?? 0.5) * W;
  if (w.kind === 'driller' || w.kind === 'cdriller') {
    const side = (x: number) => (x < W / 2 ? 8 : W - 8);
    if (w.pattern === 'pair') return [{ x: 8, y: 0 }, { x: W - 8, y: 0 }];
    return Array.from({ length: n }, (_, i) => ({ x: side(cx), y: -i * 12 }));
  }
  const pts: { x: number; y: number }[] = [];
  switch (w.pattern) {
    case 'single': pts.push({ x: cx, y: -10 }); break;
    case 'pair': pts.push({ x: W * 0.3, y: -10 }, { x: W * 0.7, y: -10 }); break;
    case 'line': for (let i = 0; i < n; i++) pts.push({ x: ((i + 0.5) / n) * (W - 20) + 10, y: -10 }); break;
    case 'column': for (let i = 0; i < n; i++) pts.push({ x: cx, y: -10 - i * 16 }); break;
    case 'vee':
      for (let i = 0; i < n; i++) {
        const side = i - (n - 1) / 2;
        pts.push({ x: Phaser.Math.Clamp(cx + side * 16, 8, W - 8), y: -10 - Math.abs(side) * 12 });
      }
      break;
    case 'swarm': {
      // Single file from the top corner, a beat apart.
      const dir = cx < W / 2 ? 1 : -1;
      return Array.from({ length: n }, (_, i) => ({ x: (dir > 0 ? 14 : W - 14) - dir * i * 4, y: -i * 9 }));
    }
  }
  return pts.map((p, i) => {
    const q = isCorrupt(w.kind) ? corruptFormation(w.pattern, i, pts.length, p.x, p.y) : p;
    return { x: q.x, y: q.y + 10 };
  });
}

const END_LABEL: Record<string, string> = {
  vendor: 'VENDOR', on: 'STRAIGHT ON', rift: 'THE RIFT OPENS', riftExit: 'OUT OF THE RIFT',
  boss: 'BOSS', treasure: 'TREASURE', clear: 'LEVEL CLEAR', gate: 'THE LAST GATE',
};

// What an event's label says, and its color. A radio call shows who's
// calling until it's tapped open.
function eventLabel(ev: LevelEvent, open: boolean): [string, string] {
  if (ev.radio !== undefined) {
    const who = ev.radio.split(':')[0];
    return [open ? ev.radio.replace(/\s*\n\s*/g, ' ') : `${who.length < 12 ? who : 'RADIO'} ...`, COLOR.cyan];
  }
  if (ev.alarm !== undefined) return [`ALARM: ${ev.alarm.replace(/\s*\n\s*/g, ' ')}`, COLOR.red];
  if (ev.arena !== undefined) return [ev.arena ? 'ARENA ON' : 'ARENA OFF', COLOR.yellow];
  return [ev.hazards ? 'HAZARDS ON' : 'HAZARDS OFF', COLOR.gray];
}

export interface ViewHooks {
  tapWave(seg: number, i: number): void;
  tapSpace(t: number, x: number, clientX: number, clientY: number): void;
  editSeg(seg: number): void;
  addSeg(at: number): void;
  openEvent(seg: number, k: number): void; // its line in the Events tab (k past the last event: the end)
  moved(): void; // the play line moved: update the readout and the level strip
}

export interface ViewState {
  def: LevelDef;
  sel: { seg: number; i: number } | null;
  locked: boolean; // no adding segments (the hive and Maw Gate)
}

interface Ship { img: Phaser.GameObjects.Image; seg: number; i: number }
interface Hit { x: number; y: number; w: number; h: number; fn: () => void } // a button, in world coordinates

export class EditView extends Phaser.Scene {
  hooks: ViewHooks | null = null;
  T = 0; // the moment on the play line, ms from the level's start
  tl: Timeline = { segs: [], waves: [], end: 0 };
  private state: ViewState | null = null;
  private built = false;
  private world!: Phaser.GameObjects.Container;
  private ships: Ship[] = [];
  private glow: Phaser.GameObjects.Image[] = [];
  private hits: Hit[] = [];
  private stars!: ReturnType<typeof starfield>;
  private theme: Theme | null = null;
  private scenery: Scenery | null = null;
  private sceneryAt = 0; // where the scenery's segment starts, for the planet's drift
  private planetY = 0;
  private nebulaY = 0;
  private drag: { y: number; T: number; moved: boolean; lastY: number; lastAt: number } | null = null;
  private fling = 0; // ms of level time per ms, after a flick
  private glide: { to: number; left: number } | null = null;
  private opened = new Set<string>(); // radio bubbles tapped open, by `seg:k`

  constructor() {
    super('EditView');
  }

  create() {
    this.built = false;
    this.ships = [];
    this.glow = [];
    this.theme = null;
    this.scenery = null;
    fitScene(this, 899);
    this.stars = starfield(this);
    this.world = this.add.container(0, 0).setDepth(10);
    // The play line.
    const line = this.add.graphics().setDepth(20);
    line.fillStyle(0x58d854, 0.5);
    for (let x = 0; x < W; x += 6) line.fillRect(x, LINE_Y, 3, 1);
    line.fillTriangle(0, LINE_Y - 3, 0, LINE_Y + 3, 4, LINE_Y);

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.fling = 0;
      this.glide = null;
      this.drag = { y: p.y, T: this.T, moved: false, lastY: p.y, lastAt: p.downTime };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      if (!d || !p.isDown) return;
      if (Math.abs(p.y - d.y) > 4) d.moved = true;
      if (!d.moved) return;
      const now = this.time.now;
      if (now > d.lastAt) this.fling = ((p.y - d.lastY) / PX) / (now - d.lastAt) * 0.6 + this.fling * 0.4;
      d.lastY = p.y;
      d.lastAt = now;
      this.setT(d.T + (p.y - d.y) / PX);
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const d = this.drag;
      this.drag = null;
      if (!d) return;
      if (d.moved) {
        if (this.time.now - d.lastAt > 80) this.fling = 0;
        return;
      }
      this.fling = 0;
      this.tap(p);
    });
    this.input.on('wheel', (_p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      this.glide = null;
      this.setT(this.T - dy * 10);
    });
    if (this.state) this.rebuild();
    this.built = true;
  }

  // Draws the level afresh: after any change to it, or a new wave picked.
  show(state: ViewState) {
    this.state = state;
    if (this.built) this.rebuild();
  }

  setT(t: number, quiet = false) {
    this.T = Phaser.Math.Clamp(t, 0, this.tl.end);
    if (!quiet) this.hooks?.moved();
  }

  // Scrolls so a wave sits in the top part of the screen, clear of the wave editor.
  focus(seg: number, i: number) {
    const spot = this.tl.waves[seg]?.[i];
    if (!spot) return;
    const y = LINE_Y + (this.T - spot.t) * PX;
    if (y > 50 && y < LINE_Y + 10) return;
    this.glide = { to: spot.t + (80 - LINE_Y) / PX, left: 300 };
  }

  private rebuild() {
    const st = this.state!;
    this.world.removeAll(true);
    this.ships = [];
    this.glow = [];
    this.hits = [];
    this.tl = timeline(st.def);
    this.T = Phaser.Math.Clamp(this.T, 0, this.tl.end);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.world.add(o); return o; };
    const g = add(this.add.graphics());
    const button = (x: number, y: number, label: string, color: string, fn: () => void) => {
      const w = label.length * 8 + 8;
      g.fillStyle(0x000000, 1).fillRect(x, y, w, 14);
      g.lineStyle(1, Phaser.Display.Color.HexStringToColor(color).color, 1).strokeRect(x + 0.5, y + 0.5, w - 1, 13);
      add(text(this, x + 4, y + 3, label, color));
      this.hits.push({ x, y, w, h: 14, fn });
      return w;
    };
    const def = st.def;
    const last = def.segments.length - 1;
    this.tl.segs.forEach((s, seg) => {
      // The segment's start: its name, EDIT, and + to put a new segment before it.
      const y = -s.start * PX;
      g.fillStyle(0xf8b800, 0.8).fillRect(0, y, W, 1);
      add(text(this, 3, y - 11, `${seg + 1}. ${segName(def, seg)}`, COLOR.yellow));
      let bx = W - 12; // clear of the level strip
      if (!st.locked) {
        bx -= 16;
        button(bx, y + 3, '+', COLOR.green, () => this.hooks?.addSeg(seg));
        bx -= 3;
      }
      button(bx - 40, y + 3, 'EDIT', COLOR.yellow, () => this.hooks?.editSeg(seg));
      // How it ends: a mini boss first, if it has one, then its end.
      const ey = -s.end * PX;
      g.fillStyle(0x7c7c7c, 0.6);
      for (let x = 0; x < W; x += 4) g.fillRect(x, ey, 2, 1);
      const boss = def.segmentBoss?.[seg];
      const end = END_LABEL[segmentEnd(def, seg)].replace('BOSS', def.boss ? `BOSS: ${def.boss.toUpperCase()}` : 'BOSS');
      const label = add(text(this, W - 12, ey + 3, `${boss && seg < last ? `MINI BOSS: ${boss.toUpperCase()}, ` : ''}${end}`, COLOR.gray).setOrigin(1, 0));
      const k = segEvents(def, seg).length;
      this.hits.push({ x: label.x - label.width - 2, y: ey, w: label.width + 4, h: 14, fn: () => this.hooks?.openEvent(seg, k) });
    });
    if (!st.locked) {
      const y = -this.tl.end * PX;
      g.fillStyle(0x7c7c7c, 0.8).fillRect(0, y, W, 1);
      add(text(this, 3, y - 11, 'END', COLOR.gray));
      button(W - 12 - 80, y + 3, '+ SEGMENT', COLOR.green, () => this.hooks?.addSeg(def.segments.length));
    }

    def.segments.forEach((list, seg) => list.forEach((w, i) => {
      const t = this.tl.waves[seg][i].t;
      const y0 = -t * PX;
      if (w.waitClear) {
        g.fillStyle(0x3cbcfc, 0.8);
        for (let x = 0; x < W; x += 6) g.fillRect(x, y0 + 8, 3, 1);
        add(text(this, 3, y0 + 10, 'WAIT FOR CLEAR', COLOR.cyan));
      }
      const key = ENEMY_STATS[w.kind]?.texture ?? w.kind;
      const tex = this.textures.exists(key) ? key : 'px';
      const on = st.sel?.seg === seg && st.sel.i === i;
      for (const p of formation(w)) {
        const img = add(this.add.image(Math.round(p.x), Math.round(y0 + p.y), tex));
        if (w.kind === 'driller' || w.kind === 'cdriller') img.setFlipX(p.x > W / 2);
        this.ships.push({ img, seg, i });
        if (on) this.glow.push(add(this.add.image(img.x, img.y, tex).setFlipX(img.flipX).setTintFill(0xffffff)));
      }
    }));

    // Events, on top: a speech bubble for each radio call (tap to read it,
    // tap again to edit it), and a tag for the rest. Ones close together stack up.
    const lg = add(this.add.graphics());
    this.tl.segs.forEach((s, seg) => {
      const times = this.tl.waves[seg].map((w) => w.t - s.start);
      let above = Infinity; // the top of the last label, to stack the next one over
      const evs = segEvents(def, seg).map((ev, k) => ({ ev, k, t: s.start + eventTime(ev, times) })).sort((a, b) => a.t - b.t);
      evs.forEach(({ ev, k, t }) => {
        const y = Math.min(-t * PX, above - 2);
        const key = `${seg}:${k}`;
        const open = this.opened.has(key);
        const [str, color] = eventLabel(ev, open);
        const tx = add(text(this, 7, 0, str, color));
        if (open) tx.setWordWrapWidth(W - 34);
        const h = tx.height + 6, w = tx.width + 8;
        tx.setY(Math.round(y - h + 3));
        const c = Phaser.Display.Color.HexStringToColor(color).color;
        lg.fillStyle(0x000000, 0.85).fillRect(3, y - h, w, h);
        lg.lineStyle(1, c, 1).strokeRect(3.5, y - h + 0.5, w - 1, h - 1);
        // A tick at its moment, on the left edge.
        lg.fillStyle(c, 1).fillRect(0, -t * PX, 3, 1);
        above = y - h;
        this.hits.push({
          x: 3, y: y - h, w, h,
          fn: () => {
            if (ev.radio !== undefined && !open) { this.opened.add(key); this.rebuild(); return; }
            this.hooks?.openEvent(seg, k);
          },
        });
      });
    });
    this.place();
  }

  private tap(p: Phaser.Input.Pointer) {
    const x = p.worldX, y = p.worldY;
    if (x < 0 || x > W || y < 0 || y > H) return;
    const wy = y - this.world.y;
    for (const h of this.hits) {
      if (x >= h.x && x <= h.x + h.w && wy >= h.y && wy <= h.y + h.h) { h.fn(); return; }
    }
    // The nearest ship under the finger, with a little room around each.
    let best: Ship | null = null;
    let bestD = Infinity;
    for (const s of this.ships) {
      const b = s.img;
      const dx = Math.abs(x - b.x), dy = Math.abs(wy - b.y);
      if (dx > b.width / 2 + 4 || dy > b.height / 2 + 4) continue;
      if (dx + dy < bestD) { best = s; bestD = dx + dy; }
    }
    if (best) { this.hooks?.tapWave(best.seg, best.i); return; }
    const ev = p.event as MouseEvent | TouchEvent;
    const pt = 'changedTouches' in ev ? ev.changedTouches[0] : ev;
    this.hooks?.tapSpace(-wy / PX, x / W, pt?.clientX ?? 0, pt?.clientY ?? 0);
  }

  // Lines the level and the backdrop up with the play line.
  private place() {
    this.world.y = Math.round(LINE_Y + this.T * PX);
    const tl = this.tl;
    // The backdrop is the theme of the segment at the middle of the screen.
    const mid = this.T + (LINE_Y - H / 2) / PX;
    const seg = segAt(tl, mid);
    const def = this.state?.def;
    if (def) {
      const theme = def.segmentThemes?.[seg] ?? def.theme;
      if (theme !== this.theme) this.setTheme(theme, tl.segs[seg]?.start ?? 0);
    }
    const rush = this.theme === 'rift' ? 3 : 1;
    const s = this.T / 1000;
    const [far, near] = this.stars.layers;
    far.tilePositionY = -6 * rush * s;
    near.tilePositionY = -18 * rush * s;
    const sc = this.scenery;
    if (!sc) return;
    if (sc.scenery) sc.scenery.tilePositionY = -11 * rush * s;
    const since = Math.max(0, this.T - this.sceneryAt) / 1000;
    if (sc.planet) sc.planet.y = this.planetY + 1.2 * since;
    if (sc.nebula) sc.nebula.y = this.nebulaY + 0.7 * since;
  }

  private setTheme(theme: Theme, start: number) {
    const old = this.scenery;
    if (old) {
      for (const o of [old.scenery, old.planet, old.nebula, old.fog]) o?.destroy();
      old.motes?.destroy();
    }
    this.theme = theme;
    this.sceneryAt = start;
    this.scenery = this.state?.def.hive ? null : addScenery(this, theme);
    this.planetY = this.scenery?.planet?.y ?? 0;
    this.nebulaY = this.scenery?.nebula?.y ?? 0;
  }

  update(time: number, delta: number) {
    if (!this.built) return;
    if (this.glide) {
      const k = Math.min(1, delta / this.glide.left);
      this.glide.left = Math.max(1, this.glide.left - delta);
      this.setT(this.T + (this.glide.to - this.T) * k);
      if (this.glide.left <= 1) this.glide = null;
    } else if (!this.drag && Math.abs(this.fling) > 0.05) {
      this.setT(this.T + this.fling * delta);
      this.fling *= Math.pow(0.995, delta);
      if (this.T <= 0 || this.T >= this.tl.end) this.fling = 0;
    }
    this.place();
    // The picked wave pulses up to half white.
    const a = 0.25 - 0.25 * Math.cos(time / 160);
    for (const g of this.glow) g.setAlpha(a);
    const fog = this.scenery?.fog;
    if (fog) { fog.tilePositionY -= 6 * delta / 1000; fog.tilePositionX += 2 * delta / 1000; }
  }
}
