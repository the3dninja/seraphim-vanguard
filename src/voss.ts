import Phaser from 'phaser';
import { W } from './config';
import { bossDeath, shipIn, shotsIn } from './bossfx';
import type { GameScene } from './scenes/GameScene';
import { toast } from './ui';

const ENTER_Y = 58;
const SHIELD = 100; // shield health; ion breaks it fast
const SHIELD_BACK = 6500; // ms the shield stays down
const HULL = 420;
const PARASITE = 510;
const REWARD = 450;

// Emperor Voss, Possessed: the level 10 boss. Phase 1 is the Emperor's
// flagship behind a shield (ion breaks it; it comes back after a while), firing
// aimed spreads and rings of shots. When the hull gives out, the Hollow
// parasite bursts out of it: an organic thing, weak to plasma, that lunges at
// the ship and lays Spore Pods. Killing it frees the Emperor.
export class Voss {
  private x = W / 2;
  private y = -30;
  private t = 0;
  private entering = true;
  private dead = false;
  private shield = SHIELD;
  private shieldDownAt = 0;
  private hull = HULL;
  private phase2 = false;
  private bursting = false; // the parasite tearing free; nothing can be hit
  private ship: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Image;
  private parasite: Phaser.GameObjects.Image | null = null;
  private px = W / 2; // parasite position
  private py = ENTER_Y + 4;
  private hp = PARASITE;
  private fireIn = 1200;
  private ringIn = 3500;
  private lunge = { step: 0, t: 0, tx: 0, ty: 0 }; // 0 idle, 1 warning, 2 diving, 3 coming back
  private lungeIn = 5000;
  private sporeIn = 3000;

  constructor(private g: GameScene, private onDefeated: () => void) {
    this.ship = g.add.image(this.x, this.y, 'vossship').setDepth(8);
    this.ring = g.add.image(this.x, this.y, 'vshield').setDepth(8.5);
    g.tweens.add({
      targets: this, y: ENTER_Y, duration: 2400, ease: 'Sine.easeOut', delay: 600,
      onComplete: () => { this.entering = false; },
    });
  }

  healthFraction() {
    return Math.max(0, (this.phase2 ? 0 : this.hull) + Math.max(0, this.hp)) / (HULL + PARASITE);
  }

  aimPoint() {
    if (this.dead) return null;
    return this.phase2 ? { x: this.px, y: this.py } : { x: this.x, y: this.y };
  }

  update(dt: number) {
    if (this.dead) return;
    this.t += dt * 1000;
    if (!this.phase2) this.x = W / 2 + Math.sin(this.t / 2200) * 40;
    this.ship.setPosition(Math.round(this.x), Math.round(this.y));
    this.ring.setPosition(this.ship.x, this.ship.y + 2).setVisible(!this.phase2 && this.shield > 0)
      .setAlpha(Math.floor(this.t / 120) % 4 === 0 ? 0.6 : 1);
    if (this.entering) { this.blockShots(); return; }
    if (this.phase2) this.updateParasite(dt);
    else this.updateShip(dt);
  }

  private updateShip(dt: number) {
    const g = this.g;
    const ms = dt * 1000;
    if (this.shield <= 0 && g.time.now >= this.shieldDownAt + SHIELD_BACK) {
      this.shield = SHIELD * 0.6;
      g.flash(this.ring);
    }
    if (g.phase === 'action') {
      this.fireIn -= ms;
      this.ringIn -= ms;
      if (this.fireIn <= 0) {
        this.fireIn = 1500;
        const tg = g.aimTarget();
        const a = Phaser.Math.Angle.Between(this.x, this.y + 14, tg.x, tg.y);
        for (const off of [-0.4, -0.2, 0, 0.2, 0.4]) g.enemyShoot(this.x, this.y + 14, a + off);
      }
      if (this.ringIn <= 0) {
        this.ringIn = 4200;
        for (let i = 0; i < 14; i++) g.enemyShoot(this.x, this.y, (i / 14) * Math.PI * 2 + this.t / 1000, 55);
        g.enemyShoot(this.x - 24, this.y + 6, Math.PI / 2);
        g.enemyShoot(this.x + 24, this.y + 6, Math.PI / 2);
      }
    }
    if (shipIn(g, this.x, this.y, 26, 12)) g.hurt();
    for (const o of shotsIn(g, this.x, this.y + 2, 28, 14)) {
      if (this.dead || this.bursting) { o.destroy(); continue; }
      o.destroy();
      if (this.shield > 0) {
        this.shield -= g.shotDamage(o, ['ion'], []) * 0.5;
        g.flash(this.ring);
        g.tink(o.x, o.y);
        if (this.shield <= 0) {
          this.shieldDownAt = g.time.now;
          g.sparks.explode(16, this.x, this.y);
          g.tipOnce('vshield', 'SHIELD DOWN!');
        }
        continue;
      }
      this.hull -= g.shotDamage(o, ['ion', 'plasma'], []);
      g.flash(this.ship);
      if (this.hull <= 0) { this.burst(); return; }
    }
    if (this.shield > 0 && !this.bursting) g.tipOnce('vion', 'ION BREAKS\nHIS SHIELD FAST');
  }

