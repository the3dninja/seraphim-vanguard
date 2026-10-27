import Phaser from 'phaser';
import { W, H } from './config';
import { CRATE_GEAR } from './data/items';

// Art for act 3 (levels 9 to 15) and the new weapons, gear and items. Same
// text-grid approach as art.ts; these grids are added to its sprite list.
export const PAL3: Record<string, string> = {
  V: '#6844fc', X: '#3c1c7c', F: '#f878f8', Q: '#a40080', U: '#4c0040', S: '#005800', H: '#b8f818',
};

export const SPRITES3: Record<string, string[]> = {
  // Blink Drive's swap: a four-point sparkle with curved-in sides.
  sparkle: ['...W...', '...W...', '..WWW..', 'WWWWWWW', '..WWW..', '...W...', '...W...'],
  // 360 Burst's pod: a grey sphere with gun holes around it.
  burstpod: [
    '..GGKGG..',
    '.KLWLLGK.',
    'GLWWLLLGG',
    'GLWLLLLGG',
    'KLLLLLGGK',
    'GGLLLGGDG',
    'GGGGGGDDG',
    '.KGDDDDK.',
    '..DDKDD..',
  ],
  // Lightning Round's bolts, flashing along its path.
  lbolt: ['...WY', '..WY.', '.WWWY', '..WY.', '.WY..', 'WY...'],
  // The Hollow.
  spore: [
    '...NNNN...',
    '..NTTTTN..',
    '.NTPTTTTN.',
    'NTTTTPTTTN',
    'NTTTTTTTTN',
    'NTPTTTTPTN',
    'NTTTTTTTTN',
    '.NTTPTTTN.',
    '..NTTTTN..',
    '...NNNN...',
  ],
  seeker: ['.FMF.', 'FMWMF', 'MWWWM', 'FMWMF', '.FMF.'],
  seekerLit: ['.MFM.', 'MFWFM', 'FWWWF', 'MFWFM', '.MFM.'],
  tendril: [
    '.Q.....Q.',
    '.QQ...QQ.',
    '..QFFFQ..',
    '..FMMMF..',
    '..QMWMQ..',
    '..QMMMQ..',
    '...QMQ...',
    '...FMF...',
    '...QMQ...',
    '....M....',
    '...QMQ...',
    '....M....',
    '....F....',
    '....W....',
  ],
  brood: [
    '....U...........U....',
    '...UQ...QQQQQ...QU...',
    '..UQ..QQFFFFFQQ..QU..',
    '.UQ..QFFMMMMMFFQ..QU.',
    '.Q..QFMMTMMMTMMFQ..Q.',
    '....QFMMMMMMMMMFQ....',
    '...QFMMTMMWMMTMMFQ...',
    '...QFMMMMMMMMMMMFQ...',
    '...QFMMTMMMMMTMMFQ...',
    '....QFMMMMMMMMMFQ....',
    '.Q..QQFMMTMMMFQQ..Q..',
    '.UQ...QQFFFFFQQ...QU.',
    '..UQ....QQQQQ....QU..',
    '...UQ...........QU...',
    '....U...........U....',
  ],
  husk: [
    '....GGGGGGGGG....',
    '..GGLLLLLLLLLGG..',
    '.GLLDDTTDDDDDLLG.',
    'GLLDTTNTDDVVDDLLG',
    'GLDDDTTDDVVVVDDLG',
    'GLDDDDDDDDVVDDDLG',
    '.GLDDNTDDDDDDTLG.',
    '..GLDTTNDDDDTTG..',
    '..GGLDDDDDDDLGG..',
    '...GQGLDDDLGQG...',
    '...Q..GGGGG..Q...',
    '...Q....T....Q...',
    '..T.....N.....T..',
    '........T........',
  ],
  // Level 15: eggs that hatch into larvae, and the Brood Wyrm and Sporeheart parts.
  egg: ['..QQQQ..', '.QFFFFQ.', 'QFFMMFFQ', 'QFMTTMFQ', 'QFMTTMFQ', 'QFFMMFFQ', 'QFFFFFFQ', '.QFFFFQ.', '..QQQQ..'],
  eggLit: ['..QQQQ..', '.QMMMMQ.', 'QMMFFMMQ', 'QMFWWFMQ', 'QMFWWFMQ', 'QMMFFMMQ', 'QMMMMMMQ', '.QMMMMQ.', '..QQQQ..'],
  larva: ['.T...T.', '..TNT..', '.NTTTN.', 'NTRKRTN', '.NTTTN.', '..NTN..', '...N...'],
  larvaLit: ['T.....T', '.T.N.T.', '.NTTTN.', 'NTRKRTN', '.NTTTN.', '.N.T.N.', '...N...'],
  wyrmhead: [
    '...QQQQQQQ...',
    '..QFFFFFFFQ..',
    '.QFMMMMMMMFQ.',
    'QFMMTMMMTMMFQ',
    'QFMWRMMMRWMFQ',
    'QFMMMMMMMMMFQ',
    '.QFMMMMMMMFQ.',
    '.QFFMMMMMFFQ.',
    '..QW.KKK.WQ..',
    '..W..KKK..W..',
    '.W.........W.',
  ],
  wyrmseg: ['..QQQQQ..', '.QFFFFFQ.', 'QFMMMMMFQ', 'QFMUMUMFQ', 'QFMMMMMFQ', 'QFMUMUMFQ', 'QFMMMMMFQ', '.QFFFFFQ.', '..QQQQQ..'],
  petal: [
    '....S....',
    '...SNS...',
    '..SNTNS..',
    '..SNTNS..',
    '.SNTHTNS.',
    '.SNTHTNS.',
    '.SNTHTNS.',
    '.SNTHTNS.',
    '.SNTTTNS.',
    '..SNTNS..',
    '..SNTNS..',
    '...SNS...',
    '....S....',
  ],
  eye: ['..FFF..', '.FWWWF.', 'FWWKWWF', 'FWKRKWF', 'FWWKWWF', '.FWWWF.', '..FFF..'],

  // Wingmen in act 3: Vex the Raider, and freed Vossari pilots.
  vex: [
    '.....W.....',
    '....RYR....',
    '...RRYRR...',
    'R..RRRRR..R',
    'RR.RDKDR.RR',
    'RRRRRRRRRRR',
    'R.RRRRRRR.R',
    '...O...O...',
    '...Y...Y...',
  ],
  ally: [
    '.....P.....',
    '....PCP....',
    '...PPCPP...',
    'P.VPPPPPV.P',
    'PVVPLLLPVVP',
    'PPPPPPPPPPP',
    '.P.VPPPV.P.',
    '...C...C...',
  ],
  ally2: [
    '.....V.....',
    '....VTV....',
    '...VVTVV...',
    'V.XVVVVVX.V',
    'VXXVLLLVXXV',
    'VVVVVVVVVVV',
    '.V.XVVVX.V.',
    '...T...T...',
  ],

  // Player shots for the new weapons.
  laser: ['W', 'R', 'R', 'R', 'R'],
  missile: ['.W.', 'GLG', 'GLG', 'GLG', 'R.R', 'Y.Y'],
  blob: ['.TTTT.', 'TTWWTT', 'TWWTTT', 'TTTTTN', 'TTTTNN', '.NNNN.'],
  arc: ['.W.', 'C..', '.C.', '..C', '.C.', 'C..'],
  // Ion Arc from level 3, thicker and brighter, and brighter again at level 5.
  arc3: ['.WW.', 'CA..', '.CA.', '..AC', '.CA.', 'CA..'],
  arc5: ['..WW.', '.WAC.', 'CWA..', '.CWA.', '..AWC', '.CWA.', 'CWA..'],
  wavebolt: ['.R.', 'RWR', '.R.'],
  rail: ['.W.', 'AWA', 'AWA', 'AWA', 'AWA', 'AWA', 'AWA', 'AWA', 'AWA', 'AWA', 'AWA', '.A.'],
  flak: ['.YY.', 'YWWY', 'YWWY', '.YY.'],
  shrap: ['YO', 'OY'],
  sidebolt: ['W', 'L', 'L'],
  sidemissile: ['W', 'L', 'L', 'Y'], // Side Winder missile: thin, with a hot tail
  sporeshot: ['.TN.', 'TWTN', 'NTTN', '.NN.'],
  bomblet: ['.GG.', 'GDDG', 'GDRG', '.GG.'],
  allyion: ['C', 'A', 'C'],
  allyplasma: ['TT', 'NN'],
  flare: ['..Y..', '.YWY.', 'YWWWY', '.YWY.', '..Y..'],
  healdrone: ['.T.T.', 'TTWTT', '.TTT.', '..T..'],

  // Weapon icons.
  icon_twin: ['..W..W..', '..R..R..', '..R..R..', '..R..R..', '........', '..W..W..', '..R..R..', '..R..R..'],
  icon_homing: ['...W....', '..GLG...', '..GLG...', '..GLG...', '.GGLGG..', '..R.R...', '..Y.Y...', '........'],
  icon_plasma: ['..TTTT..', '.TTWWTT.', '.TWWTTT.', '.TTTTTN.', '.TTTTNN.', '..NNNN..', '........', '........'],
  icon_ion: ['....C...', '...C....', '..CCC...', '...C....', '..C.....', '.CCC....', '..C.....', '.C......'],
  icon_wave: ['.R......', '..R.....', '...R....', '..R.....', '.R......', '..R.....', '...R....', '..R.....'],
  icon_rail: ['...W....', '...A....', '..AWA...', '...A....', '...A....', '..CWC...', '.C.C.C..', '...C....'],
  icon_flak: ['..Y.Y...', '.Y.Y.Y..', '..YWY...', '.YYWYY..', '..YWY...', '...Y....', '...G....', '..GGG...'],
  icon_side: ['........', '........', 'WYY..YYW', '........', '...CC...', '..CCCC..', '........', '........'],
  icon_rear: ['...CC...', '..CCCC..', '........', '...R....', '...R....', '...R....', '...W....', '........'],
  icon_bio: ['.T....T.', '..T..T..', '...NN...', '..NTTN..', '..NTTN..', '...NN...', '..T..T..', '.T....T.'],

  // Gear icons.
  icon_dodge: ['........', '.CC.....', 'CCCC.W..', '.CC.WWW.', '....WWWW', '.CC.WWW.', 'CCCC.W..', '.CC.....'],
  icon_blink: ['P......P', '.P....P.', '..PWWP..', '..WCCW..', '..WCCW..', '..PWWP..', '.P....P.', 'P......P'],
  icon_afterburner: ['...LL...', '..LLLL..', '..LBBL..', '..LLLL..', '..OYYO..', '..ROOR..', '...RR...', '...R....'],
  icon_roll: ['..CCCC..', '.C....C.', 'C..WW..C', 'C.W..W.C', 'C.W..W.C', 'C..WW...', '.C....C.', '..CCC.C.'],
  icon_burst: ['Y..Y..Y.', '.Y.Y.Y..', '..YWY...', 'YYWWWYY.', '..YWY...', '.Y.Y.Y..', 'Y..Y..Y.', '........'],
  icon_antimissile: ['......W.', '.....W..', '....W...', '..LLL...', '.LDDDL..', 'LLLLLLL.', 'LDDDDDL.', 'LLLLLLL.'],
  icon_incendiary: ['...R....', '..RO....', '..ROR...', '.ROYOR..', '.RYWYR..', '.ROYOR..', '..ROR...', '...R....'],
  icon_ioncoat: ['C.C.C.C.', '.CCCCC..', 'C.RRR.C.', '.CRWRC..', 'C.RRR.C.', '.CCCCC..', 'C.C.C.C.', '........'],
  icon_shaped: ['...YY...', '..YWWY..', '.YYYYYY.', '..GGGG..', '..GDDG..', '..GDDG..', '..GGGG..', '........'],
  icon_overcharge: ['...Y....', '..YY....', '.YWY....', 'YWWYYYY.', '.YYYWWY.', '....YWY.', '....YY..', '....Y...'],
  icon_scanner: ['.TTTTT..', 'T.....T.', 'T..T..T.', 'T.TTT.T.', 'T..T..T.', 'T.....T.', '.TTTTT..', '........'],
  icon_nullifier: ['..PPPP..', '.P....P.', 'P....W.P', 'P...W..P', 'P..W...P', 'P.W....P', '.P....P.', '..PPPP..'],
  icon_redirect: ['...F....', '..FWF...', '.F.W.F..', '...W....', 'F..W..F.', '.F.W.F..', '..FFF...', 'F.....F.'],
  icon_radar: ['..TTTT..', '.T....T.', 'T..TT..T', 'T.T..WT.', 'T.T.T..T', 'T..TT..T', '.T....T.', '..TTTT..'],
  icon_lightning: ['....YW..', '...YW...', '..YW....', '.YWWWY..', '...YW...', '..YW....', '.YW.....', 'YW......'],
  icon_cargo: ['.ffffff.', 'fbbbbbbf', 'fbbbTbbf', 'fbbTTTbf', 'fbbbTbbf', 'fbbbbbbf', 'feeeeeef', '.ffffff.'],

  // Item icons.
  icon_cluster: ['.G.G.G..', 'GDGDGDG.', '.G.G.G..', '........', '..GGG...', '.GDDDG..', '.GDRDG..', '..GGG...'],
  icon_emp: ['..CCCC..', '.C....C.', 'C..AA..C', 'C.AWWA.C', 'C.AWWA.C', 'C..AA..C', '.C....C.', '..CCCC..'],
  icon_decoy: ['...Y....', '..YWY...', '.YWWWY..', '..YWY...', '...Y....', '...O....', '..O.O...', '...O....'],
  icon_booster: ['..qqqq..', '.qWqqqz.', 'YYYYYzz.', 'YYYYYz..', 'jjjjj...', '....T...', '...TTT..', '....T...'],
  icon_drone: ['.T....T.', '.TTTTTT.', '..TWWT..', '..TTTT..', '...TT...', '........', '...T....', '..TTT...'],
  icon_fullrepair: ['...YY...', '...YY...', 'YYYWWYYY', 'YYWWWWYY', '...YY...', '...YY...', '...YY...', '........'],
  icon_nova: ['W..W..W.', '.W.W.W..', '..WWW...', 'WWWYWWW.', '..WWW...', '.W.W.W..', 'W..W..W.', '........'],
  icon_warp: ['.PPPPP..', '.P...P..', '..PWP...', '...W....', '..PWP...', '.P.W.P..', '.PPPPP..', '........'],
  icon_rewind: ['..CCC...', '.C...C..', 'C.....C.', 'C..W..C.', 'CC.WW.C.', '.C..W...', 'CCC.....', '........'],
  icon_wkit: ['.LLLLLL.', 'LGGGGGGL', 'LG.W..GL', 'LGYYY.GL', 'LG.Y..GL', 'LG.Y..GL', 'LGGGGGGL', '.LLLLLL.'],
  icon_gkit: ['.LLLLLL.', 'LGGGGGGL', 'LG.W..GL', 'LGPPP.GL', 'LG.P..GL', 'LG.P..GL', 'LGGGGGGL', '.LLLLLL.'],
};

