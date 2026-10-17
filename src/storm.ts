import Phaser from 'phaser';
import { W, H } from './config';
import type { GameScene } from './scenes/GameScene';

// Storm Eye's storm, scripted over the level instead of fixed hazard timers.
// Lightning from the start; halfway to the vendor the sky warms and harmless
// embers drift past, then real embers start falling. After the vendor it
// builds up, peaks with a second ember timer and hot wind, and dies down as
// the last waves come in, leaving a little red in the sky.
export interface StormPlan {
  lightning: [number, number] | null; // ms between strikes, null = off
  embers: [number, number][]; // one timer per entry
  heat: number; // 0..1: how red the sky is, how many embers drift by
  wind: boolean; // hot wind gusting through the background
}

const lerp = (a: number, b: number, k: number) => Math.round(a + (b - a) * k);
const range = (a: [number, number], b: [number, number], k: number): [number, number] => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];

const CALM_LIGHTNING: [number, number] = [6000, 9000];
const EMBERS: [number, number] = [2000, 6000];
const WARM = 0.35;

// After the vendor, in ms along the segment's wave delays: the build-up, the
// heavy storm, then the ramp down to the last wave.
const BUILD_FROM = 7300;
const PEAK_FROM = 38900;
const PEAK_TO = 58800;
const AFTERGLOW = 0.15; // the bit of red sky and drifting embers left at the end

// What the storm does at `p` (0..1) through segment `seg`, whose waves add up
// to `total` ms.
export function stormPlan(seg: number, p: number, total: number): StormPlan {
  if (seg === 0) {
    if (p < 0.4) return { lightning: CALM_LIGHTNING, embers: [], heat: 0, wind: false };
    // A warning first: the sky warms and embers drift by, then they start to fall.
    return { lightning: CALM_LIGHTNING, embers: p < 0.5 ? [] : [EMBERS], heat: WARM, wind: false };
  }
  const t = p * total;
  if (t < BUILD_FROM) return { lightning: CALM_LIGHTNING, embers: [EMBERS], heat: WARM, wind: false };
  if (t < PEAK_FROM) {
    const k = (t - BUILD_FROM) / (PEAK_FROM - BUILD_FROM);
    return { lightning: range(CALM_LIGHTNING, [3000, 5000], k), embers: [range(EMBERS, [1000, 4000], k)], heat: WARM + 0.2 * k, wind: false };
  }
  if (t < PEAK_TO) return { lightning: [2000, 4000], embers: [[1000, 4000], [1000, 4000]], heat: 1, wind: true };
  // The storm dies down as the last waves come in, leaving a little glow.
  if (p >= 1) return { lightning: null, embers: [], heat: AFTERGLOW, wind: false };
  const k = Math.min(1, (t - PEAK_TO) / Math.max(1, total - PEAK_TO));
  return {
    lightning: range([2000, 4000], [6000, 9000], k),
    embers: k < 0.5 ? [range([1000, 4000], [3000, 7000], k), range([1000, 4000], [3000, 7000], k)] : [range([1000, 4000], [3000, 7000], k)],
    heat: 1 + (AFTERGLOW - 1) * k,
    wind: k < 0.4,
  };
}

interface Mote { x: number; y: number; vx: number; vy: number; big: boolean }
interface Whoosh { y: number; t: number; len: number }

export class Storm {
  private gfx: Phaser.GameObjects.Graphics;
  private heat = 0; // eases toward the plan's heat
  private motes: Mote[] = [];
  private whooshes: Whoosh[] = [];
  private whooshIn = 0;
  private timers: number[] = []; // [lightning, ...embers]; NaN while off

  constructor(private g: GameScene, depthIndex: number) {
    this.gfx = g.add.graphics();
    g.children.moveTo(this.gfx, depthIndex); // over the scenery, under everything that flies
  }

  // Fires lightning and embers on the plan's timers. Call only during action.
  run(dt: number, plan: StormPlan) {
    const specs = [plan.lightning, ...plan.embers];
    for (let i = 0; i < Math.max(specs.length, this.timers.length); i++) {
      const sp = specs[i] ?? null;
      if (!sp) { this.timers[i] = NaN; continue; }
      if (Number.isNaN(this.timers[i] ?? NaN)) { this.timers[i] = Phaser.Math.Between(...sp); continue; }
      this.timers[i] -= dt * 1000;
      if (this.timers[i] > 0) continue;
      this.timers[i] = Phaser.Math.Between(...sp);
      if (i === 0) this.g.stormStrike();
      else this.g.stormEmber();
    }
  }

  // The sky: a red wash, drifting embers and hot wind. Runs every frame.
  draw(dt: number, plan: StormPlan) {
    const ms = dt * 1000;
    // Ease in slowly, but clear quickly when the storm breaks.
    const rate = plan.heat > this.heat ? 0.25 : 0.6;
    this.heat += Phaser.Math.Clamp(plan.heat - this.heat, -rate * dt, rate * dt);
    const gfx = this.gfx;
    gfx.clear();
    if (this.heat > 0.01) gfx.fillStyle(0xd82800, 0.22 * this.heat).fillRect(0, 0, W, H);

    // Harmless embers drifting by: more and faster the hotter it is.
    const want = plan.heat <= 0 ? 0 : Math.round(8 + 40 * plan.heat);
    if (this.motes.length < want && Math.random() < dt * (6 + 30 * plan.heat)) {
      const wind = plan.wind ? 1 : 0;
      this.motes.push({
        x: Phaser.Math.Between(-10, W), y: -4,
        vx: Phaser.Math.Between(4, 14) + wind * Phaser.Math.Between(30, 60), vy: Phaser.Math.Between(18, 34) + wind * 20,
        big: Math.random() < 0.25,
      });
    }
    for (const m of this.motes.slice()) {
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      if (m.y > H + 4 || m.x > W + 6) { this.motes.splice(this.motes.indexOf(m), 1); continue; }
      const flick = Math.random() < 0.15 ? 0.3 : 0.75;
      gfx.fillStyle(m.big ? 0xfc7460 : 0xf8b800, flick).fillRect(m.x, m.y, m.big ? 2 : 1, m.big ? 2 : 1);
    }

    // Hot wind: long pale streaks rushing across the sky.
    if (plan.wind) {
      this.whooshIn -= ms;
      if (this.whooshIn <= 0) {
        this.whooshIn = Phaser.Math.Between(250, 700);
        this.whooshes.push({ y: Phaser.Math.Between(10, H - 40), t: 0, len: Phaser.Math.Between(40, 110) });
      }
    }
    for (const w of this.whooshes.slice()) {
      w.t += ms;
      const x = -w.len + (w.t / 600) * (W + w.len * 2);
      if (x > W + w.len) { this.whooshes.splice(this.whooshes.indexOf(w), 1); continue; }
      const a = 0.18 * Math.sin(Math.min(1, w.t / 600) * Math.PI);
      gfx.fillStyle(0xfca044, a).fillRect(x, w.y, w.len, 2);
      gfx.fillStyle(0xfce0a8, a * 0.8).fillRect(x + w.len * 0.3, w.y + 5, w.len * 0.6, 1);
    }
  }
}
