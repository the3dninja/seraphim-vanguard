import Phaser from 'phaser';
import { W, H } from './config';
import { bossDeath, shipIn, shotsIn } from './bossfx';
import type { GameScene } from './scenes/GameScene';
import { toast } from './ui';

const CORE_Y = 70;
const EYES = 6;
const EYE_HP = 18;
const MEMBRANE = 120;
const CORE_HP = 180;
const TOTAL = EYES * EYE_HP + MEMBRANE + CORE_HP;
const REWARD = 400;
const WALL_EVERY = 2600; // ms between tentacle walls in phase 2
const WALL_GAP = 42;
const WALL_H = 8;

interface Eye { img: Phaser.GameObjects.Image; hp: number; a: number }
interface TWall { y: number; gapX: number; t: number }

// The Hollow Mind, the final boss (level 15). A giant brain-like core.
// Phase 1: six eyes circle it and take turns firing; the core can't be hurt
// until they're gone. Phase 2: a membrane closes over the core and walls of
// tentacles sweep down the screen with one gap each, while the core fires
// rings. Phase 3: the core is bare and fires spirals of shots. Weak to plasma
// and explosives throughout.
export class HollowMind {
  private x = W / 2;
  private y = -40;
  private t = 0;
  private entering = true;
  private dead = false;
  private phase = 1;
  private core: Phaser.GameObjects.Image;
  private membraneImg: Phaser.GameObjects.Image;
  private eyes: Eye[] = [];
  private membrane = MEMBRANE;
  private hp = CORE_HP;
  private fireIn = 800;
  private nextEye = 0;
  private walls: TWall[] = [];
  private wallIn = 1500;
  private ringIn = 2000;
  private spiral = 0;
  private spiralIn = 0;
  private fanIn = 3000;

  constructor(private g: GameScene, private onDefeated: () => void) {
    this.core = g.add.image(this.x, this.y, 'mindcore').setDepth(8);
    this.membraneImg = g.add.image(this.x, this.y, 'membrane').setDepth(8.5).setVisible(false);
    for (let i = 0; i < EYES; i++) {
      this.eyes.push({ img: g.add.image(this.x, this.y, 'eye').setDepth(8.6), hp: EYE_HP, a: (i / EYES) * Math.PI * 2 });
    }
    g.tweens.add({
      targets: this, y: CORE_Y, duration: 2600, ease: 'Sine.easeOut', delay: 600,
      onComplete: () => { this.entering = false; g.tipOnce('eyes', 'SHOOT THE EYES'); },
    });
  }

  healthFraction() {
    const eyes = this.eyes.reduce((n, e) => n + Math.max(0, e.hp), 0);
    return (eyes + Math.max(0, this.membrane) + Math.max(0, this.hp)) / TOTAL;
  }

