import Phaser from 'phaser';
import { W, H } from './config';
import type { GameScene } from './scenes/GameScene';

// Act 3 level hazards (levels 9 to 15), drawn every frame on the scene's beam
// layer. Each kind scrolls down with the level.
interface Cloud { img: Phaser.GameObjects.Image; vx: number }
interface Door { y: number; gapX: number; gap: number; t: number } // blast doors: a gap that narrows
interface Well { x: number; y: number; t: number } // gravity well
interface Wall { left: boolean; y: number; w: number; max: number; t: number } // coral growing in from one side
interface Tentacle { left: boolean; y: number; t: number } // ms since it appeared
interface Artery { x: number; y: number; t: number; pulse: number } // a vessel that bursts into shots

const DOOR_H = 8;
const WELL_R = 70; // pull radius
const WALL_H = 14;
const TENT_WARN = 850;
const TENT_OUT = 260;
const TENT_HOLD = 380;
const TENT_BACK = 320;
const TENT_H = 8;
const ARTERY_LEN = 150;
const ARTERY_EVERY = 1700;

export class Act3Hazards {
  private clouds: Cloud[] = [];
  private doors: Door[] = [];
  private wells: Well[] = [];
  private walls: Wall[] = [];
  private tentacles: Tentacle[] = [];
  private arteries: Artery[] = [];

  constructor(private g: GameScene) {}

  spawn(kind: string) {
    const g = this.g;
    const lv = g.state.level;
    switch (kind) {
      case 'spores': {
        const img = g.add.image(Phaser.Math.Between(30, W - 30), -40, 'sporecloud').setDepth(9).setAlpha(0.9);
        this.clouds.push({ img, vx: Phaser.Math.Between(-6, 6) });
        if (lv === 9) g.tipOnce('spores', 'ENEMIES HIDE\nIN SPORE CLOUDS');
        break;
      }
      case 'doors':
        this.doors.push({ y: -DOOR_H, gapX: Phaser.Math.Between(40, W - 40), gap: 76, t: 0 });
        if (lv === 10) g.tipOnce('doors', 'FLY THROUGH THE\nGAP IN THE DOORS');
        break;
      case 'well':
        this.wells.push({ x: Phaser.Math.Between(40, W - 40), y: -30, t: 0 });
        if (lv === 11) g.tipOnce('well', 'GRAVITY WELLS PULL\nYOU AND YOUR SHOTS');
        break;
      case 'wall': {
        const left = Math.random() < 0.5;
        this.walls.push({ left, y: -WALL_H, w: 10, max: Phaser.Math.Between(70, 100), t: 0 });
        // Sometimes a pair grows in from both sides, leaving a lane.
        if (Math.random() < 0.35) this.walls.push({ left: !left, y: -WALL_H, w: 10, max: Phaser.Math.Between(40, 60), t: 0 });
        if (lv === 12) g.tipOnce('wall', 'SHOOT THE CORAL\nTO CUT IT BACK');
        break;
      }
      case 'tentacle': {
        const y = Phaser.Math.Clamp(g.player.y + Phaser.Math.Between(-30, 30), 40, H - 40);
        this.tentacles.push({ left: Math.random() < 0.5, y, t: 0 });
        if (lv === 15) g.tipOnce('tentacle', 'A FLICKER AT THE EDGE\nMEANS A TENTACLE');
        break;
      }
      case 'artery':
        this.arteries.push({ x: Phaser.Math.Between(16, W - 16), y: -ARTERY_LEN, t: 0, pulse: ARTERY_EVERY });
        break;
    }
  }

  clear() {
    this.clouds.forEach((c) => c.img.destroy());
    this.clouds = [];
    this.doors = [];
    this.wells = [];
    this.walls = [];
    this.tentacles = [];
    this.arteries = [];
  }

  // How far the gravity wells drag the ship this frame.
  // Whether a point is inside a blast door or a coral wall.
  solidAt(x: number, y: number) {
    return this.doors.some((d) => Math.abs(y - d.y) < DOOR_H / 2 + 1 && (x < d.gapX - d.gap / 2 || x > d.gapX + d.gap / 2))
      || this.walls.some((wl) => Math.abs(y - wl.y) < WALL_H / 2 + 1 && (wl.left ? x < wl.w + 2 : x > W - wl.w - 2));
  }

  pull(dt: number) {
    const p = this.g.player;
    let x = 0, y = 0;
    for (const w of this.wells) {
      const d = Phaser.Math.Distance.Between(p.x, p.y, w.x, w.y);
      if (d > WELL_R || d < 1) continue;
      const f = 46 * (1 - d / WELL_R) * dt;
      x += ((w.x - p.x) / d) * f;
      y += ((w.y - p.y) / d) * f;
    }
    return { x, y };
  }

