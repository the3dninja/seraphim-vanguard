import Phaser from 'phaser';
import { W, H } from './config';
import type { EnemyKind } from './data/levels';
import type { EnemyData, GameScene } from './scenes/GameScene';

// The Corrupted (level 11 on): Raider, Drone Swarm and Vossari ships the
// Hollow has overgrown. Each is its ship under parasitic growths, with four
// times the health, more shots per attack and a new way of fighting.
export const CORRUPT = {
  cdart: 'dart', cweaver: 'weaver', cgunboat: 'gunboat', cbomber: 'bomber', ctrapper: 'trapper',
  cdrone: 'drone', cdriller: 'driller', cminelayer: 'minelayer',
  clancer: 'lancer', cbulwark: 'bulwark', ccarrier: 'carrier', cphantom: 'phantom',
} as const satisfies Partial<Record<EnemyKind, EnemyKind>>;
export type CorruptKind = keyof typeof CORRUPT;
export const isCorrupt = (k: string): k is CorruptKind => k in CORRUPT;
export const RAIDER_CORRUPT = new Set<string>(['cdart', 'cweaver', 'cgunboat', 'cbomber', 'ctrapper']);
// The big ones burst into seekers when shot down, like a Husk.
export const SEEDED = new Set<string>(['cgunboat', 'cbomber', 'ccarrier', 'cbulwark']);

const LANCER_WARN = 850; // ms of warning lines before a Corrupted Lancer fires
const TRAP_STEP = 150; // ms per Trapper pincer frame
const SHIELD = 18; // a Corrupted Bulwark's shield

// --- Art ------------------------------------------------------------------------

const GROWTH = ['#58d854', '#00a800', '#005800'];
const PUSTULE = ['#f878f8', '#b8f818', '#d800cc'];
const VEIN = '#a40080';
const ROT = '#4c0040';

function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// `key` drawn again as `out`, one pixel bigger on every side, with growths
// bulging out of its hull, veins across it and rot here and there. Frames of
// one ship share a seed so the growths stay put as it animates.
function corruptTexture(scene: Phaser.Scene, key: string, out: string, seed: number) {
  const src = scene.textures.get(key).getSourceImage() as HTMLCanvasElement;
  const w = src.width, h = src.height;
  const pix = src.getContext('2d')!.getImageData(0, 0, w, h).data;
  const solid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && pix[(y * w + x) * 4 + 3] > 0;
  const tex = scene.textures.createCanvas(out, w + 2, h + 2)!;
  const ctx = tex.getContext();
  ctx.drawImage(src, 1, 1);
  const px = (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x + 1, y + 1, 1, 1); };
  const rand = rng(seed);
  const cells: [number, number][] = [];
  const edges: [number, number][] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!solid(x, y)) continue;
    cells.push([x, y]);
    if (!solid(x - 1, y) || !solid(x + 1, y) || !solid(x, y - 1) || !solid(x, y + 1)) edges.push([x, y]);
  }
  for (const [x, y] of cells) if (rand() < 0.12) px(x, y, ROT);
  // Veins wandering over the hull.
  for (let v = 0; v < Math.max(1, Math.round(cells.length / 45)); v++) {
    let [x, y] = cells[Math.floor(rand() * cells.length)];
    for (let s = 0; s < 6; s++) {
      if (solid(x, y)) px(x, y, VEIN);
      x += Math.round(rand() * 2 - 1);
      y += Math.round(rand() * 2 - 1);
    }
  }
  // Growths on the edges, swelling out past them, each with a glowing pustule.
  const n = Math.max(2, Math.round(edges.length / 9));
  for (let i = 0; i < n; i++) {
    const [cx, cy] = edges[Math.floor(rand() * edges.length)];
    const r = rand() < 0.4 ? 2 : 1;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.hypot(dx, dy);
      if (d > r + 0.3 || cx + dx < -1 || cy + dy < -1 || cx + dx > w || cy + dy > h) continue;
      px(cx + dx, cy + dy, GROWTH[d < 0.5 ? 0 : d <= 1.2 ? 1 : 2]);
    }
    px(cx, cy, PUSTULE[Math.floor(rand() * PUSTULE.length)]);
  }
  tex.refresh();
}