// A Mimic is the player's own ship, recolored and turned to face down.
// A supply crate (14 x 14): a steel pod with rivets, a gear's 8 x 8 icon on
// its dark panel, and lights top and bottom (red lit, dark off: they blink).
function crateRows(icon: string[], light: string) {
  const rows = [
    'GGGGGGaaGGGGGG',
    'GDhhhhhhhhhhDG',
    'GLDDDDDDDDDDLG',
    ...Array.from({ length: 8 }, (_, i) => `GLD${icon[i]}DLG`.replace(/\./g, 'K')),
    'GLDDDDDDDDDDLG',
    'GDDDDDDDDDDDDG',
    'GGGGGGaaGGGGGG',
  ];
  return rows.map((r) => r.replace(/a/g, light));
}

export function mimicRows(ship: string[]) {
  const swap: Record<string, string> = { B: 'Q', C: 'F', A: 'M', R: 'T', Y: 'N' };
  return ship.map((r) => [...r].map((c) => swap[c] ?? c).join('')).reverse();
}

type Px = (x: number, y: number, c: string) => void;

function canvas(scene: Phaser.Scene, key: string, w: number, h: number, draw: (px: Px, ctx: CanvasRenderingContext2D) => void) {
  const tex = scene.textures.createCanvas(key, w, h)!;
  const ctx = tex.getContext();
  draw((x, y, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, 1, 1); }, ctx);
  tex.refresh();
}

