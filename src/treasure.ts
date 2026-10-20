import Phaser from 'phaser';
import { H } from './config';
import { bossDeath } from './bossfx';
import type { GameScene } from './scenes/GameScene';
import { BOSS_STATS } from './data/bosses';

const S = BOSS_STATS.cargo; // health and damage taken, live from the Tuner
// A treasure ending: a derelict cargo hauler drifts down from above. Break it
// open for a shower of credits. If it gets three quarters of the way down
// unbroken it breaks up on its own and the credits are gathered in for you.
const SPEED = 16; // px/s, about 12 s from the top to the cutoff
const HIT_W = 33, HIT_H = 13; // drawn at 1.5x

export class Treasure {
  private img: Phaser.GameObjects.Image;
  private hp = S.hp.body;
  private done = false;

  // It shows up after `wait` ms. `onBroken(byShip)` runs once the credits have dropped.
  constructor(private g: GameScene, private reward: number, private wait: number, private onBroken: (byShip: boolean) => void) {
    this.img = g.add.image(90, -20, 'cargoship').setScale(1.5).setDepth(8);
  }

  update(dt: number) {
    if (this.done) return;
    if (this.wait > 0) { this.wait -= dt * 1000; return; } // still out of sight above
    const g = this.g;
    this.img.y += SPEED * dt;
    for (const o of g.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      if (!o.active || Math.abs(o.x - this.img.x) > HIT_W || Math.abs(o.y - this.img.y) > HIT_H) continue;
      o.destroy();
      this.hp -= g.shotDamage(o, S.taken.body);
      g.flash(this.img);
      if (Math.random() < 0.3) g.sparks.explode(3, o.x, o.y);
      if (this.hp <= 0) { this.breakOpen(true); return; }
    }
    if (this.img.y >= H * 0.75) this.breakOpen(false);
  }

  private breakOpen(byShip: boolean) {
    this.done = true;
    const { x, y } = this.img;
    bossDeath(this.g, x, y, 30, 12, this.reward, () => this.img.destroy(), byShip ? 9 : 4);
    this.g.time.delayedCall(byShip ? 1800 : 1200, () => this.onBroken(byShip));
  }
}