export function generateCorruptArt(scene: Phaser.Scene) {
  let seed = 17;
  for (const [out, key] of Object.entries(CORRUPT)) corruptTexture(scene, key, out, seed += 31);
  // The Trapper's pincer frames, with the same growths as its first frame.
  const trap = 17 + 31 * (Object.keys(CORRUPT).indexOf('ctrapper') + 1);
  corruptTexture(scene, 'trapper2', 'ctrapper2', trap);
  corruptTexture(scene, 'trapper3', 'ctrapper3', trap);
  corruptTexture(scene, 'bshield', 'cbshield', 5);
}

// --- Formations -------------------------------------------------------------------

// Where each ship of a wave starts, before the usual top-of-screen spawns are
// shifted: lines come in staggered, columns zigzag, vees come in backwards
// with the leader last, and pairs spread wider and arrive one after the other.
export function corruptFormation(pattern: string, i: number, n: number, x: number, y: number): { x: number; y: number } {
  switch (pattern) {
    case 'line': return { x, y: y - (i % 2) * 16 };
    case 'column': return { x: Phaser.Math.Clamp(x + (i % 2 ? 10 : -10), 10, W - 10), y };
    case 'vee': {
      const side = Math.abs(i - (n - 1) / 2);
      return { x, y: -10 - ((n - 1) / 2 - side) * 12 };
    }
    case 'pair': return { x: x < W / 2 ? W * 0.2 : W * 0.8, y: y - i * 20 };
    default: return { x, y };
  }
}

// --- Behavior ---------------------------------------------------------------------

export function setupCorrupt(g: GameScene, e: Phaser.Physics.Arcade.Sprite, d: EnemyData) {
  d.corrupt = true;
  switch (d.kind) {
    case 'cdart':
      d.baseX = Phaser.Math.Clamp(e.x, 26, W - 26);
      d.aim = Math.random() * Math.PI * 2; // where in its meander it starts
      d.fireIn = Phaser.Math.Between(900, 1900);
      break;
    case 'cweaver':
      d.baseX = Phaser.Math.Clamp(e.x, 40, W - 40);
      d.fireIn = Phaser.Math.Between(800, 1600);
      break;
    case 'cgunboat':
      d.fireIn = 700;
      d.hold = 6500;
      break;
    case 'cbomber':
      e.x = Phaser.Math.Clamp(e.x, 24, W - 24);
      d.stopY = Phaser.Math.Between(36, 60);
      d.hold = 7500;
      d.fireIn = 900;
      break;
    case 'ctrapper':
      d.fireIn = 900;
      d.aim = 1e9;
      d.charge = 600;
      e.x = e.x < W / 2 ? 24 : W - 24;
      break;
    case 'cdrone':
      d.fireIn = Phaser.Math.Between(1200, 3000);
      break;
    case 'cdriller':
      e.setPosition(e.x < W / 2 ? -8 : W + 8, Phaser.Math.Between(Math.round(H * 0.4), Math.round(H * 0.72)));
      e.setFlipX(d.dir < 0);
      d.hold = 800;
      break;
    case 'cminelayer':
      d.baseX = Phaser.Math.Clamp(e.x, 48, W - 48);
      d.stopY = Phaser.Math.Between(40, 90);
      d.fireIn = 1000;
      d.charge = 1600;
      break;
    case 'clancer':
      d.fireIn = Phaser.Math.Between(300, 900);
      break;
    case 'cbulwark':
      d.stopY = Phaser.Math.Between(60, 84);
      d.fireIn = 1400;
      d.shield = SHIELD;
      d.shieldImg = g.add.image(e.x, e.y + 10, 'cbshield').setDepth(e.depth + 1);
      e.once('destroy', () => d.shieldImg?.destroy());
      break;
    case 'ccarrier':
      d.stopY = Phaser.Math.Between(38, 58);
      d.fireIn = 500;
      d.hold = 1600;
      break;
    case 'cphantom':
      d.cloaked = true;
      d.hold = 1400;
      d.stopY = Phaser.Math.Between(44, 110);
      e.setAlpha(0.1);
      break;
  }
}