function rng(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
}

// Emperor Voss's flagship, nose down, and the cracked wreck left when the parasite bursts out.
function makeVossShip(scene: Phaser.Scene, key: string, hull: string[], wreck: boolean) {
  const w = 56, h = 30;
  canvas(scene, key, w, h, (px) => {
    const rand = rng(91);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = Math.abs(x - w / 2 + 0.5);
        // Swept wings across the back half, a long body tapering to the nose.
        const body = dx < 9 - (y / h) * 7 && y < h - 1;
        const wing = y > 3 && y < 16 && dx < 27 - (y - 3) * 1.2 && dx > 4;
        if (!body && !wing) continue;
        let c = hull[1];
        if (body && dx < 2 && y > 6) c = hull[0];
        else if (wing && (y === 4 || dx > 24 - (y - 3) * 1.2)) c = hull[0];
        else if ((x + y) % 7 === 0) c = hull[2];
        if (body && y > 9 && y < 13 && dx < 3) c = wreck ? '#000000' : '#f8b800';
        if (wing && y === 10 && dx > 10 && dx < 22 && x % 3 === 0) c = wreck ? hull[2] : '#3cbcfc';
        if (wreck && rand() < 0.12) c = rand() < 0.5 ? '#000000' : '#58d854';
        px(x, y, c);
      }
    }
    // Engines on the back edge.
    if (!wreck) for (const ex of [w / 2 - 7, w / 2 + 6, w / 2 - 15, w / 2 + 14]) { px(ex, 2, '#f8b800'); px(ex, 3, '#fc7460'); }
  });
}

