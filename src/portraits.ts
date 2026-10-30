import Phaser from 'phaser';
import rook from './portraits/rook.png';
import kade from './portraits/kade.png';
import kadeevil from './portraits/kadeevil.png';
import vespar from './portraits/vespar.png';
import vesparevil from './portraits/vesparevil.png';
import reyes from './portraits/reyes.png';

// 16x16 portraits for the radio's comms box, drawn as PNGs (src/portraits) so
// they can be swapped straight from the drawing program. Reyes is a stand-in.
const FILES: Record<string, string> = { rook, kade, kadeevil, vespar, vesparevil, reyes };

export function loadPortraits(scene: Phaser.Scene) {
  for (const [k, url] of Object.entries(FILES)) scene.load.image(`pt_${k}`, url);
}

// Who can speak on the radio, by the name before the colon: their name color,
// the portrait's frame color, and their portrait. Kade and Vespar show their
// Hollow-touched portraits (and Vespar his Hollow color) until Vespar is freed (the level 10 boss).
export const SPEAKERS: Record<string, { color: string; frame: number; portrait: string; evil?: string; evilColor?: string }> = {
  REYES: { color: '#f8b800', frame: 0xac7c00, portrait: 'pt_reyes' },
  ROOK: { color: '#f83800', frame: 0xd82800, portrait: 'pt_rook' },
  KADE: { color: '#3cbcfc', frame: 0x0078f8, portrait: 'pt_kade', evil: 'pt_kadeevil' },
  VESPAR: { color: '#9878f8', frame: 0x6844fc, portrait: 'pt_vespar', evil: 'pt_vesparevil', evilColor: '#d800cc' },
};
// Vespar's level: before and during it, the evil portraits.
export const VESPAR_FREED_AFTER = 10;

// Splits a line into rows of at most `max` letters, breaking between words.
export function wrap(line: string, max: number) {
  const rows: string[] = [];
  for (const word of line.split(/\s+/).filter(Boolean)) {
    const last = rows.length - 1;
    if (last >= 0 && rows[last].length + 1 + word.length <= max) rows[last] += ` ${word}`;
    else rows.push(word);
  }
  return rows;
}
