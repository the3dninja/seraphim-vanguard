import Phaser from 'phaser';
import { W, H } from './config';
import type { Theme } from './data/levels';

// A theme's backdrop over the stars: a scrolling scenery layer, a planet or
// star, Hollow space's nebula, and the Black Bloom's mist. Used by the game
// and by the Level Editor's scroll view.
export interface Scenery {
  scenery: Phaser.GameObjects.TileSprite | null;
  planet: Phaser.GameObjects.Image | null;
  nebula: Phaser.GameObjects.Image | null;
  fog: Phaser.GameObjects.TileSprite | null;
  motes: Phaser.GameObjects.Particles.ParticleEmitter | null;
}

export function addScenery(scene: Phaser.Scene, theme: Theme): Scenery {
  const s: Scenery = { scenery: null, planet: null, nebula: null, fog: null, motes: null };
  if (theme === 'mist') {
    // A haze over the action (under shots and the ship), and spores drifting through it.
    s.fog = scene.add.tileSprite(0, 0, W, H, 'fog').setOrigin(0).setDepth(9.55).setAlpha(0.15);
    s.motes = scene.add.particles(0, 0, 'px', {
      x: { min: 0, max: W }, y: -4, lifespan: 9000, speedY: { min: 14, max: 30 }, speedX: { min: -6, max: 6 },
      alpha: { start: 0.8, end: 0.2 }, tint: [0xb8f818, 0x58d854, 0xfce0a8, 0x9878f8], frequency: 90,
    }).setDepth(9.5);
  }
  if (theme !== 'outpost' && theme !== 'deep') s.scenery = scene.add.tileSprite(0, 0, W, H, `scenery_${theme}`).setOrigin(0);
  if (theme === 'outpost') s.planet = scene.add.image(132, 60, 'planet');
  if (theme === 'blockade') s.planet = scene.add.image(40, 70, 'moon');
  if (theme === 'forge') s.planet = scene.add.image(150, -6, 'sun').setAlpha(0.85);
  if (theme === 'blight') s.planet = scene.add.image(140, 40, 'blightworld').setAlpha(0.8);
  // Hollow space, out of the rift: a weird purple star before a nebula.
  if (theme === 'beyond') {
    s.nebula = scene.add.image(112, 70, 'hollownebula').setAlpha(0.9);
    s.planet = scene.add.image(40, 96, 'purplestar');
  }
  // Just above the two star layers, under everything that flies.
  let depth = 2;
  for (const o of [s.scenery, s.nebula, s.planet]) if (o) scene.children.moveTo(o, depth++);
  return s;
}
