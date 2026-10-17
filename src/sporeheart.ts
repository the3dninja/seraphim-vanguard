import Phaser from 'phaser';
import { W } from './config';
import { bossDeath, shipIn, shotsIn } from './bossfx';
import type { GameScene } from './scenes/GameScene';
import { toast } from './ui';

const HOME_Y = 66;
const CORE_HP = 520;
const PETAL_HP = 70;
const PETALS = 4;
const REWARD = 225;
const CLOSED = 3400; // ms the petals stay shut
const OPENING = 450;
const OPEN = 2600; // ms the core is bare
const WEAK = ['plasma', 'explosive'] as const;
const RESIST = ['kinetic'] as const;

interface Petal { img: Phaser.GameObjects.Image; hp: number; a: number }

// The Sporeheart, level 15's first mini boss, waiting in the spore haze past
// the tunnel: a pulsing pod wrapped in four armored petals. Shut, the petals
// soak up shots while it spits Spore Pods and rings of spores. Then the
// petals peel open and the bare core can be hurt, while it fires aimed fans.
// Petals can be shot off; with all four gone it stays open and fires faster.
export class Sporeheart {
  private x = W / 2;
  private y = -40;
  private t = 0;
  private entering = true;
  private dead = false;
  private hp = CORE_HP;
  private core: Phaser.GameObjects.Image;
  private petals: Petal[] = [];
  private cycle = 0; // ms into closed > opening > open > closing
  private open = 0; // 0 shut to 1 open
  private ringIn = 1500;
  private podIn = 900;
  private fanIn = 400;
  private warned = false;

  constructor(private g: GameScene, private onDefeated: () => void) {
    this.core = g.add.image(this.x, this.y, 'sporeheart').setDepth(8);
    for (let i = 0; i < PETALS; i++) {
      const a = (i / PETALS) * Math.PI * 2 + Math.PI / 4;
      this.petals.push({ img: g.add.image(this.x, this.y, 'petal').setDepth(8.5).setRotation(a + Math.PI / 2), hp: PETAL_HP, a });
    }
    g.tweens.add({
      targets: this, y: HOME_Y, duration: 2400, ease: 'Sine.easeOut', delay: 500,
      onComplete: () => { this.entering = false; },
    });
  }

  private get bare() { return this.petals.every((p) => p.hp <= 0); }

  healthFraction() {
    return (Math.max(0, this.hp) + this.petals.reduce((n, p) => n + Math.max(0, p.hp), 0)) / (CORE_HP + PETALS * PETAL_HP);
  }

  aimPoint() { return this.dead ? null : { x: this.x, y: this.y }; }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    const ms = dt * 1000;
    this.t += ms;
    this.x = W / 2 + Math.sin(this.t / 1700) * 44;
    // The petal cycle.
    if (!this.entering) this.cycle = (this.cycle + ms) % (CLOSED + OPENING * 2 + OPEN);
    const c = this.cycle;
    this.open = this.bare ? 1 : c < CLOSED ? 0 : c < CLOSED + OPENING ? (c - CLOSED) / OPENING
      : c < CLOSED + OPENING + OPEN ? 1 : 1 - (c - CLOSED - OPENING - OPEN) / OPENING;
    const beat = 1 + Math.sin(this.t / (this.open > 0.5 ? 110 : 240)) * 0.05;
    this.core.setPosition(Math.round(this.x), Math.round(this.y)).setScale(beat);
    for (const p of this.petals) {
      const r = 6 + this.open * 14;
      p.img.setPosition(Math.round(this.x + Math.cos(p.a) * r), Math.round(this.y + Math.sin(p.a) * r * 0.85));
      p.img.setRotation(p.a + Math.PI / 2 + this.open * 0.6);
    }
    this.checkShots();
    if (this.entering) return;
    const live = g.phase === 'action';
    if (shipIn(g, this.x, this.y, 16, 14)) g.hurt();

    if (this.open < 0.5) {
      // Shut: Spore Pods and slow rings of spores.
      this.podIn -= ms;
      this.ringIn -= ms;
      if (live && this.podIn <= 0) {
        this.podIn = 1500;
        g.spawn('spore', this.x + Phaser.Math.Between(-14, 14), this.y + 16);
      }
      if (live && this.ringIn <= 0) {
        this.ringIn = 1300;
        for (let i = 0; i < 12; i++) g.enemyShoot(this.x, this.y, (i / 12) * Math.PI * 2 + this.t / 900, 44);
      }
    } else {
      // Open: aimed fans from the bare core, faster with no petals left.
      this.fanIn -= ms;
      if (live && this.fanIn <= 0) {
        this.fanIn = this.bare ? 650 : 900;
        const tg = g.aimTarget();
        const a = Phaser.Math.Angle.Between(this.x, this.y, tg.x, tg.y);
        for (const off of [-0.36, -0.18, 0, 0.18, 0.36]) g.enemyShoot(this.x, this.y + 8, a + off, 74);
      }
      if (!this.warned) { this.warned = true; g.tipOnce('sporeheart', 'HIT THE CORE\nWHILE IT IS OPEN'); }
    }
  }

  private checkShots() {
    const g = this.g;
    if (this.entering) return;
    for (const p of this.petals) {
      if (p.hp <= 0) continue;
      for (const o of shotsIn(g, p.img.x, p.img.y, 6, 6)) {
        o.destroy();
        p.hp -= g.shotDamage(o, [...WEAK], [...RESIST]);
        g.flash(p.img);
        if (p.hp <= 0) {
          g.sparks.explode(14, p.img.x, p.img.y);
          p.img.setVisible(false);
          if (this.bare) toast(g, 'ITS PETALS ARE GONE!', 120, 900);
          break;
        }
      }
    }
    for (const o of shotsIn(g, this.x, this.y, 12, 11)) {
      if (this.dead) return;
      o.destroy();
      if (this.open < 0.7) { g.tink(o.x, o.y); continue; }
      this.hp -= g.shotDamage(o, [...WEAK], [...RESIST]);
      g.flash(this.core);
      if (this.hp <= 0) { this.defeat(); return; }
    }
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    g.enemyBullets.clear(true, true);
    bossDeath(g, this.x, this.y, 18, 14, REWARD, () => {
      this.core.destroy();
      this.petals.forEach((p) => p.img.destroy());
    });
    this.onDefeated();
  }
}
