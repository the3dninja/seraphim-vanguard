import Phaser from 'phaser';
import { W } from './config';
import type { GameScene } from './scenes/GameScene';
import { toast } from './ui';

const ENTER_Y = 66;
const MAX_HP = 120;
const REWARD = 150; // credits, dropped as a shower of gold
const CLOAKED = 1500; // ms spent cloaked and moving between reveals
const SHOWN = 2600; // ms visible after each reveal
const HIT_W = 15; // half sizes of the hit box
const HIT_H = 8;

interface Copy { img: Phaser.GameObjects.Image; x: number; real: boolean }

// The Watcher, the level 8 mini boss: a cloaking Vossari spy frigate. It
// cloaks (shots pass through), moves, then decloaks alongside decoy
// afterimages. Only the real one takes damage and fires its spreads; a shot
// pops a decoy. Decoys look a shade fainter. Below half health it brings
// three decoys instead of two, the decoys fire too, and it seeds mines.
export class Watcher {
  private y = -30;
  private t = 0; // ms into the current cloak or reveal
  private entering = true;
  private dead = false;
  private shown = true;
  private hp = MAX_HP;
  private copies: Copy[] = [];
  private real: Copy;
  private fired = 0; // volleys fired this reveal
  private warnedDecoy = false;

  constructor(private g: GameScene, private onDefeated: () => void) {
    this.real = { img: g.add.image(W / 2, this.y, 'watcher').setDepth(8), x: W / 2, real: true };
    this.copies = [this.real];
    g.tweens.add({
      targets: this, y: ENTER_Y, duration: 2200, ease: 'Sine.easeOut', delay: 600,
      onComplete: () => { this.entering = false; this.cloak(); },
    });
  }

  private get angry() { return this.hp <= MAX_HP / 2; }

  healthFraction() { return Math.max(0, this.hp) / MAX_HP; }

  private cloak() {
    this.shown = false;
    this.t = 0;
    // Decoys fade out for good; the real one keeps a faint shimmer while it moves.
    for (const c of this.copies) if (!c.real) this.g.tweens.add({ targets: c.img, alpha: 0, duration: 250, onComplete: () => c.img.destroy() });
    this.copies = [this.real];
    this.real.x = this.real.img.x;
  }

  // Decloak at a new spot with decoys at other spots, spread across the screen.
  private reveal() {
    const g = this.g;
    this.shown = true;
    this.t = 0;
    this.fired = 0;
    const n = (this.angry ? 3 : 2) + 1;
    const spots = Phaser.Utils.Array.Shuffle(Array.from({ length: n }, (_v, i) => 22 + ((i + 0.5) / n) * (W - 44)));
    this.real.x = spots[0];
    this.real.img.setPosition(spots[0], this.y).setAlpha(1);
    g.flash(this.real.img);
    for (const x of spots.slice(1)) {
      const img = g.add.image(x, this.y, 'watcher').setDepth(8).setAlpha(0.78);
      g.flash(img);
      this.copies.push({ img, x, real: false });
    }
    if (this.angry) for (let i = 0; i < 2; i++) g.spawnEnemy('pmine', Phaser.Math.Between(20, W - 20), this.y + 10);
    g.tipOnce('watcher', 'FIND THE REAL ONE');
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    const bob = Math.sin(g.time.now / 400) * 3;
    for (const c of this.copies) c.img.setPosition(Math.round(c.x), Math.round(this.y + bob));
    this.checkShots();
    if (this.entering) return;

    this.t += dt * 1000;
    if (!this.shown) {
      // Cloaked: slide toward the ship's side of the screen, barely visible.
      this.real.x += Phaser.Math.Clamp(g.player.x - this.real.x, -40 * dt, 40 * dt);
      this.real.img.setAlpha(Math.floor(this.t / 50) % 7 === 0 ? 0.25 : 0.06);
      if (this.t >= CLOAKED) this.reveal();
      return;
    }
    this.checkRam();
    // Decoys flicker now and then, which gives them away to a sharp eye.
    for (const c of this.copies) if (!c.real) c.img.setAlpha(Math.floor((this.t + c.x * 7) / 90) % 9 === 0 ? 0.4 : 0.78);
    if (g.phase === 'action') {
      const volleys = [500, 1700];
      if (this.fired < volleys.length && this.t >= volleys[this.fired]) {
        this.fired++;
        const a = Phaser.Math.Angle.Between(this.real.x, this.y, g.player.x, g.player.y);
        const spread = this.angry ? [-0.5, -0.25, 0, 0.25, 0.5] : [-0.25, 0, 0.25];
        for (const off of spread) g.enemyShoot(this.real.x, this.y + 8, a + off);
        if (this.angry && this.fired === 1) for (const c of this.copies) if (!c.real) g.enemyShoot(c.x, this.y + 8);
      }
    }
    if (this.t >= SHOWN) this.cloak();
  }

  // Shots pass through while it's cloaked. Visible: the real one takes damage
  // and a decoy pops.
  private checkShots() {
    const g = this.g;
    if (!this.shown || this.entering) return;
    for (const o of g.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      if (this.dead) return;
      if (!o.active) continue;
      const c = this.copies.find((k) => Math.abs(o.x - k.img.x) <= HIT_W && Math.abs(o.y - k.img.y) <= HIT_H);
      if (!c) continue;
      o.destroy();
      if (!c.real) {
        g.sparks.explode(8, c.img.x, c.img.y);
        c.img.destroy();
        this.copies.splice(this.copies.indexOf(c), 1);
        if (!this.warnedDecoy) { this.warnedDecoy = true; toast(g, 'DECOY!', 120, 600); }
        continue;
      }
      this.hp -= (o.getData('dmg') as number) ?? 1;
      g.flash(c.img);
      if (this.hp <= 0) this.defeat();
    }
  }

  // Flying into the real frigate hurts.
  private checkRam() {
    const p = this.g.player;
    if (Math.abs(p.x - this.real.img.x) < HIT_W - 2 && Math.abs(p.y - this.real.img.y) < HIT_H - 1) this.g.hurt();
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    for (const c of this.copies) if (!c.real) c.img.destroy();
    const { x, y } = this.real.img;
    let n = 0;
    g.time.addEvent({
      delay: 140, repeat: 8, callback: () => {
        g.sparks.explode(12, x + Phaser.Math.Between(-16, 16), y + Phaser.Math.Between(-8, 8));
        g.cameras.main.shake(80, 0.008);
        if (++n === 9) {
          for (let i = 0; i < REWARD / 25; i++) g.dropCoin(x, y, 25, Phaser.Math.Between(-30, 30), Phaser.Math.Between(10, 45));
          g.sparks.explode(40, x, y);
          this.real.img.destroy();
        }
      },
    });
    this.onDefeated();
  }
}
