import Phaser from 'phaser';
import { W } from './config';
import type { GameScene } from './scenes/GameScene';
import { toast } from './ui';

// A piece of the boss that can be shot: three armor plates and the core under them.
interface Part {
  img: Phaser.GameObjects.Image;
  dx: number; // offset from the boss center
  dy: number;
  w: number; // hit box size
  h: number;
  hp: number;
  max: number;
  gun: boolean; // fires aimed shots while attached
}

const ENTER_Y = 74;
const REWARD = 150; // credits, dropped as a shower of gold
const BODY_RX = 30; // contact ellipse
const BODY_RY = 18;

// Rockjaw, the level 3 mini boss: a Raider ship welded into an asteroid.
// Phase 1: the two side plates fire, and it throws boulders. Shots on the core
// bounce off until all three plates are broken off. Phase 2: the bare core
// fires spreads, it sways faster and throws more often.
export class Rockjaw {
  private x = W / 2;
  private y = -40;
  private t = 0;
  private entering = true;
  private dead = false;
  private body: Phaser.GameObjects.Image;
  private plates: Part[];
  private core: Part;
  private gunIn = 1200;
  private throwIn = 2200;
  private spreadIn = 1500;
  private warnedArmor = false;

  constructor(private g: GameScene, private onDefeated: () => void) {
    const add = (key: string) => g.add.image(0, -100, key).setDepth(8);
    this.body = add('rockjaw');
    this.core = { img: add('core'), dx: 0, dy: 3, w: 10, h: 8, hp: 45, max: 45, gun: false };
    this.plates = [
      { img: add('plateL'), dx: -19, dy: 5, w: 12, h: 11, hp: 16, max: 16, gun: true },
      { img: add('plateL').setFlipX(true), dx: 19, dy: 5, w: 12, h: 11, hp: 16, max: 16, gun: true },
      { img: add('plateC'), dx: 0, dy: 2, w: 14, h: 9, hp: 20, max: 20, gun: false },
    ];
    this.plates.forEach((p) => p.img.setDepth(9));
    this.place();
    g.tweens.add({
      targets: this, y: ENTER_Y, duration: 2600, ease: 'Sine.easeOut', delay: 600,
      onComplete: () => { this.entering = false; },
    });
  }

  private get armored() { return this.plates.some((p) => p.hp > 0); }

  healthFraction() {
    const parts = [...this.plates, this.core];
    return parts.reduce((n, p) => n + Math.max(0, p.hp), 0) / parts.reduce((n, p) => n + p.max, 0);
  }

  private place() {
    this.body.setPosition(Math.round(this.x), Math.round(this.y));
    for (const p of [...this.plates, this.core]) {
      if (p.hp > 0 || p === this.core) p.img.setPosition(Math.round(this.x + p.dx), Math.round(this.y + p.dy));
    }
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    if (!this.entering) {
      this.t += dt;
      const fast = !this.armored;
      this.x = W / 2 + Math.sin(this.t * (fast ? 1.1 : 0.7)) * (fast ? 44 : 38);
      this.y = ENTER_Y + Math.sin(this.t * 1.3) * 6;
    }
    this.place();
    this.checkShots();
    this.checkRam();
    if (this.entering || g.phase !== 'action') return;

    const ms = dt * 1000;
    this.gunIn -= ms;
    this.throwIn -= ms;
    if (this.gunIn <= 0) {
      this.gunIn = 1600;
      for (const p of this.plates) if (p.gun && p.hp > 0) g.enemyShoot(this.x + p.dx, this.y + p.dy + 7);
    }
    if (this.throwIn <= 0) {
      this.throwIn = this.armored ? 3000 : 2000;
      const side = Math.random() < 0.5 ? -1 : 1;
      g.throwBoulder(this.x + side * 22, this.y + 10);
    }
    if (!this.armored) {
      this.spreadIn -= ms;
      if (this.spreadIn <= 0) {
        this.spreadIn = 1500;
        for (let i = -2; i <= 2; i++) g.enemyShoot(this.x, this.y + 8, Math.PI / 2 + i * 0.3, 72);
      }
    }
  }

  // Player shots: plates and the bare core take damage, the rock and the
  // armored core shrug them off.
  private checkShots() {
    const g = this.g;
    for (const o of g.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      if (this.dead) return;
      if (!o.active) continue;
      // Shots fly up into the underside, so whatever part sits in the shot's
      // column takes it: plates first, since they cover the core.
      const inRock = ((o.x - this.x) / (BODY_RX + 2)) ** 2 + ((o.y - this.y) / (BODY_RY + 2)) ** 2 <= 1;
      if (!inRock) continue;
      const hitPart = [...this.plates.filter((p) => p.hp > 0), this.core]
        .find((p) => Math.abs(o.x - (this.x + p.dx)) <= p.w / 2 + 1);
      o.destroy();
      if (this.entering || !hitPart || (hitPart === this.core && this.armored)) {
        g.tink(o.x, o.y);
        if (hitPart === this.core && !this.warnedArmor) {
          this.warnedArmor = true;
          g.tipOnce('armor', 'BREAK OFF ALL\nTHE ARMOR');
        }
        continue;
      }
      hitPart.hp -= (o.getData('dmg') as number) ?? 1;
      g.flash(hitPart.img);
      if (hitPart.hp <= 0) {
        if (hitPart === this.core) this.defeat();
        else this.breakPlate(hitPart);
      }
    }
  }

  // Flying into the rock hurts.
  private checkRam() {
    const p = this.g.player;
    if (((p.x - this.x) / BODY_RX) ** 2 + ((p.y - this.y) / BODY_RY) ** 2 <= 1) this.g.hurt();
  }

  private breakPlate(p: Part) {
    const g = this.g;
    g.sparks.explode(16, p.img.x, p.img.y);
    g.cameras.main.shake(100, 0.006);
    g.tweens.add({
      targets: p.img, y: p.img.y + 60, x: p.img.x + Math.sign(p.dx || 1) * 20, angle: p.dx < 0 ? -90 : 90, alpha: 0,
      duration: 900, ease: 'Quad.easeIn', onComplete: () => p.img.destroy(),
    });
    if (!this.armored) {
      toast(g, 'CORE EXPOSED', 140, 900);
      this.core.img.setScale(1.25);
      g.tweens.add({ targets: this.core.img, scale: 1, duration: 400, yoyo: true, repeat: -1 });
    }
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    let n = 0;
    g.time.addEvent({
      delay: 140, repeat: 8, callback: () => {
        g.sparks.explode(14, this.x + Phaser.Math.Between(-26, 26), this.y + Phaser.Math.Between(-14, 14));
        g.cameras.main.shake(80, 0.008);
        if (++n === 9) {
          for (let i = 0; i < REWARD / 25; i++) {
            g.dropCoin(this.x, this.y, 25, Phaser.Math.Between(-30, 30), Phaser.Math.Between(10, 45));
          }
          g.sparks.explode(40, this.x, this.y);
          this.body.destroy();
          this.core.img.destroy();
        }
      },
    });
    this.onDefeated();
  }
}