// An organic blob with tentacles and an eye: the Hollow parasite and the Brood Queen.
function makeCreature(scene: Phaser.Scene, key: string, w: number, h: number, colors: string[], eyes: number, seed: number) {
  canvas(scene, key, w, h, (px) => {
    const rand = rng(seed);
    const cx = w / 2, cy = h * 0.42, rx = w * 0.32, ry = h * 0.36;
    // Tentacles hanging below.
    for (let t = 0; t < 5; t++) {
      const bx = cx + (t - 2) * (w * 0.14);
      for (let y = Math.floor(cy); y < h; y++) {
        const x = Math.round(bx + Math.sin(y * 0.5 + t) * 2);
        px(x, y, colors[2]);
        if (y < h - 3) px(x + 1, y, colors[1]);
      }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot((x - cx + 0.5) / rx, (y - cy + 0.5) / ry) + Math.sin(Math.atan2(y - cy, x - cx) * 5) * 0.06;
        if (d > 1) continue;
        let c = d > 0.85 ? colors[2] : d > 0.6 ? colors[1] : colors[0];
        if (d < 0.85 && rand() < 0.05) c = colors[3];
        px(x, y, c);
      }
    }
    // Eyes.
    for (let i = 0; i < eyes; i++) {
      const ex = Math.round(cx + (i - (eyes - 1) / 2) * 7), ey = Math.round(cy + (i % 2) * 2);
      for (const [ox, oy, c] of [[0, 0, '#fcfcfc'], [1, 0, '#fcfcfc'], [0, 1, '#fcfcfc'], [1, 1, '#d82800'], [-1, 0, '#000000'], [2, 1, '#000000']] as const) {
        px(ex + ox, ey + oy, c);
      }
    }
  });
}

