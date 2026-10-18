import Phaser from 'phaser';

// Picture icons for the Base menu tiles, drawn from text grids like the rest
// of the art. They use their own palette, which has a few darker NES colors
// (navy, teal, crimson, deep purple) the sprite palette doesn't.
const PAL: Record<string, string> = {
  K: '#000000', D: '#3c3c3c', G: '#7c7c7c', L: '#bcbcbc', W: '#fcfcfc',
  B: '#0058f8', n: '#000058', C: '#3cbcfc', A: '#a4e4fc', s: '#004058',
  R: '#d82800', r: '#881400', x: '#a80020', O: '#fc7460', Y: '#f8b800', y: '#fce0a8', j: '#ac7c00',
  M: '#d800cc', v: '#440064', T: '#58d854', N: '#00a800', g: '#005800',
};

const ICONS: Record<string, string[]> = {
  // A parts shop: a bomb and missiles standing on the floor, a blaster and
  // power cells on the back wall, under a neon ARMS sign.
  iconShop: [
    'nsssssssnssssCCCCCCCCCCCCCCCCCCC',
    'nsssssssnssssCKKKKKKKKKKKKKKKKKC',
    'nsssssssnssssCKKAKKAAKKAKAKAAAKC',
    'nsssssssnssssCKAKAKAKAKAAAKAKKKC',
    'nsssssssnssssCKAAAKAAKKAAAKAAAKC',
    'nssssYssnssssCKAKAKAKAKAKAKKKAKC',
    'nssssWssnssssCKAKAKAKAKAKAKAAAKC',
    'nsssYYYsnssssCKKKKKKKKKKKKKKKKKC',
    'nssYYYYYnssssCCCCCCCCCCCCCCCCCCC',
    'nssYYYYYnssssssCnCsCsCsCnCsCsCss',
    'nsNWNNNggsssssssnssssGssnsssGsss',
    'nsNWNNNggsssssssnssssGssnsssGsss',
    'nnNWNNNggnnnnnnnnnnnnGnnnnnnGnnn',
    'nsYYYYYYYsssRsssnsssLLLLLLLLLLss',
    'nsYYYYYYYssRRRssnsssGGGGGGGGGCCs',
    'nsNWNNNggssRRRssRsssGGGGGGGGGGss',
    'nsNWNNNggssWWGsRRRssssDDnDssssss',
    'nsNWNNNggssWWGsRRRssssDDnsssssss',
    'nsNWNNNggssWWGsWWGssssDDnsssssss',
    'nsNWNNNggssWWGsWWGssssssnsssssss',
    'nsNWNNNggssWWGsWWGsssWssWssWssss',
    'nsNWNNNggssWWGsWWGsssTTsTTsTTsss',
    'nsNWNNNggssWWGsWWGsssTTsTTsTTsss',
    'nssgggggnssWWGsWWGsssTTsTTsTTsss',
    'ngggggggggsWWGsWWGsssTgsTgsTgsss',
    'nggssgssggDWWGDWWGDsLLLLLLLLLLLs',
    'nggssgssggDDDDDDDDDsGsssnsssssGs',
    'nggssgssggDDDDDDDDDsssssnsssssss',
    'KKYYKKYYKKYYKKYYKKYYKKYYKKYYKKYY',
    'DDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
    'KDKDKDKDKDKDKDKDKDKDKDKDKDKDKDKD',
    'DKDKDKDKDKDKDKDKDKDKDKDKDKDKDKDK',
  ],
  // The star map: the ship, then a dashed route past a nebula and a station
  // to the next planet.
  iconMap: [
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnRnnnnnnnnLnnnnnnnnnYYYnnn',
    'nnnnnnnLnnnnnnnnnnnnnnnnnYWYYYnn',
    'nnCCCnLLLnCCCnnnnnnnnnnnYYYYYYWW',
    'nnCBCnLYLnCBCnnnnnnnnnnnYYWWWWYn',
    'nnCCCLLGLLCCCnnWWnWWnnnWWWYYYjYn',
    'nnCBCnLYLnCBCnnnnnnnnnnnnYjjjYnn',
    'nnCCCnLLLnCCCnnnnnnnnnnnnnYYYnnn',
    'nnnnnnnGnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnWnnnnnnnnWnnnnnnnnnnnnnnnnnnGn',
    'nnnnnnnnnnnnWnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnGnnnnnnnnnnn',
    'nnnnnnnnnnnnnnWnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnWnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnGnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnWnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnWnnnnnnnnnnnnn',
    'nnnnnnnnGnnnnnnnnnnnnnMnnnMnnnnn',
    'nnnnnnnnnnnnnnnnnnnMnnnvnvnMnnnn',
    'nnnnnnnnnnnnnnnnnnnnMnvnvnvnMnnn',
    'nnnnWnnnnnnnnnnnnnnnnvnvnvnvnMnn',
    'nnnWCWnnnnnnnnnnnnMnnnvnvnvnnnMn',
    'nnWBCBWnnWWnWWnWWnnMnnnvnvnMnnnn',
    'nnWBBBWnnnnnnnnnnnnnMnnnMnnnMnnn',
    'nnRnYnRnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
    'nnnnnnnnnnnnnnnnnnnnnnnnnnnnnnnn',
  ],
  // Foes (the Bestiary): a dark book with a Raider in its sights.
  iconFoes: [
    '................................',
    '................................',
    '.....KKDDDDDDDDDDDDDDDDDLLL.....',
    '.....KKGGGGGGGGGGGGGGGGGGGL.....',
    '.....KKDDDDDDDDDDDDDDDDDDDL.....',
    '.....KKDDDDDDDDDODDDDDDDDDD.....',
    '.....KKDDDDDDDxxxxxDDDDDDDD.....',
    '.....KKDDDDDxxKKKKKxxDDDDDD.....',
    '.....KKDDDDxxKKKKKKKxxDDDDD.....',
    '.....KKDDDxxKKKKKKKKKxxDDDD.....',
    '.....KKDDDxKRKKKRKKKRKxDDDD.....',
    '.....KKDDxKKRRKRRRKRRKKxDDD.....',
    '.....KKDDxKKKRRRORRRKKKxDDD.....',
    '.....KKDOxKKRRRrOrRRRKKxODD.....',
    '.....KKDDxKKRKRRRRRKRKKxDDD.....',
    '.....KKDDxKKKKRRYRRKKKKxDDD.....',
    '.....KKDDDxKKKKRRRKKKKxDDDD.....',
    '.....KKDDDxxKKKKRKKKKxxDDDD.....',
    '.....KKDDDDxxKKKKKKKxxDDDDD.....',
    '.....KKDDDDDxxKKKKKxxDDDDDD.....',
    '.....KKDDDDDDDxxxxxDDDDDDDD.....',
    '.....KKDDDDDDDDDODDDDDDDDDD.....',
    '.....KKDDDDDDDDDDDDDDDDDDDD.....',
    '.....KKDDDDYyyyyyyyyyYDDDDD.....',
    '.....KKDDDDYYYYYYYYYYYDDDDD.....',
    '.....KKDDDDDDDDDDDDDDDDDDDD.....',
    '.....KKyyyyyyyyyyyyyyyyyLLL.....',
    '.....KKLLLLLLLLLLLLLLLLLLLL.....',
    '.....KKDDDDDDDDDDDDDDDDDLLL.....',
    '.....KKKKKKKKKKKKKKKKKKKKKK.....',
    '................................',
    '................................',
  ],
  // Options: a gear, drawn at half size and shown doubled.
  iconGear: [
    '......LLLL......',
    '......LLLL......',
    '..LL.LLLLLL.LL..',
    '..LLLLLLLLLLLL..',
    '...LLLGGGGLLL...',
    '..LLLG....GLLL..',
    'LLLLG......GLLLG',
    'LLLLG......GLLLG',
    'LLLLG......GLLLG',
    'LLLLG......GLLLG',
    '..LLLG....GLLG..',
    '...LLLGGGGLLG...',
    '..LLLLLLLLLLGG..',
    '..LL.LLLLLG.GG..',
    '......LLGG......',
    '......GGGG......',
  ],
};

export function generateMenuIcons(scene: Phaser.Scene) {
  for (const [key, rows] of Object.entries(ICONS)) {
    const tex = scene.textures.createCanvas(key, rows[0].length, rows.length)!;
    const ctx = tex.getContext();
    rows.forEach((row, y) => [...row].forEach((c, x) => {
      if (!PAL[c]) return;
      ctx.fillStyle = PAL[c];
      ctx.fillRect(x, y, 1, 1);
    }));
    tex.refresh();
  }
}
