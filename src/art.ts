import Phaser from 'phaser';
import { W, H } from './config';

// Placeholder pixel art, drawn from text grids so it can be tweaked without an editor.
// Each character is one pixel; "." is transparent.
const PAL: Record<string, string> = {
  W: '#fcfcfc', L: '#bcbcbc', G: '#7c7c7c', D: '#3c3c3c', K: '#000000',
  B: '#0058f8', C: '#3cbcfc', R: '#d82800', O: '#fc7460', Y: '#f8b800',
  P: '#9878f8', M: '#d800cc', N: '#00a800', T: '#58d854', A: '#a4e4fc',
};

const SPRITES: Record<string, string[]> = {
  ship: [
    '......W......',
    '.....WCW.....',
    '.....WCW.....',
    '....WBCBW....',
    '....WBABW....',
    '...WBBABBW...',
    '.R.WBBBBBW.R.',
    '.RWWBBBBBWWR.',
    'WBBBBBBBBBBBW',
    'WBBWWBBBWWBBW',
    'WB..WRRRW..BW',
    'W....R.R....W',
    '.....Y.Y.....',
  ],
  dart: [
    'G.......G',
    'GR.....RG',
    'GRR...RRG',
    '.RRRYRRR.',
    '..RRYRR..',
    '..RRRRR..',
    '...ORO...',
    '....R....',
  ],
  weaver: [
    'P.........P',
    'PP.......PP',
    '.PPPLLLPPP.',
    '..PMLYLMP..',
    '.PPPLLLPPP.',
    'PP...M...PP',
    'P....M....P',
  ],
  station: [
    '...........LL...........',
    '...........GG...........',
    '........GGGGGGGG........',
    '......GGLLLLLLLLGG......',
    '.....GLLDDDDDDDDLLG.....',
    'GGGGGLLDYDDDDDDYDLLGGGGG',
    'CCCCGLDDDDKKKKDDDDLGCCCC',
    'CCCCGLDDDKKKKKKDDDLGCCCC',
    'CCCCGLDDDKKKKKKDDDLGCCCC',
    'GGGGGLDDDDKKKKDDDDLGGGGG',
    '.....GLLDYDDDDYDLLG.....',
    '......GGLLLLLLLLGG......',
    '........GGGGGGGG........',
    '...........GG...........',
    '...........RR...........',
  ],
  coin1: ['.OO.', 'OYYO', 'OYYO', '.OO.'],
  coin2: ['.LLL.', 'LWWWL', 'LWLWL', 'LWWWL', '.LLL.'],
  coin3: ['..YY..', '.YWWY.', 'YWYYOY', 'YWYYOY', '.YOOY.', '..YY..'],
  bullet: ['W', 'Y', 'Y', 'Y'],
  pellet: ['YY', 'YY'],
  ebullet: ['.MM.', 'MWWM', 'MWWM', '.MM.'],
  px: ['WW', 'WW'],
  heart: ['.RR.RR.', 'RWRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'],
  heartEmpty: ['.DD.DD.', 'D..D..D', 'D.....D', '.D...D.', '..D.D..', '...D...'],
  icon_repair: ['...TT...', '...TT...', '...TT...', 'TTTTTTTT', 'TTTTTTTT', '...TT...', '...TT...', '...TT...'],
  icon_shield: ['.CCCCCC.', 'CAAAAAAC', 'CAWAAAAC', 'CAAAAAAC', 'CAAAAAAC', '.CAAAAC.', '..CAAC..', '...CC...'],
  icon_overdrive: ['....YY..', '...YY...', '..YY....', '.YYYYYY.', '....YY..', '...YY...', '..YY....', '.YY.....'],
  icon_pulse: ['...W....', '...Y....', '...Y....', '........', '...W....', '...Y....', '...Y....', '........'],
  icon_spread: ['W..W..W.', 'Y..Y..Y.', '.Y.Y.Y..', '..YYY...', '...Y....', '........', '...C....', '..CCC...'],
  coinIcon: ['.YY.', 'YWYO', 'YYYO', '.OO.'],
  lock: ['..GGG..', '.G...G.', '.G...G.', 'LLLLLLL', 'LLLDLLL', 'LLLDLLL', 'LLLLLLL'],
  // Faint pictures inside empty or locked Ship screen slots, so each slot shows what it holds.
  slotWeapon: ['....GG....', '...GGGG...', '...GGGG...', '...GGGG...', '...GGGG...', '...GGGG...', '..GGGGGG..', '.GG.GG.GG.', '.G..GG..G.', '....GG....'],
  slotItem: ['.GGGGGGGG.', 'GG......GG', 'G...GG...G', 'G...GG...G', 'G.GGGGGG.G', 'G.GGGGGG.G', 'G...GG...G', 'G...GG...G', 'GG......GG', '.GGGGGGGG.'],
  slotGear: ['...GGGG...', '.G.GGGG.G.', '.GGGGGGGG.', 'GGGG..GGGG', 'GGG....GGG', 'GGG....GGG', 'GGGG..GGGG', '.GGGGGGGG.', '.G.GGGG.G.', '...GGGG...'],
};