  update(dt: number) {
    const g = this.g;
    const gfx = g.beams;
    const p = g.player;
    const live = g.phase === 'action';
    const ms = dt * 1000;
    const shots = g.playerBullets.getChildren() as Phaser.Physics.Arcade.Image[];
    // Shots that walls and doors stop (the Wave Beam passes through cover).
    const blocked = (inside: (x: number, y: number) => boolean, onHit?: (b: Phaser.Physics.Arcade.Image) => void) => {
      for (const b of shots.slice()) {
        if (!b.active || b.getData('fx') === 'wave' || !inside(b.x, b.y)) continue;
        onHit?.(b);
        g.tink(b.x, b.y);
        b.destroy();
      }
    };

    for (const c of this.clouds.slice()) {
      c.img.y += 20 * dt;
      c.img.x += c.vx * dt;
      if (c.img.y > H + 50) { c.img.destroy(); this.clouds.splice(this.clouds.indexOf(c), 1); }
    }

    for (const d of this.doors.slice()) {
      d.t += ms;
      d.y += 30 * dt;
      d.gap = Math.max(32, 76 - d.t / 60);
      if (d.y > H + DOOR_H) { this.doors.splice(this.doors.indexOf(d), 1); continue; }
      const l = d.gapX - d.gap / 2, r = d.gapX + d.gap / 2;
      for (const [x0, x1] of [[0, l], [r, W]]) {
        gfx.fillStyle(0x3c1c7c, 1).fillRect(x0, d.y - DOOR_H / 2, x1 - x0, DOOR_H);
        gfx.fillStyle(0x9878f8, 1).fillRect(x0, d.y - DOOR_H / 2, x1 - x0, 1);
        for (let x = x0 + 3; x < x1 - 2; x += 8) gfx.fillStyle(0xf8b800, 1).fillRect(x, d.y, 3, 1);
      }
      // Warning lights on the door edges.
      if (Math.floor(d.t / 200) % 2) gfx.fillStyle(0xd82800, 1).fillRect(l - 2, d.y - 2, 2, 4).fillRect(r, d.y - 2, 2, 4);
      const inDoor = (x: number, y: number) => Math.abs(y - d.y) < DOOR_H / 2 + 1 && (x < l || x > r);
      blocked(inDoor);
      if (live && Math.abs(p.y - d.y) < DOOR_H / 2 + 2 && (p.x < l + 3 || p.x > r - 3)) g.hurt();
    }

    for (const w of this.wells.slice()) {
      w.t += ms;
      w.y += 24 * dt * (g.rush > 1 ? 2 : 1); // twice as fast inside the rift
      if (w.y > H + WELL_R) { this.wells.splice(this.wells.indexOf(w), 1); continue; }
      // Swirling rings of dots, faster toward the core.
      for (let ring = 0; ring < 4; ring++) {
        const r = 10 + ring * 14;
        const n = 6 + ring * 3;
        const spin = (w.t / 1000) * (3.2 - ring * 0.6);
        for (let i = 0; i < n; i++) {
          const a = spin + (i / n) * Math.PI * 2;
          gfx.fillStyle(ring === 0 ? 0xf878f8 : ring === 1 ? 0xd800cc : 0x6844fc, 1 - ring * 0.2)
            .fillRect(Math.round(w.x + Math.cos(a) * r), Math.round(w.y + Math.sin(a) * r * 0.8), 1, 1);
        }
      }
      gfx.fillStyle(0x000000, 1).fillCircle(w.x, w.y, 5);
      gfx.lineStyle(1, 0xfcfcfc, 0.8).strokeCircle(w.x, w.y, 5);
      // Bend every shot that passes near.
      for (const group of [g.playerBullets, g.enemyBullets]) {
        for (const b of group.getChildren() as Phaser.Physics.Arcade.Image[]) {
          const d = Phaser.Math.Distance.Between(b.x, b.y, w.x, w.y);
          if (d > WELL_R || d < 1 || !b.body) continue;
          const f = 260 * (1 - d / WELL_R) * dt;
          b.body.velocity.x += ((w.x - b.x) / d) * f;
          b.body.velocity.y += ((w.y - b.y) / d) * f;
        }
      }
      if (live && Phaser.Math.Distance.Between(p.x, p.y, w.x, w.y) < 6) g.hurt();
    }

    for (const wl of this.walls.slice()) {
      wl.t += ms;
      wl.y += 28 * dt;
      wl.w = Math.min(wl.max, wl.w + 26 * dt);
      if (wl.y > H + WALL_H) { this.walls.splice(this.walls.indexOf(wl), 1); continue; }
      const x0 = wl.left ? 0 : W - wl.w;
      // A lumpy coral edge.
      gfx.fillStyle(0x4c0040, 1).fillRect(x0, wl.y - WALL_H / 2, wl.w, WALL_H);
      for (let yy = -WALL_H / 2; yy < WALL_H / 2; yy += 2) {
        const bump = 2 + Math.round(Math.sin(yy * 1.3 + wl.t / 300) * 2);
        const ex = wl.left ? wl.w : W - wl.w - bump;
        gfx.fillStyle(0xfc7460, 1).fillRect(ex, wl.y + yy, bump, 2);
      }
      for (let x = x0 + 3; x < x0 + wl.w - 3; x += 7) gfx.fillStyle(0xd800cc, 1).fillRect(x, wl.y - 1, 2, 2);
      const inWall = (x: number, y: number) => Math.abs(y - wl.y) < WALL_H / 2 + 1 && (wl.left ? x < wl.w + 2 : x > W - wl.w - 2);
      blocked(inWall, (b) => { wl.w = Math.max(4, wl.w - 1.6 * ((b.getData('dmg') as number) ?? 1)); });
      if (live && inWall(p.x + (wl.left ? -3 : 3), p.y)) g.hurt();
    }

    for (const tn of this.tentacles.slice()) {
      tn.t += ms;
      const total = TENT_WARN + TENT_OUT + TENT_HOLD + TENT_BACK;
      if (tn.t > total) { this.tentacles.splice(this.tentacles.indexOf(tn), 1); continue; }
      let ext: number; // how far across it reaches
      if (tn.t < TENT_WARN) ext = 8 + Math.sin(tn.t / 60) * 3;
      else if (tn.t < TENT_WARN + TENT_OUT) ext = 8 + ((tn.t - TENT_WARN) / TENT_OUT) * W;
      else if (tn.t < TENT_WARN + TENT_OUT + TENT_HOLD) ext = W + 8;
      else ext = (1 - (tn.t - TENT_WARN - TENT_OUT - TENT_HOLD) / TENT_BACK) * (W + 8);
      if (tn.t < TENT_WARN && Math.floor(tn.t / 100) % 2 === 0) gfx.fillStyle(0xd800cc, 0.18).fillRect(0, tn.y - TENT_H / 2, W, TENT_H);
      // Segments that taper toward the tip, with suckers.
      for (let s = 0; s < ext; s += 4) {
        const x = tn.left ? s : W - s - 4;
        const taper = Math.max(2, TENT_H - Math.round((s / Math.max(ext, 1)) * 4));
        const wob = Math.round(Math.sin(s * 0.15 + tn.t / 90) * 1.5);
        gfx.fillStyle(0xa40080, 1).fillRect(x, tn.y - taper / 2 + wob, 4, taper);
        if ((s / 4) % 3 === 0) gfx.fillStyle(0xf878f8, 1).fillRect(x + 1, tn.y + wob, 2, 1);
      }
      const reach = tn.left ? p.x < ext : p.x > W - ext;
      if (live && tn.t >= TENT_WARN && Math.abs(p.y - tn.y) < TENT_H / 2 + 2 && reach) g.hurt();
    }

    for (const a of this.arteries.slice()) {
      a.t += ms;
      a.y += 26 * dt;
      a.pulse -= ms;
      if (a.y > H + 10) { this.arteries.splice(this.arteries.indexOf(a), 1); continue; }
      const swell = a.pulse < 220 ? 2 : 0;
      for (let s = 0; s < ARTERY_LEN; s += 3) {
        const x = a.x + Math.round(Math.sin((a.y + s) / 14) * 3);
        gfx.fillStyle(0x881400, 1).fillRect(x - 3 - swell, a.y + s, 6 + swell * 2, 3);
        gfx.fillStyle(a.pulse < 220 ? 0xfc7460 : 0xd82800, 1).fillRect(x - 1, a.y + s, 2, 3);
      }
      if (a.pulse <= 0) {
        a.pulse = ARTERY_EVERY;
        if (live) {
          const sy = Phaser.Math.Clamp(a.y + Phaser.Math.Between(20, ARTERY_LEN - 20), 10, H - 60);
          for (let i = 0; i < 5; i++) g.enemyShoot(a.x, sy, Math.PI / 2 + (i - 2) * 0.5, 55);
        }
      }
      const ax = a.x + Math.sin((p.y) / 14) * 3;
      if (live && Math.abs(p.x - ax) < 5 && p.y > a.y && p.y < a.y + ARTERY_LEN) g.hurt();
    }
  }
}
