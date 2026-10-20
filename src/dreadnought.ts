import Phaser from 'phaser';
import { DREAD_H, DREAD_W, dreadBottom } from './art';
import { COLOR, W } from './config';
import type { GameScene } from './scenes/GameScene';
import { text, toast } from './ui';
import { BOSS_STATS } from './data/bosses';

const S = BOSS_STATS.dreadnought; // health and damage taken, live from the Tuner

// A piece of the Dreadnought that can be shot: four turrets, then the bridge.
interface Part {
  img: Phaser.GameObjects.Image;
  dx: number; // offset from the hull's center
  dy: number;
  w: number; // hit width
  hp: number;
  max: number;
  spread: boolean; // inner turrets fire 3-shot spreads, outer ones single aimed shots
  fireIn: number;
}

const ENTER_Y = 62; // hull center once it has moved in, below the boss bar
const REWARD = 450; // credits, dropped as a shower of gold
const SWEEP_WARN = 900; // ms the beam paths show before the lasers fire
const BEAM_REACH = 3;
// The two lasers start pointing at the screen sides and close in toward the
// middle, leaving a narrow lane under the bridge.
const SWEEP_FROM = 0.42; // radians from straight down at the start
const SWEEP_TO = 0.13; // ... and at the end

// Admiral Kade's Dreadnought, the level 5 boss: a warship as wide as the
// screen. Phase 1: four turrets fire while the bridge sits behind a shield.
// Phase 2: the bridge fires two lasers that sweep in from the sides toward the
// middle, and drops its shield while they fire, so the place to hit it from is
// the lane under it. Below half health it sweeps faster and fires spreads too.
export class Dreadnought {
  private x = W / 2;
  private y = -DREAD_H;
  private t = 0;
  private entering = true;
  private dead = false;
  private hull: Phaser.GameObjects.Image;
  private turrets: Part[];
  private bridge: Part;
  private shieldImg: Phaser.GameObjects.Image;
  private shieldUp = true;
  private cycle = 0; // ms into the bridge's attack cycle
  private spreadIn = 1400;
  private announced = false;

  constructor(private g: GameScene, private onDefeated: () => void) {
    this.hull = g.add.image(0, -100, 'dread').setDepth(8);
    const part = (key: string, dx: number, hp: number, spread: boolean, dyUp: number): Part => ({
      img: g.add.image(0, -100, key).setDepth(9),
      dx, dy: dreadBottom(dx) - DREAD_H / 2 - dyUp, w: 10, hp, max: hp, spread, fireIn: 1000 + Math.abs(dx) * 12,
    });
    const { outerTurret: outer, innerTurret: inner, bridge } = S.hp;
    this.turrets = [part('kturret', -66, outer, false, 7), part('kturret', -34, inner, true, 7),
      part('kturret', 34, inner, true, 7), part('kturret', 66, outer, false, 7)];
    this.bridge = { ...part('kbridge', 0, bridge, false, 9), w: 16 };
    this.shieldImg = g.add.image(0, -100, 'kshield').setDepth(10);
    this.place();
    g.tweens.add({
      targets: this, y: ENTER_Y, duration: 3200, ease: 'Sine.easeOut', delay: 600,
      onComplete: () => { this.entering = false; g.tipOnce('turrets', 'DESTROY THE TURRETS'); },
    });
  }

  private get armed() { return this.turrets.some((p) => p.hp > 0); }
  private get angry() { return this.bridge.hp < this.bridge.max / 2; }

  // Where Bio Seeker spores cling: the middle of the boss. (No aimPoint: homing
  // shots fly on at whatever part is under them.)
  center() { return this.dead ? null : { x: this.x, y: this.y }; }

  healthFraction() {
    const parts = [...this.turrets, this.bridge];
    return parts.reduce((n, p) => n + Math.max(0, p.hp), 0) / parts.reduce((n, p) => n + p.max, 0);
  }

  private place() {
    this.hull.setPosition(Math.round(this.x), Math.round(this.y));
    for (const p of [...this.turrets, this.bridge]) {
      if (p.img.active) p.img.setPosition(Math.round(this.x + p.dx), Math.round(this.y + p.dy));
    }
    this.shieldImg.setPosition(Math.round(this.x), Math.round(this.y + this.bridge.dy));
    this.shieldImg.setVisible(!this.dead && this.shieldUp && Math.floor(this.t * 10) % 4 !== 0);
  }

  // Where the hull's lower edge is on screen at a given x.
  private hullEdge(x: number) {
    const dx = x - this.x;
    if (Math.abs(dx) > DREAD_W / 2) return -Infinity;
    return this.y - DREAD_H / 2 + dreadBottom(dx);
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    if (!this.entering) {
      this.t += dt;
      this.x = W / 2 + Math.sin(this.t * 0.5) * 6;
      this.y = ENTER_Y + Math.sin(this.t * 0.9) * 3;
    }
    this.place();
    this.checkShots();
    if (g.player.y < this.hullEdge(g.player.x) - 2) g.hurt();
    if (this.entering || g.phase !== 'action') return;

    const ms = dt * 1000;
    if (this.armed) {
      for (const p of this.turrets) {
        if (p.hp <= 0) continue;
        p.fireIn -= ms;
        if (p.fireIn > 0) continue;
        p.fireIn = p.spread ? 2100 : 1500;
        const x = this.x + p.dx, y = this.y + p.dy + 6;
        const a = Phaser.Math.Angle.Between(x, y, g.player.x, g.player.y);
        if (p.spread) for (const off of [-0.25, 0, 0.25]) g.enemyShoot(x, y, a + off);
        else g.enemyShoot(x, y);
      }
      return;
    }
    this.bridgeAttack(ms);
  }