// The Hollow Mind: a folded, brain-like core.
function makeMindCore(scene: Phaser.Scene) {
  const w = 40, h = 36;
  canvas(scene, 'mindcore', w, h, (px) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - w / 2 + 0.5) / (w / 2), ny = (y - h / 2 + 0.5) / (h / 2);
        const d = Math.hypot(nx, ny);
        if (d > 1) continue;
        const fold = Math.sin(nx * 9 + Math.sin(ny * 6) * 2) + Math.sin(ny * 11 + nx * 3);
        let c = fold > 0.9 ? '#fcfcfc' : fold > 0.2 ? '#f878f8' : fold > -0.6 ? '#d800cc' : '#a40080';
        if (d > 0.9) c = '#4c0040';
        if (Math.abs(nx) < 0.05 && d < 0.9) c = '#4c0040'; // the split between halves
        px(x, y, c);
      }
    }
  });
}

// The Hollow Mind split open (phase 4): the folds peel back into a maw ringed
// with teeth, and a huge slit-pupiled eye stares out of it.
function makeMindMaw(scene: Phaser.Scene) {
  const w = 44, h = 40;
  canvas(scene, 'mindmaw', w, h, (px) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - w / 2 + 0.5) / (w / 2), ny = (y - h / 2 + 0.5) / (h / 2);
        const d = Math.hypot(nx, ny);
        if (d > 1) continue;
        const maw = Math.hypot(nx / 0.78, ny / 0.9); // the opening
        let c: string;
        if (maw < 0.82) c = maw < 0.6 ? '#1c0004' : '#4c0010';
        else if (maw < 0.95) {
          // Teeth around the rim, pointing inward.
          const a = Math.atan2(ny, nx);
          const tooth = Math.abs(Math.sin(a * 9)) > 0.45 - (0.95 - maw) * 3;
          c = tooth ? '#fcfcfc' : '#881400';
        } else {
          const fold = Math.sin(nx * 9 + Math.sin(ny * 6) * 2) + Math.sin(ny * 11 + nx * 3);
          c = fold > 0.6 ? '#f878f8' : fold > -0.4 ? '#d82800' : '#881400';
          if (d > 0.93) c = '#4c0010';
        }
        px(x, y, c);
      }
    }
    // The eye.
    const cx = w / 2 - 0.5, cy = h / 2 - 0.5;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const e = Math.hypot((x - cx) / 9, (y - cy) / 6.5);
        if (e > 1) continue;
        const iris = Math.hypot((x - cx) / 5, (y - cy) / 5.5);
        let c = '#fce0a8';
        if (iris < 1) c = iris < 0.75 ? '#f8b800' : '#d82800';
        if (Math.abs(x - cx) < 1 && iris < 0.95) c = '#000000';
        if (e > 0.85) c = '#881400';
        px(x, y, c);
      }
    }
  });
}

// The Sporeheart's core: a swollen, glowing pod veined with purple.
function makeSporeheart(scene: Phaser.Scene) {
  const w = 26, h = 24;
  canvas(scene, 'sporeheart', w, h, (px) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const nx = (x - w / 2 + 0.5) / (w / 2), ny = (y - h / 2 + 0.5) / (h / 2);
        const d = Math.hypot(nx, ny) + Math.sin(Math.atan2(ny, nx) * 7) * 0.05;
        if (d > 1) continue;
        const vein = Math.abs(Math.sin(nx * 8 + ny * 3) + Math.sin(ny * 7 - nx * 2)) < 0.18;
        let c = d < 0.28 ? '#fcfcfc' : d < 0.45 ? '#b8f818' : d < 0.7 ? '#58d854' : '#00a800';
        if (vein && d > 0.35) c = '#a40080';
        if (d > 0.88) c = '#005800';
        px(x, y, c);
      }
    }
  });
}

// Level 15's haze: drifting veils of spores laid over the action.
function makeFog(scene: Phaser.Scene) {
  canvas(scene, 'fog', W, H, (px) => {
    const rand = rng(29);
    const blobs = Array.from({ length: 16 }, () => [rand() * W, rand() * H, 18 + rand() * 30]);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let v = 0;
        for (const [bx, by, r] of blobs) {
          const dy = Math.min(Math.abs(y - by), H - Math.abs(y - by)); // wraps top to bottom
          v = Math.max(v, 1 - Math.hypot(x - bx, dy) / r);
        }
        if (v > 0.5 && (x + y) % 2 === 0) px(x, y, '#b8d8a8');
        else if (v > 0.15 && (x + y * 3) % 4 === 0) px(x, y, '#88a878');
      }
    }
  });
}