// Shots fanned out around `a`, `gap` radians apart.
function fan(g: GameScene, x: number, y: number, a: number, n: number, gap: number, speed?: number) {
  for (let i = 0; i < n; i++) g.enemyShoot(x, y, a + (i - (n - 1) / 2) * gap, speed);
}

function ring(g: GameScene, x: number, y: number, n: number, speed: number, turn = 0) {
  for (let i = 0; i < n; i++) g.enemyShoot(x, y, turn + (i / n) * Math.PI * 2, speed);
}

const aimAt = (g: GameScene, x: number, y: number, spread = true) => {
  const tg = g.aimTarget(spread);
  return Phaser.Math.Angle.Between(x, y, tg.x, tg.y);
};

// Returns true if the enemy is gone.
export function updateCorrupt(g: GameScene, e: Phaser.Physics.Arcade.Sprite, d: EnemyData, dt: number, firing: boolean) {
  const ms = dt * 1000;
  const down = Math.PI / 2;
  switch (d.kind) {
    case 'cdart':
      // Meanders slowly back and forth as it comes down, firing aimed pairs.
      e.y += 44 * dt;
      e.x = d.baseX + Math.sin(d.t * 1.2 + d.aim) * 24;
      if (d.fireIn <= 0 && firing && e.y > 10 && e.y < H * 0.65) {
        d.fireIn = Phaser.Math.Between(1700, 2600);
        fan(g, e.x, e.y + 4, aimAt(g, e.x, e.y), 2, 0.22);
      }
      break;
    case 'cweaver':
      // Swings wide and lurches, slowing at each end of its swing, and fires fans of three.
      e.y += (24 + Math.abs(Math.cos(d.t * 1.6)) * 22) * dt;
      e.x = d.baseX + Math.sin(d.t * 1.6) * 36;
      if (d.fireIn <= 0 && firing && e.y > 10 && e.y < H * 0.6) {
        d.fireIn = Phaser.Math.Between(1800, 2500);
        fan(g, e.x, e.y + 4, aimAt(g, e.x, e.y), 3, 0.3);
      }
      break;
    case 'cgunboat':
      // Parks and takes turns: a wide aimed fan of seven, then a slow ring of ten.
      if (e.y < d.stopY && d.hold > 0) e.y += 46 * dt;
      else if (d.hold > 0) {
        d.hold -= ms;
        if (d.fireIn <= 0 && firing) {
          d.fireIn = 2000;
          if (d.step++ % 2 === 0) fan(g, e.x, e.y + 5, aimAt(g, e.x, e.y), 7, 0.17);
          else ring(g, e.x, e.y, 10, g.bulletSpeed() * 0.75, d.t);
        }
      } else e.y += 40 * dt;
      break;
    case 'cbomber':
      // Hunts the ship more closely, dropping three bombs, then sprays a fan straight down.
      if (e.y < d.stopY && d.hold > 0) e.y += 30 * dt;
      else if (d.hold > 0) {
        d.hold -= ms;
        e.x += Phaser.Math.Clamp(g.player.x - e.x, -16, 16) * dt;
        if (d.fireIn <= 0 && firing) {
          d.fireIn = 1700;
          if (d.step++ % 2 === 0) for (const dx of [-8, 0, 8]) g.spawnEnemy('bomb', e.x + dx, e.y + 9);
          else fan(g, e.x, e.y + 6, down, 5, 0.28);
        }
      } else e.y += 28 * dt;
      break;
    case 'ctrapper': {
      // Crosses bobbing up and down, seeding mines faster, and fires a pair
      // from its pincers between them. Its mines throw shots as they net.
      d.aim += ms;
      const frame = Math.min(d.fireIn, d.aim);
      e.setTexture(frame < TRAP_STEP ? 'ctrapper3' : frame < TRAP_STEP * 2 ? 'ctrapper2' : 'ctrapper');
      if (e.y < 44 && d.step === 0) e.y += 40 * dt;
      else {
        d.step = 1;
        e.x += d.dir * 28 * dt;
        e.y = 50 + Math.sin(d.t * 1.5) * 12;
        if (d.fireIn <= 0 && firing && e.x > 8 && e.x < W - 8) {
          d.fireIn = 1300;
          d.aim = 0;
          const m = g.spawnEnemy('mine', e.x, e.y + 8);
          (m.getData('e') as EnemyData).corrupt = true;
        }
        d.charge -= ms;
        if (d.charge <= 0 && firing) {
          d.charge = 1300;
          const a = aimAt(g, e.x, e.y);
          g.enemyShoot(e.x - 5, e.y + 6, a);
          g.enemyShoot(e.x + 5, e.y + 6, a);
        }
      }
      if ((d.dir > 0 && e.x > W + 20) || (d.dir < 0 && e.x < -20)) { e.destroy(); return true; }
      break;
    }
    case 'cdrone':
      // A wider, wilder snake, and every drone takes potshots.
      e.y += 46 * dt;
      e.x = d.baseX + d.dir * d.t * 38 + Math.sin(d.t * 3) * 20 * d.dir;
      if (d.fireIn <= 0 && firing && e.y > 10 && e.y < H * 0.7) {
        d.fireIn = Phaser.Math.Between(2400, 3400);
        g.enemyShoot(e.x, e.y + 3);
      }
      break;
    case 'cdriller': {
      // Rams across spraying shots up and down, then turns at the far edge
      // and comes back for a second run.
      const edge = d.dir > 0 ? 12 : W - 12;
      if (d.step === 0) {
        e.x += d.dir * 50 * dt;
        if ((d.dir > 0 && e.x >= edge) || (d.dir < 0 && e.x <= edge)) { e.x = edge; d.step = 1; }
      } else if (d.step === 1) {
        d.hold -= ms;
        e.y += Phaser.Math.Clamp(g.player.y - e.y, -50 * dt, 50 * dt);
        e.x = edge + (Math.floor(d.t * 30) % 2 ? 1 : -1);
        if (Math.floor(d.t * 12) % 2) e.setTintFill(0xd800cc);
        else e.clearTint();
        if (d.hold <= 0) { d.step = 2; d.charge = 0; e.clearTint(); }
      } else {
        e.x += d.dir * 180 * dt;
        d.charge -= ms;
        if (d.charge <= 0 && firing && e.x > 4 && e.x < W - 4) {
          d.charge = 120;
          g.enemyShoot(e.x, e.y, -down, g.bulletSpeed() * 0.8);
          g.enemyShoot(e.x, e.y, down, g.bulletSpeed() * 0.8);
        }
        const far = d.dir > 0 ? W - 12 : 12;
        if (d.beam === 0 && ((d.dir > 0 && e.x >= far) || (d.dir < 0 && e.x <= far))) {
          d.beam = 1;
          d.dir = -d.dir;
          d.step = 1;
          d.hold = 650;
          e.x = far;
          e.setFlipX(d.dir < 0);
        }
      }
      if ((d.dir > 0 && e.x > W + 20) || (d.dir < 0 && e.x < -20)) { e.destroy(); return true; }
      break;
    }
    case 'cminelayer':
      // Weaves wider, seeds six mines that burst into more shots, and fires aimed pairs.
      e.y += (e.y < d.stopY ? 34 : d.step >= 6 ? 28 : 5) * dt;
      e.x = d.baseX + Math.sin(d.t * 1.4) * 44;
      if (d.fireIn <= 0 && firing && e.y > 20 && d.step < 6) {
        d.fireIn = 1100;
        d.step++;
        const m = g.spawnEnemy('pmine', e.x, e.y + 6);
        (m.getData('e') as EnemyData).corrupt = true;
      }
      d.charge -= ms;
      if (d.charge <= 0 && firing && e.y > 20) {
        d.charge = 1700;
        fan(g, e.x, e.y + 5, aimAt(g, e.x, e.y), 2, 0.18);
      }
      break;
    case 'clancer':
      return updateLancer(g, e, d, dt, firing);
    case 'cbulwark':
      // Lumbers down behind a tougher shield, firing aimed fans of five.
      e.y += (e.y < d.stopY ? 26 : 7) * dt;
      if (d.fireIn <= 0 && firing && e.y > 20) {
        d.fireIn = 2000;
        fan(g, e.x, e.y + 9, aimAt(g, e.x, e.y), 5, 0.2);
      }
      d.shieldImg?.setPosition(e.x, e.y + 10);
      break;
    case 'ccarrier':
      // Launches four Corrupted Darts, then a ring of shots as it backs away.
      if (d.step < 4) {
        if (e.y < d.stopY) e.y += 30 * dt;
        else if (d.fireIn <= 0 && firing) {
          d.fireIn = 750;
          g.spawnEnemy('cdart', e.x + (d.step % 2 ? 8 : -8), e.y + 9);
          d.step++;
        }
      } else {
        if (d.step === 4 && firing) { d.step = 5; ring(g, e.x, e.y, 12, g.bulletSpeed() * 0.8); }
        d.hold -= ms;
        if (d.hold <= 0) e.y -= 24 * dt;
      }
      break;
    case 'cphantom':
      updatePhantom(g, e, d, dt, firing);
      break;
  }
  return false;
}