  // The bridge's cycle: a rest with the shield up, then the beam paths blink,
  // then the two lasers sweep in. The shield is down from the warning on.
  private bridgeAttack(ms: number) {
    const g = this.g;
    const rest = this.angry ? 1300 : 2000;
    const sweep = this.angry ? 1500 : 2100;
    this.cycle += ms;
    const ox = this.x, oy = this.y + this.bridge.dy + 7;

    if (this.cycle < rest) {
      this.shieldUp = true;
      this.spreadIn -= ms;
      if (this.spreadIn <= 0) {
        this.spreadIn = this.angry ? 1000 : 1400;
        const n = this.angry ? 3 : 2;
        for (let i = -n; i <= n; i++) g.enemyShoot(ox, oy, Math.PI / 2 + i * 0.22, 66);
      }
      return;
    }
    if (this.shieldUp) {
      this.shieldUp = false;
      if (!this.announced) {
        this.announced = true;
        toast(g, 'SHIELD DOWN\nWHILE IT FIRES', 150, 1400);
      }
    }
    const k = this.cycle - rest;
    if (k < SWEEP_WARN) {
      // Blink the start and end of each beam's path.
      if (Math.floor(k / 110) % 2 === 0) {
        for (const side of [-1, 1]) {
          g.drawBeam(ox, oy, Math.PI / 2 + side * SWEEP_FROM, 1, 0xfc7460, 0.8);
          g.drawBeam(ox, oy, Math.PI / 2 + side * SWEEP_TO, 1, 0xfc7460, 0.35);
        }
      }
      return;
    }
    const f = Math.min(1, (k - SWEEP_WARN) / sweep);
    const off = SWEEP_FROM + (SWEEP_TO - SWEEP_FROM) * Phaser.Math.Easing.Sine.InOut(f);
    for (const side of [-1, 1]) {
      const a = Math.PI / 2 + side * off;
      g.drawBeam(ox, oy, a, 4, 0xd82800);
      if (g.beamHits(ox, oy, a, BEAM_REACH)) g.hurt(2);
    }
    // Spreads keep coming while it's angry, so the lane isn't a rest.
    if (this.angry) {
      this.spreadIn -= ms;
      if (this.spreadIn <= 0) {
        this.spreadIn = 900;
        g.enemyShoot(ox, oy);
      }
    }
    if (f >= 1) {
      this.cycle = 0;
      this.spreadIn = 600;
    }
  }

  // Shots flying up hit the hull's lower edge; whatever part sits in that
  // column takes them. The hull and the shielded bridge shrug them off.
  private checkShots() {
    const g = this.g;
    for (const o of g.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      if (this.dead) return;
      if (!o.active || o.y > this.hullEdge(o.x) + 1) continue;
      o.destroy();
      const hit = [...this.turrets.filter((p) => p.hp > 0), this.bridge]
        .find((p) => Math.abs(o.x - (this.x + p.dx)) <= p.w / 2 + 1);
      if (this.entering || !hit || (hit === this.bridge && (this.armed || this.shieldUp))) {
        g.tink(o.x, o.y);
        if (hit === this.bridge && !this.armed) g.flash(this.shieldImg);
        continue;
      }
      hit.hp -= g.shotDamage(o, S.taken.body);
      g.flash(hit.img);
      if (hit.hp <= 0) {
        if (hit === this.bridge) this.defeat();
        else this.breakTurret(hit);
      }
    }
  }

  private breakTurret(p: Part) {
    const g = this.g;
    g.sparks.explode(18, p.img.x, p.img.y);
    g.cameras.main.shake(120, 0.006);
    p.img.destroy();
    if (!this.armed) {
      toast(g, 'BRIDGE EXPOSED', 150, 900);
      this.cycle = 0;
    }
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    this.shieldImg.destroy();
    let n = 0;
    g.time.addEvent({
      delay: 130, repeat: 15, callback: () => {
        g.sparks.explode(14, this.x + Phaser.Math.Between(-80, 80), this.y + Phaser.Math.Between(-16, 16));
        g.cameras.main.shake(90, 0.01);
        if (++n === 16) {
          for (let i = 0; i < REWARD / 25; i++) {
            g.dropCoin(this.x + Phaser.Math.Between(-30, 30), this.y, 25, Phaser.Math.Between(-40, 40), Phaser.Math.Between(10, 45));
          }
          g.sparks.explode(50, this.x, this.y);
          this.hull.destroy();
          this.bridge.img.destroy();
          // Kade's last transmission, strangely distorted.
          const msg = text(g, W / 2, 112, 'KADE: THE VOICE...\nIT WILL NOT STOP...', COLOR.red).setOrigin(0.5).setDepth(1000);
          msg.setAlign('center');
          g.tweens.add({ targets: msg, x: { from: W / 2 - 1, to: W / 2 + 1 }, duration: 60, yoyo: true, repeat: 30 });
          g.tweens.add({ targets: msg, alpha: 0, delay: 3200, duration: 400, onComplete: () => msg.destroy() });
        }
      },
    });
    this.onDefeated();
  }
}