  aimPoint() {
    if (this.dead) return null;
    const eye = this.eyes.find((e) => e.hp > 0);
    return eye ? { x: eye.img.x, y: eye.img.y } : { x: this.x, y: this.y };
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    const ms = dt * 1000;
    this.t += ms;
    const pulse = 1 + Math.sin(this.t / (this.phase === 3 ? 120 : 260)) * 0.05;
    this.core.setPosition(Math.round(this.x), Math.round(this.y)).setScale(pulse);
    this.membraneImg.setPosition(this.core.x, this.core.y).setScale(pulse);
    for (const e of this.eyes) {
      e.a += dt * 0.6;
      e.img.setPosition(Math.round(this.x + Math.cos(e.a) * 44), Math.round(this.y + Math.sin(e.a) * 28));
    }
    this.checkShots();
    if (this.entering) return;
    const live = g.phase === 'action';
    if (shipIn(g, this.x, this.y, 18, 16)) g.hurt();

    if (this.phase === 1) {
      // The eyes take turns: one aimed shot every half second.
      this.fireIn -= ms;
      const alive = this.eyes.filter((e) => e.hp > 0);
      if (live && this.fireIn <= 0 && alive.length) {
        this.fireIn = 380 + alive.length * 25;
        const e = alive[this.nextEye++ % alive.length];
        g.enemyShoot(e.img.x, e.img.y + 4);
      }
    } else if (this.phase === 2) {
      this.updateWalls(dt, live);
      this.ringIn -= ms;
      if (live && this.ringIn <= 0) {
        this.ringIn = 2200;
        for (let i = 0; i < 10; i++) g.enemyShoot(this.x, this.y, (i / 10) * Math.PI * 2 + this.t / 700, 50);
      }
    } else {
      // Bare core: two-armed spirals, and an aimed fan now and then.
      this.spiralIn -= ms;
      this.fanIn -= ms;
      if (live && this.spiralIn <= 0) {
        this.spiralIn = 150;
        this.spiral += 0.32;
        for (const arm of [0, Math.PI]) g.enemyShoot(this.x, this.y, this.spiral + arm, 58);
      }
      if (live && this.fanIn <= 0) {
        this.fanIn = 2800;
        const tg = g.aimTarget();
        const a = Phaser.Math.Angle.Between(this.x, this.y, tg.x, tg.y);
        for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) g.enemyShoot(this.x, this.y + 10, a + off, 80);
      }
    }
  }

  // Phase 2: walls of tentacles sweep down, each with one gap to fly through.
  private updateWalls(dt: number, live: boolean) {
    const g = this.g;
    const gfx = g.beams;
    this.wallIn -= dt * 1000;
    if (live && this.wallIn <= 0) {
      this.wallIn = WALL_EVERY;
      this.walls.push({ y: this.y + 24, gapX: Phaser.Math.Between(30, W - 30), t: 0 });
    }
    for (const w of this.walls.slice()) {
      w.t += dt * 1000;
      w.y += 52 * dt;
      if (w.y > H + 10) { this.walls.splice(this.walls.indexOf(w), 1); continue; }
      const l = w.gapX - WALL_GAP / 2, r = w.gapX + WALL_GAP / 2;
      for (let x = 0; x < W; x += 4) {
        if (x + 4 > l && x < r) continue;
        const wob = Math.round(Math.sin(x * 0.2 + w.t / 120) * 2);
        gfx.fillStyle(0xa40080, 1).fillRect(x, w.y - WALL_H / 2 + wob, 4, WALL_H);
        if ((x / 4) % 3 === 0) gfx.fillStyle(0xf878f8, 1).fillRect(x + 1, w.y + wob, 2, 1);
      }
      const p = g.player;
      if (live && Math.abs(p.y - w.y) < WALL_H / 2 + 2 && (p.x < l + 3 || p.x > r - 3)) g.hurt();
    }
  }

  private checkShots() {
    const g = this.g;
    if (this.entering) return;
    if (this.phase === 1) {
      for (const e of this.eyes) {
        if (e.hp <= 0) continue;
        for (const o of shotsIn(g, e.img.x, e.img.y, 6, 6)) {
          o.destroy();
          e.hp -= g.shotDamage(o, ['plasma', 'explosive'], ['kinetic']);
          g.flash(e.img);
          if (e.hp <= 0) {
            g.sparks.explode(14, e.img.x, e.img.y);
            e.img.setVisible(false);
            break;
          }
        }
      }
      if (this.eyes.every((e) => e.hp <= 0)) this.toPhase(2);
    }
    for (const o of shotsIn(g, this.x, this.y, 20, 18)) {
      if (this.dead) return;
      o.destroy();
      if (this.phase === 1) { g.tink(o.x, o.y); continue; }
      const dmg = g.shotDamage(o, ['plasma', 'explosive'], ['kinetic']);
      if (this.phase === 2) {
        this.membrane -= dmg;
        g.flash(this.membraneImg);
        if (this.membrane <= 0) this.toPhase(3);
      } else {
        this.hp -= dmg;
        g.flash(this.core);
        if (this.hp <= 0) this.defeat();
      }
    }
  }

  private toPhase(n: number) {
    const g = this.g;
    this.phase = n;
    g.cameras.main.shake(500, 0.008);
    g.sparks.explode(20, this.x, this.y);
    if (n === 2) {
      this.membraneImg.setVisible(true).setScale(0.2);
      toast(g, 'FLY THROUGH THE GAPS', 120, 1000);
    } else {
      this.walls = [];
      g.enemyBullets.clear(true, true);
      this.membraneImg.setVisible(false);
      toast(g, 'THE CORE IS EXPOSED!', 120, 1000);
    }
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    g.enemyBullets.clear(true, true);
    g.cameras.main.flash(800, 252, 252, 252);
    bossDeath(g, this.x, this.y, 22, 18, REWARD, () => {
      this.core.destroy();
      this.membraneImg.destroy();
      this.eyes.forEach((e) => e.img.destroy());
    }, 16);
    this.onDefeated();
  }
}