// Three warning lines in a fan, then three beams down them. Three volleys, then it leaves.
function updateLancer(g: GameScene, e: Phaser.Physics.Arcade.Sprite, d: EnemyData, dt: number, firing: boolean) {
  const ms = dt * 1000;
  const fanOf = (a: number) => [a - 0.32, a, a + 0.32];
  if (d.step >= 3 && d.charge <= 0 && d.beam <= 0) {
    e.y -= 40 * dt;
    if (e.y < -20) { e.destroy(); return true; }
    return false;
  }
  if (e.y < d.stopY) { e.y += 45 * dt; return false; }
  const nx = e.x, ny = e.y + 8;
  if (d.beam > 0) {
    d.beam -= ms;
    for (const a of fanOf(d.aim)) {
      g.drawBeam(nx, ny, a, 3, 0x00a800);
      if (firing && g.beamHits(nx, ny, a, 2.5)) g.hurt();
    }
    if (d.beam <= 0) { d.step++; d.fireIn = 1700; }
  } else if (d.charge > 0) {
    d.charge -= ms;
    if (Math.floor(d.charge / 90) % 2 === 0) for (const a of fanOf(d.aim)) g.drawBeam(nx, ny, a, 1, 0xb8f818, 0.7);
    if (d.charge <= 0) d.beam = 320;
  } else {
    e.x += Phaser.Math.Clamp(g.player.x - e.x, -18 * dt, 18 * dt);
    if (d.fireIn <= 0 && firing) {
      d.aim = aimAt(g, nx, ny, false);
      d.charge = LANCER_WARN;
    }
  }
  return false;
}