// A dotted ring: the Voss shield and the Hollow Mind's membrane.
function makeRing3(scene: Phaser.Scene, key: string, rx: number, ry: number, colors: string[], thick = 1.2) {
  canvas(scene, key, rx * 2 + 1, ry * 2 + 1, (px) => {
    for (let y = 0; y <= ry * 2; y++) {
      for (let x = 0; x <= rx * 2; x++) {
        const d = Math.hypot((x - rx) / rx, (y - ry) / ry);
        if (d > 1 - thick / Math.min(rx, ry) && d <= 1.02) px(x, y, (x + y) % 3 === 0 ? colors[0] : colors[1]);
      }
    }
  });
}

// Level 13's dark: black everywhere but a pool of light around the ship.
function makeDarkness(scene: Phaser.Scene) {
  const w = W * 2, h = H * 2;
  canvas(scene, 'darkness', w, h, (px) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.hypot(x - w / 2, y - h / 2);
        if (d < 44) continue;
        if (d < 58 && ((x + y) % 2 === 0 || (d < 50 && (x * 3 + y) % 4 !== 0))) continue;
        px(x, y, '#000000');
      }
    }
  });
}

// A soft cloud of spores that hides whatever flies inside it.
function makeSporeCloud(scene: Phaser.Scene) {
  const w = 84, h = 58;
  canvas(scene, 'sporecloud', w, h, (px) => {
    const rand = rng(17);
    const blobs = Array.from({ length: 7 }, () => [w * 0.2 + rand() * w * 0.6, h * 0.25 + rand() * h * 0.5, 12 + rand() * 12]);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let v = 0;
        for (const [bx, by, r] of blobs) v = Math.max(v, 1 - Math.hypot(x - bx, y - by) / r);
        if (v <= 0) continue;
        if (v > 0.35) px(x, y, (x + y) % 5 === 0 ? '#58d854' : (x * 2 + y) % 7 === 0 ? '#9878f8' : '#005800');
        else if ((x + y) % 2 === 0) px(x, y, '#003800');
      }
    }
  });
}

// Faint scenery that scrolls behind the action, one per act 3 locale. Tiles
// wrap vertically, so features near the top and bottom edges join up.
function makeScenery3(scene: Phaser.Scene, key: string, draw: (px: Px, rand: () => number) => void) {
  canvas(scene, key, W, H, (px) => draw(px, rng(key.length * 131 + 7)));
}

const wrapDy = (y: number, by: number) => Math.min(Math.abs(y - by), H - Math.abs(y - by));

// Hollow space's weird purple star: a pale core, purple bands crawling with
// green blotches, and a ragged dithered corona.
function makePurpleStar(scene: Phaser.Scene) {
  const r = 13, size = 44, c = size / 2;
  canvas(scene, 'purplestar', size, size, (px) => {
    const rand = rng(53);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c + 0.5, y - c + 0.5);
      const a = Math.atan2(y - c, x - c);
      if (d <= r) {
        const band = Math.sin(d * 0.9 + Math.sin(a * 3) * 1.5);
        let col = d < 4 ? '#fcfcfc' : d < 7 ? '#f878f8' : band > 0.3 ? '#d800cc' : band > -0.4 ? '#9878f8' : '#6844fc';
        if (d > 5 && rand() < 0.07) col = rand() < 0.5 ? '#58d854' : '#005800';
        px(x, y, col);
      } else {
        // The corona reaches further in some directions than others.
        const reach = r + 4 + Math.sin(a * 5) * 2 + Math.sin(a * 2 + 1) * 2;
        if (d <= reach && (x + y) % 2 === 0) px(x, y, d < r + 2.5 ? '#a40080' : '#3c1c7c');
        else if (d <= reach + 3 && (x * 3 + y) % 5 === 0) px(x, y, '#3c1c7c');
      }
    }
  });
}

// A purple-green nebula, dithered thin so it sits far back.
function makeHollowNebula(scene: Phaser.Scene) {
  const w = 150, h = 120;
  canvas(scene, 'hollownebula', w, h, (px) => {
    const rand = rng(77);
    const puffs = Array.from({ length: 9 }, () => [20 + rand() * (w - 40), 20 + rand() * (h - 40), 14 + rand() * 22, rand()]);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = 0, green = 0;
      for (const [bx, by, r, k] of puffs) {
        const f = Math.max(0, 1 - Math.hypot(x - bx, (y - by) * 1.2) / r);
        v += f;
        green += f * k;
      }
      if (v <= 0.15) continue;
      const g = green / v > 0.55;
      if (v > 0.9 && (x + y) % 2 === 0) px(x, y, g ? '#1c4c1c' : '#3c1c5c');
      else if (v > 0.45 && (x + y * 3) % 4 === 0) px(x, y, g ? '#143414' : '#2c1444');
      else if ((x * 5 + y * 3) % 9 === 0) px(x, y, g ? '#0c240c' : '#1c0c2c');
    }
  });
}