  // The hull cracks and the parasite tears itself free.
  private burst() {
    const g = this.g;
    this.bursting = true;
    g.enemyBullets.clear(true, true);
    g.cameras.main.shake(1200, 0.01);
    g.time.addEvent({ delay: 150, repeat: 7, callback: () => g.sparks.explode(10, this.x + Phaser.Math.Between(-24, 24), this.y + Phaser.Math.Between(-10, 10)) });
    this.g.time.delayedCall(1300, () => {
      this.ship.setTexture('vosswreck');
      this.phase2 = true;
      this.bursting = false;
      this.px = this.x;
      this.py = this.y;
      this.parasite = g.add.image(this.px, this.py, 'parasite').setDepth(9).setScale(0.3);
      g.tweens.add({ targets: this.parasite, scale: 1, duration: 600, ease: 'Back.easeOut' });
      g.tweens.add({ targets: this, py: this.y + 34, duration: 700, ease: 'Sine.easeOut' });
      g.tweens.add({ targets: this, y: this.y - 16, duration: 1500 });
      toast(g, 'THE PARASITE!', 120, 900);
      g.tipOnce('parasite', 'PLASMA BURNS IT');
    });
  }

  private updateParasite(dt: number) {
    const g = this.g;
    const ms = dt * 1000;
    const p = this.parasite!;
    const home = { x: W / 2 + Math.sin(this.t / 1500) * 50, y: this.y + 34 };
    const L = this.lunge;
    if (L.step === 0) {
      this.px += (home.x - this.px) * Math.min(1, 2 * dt);
      this.py += (home.y - this.py) * Math.min(1, 2 * dt);
      if (g.phase === 'action') {
        this.lungeIn -= ms;
        this.fireIn -= ms;
        this.sporeIn -= ms;
        if (this.fireIn <= 0) {
          this.fireIn = 1200;
          const tg = g.aimTarget();
          const a = Phaser.Math.Angle.Between(this.px, this.py, tg.x, tg.y);
          for (const off of [-0.25, 0, 0.25]) g.enemyShoot(this.px, this.py + 8, a + off);
        }
        if (this.sporeIn <= 0) {
          this.sporeIn = 5000;
          g.spawn('spore', this.px - 14, this.py + 6);
          g.spawn('spore', this.px + 14, this.py + 6);
        }
        if (this.lungeIn <= 0) {
          const tg = g.aimTarget(false);
          Object.assign(L, { step: 1, t: 600, tx: tg.x, ty: tg.y });
        }
      }
    } else if (L.step === 1) {
      L.t -= ms;
      p.setTint(Math.floor(L.t / 80) % 2 ? 0xd800cc : 0xffffff);
      if (L.t <= 0) { L.step = 2; p.clearTint(); }
    } else if (L.step === 2) {
      const a = Phaser.Math.Angle.Between(this.px, this.py, L.tx, L.ty);
      this.px += Math.cos(a) * 210 * dt;
      this.py += Math.sin(a) * 210 * dt;
      if (Phaser.Math.Distance.Between(this.px, this.py, L.tx, L.ty) < 6) L.step = 3;
    } else {
      this.px += Phaser.Math.Clamp(home.x - this.px, -90 * dt, 90 * dt);
      this.py += Phaser.Math.Clamp(home.y - this.py, -90 * dt, 90 * dt);
      if (Math.abs(home.y - this.py) < 2) { L.step = 0; this.lungeIn = 5500; }
    }
    p.setPosition(Math.round(this.px), Math.round(this.py + Math.sin(this.t / 200) * 1.5));
    p.setScale(1 + Math.sin(this.t / 150) * 0.04, 1 - Math.sin(this.t / 150) * 0.04);
    if (shipIn(g, this.px, this.py, 16, 11)) g.hurt();
    for (const o of shotsIn(g, this.px, this.py, 19, 13)) {
      if (this.dead) return;
      o.destroy();
      this.hp -= g.shotDamage(o, ['plasma'], ['kinetic']);
      g.flash(p);
      if (this.hp <= 0) this.defeat();
    }
    // The wreck soaks up shots that miss the parasite.
    this.blockShots();
  }

  private blockShots() {
    for (const o of shotsIn(this.g, this.x, this.y, 28, 12)) { this.g.tink(o.x, o.y); o.destroy(); }
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    g.enemyBullets.clear(true, true);
    bossDeath(g, this.px, this.py, 16, 10, REWARD, () => {
      this.parasite?.destroy();
      toast(g, 'EMPEROR VOSS IS FREE', 110, 1600);
      // The freed Emperor's ship limps away.
      g.tweens.add({ targets: this.ship, y: -40, alpha: 0.4, duration: 3000, ease: 'Sine.easeIn', onComplete: () => this.ship.destroy() });
    });
    this.ring.destroy();
    this.onDefeated();
  }
}