// Cloaks and moves like a Phantom, but each time it shows itself it fires
// three fans of three, and it stays for four rounds.
function updatePhantom(g: GameScene, e: Phaser.Physics.Arcade.Sprite, d: EnemyData, dt: number, firing: boolean) {
  d.hold -= dt * 1000;
  if (d.cloaked) {
    e.setAlpha(Math.floor(d.t * 20) % 6 === 0 ? 0.3 : 0.1);
    if (d.step >= 4) { e.y -= 50 * dt; return; }
    e.y += Phaser.Math.Clamp(d.stopY - e.y, -50 * dt, 50 * dt);
    e.x += Phaser.Math.Clamp(d.baseX - e.x, -70 * dt, 70 * dt);
    if (d.hold <= 0) {
      d.cloaked = false;
      d.hold = 1500;
      d.fireIn = 400;
      d.charge = 3;
      e.setAlpha(1);
      g.flash(e);
    }
    return;
  }
  if (d.fireIn <= 0 && d.charge > 0 && firing) {
    d.charge--;
    d.fireIn = 260;
    fan(g, e.x, e.y + 5, aimAt(g, e.x, e.y), 3, 0.2);
  }
  if (d.hold <= 0) {
    d.cloaked = true;
    d.step++;
    d.hold = 1300;
    d.baseX = Phaser.Math.Clamp(g.player.x + Phaser.Math.Between(-50, 50), 14, W - 14);
    d.stopY = Phaser.Math.Between(44, 110);
  }
}