// The big ship for the Ship screen, drawn as its left half plus the center
// column and mirrored, so it stays symmetric while being tweaked.
const SHIP_LARGE_HALF = [
  '............W',
  '...........WC',
  '...........WC',
  '..........WBC',
  '..........WBA',
  '.........WBBA',
  '.........WBAA',
  '........WBBAA',
  '........WBBBB',
  '...R....WBBBB',
  '...R...WBBLBB',
  '...G...WBBLBB',
  '...G..WBBBLBB',
  '..WGWWBBBBBBB',
  '.WBBBBBBBBBBB',
  'WBBBBBBBBBBBB',
  'WBBCCBBBBBBBB',
  'WBBBBBBWWBBBB',
  'WBB..WBBWWBBB',
  'WB...WBBBBBBB',
  'W....WBBBDDDB',
  '.....WDRRDKDD',
  '......RYYR.K.',
  '.......YY....',
];
SPRITES.shipLarge = SHIP_LARGE_HALF.map((r) => r + [...r.slice(0, -1)].reverse().join(''));

function makeTexture(scene: Phaser.Scene, key: string, rows: string[]) {
  const w = Math.max(...rows.map((r) => r.length));
  const tex = scene.textures.createCanvas(key, w, rows.length)!;
  const ctx = tex.getContext();
  rows.forEach((row, y) => {
    [...row].forEach((c, x) => {
      if (c === '.' || !PAL[c]) return;
      ctx.fillStyle = PAL[c];
      ctx.fillRect(x, y, 1, 1);
    });
  });
  tex.refresh();
}

// A banded gas giant with a dithered shadow edge, for the level 1 backdrop.
function makePlanet(scene: Phaser.Scene) {
  const r = 34;
  const size = r * 2;
  const tex = scene.textures.createCanvas('planet', size, size)!;
  const ctx = tex.getContext();
  const bands = ['#0058f8', '#3cbcfc', '#0058f8', '#0000bc', '#3cbcfc', '#0058f8', '#0000bc'];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - r + 0.5;
      const dy = y - r + 0.5;
      if (dx * dx + dy * dy > r * r) continue;
      const band = bands[Math.floor(((y + Math.sin(x / 9) * 2) / size) * bands.length) % bands.length];
      // Shadow on the lower right, dithered in a checkerboard at the edge.
      const shade = dx * 0.6 + dy * 0.8;
      if (shade > r * 0.55 || (shade > r * 0.35 && (x + y) % 2 === 0)) ctx.fillStyle = '#000058';
      else ctx.fillStyle = band;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

// A screen-sized layer of random stars, tiled and scrolled for parallax.
function makeStars(scene: Phaser.Scene, key: string, count: number, colors: string[]) {
  const tex = scene.textures.createCanvas(key, W, H)!;
  const ctx = tex.getContext();
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[i % colors.length];
    ctx.fillRect(Math.floor(Math.random() * W), Math.floor(Math.random() * H), 1, 1);
  }
  tex.refresh();
}

function makeShieldBubble(scene: Phaser.Scene) {
  const r = 11;
  const tex = scene.textures.createCanvas('bubble', r * 2 + 1, r * 2 + 1)!;
  const ctx = tex.getContext();
  for (let y = 0; y <= r * 2; y++) {
    for (let x = 0; x <= r * 2; x++) {
      const d = Math.hypot(x - r, y - r);
      if (d > r - 1 && d <= r + 0.2) {
        ctx.fillStyle = (x + y) % 3 === 0 ? '#fcfcfc' : '#3cbcfc';
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  tex.refresh();
}

export function generateArt(scene: Phaser.Scene) {
  for (const [key, rows] of Object.entries(SPRITES)) makeTexture(scene, key, rows);
  makePlanet(scene);
  makeShieldBubble(scene);
  makeStars(scene, 'stars-far', 70, ['#3c3c3c', '#7c7c7c']);
  makeStars(scene, 'stars-near', 25, ['#bcbcbc', '#fcfcfc', '#a4e4fc']);
}
