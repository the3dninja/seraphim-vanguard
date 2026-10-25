import Phaser from 'phaser';
import { W, H } from './config';
import { shotsIn } from './bossfx';
import type { GameScene } from './scenes/GameScene';

// Side mission hazards, drawn every frame on their own layer under the ship.
// press: scrap slabs that slam shut across a band of the screen as it scrolls
// down. gust: a crosswind that shoves the ship sideways for a few seconds.
// ember: a cluster of red-hot rocks that rain down fast (they can be shot).
// blackout: the lights go out, leaving a pool of light around the ship.
// sweep: a searchlight on the edge of the screen that swings a laser across.
// Wrecks and satellite chunks block it, so the ship can hide behind one.
interface Press { y: number; t: number; gap: number } // gap: where the slabs meet
interface Gust { dir: number; t: number }
interface Ember { x: number; y: number; vy: number; hp: number; warn: number }
interface Sweep { left: boolean; y: number; t: number }

const SCROLL = 30; // px per second the level scrolls
const PRESS_H = 14;
const PRESS_CYCLE = [1500, 220, 520, 420]; // ms open, slamming, shut, opening
const GUST_WARN = 1100;
const GUST_BLOW = 2600;
const GUST_FORCE = 52; // px/s at full blow
const EMBER_WARN = 700;
const SWEEP_WARN = 900;
const SWEEP_FIRE = 1700;
const SWEEP_ARC = 1.5; // radians the laser swings through

export class SideHazards {
  private presses: Press[] = [];
  private gusts: Gust[] = [];
  private embers: Ember[] = [];
  private sweeps: Sweep[] = [];
  private gfx: Phaser.GameObjects.Graphics;
  private dark: Phaser.GameObjects.Image | null = null;
  private darkT = -1; // ms into a blackout, -1 when the lights are on

  constructor(private g: GameScene) {
    this.gfx = g.add.graphics().setDepth(9.4);
  }

  spawn(kind: string) {
    const g = this.g;
    switch (kind) {
      case 'press':
        this.presses.push({ y: -PRESS_H, t: 0, gap: Phaser.Math.Between(50, W - 50) });
        g.tipOnce('press', 'CROSS THE PRESS\nWHEN IT OPENS');
        break;
      case 'gust':
        if (this.gusts.length) break;
        this.gusts.push({ dir: Math.random() < 0.5 ? -1 : 1, t: 0 });
        g.tipOnce('gust', 'CROSSWINDS PUSH\nYOU SIDEWAYS');
        break;
      case 'ember': {
        const cx = Phaser.Math.Between(30, W - 30);
        const n = Phaser.Math.Between(3, 5);
        for (let i = 0; i < n; i++) {
          this.embers.push({ x: Phaser.Math.Clamp(cx + Phaser.Math.Between(-28, 28), 6, W - 6), y: -8, vy: Phaser.Math.Between(110, 150), hp: 2, warn: EMBER_WARN + i * 140 });
        }
        g.tipOnce('ember', 'EMBERS FALL WHERE\nTHE TOP GLOWS');
        break;
      }
      case 'blackout':
        if (this.darkT >= 0) break;
        this.darkT = 0;
        this.dark ??= g.add.image(W / 2, H / 2, 'darkness').setDepth(9.6).setAlpha(0);
        g.tipOnce('blackout', 'THE LIGHTS ARE\nGOING OUT');
        break;
      case 'sweep': {
        const left = Math.random() < 0.5;
        this.sweeps.push({ left, y: Phaser.Math.Between(30, 90), t: 0 });
        g.tipOnce('sweep', g.hasHazard('satchunk') ? 'HIDE BEHIND DEBRIS\nFROM THE SEARCHLIGHT' : 'DODGE THE\nSEARCHLIGHT');
        break;
      }
    }
  }

