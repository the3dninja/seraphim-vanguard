import Phaser from 'phaser';
import { W, H } from './config';
import { bossDeath, shotsIn } from './bossfx';
import type { GameScene } from './scenes/GameScene';
import { toast } from './ui';
import { BOSS_STATS } from './data/bosses';

const S = BOSS_STATS.wyrm; // health and damage taken, live from the Tuner
const SEGMENTS = 10;
const SPACING = 6; // px along the trail between segments
const REWARD = 225;
const DIVE_EVERY = 7500; // ms between dives at the ship

interface Seg { img: Phaser.GameObjects.Image; hp: number }

// The Brood Wyrm, level 15's second mini boss, at the end of the egg-laden
// growths: a long segmented worm that swims figure eights across the top of
// the screen. Only the head can be hurt; body segments block shots and can be
// burst one at a time, shortening it. Segments lay eggs as it swims, the head
// fires aimed spreads, and now and then it dives at the ship and swims back up.
export class Wyrm {
  private t = 0;
  private hx = W / 2;
  private hy = -30;
  private trail: { x: number; y: number }[] = [];
  private head: Phaser.GameObjects.Image;
  private segs: Seg[] = [];
  private hp = S.hp.head;
  private entering = true;
  private dead = false;
  private path = 0; // where it is on its figure eight
  private dive = 0; // ms into a dive, 0 when swimming
  private diveIn = DIVE_EVERY;
  private diveFrom = { x: 0, y: 0 };
  private diveTo = { x: 0, y: 0 };
  private fireIn = 1400;
  private eggIn = 2600;

  constructor(private g: GameScene, private onDefeated: () => void) {
    this.head = g.add.image(this.hx, this.hy, 'wyrmhead').setDepth(8.6);
    for (let i = 0; i < SEGMENTS; i++) this.segs.push({ img: g.add.image(this.hx, this.hy, 'wyrmseg').setDepth(8.5 - i * 0.01), hp: S.hp.segment });
    g.time.delayedCall(2200, () => { this.entering = false; });
  }

  healthFraction() {
    return (Math.max(0, this.hp) + this.segs.reduce((n, s) => n + Math.max(0, s.hp), 0)) / (S.hp.head + SEGMENTS * S.hp.segment);
  }

  aimPoint() { return this.dead ? null : { x: this.hx, y: this.hy }; }

  private swimPoint(p: number) {
    return { x: W / 2 + Math.sin(p) * (W / 2 - 22), y: 96 + Math.sin(p * 2) * 46 };
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    const ms = dt * 1000;
    this.t += ms;
    const live = g.phase === 'action' && !this.entering;

    // Move the head: swim in from the top, then figure eights, with dives.
    if (this.entering) {
      const to = this.swimPoint(0);
      this.hx += (to.x - this.hx) * Math.min(1, 1.6 * dt);
      this.hy += (to.y - this.hy) * Math.min(1, 1.6 * dt);
    } else if (this.dive > 0) {
      this.dive += ms;
      const k = this.dive < 900 ? this.dive / 900 : Math.max(0, 1 - (this.dive - 1300) / 1100);
      const e = Math.sin((k * Math.PI) / 2);
      this.hx = Phaser.Math.Linear(this.diveFrom.x, this.diveTo.x, e);
      this.hy = Phaser.Math.Linear(this.diveFrom.y, this.diveTo.y, e);
      if (this.dive > 2400) this.dive = 0;
    } else {
      this.path += dt * (0.75 + (1 - this.healthFraction()) * 0.35);
      const to = this.swimPoint(this.path);
      this.hx += (to.x - this.hx) * Math.min(1, 6 * dt);
      this.hy += (to.y - this.hy) * Math.min(1, 6 * dt);
      this.diveIn -= ms;
      if (live && this.diveIn <= 0) {
        this.diveIn = DIVE_EVERY;
        this.dive = 1;
        this.diveFrom = { x: this.hx, y: this.hy };
        this.diveTo = { x: Phaser.Math.Clamp(g.player.x, 16, W - 16), y: Math.min(H - 60, g.player.y - 10) };
        g.tipOnce('wyrmdive', 'IT DIVES AT YOU!');
      }
    }

    // The body follows the head's trail.
    const last = this.trail[0];
    if (!last || Phaser.Math.Distance.Between(last.x, last.y, this.hx, this.hy) >= 1) this.trail.unshift({ x: this.hx, y: this.hy });
    if (this.trail.length > 400) this.trail.length = 400;
    const ang = last ? Math.atan2(this.hy - last.y, this.hx - last.x) : Math.PI / 2;
    this.head.setPosition(Math.round(this.hx), Math.round(this.hy)).setRotation(ang - Math.PI / 2);
    this.segs.forEach((s, i) => {
      const p = this.trail[Math.min(this.trail.length - 1, (i + 1) * SPACING)] ?? { x: this.hx, y: this.hy };
      const wob = 1 + Math.sin(this.t / 160 + i) * 0.06;
      s.img.setPosition(Math.round(p.x), Math.round(p.y)).setScale(wob * (1 - i * 0.03));
    });

    this.checkShots();
    if (!live) return;

    // Touching any part of it hurts.
    const p = g.player;
    const near = (x: number, y: number, r: number) => Math.abs(p.x - x) < r && Math.abs(p.y - y) < r;
    if (near(this.hx, this.hy, 8) || this.segs.some((s) => near(s.img.x, s.img.y, 6))) g.hurt();

    this.fireIn -= ms;
    if (this.fireIn <= 0 && this.dive === 0) {
      this.fireIn = 1500;
      const tg = g.aimTarget();
      const a = Phaser.Math.Angle.Between(this.hx, this.hy, tg.x, tg.y);
      for (const off of [-0.25, 0, 0.25]) g.enemyShoot(this.hx, this.hy + 6, a + off, 80);
    }
    this.eggIn -= ms;
    if (this.eggIn <= 0 && this.segs.length) {
      this.eggIn = 2400;
      const s = Phaser.Utils.Array.GetRandom(this.segs);
      g.spawnEgg(s.img.x, s.img.y + 6, 24);
    }
  }

  private checkShots() {
    const g = this.g;
    if (this.entering) return;
    for (const s of this.segs.slice()) {
      for (const o of shotsIn(g, s.img.x, s.img.y, 6, 6)) {
        o.destroy();
        s.hp -= g.shotDamage(o, S.taken.body);
        g.flash(s.img);
        if (s.hp <= 0) {
          g.sparks.explode(12, s.img.x, s.img.y);
          s.img.destroy();
          this.segs.splice(this.segs.indexOf(s), 1);
          g.tipOnce('wyrmseg', 'ONLY THE HEAD\nCAN KILL IT');
          break;
        }
      }
    }
    for (const o of shotsIn(g, this.hx, this.hy, 8, 8)) {
      if (this.dead) return;
      o.destroy();
      this.hp -= g.shotDamage(o, S.taken.body);
      g.flash(this.head);
      if (this.hp <= 0) { this.defeat(); return; }
    }
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    g.enemyBullets.clear(true, true);
    // The body bursts segment by segment, then the head.
    this.segs.forEach((s, i) => g.time.delayedCall(i * 90, () => { g.sparks.explode(10, s.img.x, s.img.y); s.img.destroy(); }));
    toast(g, 'THE WYRM IS DOWN', 120, 900);
    bossDeath(g, this.hx, this.hy, 10, 10, REWARD, () => this.head.destroy());
    this.onDefeated();
  }
}
