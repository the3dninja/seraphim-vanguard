import Phaser from 'phaser';
import { W, H } from './config';
import { PAL3, generateArt3, mimicRows } from './art3';
import { generateMenuIcons } from './menuIcons';

// Placeholder pixel art, drawn from text grids so it can be tweaked without an editor.
// Each character is one pixel; "." is transparent.
const PAL: Record<string, string> = {
  W: '#fcfcfc', L: '#bcbcbc', G: '#7c7c7c', D: '#3c3c3c', K: '#000000',
  B: '#0058f8', C: '#3cbcfc', R: '#d82800', O: '#fc7460', Y: '#f8b800',
  P: '#9878f8', M: '#d800cc', N: '#00a800', T: '#58d854', A: '#a4e4fc',
  // Metals for the ingot drops: bronze (b e f v), silver (h g), gold (q j z).
  b: '#fca044', e: '#c84c0c', f: '#7c2c00', v: '#4c1800',
  h: '#e4e4e4', g: '#5c5c5c',
  q: '#fce0a8', j: '#ac7c00', z: '#6c4800',
  ...PAL3,
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
  // Credit drops: 3D bars in bronze, silver and gold, plus a stack of gold for big drops.
  ingot1: ['..bbbbbb.', '.bWbbbbbv', 'eeeeeeeev', 'eeeeeeevv', 'fffffff..'],
  ingot2: ['...hhhhhhh.', '..hWWhhhhhg', '.hhhhhhhhgg', 'LLLLLLLLLgg', 'LLLLLLLLLg.', 'GGGGGGGGG..'],
  ingot3: [
    '...qqqqqqqqq.',
    '..qWWqqqqqqqz',
    '.qqqqqqqqqqzz',
    'YYYYYYYYYYzzz',
    'YYYYYYYYYYzz.',
    'YYYYYYYYYYz..',
    'jjjjjjjjjj...',
  ],
  ingot4: [
    '.....qqqqqqqq..',
    '....qWWqqqqqqz.',
    '...qqqqqqqqqzz.',
    '..YYYYYYYYYzzz.',
    '..YYYYYYYYYzz..',
    '..jjjjjjjjjj...',
    'qqqqqqqq.qqqqqz',
    'qWWqqqqqzqqqqzz',
    'YYYYYYYzzYYYzzz',
    'YYYYYYYzzYYYzz.',
    'jjjjjjjj.jjjj..',
  ],
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
  coinIcon: ['..qqqq.', '.qWqqqz', 'YYYYYzz', 'YYYYYz.', 'jjjjj..'],
  icon_hull: ['.LLLLLL.', 'LWLLLLLG', 'LLLRRLLG', 'LLRRRRLG', 'LLLRRLLG', 'LLLLLLLG', '.LGGGGG.', '..GGGG..'],
  slotWeaponSmall: ['...LL...', '..LLLL..', '..LLLL..', '..LLLL..', '.LLLLLL.', 'LL.LL.LL', 'L..LL..L', '...LL...'],
  slotItemSmall: ['.LLLLLL.', 'L......L', 'L..LL..L', 'L.LLLL.L', 'L.LLLL.L', 'L..LL..L', 'L......L', '.LLLLLL.'],
  qmark: ['.WWWW.', 'WW..WW', '....WW', '..WWW.', '..WW..', '......', '..WW..'],
  check: ['......T', '.....TT', 'T...TT.', 'TT.TT..', '.TTT...', '..T....'],
  // Treasure chest, in 3/4 view: shut, and opened and emptied (not in use).
  chest: ['.vvvvvvvv.', 'vqbbbbbbev', 'vbbbbbbbev', 'vbbbbbbbev', 'vjjjjYjjzv', 'veeeeYeefv', 'veeeejeefv', 'veeeeeeefv', 'vffffffffv', '.vvvvvvvv.'],
  chestOpen: ['.vvvvvvvv.', '.veeeeeev.', '.vffffffv.', 'vvvvvvvvvv', 'vjvvvvvvzv', 'vjKKKKKKzv', 'vjjjjjjjzv', 'veeeeYeefv', 'vffffffffv', '.vvvvvvvv.'],
  // Star map treasure: three small gold bars, stacked like the big credit drop.
  goldPile: ['....qWqqz...', '...YYYYzz...', '...YYYYz....', '...jjjj.....', '.qWqqz.qWqqz', 'YYYYzzYYYYzz', 'YYYYz.YYYYz.', 'jjjj..jjjj..'],
  pip: ['YY', 'YY'],
  pipEmpty: ['DD', 'DD'],

  // Level 2 and 3 enemies.
  gunboat: [
    '...Y.....Y...',
    '..RRR...RRR..',
    '.RRRRRRRRRRR.',
    'RRLLLRRRLLLRR',
    'RLDDDLRLDDDLR',
    'RRLLLRORLLLRR',
    '.RRRROOORRRR.',
    '.GRRRRYRRRRG.',
    '.G..RRRRR..G.',
    '.G...RRR...G.',
    '......R......',
  ],
  drone: ['G.....G', '.G.L.G.', '..LLL..', 'GLYKYLG', '.LLLLL.', '.G.G.G.', 'G..G..G'],
  bomber: [
    '.....RRRRR.....',
    '...RRRRRRRRR...',
    'RRRRRDDDDDRRRRR',
    'ROORRDKKKDRROOR',
    'RRRRRDDDDDRRRRR',
    '.RRR.RRRRR.RRR.',
    '..G...ROR...G..',
    '......YYY......',
  ],
  mine: ['...G...', '..GDG..', '.GDRDG.', 'GDRYRDG', '.GDRDG.', '..GDG..', '...G...'],
  mineLit: ['...G...', '..GRG..', '.GRWRG.', 'GRWWWRG', '.GRWRG.', '..GRG..', '...G...'],
  debris1: [
    '......GGGG..........',
    '....GGLLLLGG........',
    '..GGLLDDDDLLGGG.....',
    '.GLLDDGGDDDDLLLGG...',
    'GLDDGGKKGGDDDDDLLG..',
    'GLDGKKKKKKGDDRDDDLG.',
    '.GLDGKKKKGDDDRRDDLG.',
    '..GLDDGGDDDDDDDDLG..',
    '...GLDDDDDDDDDLLG...',
    '....GGLLDDDLLLGG....',
    '......GGGLLGG.......',
    '.........GG.........',
  ],
  debris2: [
    'GGGGGGG.......',
    'GLLLLLLGG.....',
    'GLDDDDDLLGG...',
    'GLDBBDDDDLLG..',
    'GLDDDDKKDDDLG.',
    '.GLDDKKKKDDLG.',
    '..GLDDKKDDDLLG',
    '...GLDDDDDDDLG',
    '....GLLDDDLLG.',
    '.....GGLLLGG..',
    '.......GGG....',
  ],

  // Broken satellite: a torn solar panel and a chunk of the hull with its dish.
  satchunk1: [
    '..GGGGGGGGGGGGG.....',
    '.GLDBDBDBDBDBDLG....',
    '.GLBCBDBCBDBCBLG....',
    '.GLDBDBDBDBDBDLGGG..',
    '.GLBCBDBCBDBCBLLLLG.',
    '.GLDBDBDBDBDBDLGGG..',
    '.GLBCBDBCBDB.GLG....',
    '.GLDBDBDBD...G......',
    '.GLLLLLL.....G......',
    '..GGGGG.............',
  ],
  satchunk2: [
    '....GGGGGGGGGGGG....',
    '..GGLLLLLLLLLLLLG...',
    '.GLLDDDDDDDDDDDDLG..',
    'GLDDDGGGDDDDKKDDDLG.',
    'GLDDGYYGDDDDKKDDDLGG',
    'GLDDDGGGDDDDDDDDDLLG',
    'GLDBDBDBDBDDRRDDDDLG',
    'GLDCBCBCBCDDDDDDDLG.',
    '.GLDDDDDDDDDDKDDLG..',
    '..GLLDDDKKDDDDDLG...',
    '...GGLLLDDDDLLGG....',
    '.....GG.GLLLGG......',
    '.........GGG........',
  ],

  // A derelict cargo hauler, stacked with containers: the treasure at the end of some levels.
  cargoship: [
    '..........GGGGGGGGGGGGGGGGGGGGGGGGG.........',
    '........GGLLLLLLLLLLLLLLLLLLLLLLLLLGG.......',
    '......GGLLDDDDDDDDDDDDDDDDDDDDDDDDDLLGG.....',
    '.....GLLDDRRRRRDBBBBBDYYYYYDNNNNNDDDDLLG....',
    '....GLDDDDROORRDBCCBBDYqqYYDNTTNNDGGDDDLG...',
    '...GLDDGGDRRRRRDBBBBBDYYYYYDNNNNNDGKGDDDLGG.',
    'GGGLDDGKKGDDDDDDDDDDDDDDDDDDDDDDDDGGDDDDLLLG',
    'GWLDDDGKKGDBBBBBDRRRRRDNNNNNDYYYYYDDDDDDDDLG',
    'GWLDDDDGGDDBCCBBDROORRDNTTNNDYqqYYDDKKDDDDLG',
    'GGGLDDDDDDDBBBBBDRRRRRDNNNNNDYYYYYDDKKDDDLLG',
    '...GLDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDLGG.',
    '....GLLDDDDYYYYYDNNNNNDBBBBBDDDDDDDDDDDLG...',
    '.....GGLLDDYqqYYDNTTNNDBCCBBDDKDDDDDLLGG....',
    '.......GGLLLLLLLLLLLLLLLLLLLLLLLLLLLLGG.....',
    '.........GGGGGG..GGGGGGGG..GGGGGGGGG.......',
    '..........ROY......ROY.......ROY...........',
  ],

  // Rockjaw, the level 3 mini boss: armor plates bolted over an asteroid, a core underneath.
  plateL: [
    '..GGGGGGGGGG',
    '.GLLLLLLLLLG',
    'GLWLLDLLLLLG',
    'GLLLLLLLLDLG',
    'GLLDDDDDDLLG',
    'GLLLLLLLLLLG',
    'GLDLLLLLLDLG',
    '.GLLLLLLLLG.',
    '..GGGDDGGG..',
    '.....DD.....',
    '.....GG.....',
  ],
  plateC: [
    'GGGGGGGGGGGGGG',
    'GLLLLLLLLLLLLG',
    'GLWLLLLLLLLDLG',
    'GLLLDDDDDDLLLG',
    'GLLLLLLLLLLLLG',
    'GLDLLLLLLLLDLG',
    'GLLLLLLLLLLLLG',
    '.GLLLLLLLLLLG.',
    '..GGGGGGGGGG..',
  ],
  core: ['..RRRR..', '.RROORR.', 'RROWWORR', 'ROWYYWOR', 'ROWYYWOR', 'RROWWORR', '.RROORR.', '..RRRR..'],

  // Level 4 and 5 enemies and hazards.
  // Driller (Drone Swarm), drawn facing right; flipped when it comes from the right.
  driller: [
    '.G.GGG........',
    '..GLLLGOO.....',
    '.GLLLLGOYOO...',
    'GLLYKLLGOYOOO.',
    'GLLKYLLGYOYOYW',
    'GLLYKLLGOYOOO.',
    '.GLLLLGOYOO...',
    '..GLLLGOO.....',
    '.G.GGG........',
  ],
  // Vossari Lancer: the lance under the hull is where its beam comes from.
  lancer: [
    '..PP...PP..',
    '.PLLP.PLLP.',
    'PLWLLPLLWLP',
    'PLLLMMMLLLP',
    '.PLLMWMLLP.',
    '..PPMWMPP..',
    '....MWM....',
    '....LWL....',
    '....LCL....',
    '.....C.....',
    '.....C.....',
    '.....W.....',
  ],
  bulwark: [
    '....PPPPPPPPP....',
    '..PPLLLLLLLLLPP..',
    '.PLLWLLLLLLLLLLP.',
    'PLLLLDDDDDDDLLLLP',
    'PLLLDMMMMMMMDLLLP',
    'PLLLDMYYYYYMDLLLP',
    'PLLLDMMMMMMMDLLLP',
    '.PLLLDDDDDDDLLLP.',
    '..PPLLLLLLLLLPP..',
    '...GG.PPPPP.GG...',
    '...G.........G...',
  ],
  // The Bulwark's shield, a bowl under its nose that soaks up shots from below.
  bshield: [
    'C...................C',
    'CA.................AC',
    '.CAA.............AAC.',
    '..CCAAAWAAAAAWAAACC..',
    '....CCCCCCCCCCCCC....',
  ],
  shard: ['..W..', '.WA..', '.AAC.', 'WACC.', '.ACCB', '.ACB.', '..CB.', '..B..'],
  // A capital ship gun leaning in from the left edge (flipped for the right).
  eturret: [
    'GGGG......',
    'GLLLG.....',
    'GLRRLGGGGG',
    'GLRYLLLLLW',
    'GLRRLGGGGG',
    'GLLLG.....',
    'GGGG......',
  ],
  // Admiral Kade's Dreadnought: four gun turrets and the bridge.
  kturret: [
    '...DDDDD...',
    '.DDPPPPPDD.',
    '.DPLLLLLPD.',
    'DPLMMMMMLPD',
    'DPLMYYYMLPD',
    'DPLMYWYMLPD',
    'DPLMMMMMLPD',
    '.DPLLLLLPD.',
    '.DDPGGGPDD.',
    '...DGGGD...',
    '....GGG....',
    '....DKD....',
  ],
  kbridge: [
    '.....PPPPPPPP.....',
    '...PPLLLLLLLLPP...',
    '..PLWLLLLLLLLLLP..',
    '.PLLDDDDDDDDDDLLP.',
    'PLLDCACCACCACCDLLP',
    'PLLDAACAACAACADLLP',
    'PLLDDDDDDDDDDDDLLP',
    '.PLLLLLMMMMLLLLLP.',
    '..PLLLMRRRRMLLLP..',
    '...PPLMRYYRMLPP...',
    '.....PMRWWRMP.....',
    '......PMRRMP......',
    '.......PMMP.......',
    '........PP........',
  ],

  // Level 6 to 8 enemies.
  // Mine Layer (Drone Swarm): a hauler with a mine rack underneath.
  minelayer: [
    '..G.......G..',
    '.GLLGGGGGLLG.',
    'GLLLLLLLLLLLG',
    'GLYKLLLLLKYLG',
    'GLLLLOOOLLLLG',
    '.GGLOYCYOLGG.',
    '..G.OCCCO.G..',
    '.....OCO.....',
    '......C......',
  ],
  // Proximity mine: dim until the ship comes close, then it blinks fast.
  pmine: ['...C...', '.C.D.C.', '..DCD..', 'CDCACDC', '..DCD..', '.C.D.C.', '...C...'],
  pmineLit: ['...W...', '.W.R.W.', '..RWR..', 'WRWWWRW', '..RWR..', '.W.R.W.', '...W...'],
  // Vossari Carrier: a broad hull with a launch bay that opens downward.
  carrier: [
    '......PPPPPPPPP......',
    '...PPPLLLLLLLLLPPP...',
    '.PPLLLWLLLLLLLLLLLPP.',
    'PLLLLLLLDDDDDLLLLLLLP',
    'PLMMLLLDKKKKKDLLLMMLP',
    'PLLLLLLDKKKKKDLLLLLLP',
    '.PLLLLLDKKKKKDLLLLLP.',
    '..PPLLLDKKKKKDLLLPP..',
    '...GPPLDYKKKYDLPPG...',
    '...G..PPPDDDPPP..G...',
    '..........D..........',
  ],
  // Phantom: a thin dark stealth ship with a single eye.
  phantom: [
    'B.........B',
    'BB.......BB',
    '.BPPPPPPPB.',
    '..PDDCDDP..',
    '...PDADP...',
    '....PDP....',
    '.....P.....',
  ],
  // The Watcher, the level 8 mini boss: a Vossari spy frigate with a big eye.
  watcher: [
    '.........PPPPPPPPPPP.........',
    '......PPPLLLLLLLLLLLPPP......',
    '..PPPPLLLLLDDDDDLLLLLLLPPPP..',
    'PPLLLLLLLLDKKKKKDLLLLLLLLLLPP',
    'PLLWLLLLLDKCCCCCKDLLLLLLLLLLP',
    'PLLLLMMMLDKCAWACKDLMMMLLLLLLP',
    'PLLLLLLLLDKCCACCKDLLLLLLLLLLP',
    '.PPLLLLLLLDKKKKKDLLLLLLLLLPP.',
    '...PPPLLLLLDDDDDLLLLLLPPP....',
    '......PPPGPPPPPPPPPGPPP......',
    '.........G.........G.........',
    '.........D.........D.........',
  ],
  // Gear
  sat: ['.C.', 'CWC', '.C.'],
  satshot: ['A', 'C', 'C'],
  fencepost: ['GGGG.', 'GLLG.', 'GLRRR', 'GLRWR', 'GLRRR', 'GLLG.', 'GGGG.'],
  icon_plating: ['LLLLLLLL', 'LWLGGLWL', 'LLLLLLLL', 'GGLLLLGG', 'LLLLLLLL', 'LWLGGLWL', 'LLLLLLLL', '.GGGGGG.'],
  icon_magnet: ['.RR..RR.', '.RR..RR.', '.RR..RR.', '.RR..RR.', '.RRRRRR.', '..RRRR..', 'WW....WW', 'WW....WW'],
  icon_deflector: ['..PPPP..', '.P....P.', 'P..WW..P', 'P.W..W.P', 'P..WW..P', '.P....P.', '..PPPP..', '........'],
  icon_satellite: ['C.....C.', '.C...C..', '..CCC...', '.CCWCC..', '..CCC...', '.C...C..', 'C.....C.', '........'],
  slotGearSmall: ['...LL...', '.L.LL.L.', '..LLLL..', 'LLL..LLL', 'LLL..LLL', '..LLLL..', '.L.LL.L.', '...LL...'],

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

// A banded planet with a dithered shadow edge: the level 1 gas giant and the
// level 5 fortress moon.
function makePlanet(scene: Phaser.Scene, key: string, r: number, bands: string[], shadow: string, craters = 0) {
  const size = r * 2;
  const tex = scene.textures.createCanvas(key, size, size)!;
  const ctx = tex.getContext();
  const rand = rng(r * 31 + craters);
  const pits = Array.from({ length: craters }, () => [rand() * size, rand() * size, 1.5 + rand() * r * 0.18]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - r + 0.5;
      const dy = y - r + 0.5;
      if (dx * dx + dy * dy > r * r) continue;
      let band = bands[Math.floor(((y + Math.sin(x / 9) * 2) / size) * bands.length) % bands.length];
      for (const [cx, cy, cr] of pits) {
        const d = Math.hypot(x - cx, y - cy);
        if (d < cr) band = d > cr - 1 && x + y < cx + cy ? shadow : bands[bands.length - 1];
      }
      // Shadow on the lower right, dithered in a checkerboard at the edge.
      const shade = dx * 0.6 + dy * 0.8;
      if (shade > r * 0.55 || (shade > r * 0.35 && (x + y) % 2 === 0)) ctx.fillStyle = shadow;
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

// A dotted ring: the ship's shield bubble and the Dreadnought bridge's shield.
function makeRing(scene: Phaser.Scene, key: string, rx: number, ry: number, colors = ['#fcfcfc', '#3cbcfc']) {
  const tex = scene.textures.createCanvas(key, rx * 2 + 1, ry * 2 + 1)!;
  const ctx = tex.getContext();
  for (let y = 0; y <= ry * 2; y++) {
    for (let x = 0; x <= rx * 2; x++) {
      const d = Math.hypot((x - rx) / rx, (y - ry) / ry);
      if (d > 1 - 1.2 / Math.min(rx, ry) && d <= 1.02) {
        ctx.fillStyle = (x + y) % 3 === 0 ? colors[0] : colors[1];
        ctx.fillRect(x, y, 1, 1);
      }
    }
  }
  tex.refresh();
}

// A sheet of ice for level 4: a pale, dithered oval with a few cracks.
function makeIcePatch(scene: Phaser.Scene) {
  const rx = 30, ry = 16;
  const tex = scene.textures.createCanvas('icepatch', rx * 2, ry * 2)!;
  const ctx = tex.getContext();
  const rand = rng(77);
  const cracks = Array.from({ length: 4 }, () => [rand() * rx * 2, rand() * ry * 2, rand() * Math.PI]);
  for (let y = 0; y < ry * 2; y++) {
    for (let x = 0; x < rx * 2; x++) {
      const d = Math.hypot((x - rx + 0.5) / rx, (y - ry + 0.5) / ry) + Math.sin(x * 0.7 + y) * 0.04;
      if (d > 1) continue;
      let c = d > 0.85 ? '#a4e4fc' : (x + y) % 2 === 0 ? '#3cbcfc' : '#0058f8';
      if (d < 0.85 && (x * 3 + y * 5) % 23 === 0) c = '#fcfcfc';
      for (const [cx, cy, a] of cracks) {
        const along = (x - cx) * Math.cos(a) + (y - cy) * Math.sin(a);
        const off = -(x - cx) * Math.sin(a) + (y - cy) * Math.cos(a);
        if (Math.abs(off) < 0.5 && Math.abs(along) < 7) c = '#a4e4fc';
      }
      ctx.fillStyle = c;
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

// Admiral Kade's Dreadnought, as wide as the screen, nose pointing down.
export const DREAD_W = 176;
export const DREAD_H = 56;
// Where the hull's lower edge is, measured from its top, `dx` px from the middle.
export const dreadBottom = (dx: number) => 34 + 20 * Math.max(0, 1 - Math.abs(dx) / (DREAD_W / 2)) ** 1.6;
const dreadTop = (dx: number) => 6 + 14 * (Math.abs(dx) / (DREAD_W / 2)) ** 2;

function makeDreadnought(scene: Phaser.Scene) {
  const tex = scene.textures.createCanvas('dread', DREAD_W, DREAD_H)!;
  const ctx = tex.getContext();
  const px = (x: number, y: number, c: string) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); };
  for (let x = 0; x < DREAD_W; x++) {
    const dx = x - DREAD_W / 2 + 0.5;
    const top = Math.round(dreadTop(dx));
    const bot = Math.round(dreadBottom(dx));
    // Engines along the back edge.
    if ([20, 21, 22, 23, 50, 51, 52, 53].includes(Math.floor(Math.abs(dx)))) {
      for (let y = top - 3; y < top; y++) px(x, y, y === top - 3 ? '#f8b800' : '#fc7460');
    }
    for (let y = top; y < bot; y++) {
      let c = '#7c7c7c';
      if (y - top < 2) c = '#bcbcbc';
      else if (bot - y <= 3) c = (x + y) % 2 === 0 ? '#3c3c3c' : '#000000';
      else if (Math.abs(dx) > 20 && y === 27) c = '#6844fc';
      else if (Math.abs(dx) > 20 && y === 28) c = '#3c1c7c';
      else if (Math.abs(dx) < 1.5 && y > 8) c = '#bcbcbc';
      else if (Math.round(Math.abs(dx)) % 12 === 0 && (y % 2 === 0)) c = '#3c3c3c';
      else if (y === 31 && Math.abs(dx) > 24 && Math.abs(dx) < 80 && x % 5 === 0) c = '#f8b800';
      px(x, y, c);
    }
  }
  // A red light on the prow.
  px(DREAD_W / 2 - 1, Math.round(dreadBottom(0)) - 1, '#d82800');
  px(DREAD_W / 2, Math.round(dreadBottom(0)) - 1, '#d82800');
  tex.refresh();
}

// A copy of a sprite with a bright diagonal streak, swapped in now and then so drops glint.
function makeGlint(scene: Phaser.Scene, key: string) {
  const rows = SPRITES[key];
  const w = Math.max(...rows.map((r) => r.length));
  const at = Math.floor(w * 0.6);
  makeTexture(scene, `${key}_glint`, rows.map((row, y) =>
    [...row].map((c, x) => (c !== '.' && (x + y === at || x + y === at + 1) ? 'W' : c)).join('')));
}

// Small seeded random so procedural art comes out the same every load.
function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// A lumpy, cratered rock lit from the upper left. rx/ry are the half sizes.
function makeRock(scene: Phaser.Scene, key: string, rx: number, ry: number, seed: number,
  colors = ['#c8a878', '#887000', '#503000', '#2c1800']) {
  const rand = rng(seed);
  const bumps = Array.from({ length: 5 }, () => [rand() * Math.PI * 2, 0.06 + rand() * 0.1, 2 + Math.floor(rand() * 3)]);
  const craters = Array.from({ length: Math.max(1, Math.round((rx * ry) / 50)) }, () =>
    [(rand() - 0.5) * rx * 1.2, (rand() - 0.5) * ry * 1.2, 1 + rand() * Math.min(rx, ry) * 0.25]);
  const w = rx * 2, h = ry * 2;
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const nx = (x - rx + 0.5) / rx, ny = (y - ry + 0.5) / ry;
      const a = Math.atan2(ny, nx);
      let edge = 0.92;
      for (const [p, amp, f] of bumps) edge += Math.sin(a * f + p) * amp;
      const d = Math.hypot(nx, ny);
      if (d > edge) continue;
      // Light from the upper left, a dark rim at the edge, and craters.
      let light = 0.55 - nx * 0.35 - ny * 0.35 - (d / edge > 0.85 ? 0.35 : 0);
      for (const [cx, cy, cr] of craters) {
        const cd = Math.hypot(x - rx - cx, y - ry - cy);
        if (cd < cr) light += cd < cr - 1 ? -0.3 : 0.2;
      }
      const i = light > 0.75 ? 0 : light > 0.4 ? 1 : light > 0.1 ? 2 : 3;
      ctx.fillStyle = colors[i];
      ctx.fillRect(x, y, 1, 1);
    }
  }
  tex.refresh();
}

// Star map pictures, one per level locale.
type NodeKind = 'planet' | 'ring' | 'rocks' | 'scrap' | 'nebula' | 'star' | 'station' | 'rift' | 'gate';
function makeNode(scene: Phaser.Scene, key: string, kind: NodeKind, c: string[]) {
  const S = 20;
  const tex = scene.textures.createCanvas(key, S, S)!;
  const ctx = tex.getContext();
  const px = (x: number, y: number, col: string) => { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); };
  const disc = (cx: number, cy: number, r: number, bands: string[], shadow: string) => {
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const dx = x - cx + 0.5, dy = y - cy + 0.5;
      if (dx * dx + dy * dy > r * r) continue;
      const sh = dx * 0.6 + dy * 0.8;
      px(x, y, sh > r * 0.5 || (sh > r * 0.3 && (x + y) % 2 === 0) ? shadow
        : bands[Math.floor(((y - cy + r) / (2 * r)) * bands.length) % bands.length]);
    }
  };
  const rand = rng(key.length * 97 + c.length);
  switch (kind) {
    case 'planet':
      disc(10, 10, 8, c.slice(0, -1), c[c.length - 1]);
      break;
    case 'ring':
      disc(10, 10, 6, c.slice(0, -2), c[c.length - 2]);
      for (let x = 0; x < S; x++) {
        const y = Math.round(10 + (x - 10) * 0.25);
        if (Math.abs(x - 10) > 5 || x > 10) { px(x, y, c[c.length - 1]); if (x % 3) px(x, y + 1, c[c.length - 1]); }
      }
      break;
    case 'rocks':
    case 'scrap':
      for (const [cx, cy, r] of [[7, 8, 5], [14, 12, 4], [6, 15, 3], [15, 4, 2]]) {
        for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
          const inside = kind === 'rocks' ? x * x + y * y <= r * r - rand() * 3 : Math.abs(x) + Math.abs(y) * 1.6 <= r + 1;
          if (inside) px(cx + x, cy + y, x + y < -1 ? c[0] : x + y < 2 ? c[1] : c[2]);
        }
      }
      break;
    case 'nebula':
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const d = Math.hypot(x - 10, (y - 10) * 1.3) + Math.sin(x * 0.9) * 1.5 + Math.cos(y * 1.3) * 1.5;
        if (d < 5) px(x, y, c[0]);
        else if (d < 8 && (x + y) % 2 === 0) px(x, y, c[1]);
        else if (d < 10 && (x * 3 + y) % 4 === 0) px(x, y, c[2]);
      }
      break;
    case 'star':
      disc(10, 10, 6, [c[0], c[1], c[0]], c[1]);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        px(Math.round(10 + Math.cos(a) * 8), Math.round(10 + Math.sin(a) * 8), c[2]);
        px(Math.round(10 + Math.cos(a) * 9), Math.round(10 + Math.sin(a) * 9), c[2]);
      }
      break;
    case 'station':
      for (let i = 2; i < 18; i++) { px(i, 10, c[1]); px(10, i, c[1]); }
      for (let y = 6; y < 14; y++) for (let x = 6; x < 14; x++) px(x, y, (x === 6 || y === 6) ? c[0] : (x === 13 || y === 13) ? c[2] : c[1]);
      px(9, 9, c[3]); px(10, 9, c[3]); px(9, 10, c[3]); px(10, 10, c[3]);
      for (const [x, y] of [[2, 10], [17, 10], [10, 2], [10, 17]]) px(x, y, c[3]);
      break;
    case 'rift':
      for (let y = 1; y < 19; y++) {
        const x = Math.round(10 + Math.sin(y * 0.8) * 3);
        const w = 3 - Math.abs(y - 10) / 4;
        for (let dx = -Math.ceil(w) - 1; dx <= Math.ceil(w) + 1; dx++) {
          px(x + dx, y, Math.abs(dx) <= w - 1 ? c[0] : Math.abs(dx) <= w ? c[1] : c[2]);
        }
      }
      break;
    case 'gate':
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
        const d = Math.hypot(x - 9.5, y - 9.5);
        if (d >= 6 && d < 9.5) px(x, y, d < 7 ? c[2] : (x + y) % 3 === 0 ? c[1] : c[0]);
        else if (d < 6 && (x + y) % 2 === 0) px(x, y, c[3]);
      }
      break;
  }
  tex.refresh();
}