function makeSceneries3(scene: Phaser.Scene) {
  // Blight Colony: fungal blotches in sick green and purple.
  makeScenery3(scene, 'scenery_blight', (px, rand) => {
    const blobs = Array.from({ length: 8 }, () => [rand() * W, rand() * H, 14 + rand() * 24, rand() < 0.5 ? 1 : 0]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      for (const [bx, by, r, k] of blobs) {
        const v = 1 - Math.hypot(x - bx, wrapDy(y, by)) / r;
        if (v > 0.5 && (x + y) % 2 === 0) { px(x, y, k ? '#0c2808' : '#1c0c2c'); break; }
        if (v > 0.15 && (x * 3 + y * 5) % 9 === 0) { px(x, y, k ? '#081c04' : '#140820'); break; }
      }
    }
  });
  // Throne of Voss: station walls down both sides with rows of lights.
  makeScenery3(scene, 'scenery_throne', (px, rand) => {
    for (let y = 0; y < H; y++) {
      const lw = 14 + Math.round(Math.sin((y / H) * Math.PI * 4) * 4), rw = 14 + Math.round(Math.cos((y / H) * Math.PI * 4) * 4);
      for (let x = 0; x < lw; x++) px(x, y, y % 24 === 0 ? '#2c1c4c' : '#140c24');
      for (let x = W - rw; x < W; x++) px(x, y, y % 24 === 12 ? '#2c1c4c' : '#140c24');
      if (y % 12 === 0) { px(lw - 3, y, '#3c2c6c'); px(W - rw + 2, y, '#3c2c6c'); }
    }
    for (let i = 0; i < 40; i++) px(Math.floor(30 + rand() * (W - 60)), Math.floor(rand() * H), '#1c1434');
  });
  // The Rift: warped bands of purple and magenta.
  makeScenery3(scene, 'scenery_rift', (px) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = Math.sin(x * 0.05 + Math.sin((y / H) * Math.PI * 2 * 3) * 2) + Math.sin((y / H) * Math.PI * 2 * 2 + x * 0.02);
      if (v > 1.4 && (x + y) % 2 === 0) px(x, y, '#3c1c7c');
      else if (v > 0.9 && (x + y) % 2 === 0) px(x, y, '#24104c');
      else if (v < -1.3 && (x * 3 + y) % 4 === 0) px(x, y, '#3c0c3c');
    }
  });
  // Hollow space, out of the rift: sickly purple and green blotches webbed with veins.
  makeScenery3(scene, 'scenery_beyond', (px, rand) => {
    const blobs = Array.from({ length: 10 }, () => [rand() * W, rand() * H, 12 + rand() * 22, rand() < 0.5 ? 1 : 0]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      for (const [bx, by, r, k] of blobs) {
        const v = 1 - Math.hypot(x - bx, wrapDy(y, by)) / r;
        if (v > 0.55 && (x + y) % 2 === 0) { px(x, y, k ? '#142c10' : '#24102c'); break; }
        if (v > 0.2 && (x * 3 + y * 5) % 7 === 0) { px(x, y, k ? '#0c1c08' : '#180a20'); break; }
      }
    }
    for (let i = 0; i < 12; i++) {
      let x = rand() * W, y = rand() * H, a = rand() * Math.PI * 2;
      for (let s = 0; s < 50; s++) {
        a += (rand() - 0.5) * 0.7;
        x += Math.cos(a);
        y += Math.sin(a);
        if (x < 0 || x >= W) break;
        px(Math.round(x), ((Math.round(y) % H) + H) % H, s % 7 === 0 ? '#3c0c3c' : '#200820');
      }
    }
  });
  // Hive Reef: branching coral growing in from the edges.
  makeScenery3(scene, 'scenery_reef', (px, rand) => {
    for (let i = 0; i < 14; i++) {
      const left = i % 2 === 0;
      let x = left ? 0 : W - 1, y = rand() * H;
      for (let s = 0; s < 40; s++) {
        x += (left ? 1 : -1) * (0.5 + rand());
        y += (rand() - 0.5) * 3;
        const yy = ((Math.round(y) % H) + H) % H;
        px(Math.round(x), yy, s % 5 === 0 ? '#4c0040' : '#3c0c1c');
        px(Math.round(x), (yy + 1) % H, '#2c0814');
      }
    }
  });
  // Black Bloom: near-black, with glowing flora here and there.
  makeScenery3(scene, 'scenery_bloom', (px, rand) => {
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(rand() * W), y = Math.floor(rand() * H);
      const c = rand() < 0.5 ? '#1c6c2c' : '#0c4c5c';
      px(x, y, c);
      px(x - 1, y, '#0c2c14'); px(x + 1, y, '#0c2c14'); px(x, (y + 1) % H, '#0c2c14'); px(x, (y + H - 1) % H, c);
    }
  });
  // Maw Gate: vast arcs of the living gate and far-off ships.
  makeScenery3(scene, 'scenery_gate', (px, rand) => {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const d = Math.hypot(x - W / 2, wrapDy(y, H / 2) * 0.6);
      if (Math.abs(d - 110) < 3 && (x + y) % 2 === 0) px(x, y, '#2c0828');
      if (Math.abs(d - 70) < 2 && (x * 3 + y) % 3 === 0) px(x, y, '#1c0418');
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(rand() * (W - 20)), y = Math.floor(rand() * H);
      for (let k = 0; k < 10; k++) px(x + k, y, '#141c34');
      px(x + 3, y - 1, '#141c34');
    }
  });
  // Heart of the Hollow: veins everywhere.
  makeScenery3(scene, 'scenery_heart', (px, rand) => {
    for (let i = 0; i < 18; i++) {
      let x = rand() * W, y = rand() * H, a = rand() * Math.PI * 2;
      for (let s = 0; s < 70; s++) {
        a += (rand() - 0.5) * 0.6;
        x += Math.cos(a);
        y += Math.sin(a);
        if (x < 0 || x >= W) break;
        px(Math.round(x), ((Math.round(y) % H) + H) % H, s % 9 === 0 ? '#4c0c1c' : '#2c0410');
      }
    }
  });
  // Past the tunnel: pale veils and floating spores.
  makeScenery3(scene, 'scenery_mist', (px, rand) => {
    for (let i = 0; i < 9; i++) {
      const cx = rand() * W, cy = rand() * H, r = 20 + rand() * 30;
      for (let y = -r; y < r; y++) {
        for (let x = -r; x < r; x++) {
          if (Math.hypot(x, y * 1.6) > r || (x + y) % 3 !== 0) continue;
          const xx = Math.round(cx + x);
          if (xx >= 0 && xx < W) px(xx, ((Math.round(cy + y) % H) + H) % H, '#16241a');
        }
      }
    }
    for (let i = 0; i < 70; i++) px(Math.floor(rand() * W), Math.floor(rand() * H), rand() < 0.3 ? '#3c5c3c' : '#24341c');
  });
}

