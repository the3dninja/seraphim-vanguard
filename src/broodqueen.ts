import Phaser from 'phaser';
import { W } from './config';
import { bossDeath, shipIn, shotsIn, type BossOpts } from './bossfx';
import type { GameScene } from './scenes/GameScene';
import { BOSS_STATS, type BossStats } from './data/bosses';

const HOME_Y = 62;
// Health a second she heals while she isn't being hit, for each 600 health she has.
const REGEN = 20;
const REGEN_AFTER = 1500; // ms without a hit before she starts healing
const REWARD = 175;

type Mode = 'spawn' | 'shoot' | 'warn' | 'charge' | 'return';

// The Brood Queen, the level 13 mini boss. She lays a wave of Spore Pods,
// fires fans of shots, then flickers and charges at where the ship was before
// swimming back up. She heals if you stop hitting her. Weak to plasma.
export class BroodQueen {
  private x = W / 2;
  private y = -30;
  private max: number;
  private stats: BossStats;
  private hp: number;
  private t = 0;
  private entering = true;
  private dead = false;
  private mode: Mode = 'spawn';
  private modeT = 0; // ms into the current mode
  private fired = 0;
  private lastHit = 0;
  private target = { x: 0, y: 0 };
  private img: Phaser.GameObjects.Image;

  constructor(private g: GameScene, private onDefeated: () => void, opts: BossOpts = {}) {
    this.stats = BOSS_STATS[opts.stats ?? 'queen'];
    this.max = this.stats.hp.body;
    this.hp = this.max;
    this.img = g.add.image(this.x, this.y, 'queen').setDepth(9.9); // in front of the dark
    if (opts.tint) this.img.setData('baseTint', opts.tint).setTint(opts.tint);
    g.tweens.add({
      targets: this, y: HOME_Y, duration: 2000, ease: 'Sine.easeOut', delay: 500,
      onComplete: () => { this.entering = false; this.lastHit = g.time.now; },
    });
  }

  healthFraction() { return Math.max(0, this.hp) / this.max; }

  aimPoint() { return this.dead ? null : { x: this.x, y: this.y }; }

  private setMode(m: Mode) {
    this.mode = m;
    this.modeT = 0;
    this.fired = 0;
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    const ms = dt * 1000;
    this.t += ms;
    this.modeT += ms;
    const wob = Math.sin(this.t / 180);
    this.img.setPosition(Math.round(this.x), Math.round(this.y)).setScale(1 + wob * 0.04, 1 - wob * 0.04);
    this.checkShots();
    if (this.entering) return;
    const live = g.phase === 'action';

    switch (this.mode) {
      case 'spawn':
        // Five pods, one every 400 ms.
        this.x += (W / 2 + Math.sin(this.t / 1400) * 40 - this.x) * Math.min(1, 2 * dt);
        if (live && this.fired < 5 && this.modeT > 300 + this.fired * 400) {
          g.spawn('spore', this.x + (this.fired - 2) * 10, this.y + 12);
          this.fired++;
        }
        if (this.modeT > 2600) this.setMode('shoot');
        break;
      case 'shoot':
        this.x += (W / 2 + Math.sin(this.t / 1400) * 40 - this.x) * Math.min(1, 2 * dt);
        if (live && this.modeT > 400 + this.fired * 650 && this.fired < 4) {
          this.fired++;
          const tg = g.aimTarget();
          const a = Phaser.Math.Angle.Between(this.x, this.y + 10, tg.x, tg.y);
          for (const off of [-0.45, -0.15, 0.15, 0.45]) g.enemyShoot(this.x, this.y + 10, a + off);
        }
        if (this.modeT > 3200) {
          const tg = g.aimTarget(false);
          this.target = { x: tg.x, y: tg.y };
          this.setMode('warn');
          g.tipOnce('queen', 'SHE CHARGES!\nMOVE!');
        }
        break;
      case 'warn':
        this.img.setTint(Math.floor(this.modeT / 80) % 2 ? 0xfc7460 : 0xffffff);
        if (this.modeT > 700) { this.g.restTint(this.img); this.setMode('charge'); }
        break;
      case 'charge': {
        const a = Phaser.Math.Angle.Between(this.x, this.y, this.target.x, this.target.y);
        this.x += Math.cos(a) * 220 * dt;
        this.y += Math.sin(a) * 220 * dt;
        if (Phaser.Math.Distance.Between(this.x, this.y, this.target.x, this.target.y) < 6 || this.modeT > 2000) this.setMode('return');
        break;
      }
      case 'return':
        this.x += Phaser.Math.Clamp(W / 2 - this.x, -70 * dt, 70 * dt);
        this.y += Phaser.Math.Clamp(HOME_Y - this.y, -80 * dt, 80 * dt);
        if (Math.abs(this.y - HOME_Y) < 2) this.setMode('spawn');
        break;
    }

    // She heals if left alone.
    if (g.time.now - this.lastHit > REGEN_AFTER && this.hp < this.max) {
      this.hp = Math.min(this.max, this.hp + REGEN * (this.max / 600) * dt);
      if (Math.floor(this.t / 400) % 2 === 0 && this.mode !== 'warn') this.img.setTint(0x58d854);
      else if (this.mode !== 'warn') this.g.restTint(this.img);
      g.tipOnce('regen', 'KEEP HITTING HER\nOR SHE HEALS');
    } else if (this.mode !== 'warn') this.g.restTint(this.img);

    if (shipIn(g, this.x, this.y, 18, 11)) g.hurt();
  }

  private checkShots() {
    const g = this.g;
    for (const o of shotsIn(g, this.x, this.y, 21, 13)) {
      if (this.dead) return;
      o.destroy();
      if (this.entering) { g.tink(o.x, o.y); continue; }
      this.hp -= g.shotDamage(o, this.stats.taken.body);
      this.lastHit = g.time.now;
      g.flash(this.img);
      if (this.hp <= 0) this.defeat();
    }
  }

  private defeat() {
    this.dead = true;
    this.g.enemyBullets.clear(true, true);
    bossDeath(this.g, this.x, this.y, 18, 10, REWARD, () => this.img.destroy());
    this.onDefeated();
  }
}