const NODES: [string, NodeKind, string[]][] = [
  ['node_gas', 'planet', ['#0058f8', '#3cbcfc', '#0058f8', '#0000bc', '#000058']],
  ['node_scrap', 'scrap', ['#bcbcbc', '#7c7c7c', '#3c3c3c']],
  ['node_rocks', 'rocks', ['#c8a878', '#887000', '#503000']],
  ['node_ice', 'ring', ['#fcfcfc', '#a4e4fc', '#3cbcfc', '#0058f8', '#bcbcbc']],
  ['node_moon', 'planet', ['#bcbcbc', '#7c7c7c', '#bcbcbc', '#3c3c3c']],
  ['node_nebula', 'nebula', ['#fc7460', '#d82800', '#881400']],
  ['node_star', 'star', ['#fcfcfc', '#f8b800', '#fc7460']],
  ['node_relay', 'station', ['#bcbcbc', '#7c7c7c', '#3c3c3c', '#3cbcfc']],
  ['node_blight', 'planet', ['#58d854', '#9878f8', '#00a800', '#6844fc', '#1c1c3c']],
  ['node_throne', 'station', ['#9878f8', '#6844fc', '#3c1c7c', '#f8b800']],
  ['node_rift', 'rift', ['#fcfcfc', '#d800cc', '#6844fc']],
  ['node_reef', 'planet', ['#fc7460', '#f878f8', '#d800cc', '#fc7460', '#4c0040']],
  ['node_bloom', 'nebula', ['#58d854', '#3c1c7c', '#1c1c3c']],
  ['node_gate', 'gate', ['#d800cc', '#f878f8', '#4c0040', '#1c001c']],
  ['node_heart', 'planet', ['#f878f8', '#d800cc', '#f878f8', '#a40080', '#4c0040']],
];