export function generateArt3(scene: Phaser.Scene, makeTexture: (key: string, rows: string[]) => void,
  makePlanet: (key: string, r: number, bands: string[], shadow: string) => void) {
  for (const [key, rows] of Object.entries(SPRITES3)) makeTexture(key, rows);
  for (const gear of CRATE_GEAR) {
    makeTexture(`crate_${gear}`, crateRows(SPRITES3[`icon_${gear}`], 'R'));
    makeTexture(`crate_${gear}_off`, crateRows(SPRITES3[`icon_${gear}`], 'D'));
  }
  makeVossShip(scene, 'vossship', ['#9878f8', '#6844fc', '#3c1c7c'], false);
  makeVossShip(scene, 'vosswreck', ['#7c7c7c', '#3c3c3c', '#1c1c1c'], true);
  makeCreature(scene, 'parasite', 36, 26, ['#58d854', '#00a800', '#005800', '#d800cc'], 1, 3);
  makeCreature(scene, 'queen', 42, 28, ['#f878f8', '#d800cc', '#a40080', '#58d854'], 3, 9);
  makeMindCore(scene);
  makeMindMaw(scene);
  makeSporeheart(scene);
  makeFog(scene);
  makeRing3(scene, 'vshield', 32, 18, ['#fcfcfc', '#9878f8']);
  makeRing3(scene, 'membrane', 23, 21, ['#f878f8', '#a40080'], 2.5);
  makeDarkness(scene);
  makeSporeCloud(scene);
  makeSceneries3(scene);
  makePurpleStar(scene);
  makeHollowNebula(scene);
  makePlanet('blightworld', 26, ['#58d854', '#9878f8', '#00a800', '#6844fc'], '#1c1c3c');
  // Side mission moons on the star map: small, each colored for its locale.
  const moons: [string, string[], string][] = [
    ['moon_rust', ['#fca044', '#c84c0c', '#7c2c00'], '#4c1800'],
    ['moon_frost', ['#fcfcfc', '#a4e4fc', '#3cbcfc'], '#0058f8'],
    ['moon_glacier', ['#a4e4fc', '#3cbcfc', '#bcbcbc'], '#3c3c7c'],
    ['moon_storm', ['#f8b800', '#d82800', '#fc7460'], '#4c0010'],
    ['moon_relay', ['#bcbcbc', '#7c7c7c', '#3cbcfc'], '#3c3c3c'],
    ['moon_eclipse', ['#3c3c3c', '#7c7c7c', '#3c3c3c'], '#000000'],
    ['moon_armory', ['#9878f8', '#6844fc', '#f8b800'], '#3c1c7c'],
    ['moon_drift', ['#58d854', '#3cbcfc', '#00a800'], '#005800'],
    ['moon_mirror', ['#fcfcfc', '#9878f8', '#3c1c7c'], '#1c1c3c'],
    ['moon_nursery', ['#f878f8', '#d800cc', '#58d854'], '#4c0040'],
  ];
  for (const [key, bands, shadow] of moons) makePlanet(key, 6, bands, shadow);
}
