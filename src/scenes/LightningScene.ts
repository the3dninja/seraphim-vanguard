import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { text } from '../ui';

export interface Pt { x: number; y: number }

interface LightningData {
  ship: Pt; // where the ship is
  dist: number; // px of path to draw
  reach: number; // the drawing starts this near the ship
  orb: number; // the orb's speed along the path (px/s)
  vanish: () => void; // the ship disappears
  done: (path: Pt[], pointer: Phaser.Input.Pointer | null) => void; // the orb is at the end
}

// Lightning Round, drawn over the paused Game scene: the player drags a path
// out from the ship, each pixel using up one of `dist`, with what's left shown
// over the finger. When it runs out (or the finger lifts) the ship vanishes in
// a flash and a white orb runs the path, then Game takes over again.
export class LightningScene extends Phaser.Scene {
  private d!: LightningData;
  private path: Pt[] = [];
  private left = 0;
  private drawing: Phaser.Input.Pointer | null = null;
  private line!: Phaser.GameObjects.Graphics;
  private count!: Phaser.GameObjects.Text;
  private ring!: Phaser.GameObjects.Arc;
  private hint!: Phaser.GameObjects.Text;
  private over = false;

  constructor() {
    super('Lightning');
  }

  init(d: LightningData) {
    this.d = d;
    this.path = [];
    this.left = d.dist;
    this.drawing = null;
    this.over = false;
  }

  create() {
    const { ship, reach } = this.d;
    if (!this.textures.exists('lorb')) {
      // A small white orb, fully opaque in the middle and clear at the edge.
      const r = 6;
      const tex = this.textures.createCanvas('lorb', r * 2, r * 2)!;
      const ctx = tex.getContext();
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, 'rgba(252,252,252,1)');
      g.addColorStop(1, 'rgba(252,252,252,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, r * 2, r * 2);
      tex.refresh();
    }
    this.add.rectangle(0, 0, W, H, 0x000000, 0.3).setOrigin(0);
    this.ring = this.add.circle(ship.x, ship.y, reach, 0xfcfcfc, 0).setStrokeStyle(1, 0xf8b800);
    this.tweens.add({ targets: this.ring, alpha: 0.3, yoyo: true, repeat: -1, duration: 300 });
    this.hint = text(this, W / 2, H / 2 - 20, 'DRAW FROM\nYOUR SHIP', COLOR.yellow).setOrigin(0.5).setAlign('center');
    this.tweens.add({ targets: this.hint, alpha: 0.2, yoyo: true, repeat: -1, duration: 450 });
    this.line = this.add.graphics();
    this.count = text(this, ship.x, ship.y - 12, `${this.left}`, COLOR.white).setOrigin(0.5, 1);
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => this.press(p));
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p === this.drawing && p.isDown) this.drag(p); });
    const lift = (p: Phaser.Input.Pointer) => { if (p === this.drawing) this.finish(null); };
    this.input.on('pointerup', lift);
    this.input.on('pointerupoutside', lift);
  }

  private press(p: Phaser.Input.Pointer) {
    if (this.drawing || this.over) return;
    const { ship, reach } = this.d;
    if (Phaser.Math.Distance.Between(p.x, p.y, ship.x, ship.y) > reach) return;
    this.drawing = p;
    this.path = [{ ...ship }, clampPt(p)];
    this.ring.setVisible(false);
    this.hint.setVisible(false);
    this.redraw(p);
  }

  private drag(p: Phaser.Input.Pointer) {
    if (this.over) return;
    const last = this.path[this.path.length - 1];
    const to = clampPt(p);
    const len = Phaser.Math.Distance.Between(last.x, last.y, to.x, to.y);
    if (len < 1) return;
    if (len >= this.left) {
      // Runs out partway along this stretch: stop exactly where it does.
      const k = this.left / len;
      this.path.push({ x: last.x + (to.x - last.x) * k, y: last.y + (to.y - last.y) * k });
      this.left = 0;
      this.redraw(p);
      this.finish(p);
      return;
    }
    this.left -= len;
    this.path.push(to);
    this.redraw(p);
  }

  private redraw(p: Phaser.Input.Pointer) {
    const g = this.line.clear().lineStyle(1, 0xa4e4fc, 0.9).beginPath();
    this.path.forEach((q, i) => (i ? g.lineTo(q.x, q.y) : g.moveTo(q.x, q.y)));
    g.strokePath();
    this.count.setText(`${Math.ceil(this.left)}`)
      .setPosition(Phaser.Math.Clamp(p.x, 12, W - 12), Math.max(12, p.y - 14));
  }

  // The path is drawn: the ship flashes out and the orb runs it. A lift before
  // anything much is drawn just lets the player start again.
  private finish(p: Phaser.Input.Pointer | null) {
    if (this.over) return;
    if (pathLength(this.path) - pathLength(this.path.slice(0, 2)) < 4) {
      this.drawing = null;
      this.path = [];
      this.line.clear();
      this.ring.setVisible(true);
      this.hint.setVisible(true);
      this.count.setText(`${this.d.dist}`).setPosition(this.d.ship.x, this.d.ship.y - 12);
      return;
    }
    this.over = true;
    this.count.setVisible(false);
    const { ship } = this.d;
    this.d.vanish();
    const flash = this.add.circle(ship.x, ship.y, 3, 0xfcfcfc, 1);
    this.tweens.add({ targets: flash, radius: 9, alpha: 0, duration: 160, onComplete: () => flash.destroy() });
    const orb = this.add.image(ship.x, ship.y, 'lorb').setBlendMode(Phaser.BlendModes.ADD);
    const total = pathLength(this.path);
    const at = { t: 0 };
    this.tweens.add({
      targets: at, t: 1, duration: (total / this.d.orb) * 1000,
      onUpdate: () => { const q = pointAlong(this.path, at.t * total); orb.setPosition(q.x, q.y); },
      onComplete: () => this.d.done(this.path, p),
    });
  }
}

// Where the ship can be: the same bounds as flying.
const clampPt = (p: Pt): Pt => ({ x: Phaser.Math.Clamp(p.x, 6, W - 6), y: Phaser.Math.Clamp(p.y, 24, H - 30) });

export function pathLength(path: Pt[]) {
  let n = 0;
  for (let i = 1; i < path.length; i++) n += Phaser.Math.Distance.Between(path[i - 1].x, path[i - 1].y, path[i].x, path[i].y);
  return n;
}

// The point `s` px along the path.
export function pointAlong(path: Pt[], s: number): Pt {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const len = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    if (s <= len && len > 0) return { x: a.x + (b.x - a.x) * (s / len), y: a.y + (b.y - a.y) * (s / len) };
    s -= len;
  }
  return path[path.length - 1];
}

// How far (x, y) is from the nearest point of the path.
export function distToPath(path: Pt[], x: number, y: number) {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1], b = path[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const l2 = dx * dx + dy * dy;
    const k = l2 ? Phaser.Math.Clamp(((x - a.x) * dx + (y - a.y) * dy) / l2, 0, 1) : 0;
    best = Math.min(best, Math.hypot(x - (a.x + dx * k), y - (a.y + dy * k)));
  }
  return best;
}