  // How far the wind pushes the ship this frame.
  pull(dt: number) {
    let x = 0;
    for (const gu of this.gusts) {
      if (gu.t < GUST_WARN) continue;
      const k = Math.min(1, (gu.t - GUST_WARN) / 300) * Math.min(1, (GUST_WARN + GUST_BLOW - gu.t) / 300);
      x += gu.dir * GUST_FORCE * k * dt;
    }
    return { x, y: 0 };
  }

  // The presses are part of the moon, so a cleared level leaves them scrolling
  // past (they only hurt during the action) instead of popping out of sight.
  clear(keepPresses = false) {
    if (!keepPresses) this.presses = [];
    this.gusts = [];
    this.embers = [];
    this.sweeps = [];
    this.gfx.clear();
    this.darkT = -1;
    this.dark?.setAlpha(0);
  }

  update(dt: number) {
    const g = this.g;
    const ms = dt * 1000;
    const live = g.phase === 'action';
    const p = g.player;
    const gfx = this.gfx;
    gfx.clear();

    // Presses: two slabs that slam together at `gap`, over and over.
    for (const pr of this.presses.slice()) {
      pr.y += SCROLL * dt;
      pr.t += ms;
      if (pr.y > H + PRESS_H) { this.presses.splice(this.presses.indexOf(pr), 1); continue; }
      const [open, slam, shut, back] = PRESS_CYCLE;
      const c = pr.t % (open + slam + shut + back);
      const k = c < open ? 0 : c < open + slam ? (c - open) / slam : c < open + slam + shut ? 1 : 1 - (c - open - slam - shut) / back;
      const lw = 8 + (pr.gap - 8) * k, rw = 8 + (W - pr.gap - 8) * k;
      const top = pr.y - PRESS_H / 2;
      const warn = c > open - 400 && c < open && Math.floor(c / 80) % 2 === 0;
      for (const [x0, w] of [[0, lw], [W - rw, rw]]) {
        gfx.fillStyle(0x3c3c3c, 1).fillRect(x0, top, w, PRESS_H);
        gfx.fillStyle(0x7c7c7c, 1).fillRect(x0, top, w, 2);
        // Hazard stripes on the leading edge.
        const edge = x0 === 0 ? lw - 6 : W - rw;
        for (let s = 0; s < PRESS_H; s += 4) gfx.fillStyle(warn ? 0xfcfcfc : 0xf8b800, 1).fillRect(edge, top + s, 6, 2);
        for (let rx = x0 + 4; rx < x0 + w - 6; rx += 12) gfx.fillStyle(0x1c1c1c, 1).fillRect(rx, top + 6, 2, 2);
      }
      // Shots stop on the slabs.
      for (const s of g.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
        if (!s.active || Math.abs(s.y - pr.y) > PRESS_H / 2 || (s.x > lw && s.x < W - rw)) continue;
        g.tink(s.x, s.y);
        s.destroy();
      }
      for (const s of g.enemyBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
        if (Math.abs(s.y - pr.y) <= PRESS_H / 2 && (s.x <= lw || s.x >= W - rw)) s.destroy();
      }
      if (live && Math.abs(p.y - pr.y) < PRESS_H / 2 + 3 && (p.x - 3 < lw || p.x + 3 > W - rw)) {
        g.hurt();
        p.y = pr.y + (p.y < pr.y ? -PRESS_H : PRESS_H); // knocked clear of the slabs
      }
    }

    // Gusts: streaks across the screen, then the push.
    for (const gu of this.gusts.slice()) {
      gu.t += ms;
      if (gu.t > GUST_WARN + GUST_BLOW) { this.gusts.splice(this.gusts.indexOf(gu), 1); continue; }
      const blowing = gu.t >= GUST_WARN;
      const n = blowing ? 14 : 4;
      for (let i = 0; i < n; i++) {
        const y = (i * 53 + gu.t * 0.05) % H;
        const len = blowing ? 26 : 12;
        const x = ((gu.t * (blowing ? 0.5 : 0.2) + i * 71) % (W + len)) - len;
        const sx = gu.dir > 0 ? x : W - x - len;
        gfx.fillStyle(0xbcbcbc, blowing ? 0.55 : 0.3).fillRect(sx, y, len, 1);
      }
      if (!blowing && Math.floor(gu.t / 200) % 2 === 0) {
        // Arrows at the edge it blows from.
        const ex = gu.dir > 0 ? 6 : W - 10;
        for (const ay of [120, 160, 200]) gfx.fillStyle(0xf8b800, 1).fillTriangle(ex, ay - 4, ex, ay + 4, ex + gu.dir * 4 + (gu.dir > 0 ? 0 : 4), ay);
      }
    }

    // Embers: a glow at the top, then they rain down.
    for (const em of this.embers.slice()) {
      if (em.warn > 0) {
        em.warn -= ms;
        if (Math.floor(em.warn / 90) % 2 === 0) gfx.fillStyle(0xd82800, 0.8).fillRect(em.x - 3, 0, 6, 3);
        continue;
      }
      em.y += em.vy * dt;
      if (em.y > H + 8 || em.hp <= 0) { this.embers.splice(this.embers.indexOf(em), 1); continue; }
      gfx.fillStyle(0xfc7460, 0.5).fillRect(em.x - 1, em.y - 12, 2, 10); // trail
      gfx.fillStyle(0xd82800, 1).fillCircle(em.x, em.y, 4);
      gfx.fillStyle(0xf8b800, 1).fillCircle(em.x, em.y, 2);
      for (const s of shotsIn(g, em.x, em.y, 5, 5)) {
        s.destroy();
        em.hp -= 1;
        g.sparks.explode(4, em.x, em.y);
      }
      if (live && Math.abs(p.x - em.x) < 6 && Math.abs(p.y - em.y) < 6) { g.hurt(); em.hp = 0; }
    }

    // Searchlights: a warning line that swings, then the live laser.
    for (const sw of this.sweeps.slice()) {
      sw.t += ms;
      if (sw.t > SWEEP_WARN + SWEEP_FIRE) { this.sweeps.splice(this.sweeps.indexOf(sw), 1); continue; }
      const x = sw.left ? 0 : W;
      const k = sw.t < SWEEP_WARN ? 0 : (sw.t - SWEEP_WARN) / SWEEP_FIRE;
      // Starts pointing across the top, swings down through the screen.
      const base = sw.left ? 0.15 : Math.PI - 0.15;
      const a = base + (sw.left ? 1 : -1) * SWEEP_ARC * Phaser.Math.Easing.Sine.InOut(k);
      gfx.fillStyle(0x7c7c7c, 1).fillRect(sw.left ? 0 : W - 6, sw.y - 5, 6, 10);
      gfx.fillStyle(0xf8b800, 1).fillRect(sw.left ? 2 : W - 4, sw.y - 2, 2, 4);
      const len = g.beamStop(x, sw.y, a);
      if (sw.t < SWEEP_WARN) {
        if (Math.floor(sw.t / 100) % 2 === 0) g.drawBeam(x, sw.y, a, 1, 0xf8b800, 0.6, len);
      } else {
        g.drawBeam(x, sw.y, a, 3, 0xfcfcfc, 0.9, len);
        if (len < 420 && Math.random() < 0.4) g.sparks.explode(1, x + Math.cos(a) * len, sw.y + Math.sin(a) * len);
        if (live && g.beamHits(x, sw.y, a, 3, len)) g.hurt();
      }
    }

    // Blackout: flickers, goes dark for a while, then flickers back on.
    if (this.darkT >= 0 && this.dark) {
      this.darkT += ms;
      const t = this.darkT;
      const a = t < 900 ? (Math.floor(t / 110) % 2 ? 0.95 : 0) : t < 5200 ? 1 : t < 6000 ? (Math.floor(t / 110) % 2 ? 0 : 0.95) : 0;
      this.dark.setAlpha(a).setPosition(p.x, p.y);
      if (t >= 6000) this.darkT = -1;
    }
  }
}
