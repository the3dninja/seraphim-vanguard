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
const TWIN_REWARD = 150; // each, when there are two
const DIVE_EVERY = 7500; // ms between dives at the ship
const LASH_EVERY = 8500; // ms between the purple one's lashes across the screen

interface Seg { img: Phaser.GameObjects.Image; hp: number }
// purple: the twin, with its own moves. hpK: its share of the usual health.
// at: where on its path it starts. reward: credits it drops.
export interface WyrmOpts { purple?: boolean; hpK?: number; at?: number; reward?: number }

// The Brood Wyrm, level 15's second mini boss, at the end of the egg-laden
// growths: a long segmented worm that swims figure eights across the top of
// the screen. Only the head can be hurt; body segments block shots and can be
// burst one at a time, shortening it. Segments lay eggs as it swims, the head
// fires aimed spreads, and now and then it dives at the ship and swims back up.
// Level 15 brings two at once (see WyrmPair). The purple one swims a wide
// loop the other way round, spits rings and fans and Spore Pods instead of
// eggs, and lashes across the screen instead of diving.
export class Wyrm {
  private t = 0;
  private hx = W / 2;
  private hy = -30;
  private trail: { x: number; y: number }[] = [];
  private head: Phaser.GameObjects.Image;
  private segs: Seg[] = [];
  private hp: number;
  private maxHp: number;
  private entering = true;
  dead = false;
  rage = 1; // everything it does runs this many times as fast (its twin is dead)
  private path = 0; // where it is on its figure eight
  private dive = 0; // ms into a dive, 0 when swimming
  private diveIn = DIVE_EVERY;
  private diveFrom = { x: 0, y: 0 };
  private diveTo = { x: 0, y: 0 };
  private fireIn = 1400;
  private eggIn = 2600;
  private volley = 0;

  private purple: boolean;
  private segHp: number;

  constructor(private g: GameScene, private onDefeated: () => void, private o: WyrmOpts = {}) {
    this.purple = !!o.purple;
    const k = o.hpK ?? 1;
    this.hp = this.maxHp = S.hp.head * k;
    this.segHp = S.hp.segment * k;
    this.path = o.at ?? 0;
    this.hx = this.swimPoint(this.path).x;
    if (this.purple) { this.diveIn = LASH_EVERY * 0.6; this.fireIn = 2200; this.eggIn = 3600; }
    const skin = this.purple ? '_p' : '';
    this.head = g.add.image(this.hx, this.hy, `wyrmhead${skin}`).setDepth(8.6);
    for (let i = 0; i < SEGMENTS; i++) this.segs.push({ img: g.add.image(this.hx, this.hy, `wyrmseg${skin}`).setDepth(8.5 - i * 0.01), hp: this.segHp });
    g.time.delayedCall(2200, () => { this.entering = false; });
  }

  healthFraction() {
    return (Math.max(0, this.hp) + this.segs.reduce((n, s) => n + Math.max(0, s.hp), 0)) / (this.maxHp + SEGMENTS * this.segHp);
  }

  aimPoint() { return this.dead ? null : { x: this.hx, y: this.hy }; }

  // Figure eights; the purple one swims a wide loop the other way round.
  private swimPoint(p: number) {
    if (this.purple) return { x: W / 2 + Math.cos(-p) * (W / 2 - 26), y: 110 + Math.sin(-p) * 40 };
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
    } else if (this.dive > 0 && this.purple) {
      // The lash: down to one side at the ship's height, across to the other, and back up.
      this.dive += ms;
      const d = this.dive;
      const side = this.diveTo.x;
      const yy = this.diveTo.y;
      const leg = (from: { x: number; y: number }, to: { x: number; y: number }, k: number) => {
        const e = (1 - Math.cos(Math.PI * Phaser.Math.Clamp(k, 0, 1))) / 2;
        this.hx = Phaser.Math.Linear(from.x, to.x, e);
        this.hy = Phaser.Math.Linear(from.y, to.y, e);
      };
      if (d < 800) leg(this.diveFrom, { x: side, y: yy }, d / 800);
      else if (d < 1300) leg({ x: side, y: yy }, { x: side, y: yy }, 1);
      else if (d < 2300) leg({ x: side, y: yy }, { x: W - side, y: yy }, (d - 1300) / 1000);
      else if (d < 3200) leg({ x: W - side, y: yy }, this.swimPoint(this.path), (d - 2300) / 900);
      else this.dive = 0;
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
      if (live && this.diveIn <= 0 && this.purple) {
        this.diveIn = LASH_EVERY;
        this.dive = 1;
        this.diveFrom = { x: this.hx, y: this.hy };
        const side = g.player.x < W / 2 ? W - 14 : 14; // from the far side, across toward the ship
        this.diveTo = { x: side, y: Phaser.Math.Clamp(g.player.y - 24, 130, H - 80) };
        g.tipOnce('wyrmlash', 'IT LASHES ACROSS!');
      } else if (live && this.diveIn <= 0) {
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
    if (this.purple) {
      // Rings of slow shots, and a wide fan now and then; Spore Pods from its body.
      if (this.fireIn <= 0 && this.dive === 0) {
        this.fireIn = 1900;
        this.volley++;
        if (this.volley % 3 === 0) {
          const tg = g.aimTarget();
          const a = Phaser.Math.Angle.Between(this.hx, this.hy, tg.x, tg.y);
          for (let i = -2; i <= 2; i++) g.enemyShoot(this.hx, this.hy + 6, a + i * 0.2, 62);
        } else for (let i = 0; i < 9; i++) g.enemyShoot(this.hx, this.hy, (i / 9) * Math.PI * 2 + this.t / 700, 46);
      }
      this.eggIn -= ms;
      if (this.eggIn <= 0 && this.segs.length) {
        this.eggIn = 3400;
        const s = Phaser.Utils.Array.GetRandom(this.segs);
        g.spawn('spore', s.img.x, s.img.y + 6);
      }
      return;
    }
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
    toast(g, this.purple ? 'THE PURPLE WYRM IS DOWN' : 'THE WYRM IS DOWN', 120, 900);
    bossDeath(g, this.hx, this.hy, 10, 10, this.o.reward ?? REWARD, () => this.head.destroy());
    this.onDefeated();
  }
}

// Level 15's twin Brood Wyrms, at half health each. When one dies the other
// goes on at half again as fast, in everything it does.
export class WyrmPair {
  private wyrms: Wyrm[];
  private left = 2;

  constructor(private g: GameScene, onDefeated: () => void) {
    const down = () => {
      if (--this.left > 0) {
        const other = this.wyrms.find((w) => !w.dead);
        if (other) other.rage = 1.5;
        g.time.delayedCall(1000, () => toast(g, 'THE OTHER ONE IS ENRAGED!', 140, 1100));
        return;
      }
      onDefeated();
    };
    this.wyrms = [
      new Wyrm(g, down, { hpK: 0.5, at: 0, reward: TWIN_REWARD }),
      new Wyrm(g, down, { hpK: 0.5, at: Math.PI, purple: true, reward: TWIN_REWARD }),
    ];
  }

  update(dt: number) { for (const w of this.wyrms) w.update(dt * w.rage); }

  healthFraction() { return this.wyrms.reduce((n, w) => n + w.healthFraction(), 0) / this.wyrms.length; }

  aimPoint() {
    const p = this.g.player;
    const pts = this.wyrms.map((w) => w.aimPoint()).filter((a): a is { x: number; y: number } => !!a);
    return pts.sort((a, b) => Phaser.Math.Distance.Between(a.x, a.y, p.x, p.y) - Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y))[0] ?? null;
  }
}