// Faint scenery that scrolls between the two star layers, one per level theme.
function makeScenery(scene: Phaser.Scene, key: string, draw: (ctx: CanvasRenderingContext2D, rand: () => number) => void) {
  const tex = scene.textures.createCanvas(key, W, H)!;
  draw(tex.getContext(), rng(key.length * 131));
  tex.refresh();
}

function makeSceneries(scene: Phaser.Scene) {
  // Scrapyard: dim hull silhouettes with dark window rows.
  makeScenery(scene, 'scenery_scrapyard', (ctx, rand) => {
    for (let i = 0; i < 5; i++) {
      const x = Math.floor(rand() * (W - 40)), y = Math.floor((i / 5) * H + rand() * 30);
      const w = 24 + Math.floor(rand() * 30), h = 8 + Math.floor(rand() * 10);
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(x, y, w, h);
      ctx.fillRect(x + 4, y - 3, w * 0.4, 3);
      ctx.fillRect(x + w, y + 2, 4, h - 4);
      ctx.fillStyle = '#2c2c2c';
      ctx.fillRect(x, y, w, 1);
      ctx.fillStyle = '#0c0c0c';
      for (let k = x + 3; k < x + w - 3; k += 4) ctx.fillRect(k, y + Math.floor(h / 2), 2, 1);
      // A broken end.
      ctx.fillStyle = '#000000';
      for (let k = 0; k < h; k += 2) ctx.fillRect(x + w - 1 - Math.floor(rand() * 4), y + k, 4, 2);
    }
  });
  // Ice ring: diagonal bands of glittering ice specks.
  makeScenery(scene, 'scenery_ice', (ctx, rand) => {
    for (let i = 0; i < 260; i++) {
      const t = rand();
      const band = Math.floor(rand() * 3);
      const x = t * W;
      const y = ((band * H) / 3 + t * 60 + rand() * 18) % H;
      ctx.fillStyle = rand() < 0.08 ? '#3c78a8' : rand() < 0.4 ? '#1c3c6c' : '#14243c';
      ctx.fillRect(Math.floor(x), Math.floor(y), rand() < 0.2 ? 2 : 1, 1);
    }
  });
  // Blockade: far-off capital ships with rows of lights.
  makeScenery(scene, 'scenery_blockade', (ctx, rand) => {
    for (let i = 0; i < 4; i++) {
      const w = 40 + Math.floor(rand() * 40), h = 5 + Math.floor(rand() * 4);
      const x = Math.floor(rand() * (W - w)), y = Math.floor((i / 4) * H + rand() * 40);
      ctx.fillStyle = '#12122a';
      ctx.fillRect(x, y, w, h);
      ctx.fillRect(x + w * 0.3, y - 3, w * 0.25, 3);
      for (let k = 0; k < h / 2; k++) ctx.fillRect(x - k * 2 - 2, y + k + 1, k * 2 + 2, h - k * 2 - 2 > 0 ? h - k * 2 - 2 : 1);
      ctx.fillStyle = '#2c2c3c';
      for (let k = x + 3; k < x + w - 2; k += 5) ctx.fillRect(k, y + 2, 1, 1);
    }
  });
  // Ember Nebula: soft red cloud blobs, dithered.
  makeScenery(scene, 'scenery_nebula', (ctx, rand) => {
    const blobs = Array.from({ length: 6 }, () => [rand() * W, rand() * H, 20 + rand() * 30]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = 0;
      for (const [bx, by, r] of blobs) {
        // Wrap vertically so the tile scrolls without a seam.
        const dy = Math.min(Math.abs(y - by), H - Math.abs(y - by));
        v = Math.max(v, 1 - Math.hypot(x - bx, dy) / r);
      }
      if (v > 0.55 && (x + y) % 2 === 0) { ctx.fillStyle = '#3c0c08'; ctx.fillRect(x, y, 1, 1); }
      else if (v > 0.2 && (x * 3 + y * 5) % 7 === 0) { ctx.fillStyle = '#2c0804'; ctx.fillRect(x, y, 1, 1); }
    }
  });
  // Solar Forge: drifting heat specks.
  makeScenery(scene, 'scenery_forge', (ctx, rand) => {
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = rand() < 0.15 ? '#7c2c00' : '#3c1404';
      ctx.fillRect(Math.floor(rand() * W), Math.floor(rand() * H), rand() < 0.3 ? 2 : 1, 1);
    }
  });
  // Silent Relay: dim girders and dead panels.
  makeScenery(scene, 'scenery_relay', (ctx, rand) => {
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rand() * (W - 30)), y = Math.floor((i / 6) * H + rand() * 20);
      const w = 20 + Math.floor(rand() * 40);
      ctx.fillStyle = '#1c1c24';
      ctx.fillRect(x, y, w, 2);
      for (let k = x; k < x + w; k += 6) { ctx.fillRect(k, y + 2, 1, 5); ctx.fillRect(k + 1, y + 6, 4, 1); }
      ctx.fillStyle = '#10202c';
      if (rand() < 0.6) ctx.fillRect(x + 4, y - 6, 8, 5);
      ctx.fillStyle = '#183c4c';
      if (rand() < 0.4) ctx.fillRect(x + 6, y - 4, 1, 1);
    }
  });
  // Asteroids: a distant field of small dim rocks.
  makeScenery(scene, 'scenery_asteroids', (ctx, rand) => {
    for (let i = 0; i < 28; i++) {
      const x = rand() * W, y = rand() * H, r = 1 + rand() * 4;
      for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        if (dx * dx + dy * dy > r * r) continue;
        ctx.fillStyle = dx + dy < 0 ? '#3c2c14' : '#24180c';
        ctx.fillRect(Math.floor(x + dx), Math.floor(y + dy), 1, 1);
      }
    }
  });
}

