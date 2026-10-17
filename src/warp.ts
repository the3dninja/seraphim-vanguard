import Phaser from 'phaser';
import { W, H } from './config';
import type { FoeKind } from './data/enemies';
import type { EnemyData, GameScene } from './scenes/GameScene';

// Maw Gate: enemies warping into the top half of the screen. Each one is
// announced by a warp circle that forms where it will appear, with a blinking
// marker in the middle; it pops in with a flash and the circle blinks away.
// A big warp-in brings twice the enemies, with larger, brighter circles.

const WARN = 1300; // ms the circle forms before the enemy arrives
const BIG_WARN = 1900;
const FADE = 450; // ms the circle blinks away after
const POOL: FoeKind[] = ['tendril', 'tendril', 'mimic', 'mimic', 'spore'];
const BIG_POOL: FoeKind[] = ['tendril', 'tendril', 'mimic', 'mimic', 'spore', 'husk'];

interface Portal { x: number; y: number; t: number; warn: number; big: boolean; kind: FoeKind; spawned: boolean }

export class Warps {
  private portals: Portal[] = [];

  constructor(private g: GameScene) {}

  // `n` enemies at spread-out spots in the top half, arriving a beat apart.
  open(n: number, big: boolean) {
    const spots: { x: number; y: number }[] = [];
    for (let tries = 0; spots.length < n && tries < 200; tries++) {
      const x = Phaser.Math.Between(16, W - 16), y = Phaser.Math.Between(34, Math.round(H * 0.45));
      if (spots.every((s) => Phaser.Math.Distance.Between(s.x, s.y, x, y) > (big ? 30 : 26))) spots.push({ x, y });
    }
    spots.forEach((s, i) => this.portals.push({
      ...s, t: -i * 120, warn: big ? BIG_WARN : WARN, big, spawned: false,
      kind: Phaser.Utils.Array.GetRandom(big ? BIG_POOL : POOL),
    }));
    const g = this.g;
    g.tipOnce('warp', 'ENEMIES WARPING IN!');
    if (big) {
      g.cameras.main.shake(BIG_WARN, 0.003);
      g.cameras.main.flash(300, 120, 0, 110);
    }
  }

  update(dt: number) {
    const g = this.g;
    const gfx = g.beams;
    for (const p of this.portals.slice()) {
      p.t += dt * 1000;
      if (p.t < 0) continue;
      const r = p.big ? 17 : 11;
      if (p.t < p.warn) {
        // Forming: dashed rings spin up and grow, a marker blinks in the middle.
        const k = p.t / p.warn;
        const rr = 3 + (r - 3) * Math.sqrt(k);
        const spin = (p.t / 1000) * (p.big ? 5 : 3.5);
        gfx.fillStyle(p.big ? 0xd800cc : 0x6844fc, 0.12 + 0.18 * k).fillCircle(p.x, p.y, rr);
        this.dashes(gfx, p.x, p.y, rr, spin, p.big ? 0xd800cc : 0x9878f8, 0.45 + 0.5 * k, p.big ? 2 : 1);
        if (p.big) this.dashes(gfx, p.x, p.y, rr * 0.7, -spin * 1.4, 0x3cbcfc, 0.4 + 0.5 * k, 1);
        if (Math.floor(p.t / (k > 0.7 ? 70 : 140)) % 2 === 0) {
          gfx.fillStyle(p.big ? 0xfc7460 : 0xfcfcfc, 1);
          gfx.fillRect(p.x - 1, p.y - 3, 2, 6).fillRect(p.x - 3, p.y - 1, 6, 2);
        }
        continue;
      }
      if (!p.spawned) {
        p.spawned = true;
        if (g.phase !== 'action') { this.portals.splice(this.portals.indexOf(p), 1); continue; }
        const e = g.spawn(p.kind, p.x, p.y);
        const d = e.getData('e') as EnemyData;
        d.stopY = p.y; // they've arrived: no drifting in from the top
        g.flash(e);
        g.sparks.explode(p.big ? 14 : 8, p.x, p.y);
      }
      // Blinking away: a bright ring that widens and flickers out.
      const f = (p.t - p.warn) / FADE;
      if (f >= 1) { this.portals.splice(this.portals.indexOf(p), 1); continue; }
      if (Math.floor(p.t / 60) % 2 === 0) {
        gfx.lineStyle(p.big ? 3 : 2, 0xfcfcfc, 1 - f).strokeCircle(p.x, p.y, r + f * (p.big ? 10 : 6));
        gfx.lineStyle(1, p.big ? 0xd800cc : 0x9878f8, 1 - f).strokeCircle(p.x, p.y, r + 3 + f * (p.big ? 14 : 8));
      }
    }
  }

  // A ring of eight dashes, turned by `spin`.
  private dashes(gfx: Phaser.GameObjects.Graphics, x: number, y: number, r: number, spin: number, color: number, alpha: number, width: number) {
    gfx.lineStyle(width, color, alpha);
    for (let i = 0; i < 8; i++) {
      const a = spin + (i / 8) * Math.PI * 2;
      gfx.beginPath();
      gfx.arc(x, y, r, a, a + 0.5);
      gfx.strokePath();
    }
  }

  clear() { this.portals = []; }
}