export function generateArt(scene: Phaser.Scene) {
  for (const [key, rows] of Object.entries(SPRITES)) makeTexture(scene, key, rows);
  makeTexture(scene, 'mimic', mimicRows(SPRITES.ship));
  generateArt3(scene, (key, rows) => makeTexture(scene, key, rows), (key, r, bands, shadow) => makePlanet(scene, key, r, bands, shadow));
  for (const key of ['ingot1', 'ingot2', 'ingot3', 'ingot4']) makeGlint(scene, key);
  makeRock(scene, 'rock', 9, 8, 7);
  makeRock(scene, 'pebble', 4, 4, 11);
  makeRock(scene, 'boulder', 7, 7, 23, ['#bcbcbc', '#7c7c7c', '#503000', '#2c1800']);
  makeRock(scene, 'rockjaw', 34, 22, 5);
  makeRock(scene, 'frostjaw', 34, 22, 5, ['#fcfcfc', '#a4e4fc', '#3cbcfc', '#0058f8']); // a side mission's icy Rockjaw
  for (const [key, kind, colors] of NODES) makeNode(scene, key, kind, colors);
  makeSceneries(scene);
  makePlanet(scene, 'planet', 34, ['#0058f8', '#3cbcfc', '#0058f8', '#0000bc', '#3cbcfc', '#0058f8', '#0000bc'], '#000058');
  makePlanet(scene, 'moon', 40, ['#5c5c5c', '#4c4c4c', '#5c5c5c', '#4c4c4c', '#2c2c2c'], '#141414', 9);
  makePlanet(scene, 'sun', 46, ['#fcfcfc', '#f8b800', '#fce0a8', '#f8b800', '#fc7460'], '#d82800');
  makeRing(scene, 'bubble', 11, 11);
  makeRing(scene, 'kshield', 14, 11);
  makeRing(scene, 'deflect', 10, 10, ['#fcfcfc', '#9878f8']);
  makeRock(scene, 'shelter', 16, 12, 41, ['#fc7460', '#c84c0c', '#7c2c00', '#4c1800']);
  makeIcePatch(scene);
  makeDreadnought(scene);
  makeStars(scene, 'stars-far', 70, ['#3c3c3c', '#7c7c7c']);
  makeStars(scene, 'stars-near', 25, ['#bcbcbc', '#fcfcfc', '#a4e4fc']);
  generateMenuIcons(scene);
}
