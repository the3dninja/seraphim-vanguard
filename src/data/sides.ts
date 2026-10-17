import type { LevelDef, Wave } from './levels';
import type { SaveData } from '../save';

// Side missions: extra levels beside levels 2, 4, 6, 8, 10, 12 and 14, for
// more credits and loot before the boss and mini boss levels. Each opens when
// the ship reaches its level and stays open until the ship leaves that system
// (levels 1 to 5 are system 1, 6 to 10 system 2, 11 to 15 system 3). They
// bring back enemies already met, in new mixes, with their own hazards.
export interface SideDef extends LevelDef {
  id: string;
  anchor: number; // the level it sits beside on the map
}

type Opts = Partial<Pick<Wave, 'count' | 'x' | 'waitClear'>>;
const w = (delay: number, kind: Wave['kind'], pattern: Wave['pattern'], o: Opts = {}): Wave => ({ delay, kind, pattern, ...o });

export const SIDES: SideDef[] = [
  // Beside level 2: short, scrap presses slamming shut.
  {
    id: 's2', anchor: 2, name: 'RUST MOON', node: 'moon_rust', theme: 'scrapyard',
    desc: 'A QUICK RUN. OLD SCRAP PRESSES STILL SLAM SHUT ON THIS MINING MOON.',
    hazards: [{ kind: 'press', every: [6000, 8000] }, { kind: 'debris', every: [4000, 6000] }],
    segments: [[
      w(2500, 'drone', 'swarm', { count: 6, x: 0.1 }), w(0, 'drone', 'swarm', { count: 6, x: 0.9 }),
      w(3500, 'gunboat', 'pair'), w(2500, 'dart', 'vee', { count: 7, x: 0.5 }),
      w(3000, 'weaver', 'line', { count: 4, waitClear: true }),
      w(2000, 'gunboat', 'column', { count: 3, x: 0.5 }), w(2500, 'drone', 'swarm', { count: 8, x: 0.1 }),
      w(1500, 'dart', 'column', { count: 5, x: 0.25 }), w(0, 'dart', 'column', { count: 5, x: 0.75 }),
      w(3000, 'weaver', 'vee', { count: 5, x: 0.5, waitClear: true }),
      w(2000, 'drone', 'swarm', { count: 8, x: 0.9 }), w(1000, 'gunboat', 'pair'),
      w(2500, 'dart', 'line', { count: 7 }), w(2500, 'weaver', 'pair'),
      w(2000, 'gunboat', 'line', { count: 3, waitClear: true }),
    ]],
  },
  // Beside level 4: a frozen moon with crosswinds.
  {
    id: 's4a', anchor: 4, name: 'FROST MOON', node: 'moon_frost', theme: 'ice',
    desc: 'A MEDIUM RUN THROUGH ICE STORMS. CROSSWINDS SHOVE YOUR SHIP AROUND.',
    hazards: [{ kind: 'gust', every: [8000, 11000] }, { kind: 'shard', every: [3000, 5000] }],
    segments: [
      [
        w(2500, 'driller', 'pair'), w(2500, 'dart', 'vee', { count: 7, x: 0.5 }),
        w(3000, 'lancer', 'single', { x: 0.2 }), w(0, 'lancer', 'single', { x: 0.8 }),
        w(3500, 'weaver', 'line', { count: 4, waitClear: true }),
        w(2000, 'bomber', 'single', { x: 0.2 }), w(2500, 'driller', 'pair'),
        w(2000, 'drone', 'swarm', { count: 8, x: 0.9 }), w(3000, 'gunboat', 'pair', { waitClear: true }),
        w(2000, 'lancer', 'line', { count: 3 }), w(3000, 'dart', 'column', { count: 6, x: 0.5 }),
        w(2500, 'bomber', 'single', { x: 0.8 }), w(2000, 'driller', 'single', { x: 0.2 }),
        w(1500, 'driller', 'single', { x: 0.8 }), w(3000, 'weaver', 'vee', { count: 5, x: 0.5, waitClear: true }),
      ],
      [
        w(2500, 'gunboat', 'line', { count: 3 }), w(3000, 'driller', 'pair'),
        w(2000, 'drone', 'swarm', { count: 8, x: 0.1 }), w(0, 'drone', 'swarm', { count: 8, x: 0.9 }),
        w(3500, 'lancer', 'pair', { waitClear: true }), w(2000, 'bomber', 'pair'),
        w(3000, 'dart', 'vee', { count: 9, x: 0.5 }), w(2500, 'lancer', 'single', { x: 0.5 }),
        w(1500, 'driller', 'pair'), w(3000, 'weaver', 'line', { count: 5, waitClear: true }),
        w(2000, 'gunboat', 'column', { count: 3, x: 0.3 }), w(1000, 'gunboat', 'column', { count: 3, x: 0.7 }),
        w(3000, 'lancer', 'line', { count: 3 }), w(2500, 'driller', 'pair'),
        w(2500, 'bomber', 'pair', { waitClear: true }),
      ],
    ],
  },
  // Beside level 4: short, with Frostjaw waiting at the end.
  {
    id: 's4b', anchor: 4, name: 'GLACIER VAULT', node: 'moon_glacier', theme: 'ice',
    desc: 'SHORT, ON SLICK ICE. SOMETHING BIG AND COLD SLEEPS IN THE VAULT. MINI BOSS.',
    hazards: [{ kind: 'patch', every: [5000, 7000] }, { kind: 'shard', every: [4000, 6000] }],
    boss: 'frostjaw',
    segments: [[
      w(2500, 'dart', 'line', { count: 7 }), w(2500, 'driller', 'pair'),
      w(3000, 'gunboat', 'single', { x: 0.5 }), w(2000, 'weaver', 'pair', { waitClear: true }),
      w(2000, 'lancer', 'single', { x: 0.25 }), w(1200, 'lancer', 'single', { x: 0.75 }),
      w(3000, 'drone', 'swarm', { count: 10, x: 0.1 }), w(2500, 'bomber', 'single', { x: 0.5, waitClear: true }),
      w(2000, 'driller', 'pair'), w(1500, 'dart', 'vee', { count: 7, x: 0.5 }),
      w(3000, 'gunboat', 'pair'), w(2500, 'weaver', 'line', { count: 4, waitClear: true }),
    ]],
  },
  // Beside level 6: the longest side mission, embers raining through a storm.
  {
    id: 's6', anchor: 6, name: 'STORM EYE', node: 'moon_storm', theme: 'nebula',
    desc: 'A LONG RUN INTO THE STORM. LIGHTNING AND RED-HOT EMBERS RAIN DOWN.',
    hazards: [{ kind: 'lightning', every: [6000, 9000] }, { kind: 'ember', every: [2000, 6000] }],
    segments: [
      [
        w(2500, 'minelayer', 'single', { x: 0.3 }), w(2500, 'dart', 'vee', { count: 7, x: 0.7 }),
        w(3000, 'bulwark', 'single', { x: 0.5 }), w(2500, 'drone', 'swarm', { count: 8, x: 0.1 }),
        w(3000, 'lancer', 'pair', { waitClear: true }), w(2000, 'gunboat', 'line', { count: 3 }),
        w(3000, 'minelayer', 'pair'), w(3000, 'weaver', 'line', { count: 5 }),
        w(2500, 'driller', 'pair', { waitClear: true }), w(2000, 'bomber', 'single', { x: 0.2 }),
        w(1500, 'bomber', 'single', { x: 0.8 }), w(3000, 'bulwark', 'pair'),
        w(3000, 'drone', 'swarm', { count: 10, x: 0.9 }), w(2500, 'lancer', 'single', { x: 0.5, waitClear: true }),
        w(2000, 'minelayer', 'single', { x: 0.5 }), w(2500, 'dart', 'column', { count: 6, x: 0.2 }),
        w(0, 'dart', 'column', { count: 6, x: 0.8 }), w(3000, 'gunboat', 'pair'),
        w(2500, 'weaver', 'vee', { count: 5, x: 0.5 }), w(3000, 'bulwark', 'single', { x: 0.3 }),
        w(1500, 'bulwark', 'single', { x: 0.7, waitClear: true }),
      ],
      [
        w(2500, 'lancer', 'line', { count: 3 }), w(3000, 'minelayer', 'pair'),
        w(2500, 'driller', 'pair'), w(2500, 'drone', 'swarm', { count: 10, x: 0.1 }),
        w(0, 'drone', 'swarm', { count: 10, x: 0.9 }), w(3500, 'bulwark', 'line', { count: 3, waitClear: true }),
        w(2000, 'bomber', 'pair'), w(2500, 'gunboat', 'column', { count: 3, x: 0.5 }),
        w(3000, 'weaver', 'line', { count: 5 }), w(2500, 'lancer', 'pair'),
        w(2500, 'minelayer', 'single', { x: 0.5, waitClear: true }), w(2000, 'dart', 'vee', { count: 9, x: 0.5 }),
        w(2500, 'driller', 'pair'), w(2000, 'driller', 'pair'),
        w(3000, 'bulwark', 'pair'), w(3000, 'gunboat', 'line', { count: 4 }),
        w(3000, 'lancer', 'line', { count: 3 }), w(2500, 'drone', 'swarm', { count: 12, x: 0.1 }),
        w(3000, 'minelayer', 'pair'), w(3000, 'bulwark', 'line', { count: 3 }),
        w(2500, 'weaver', 'vee', { count: 7, x: 0.5 }), w(2500, 'bomber', 'pair'),
        w(3000, 'lancer', 'pair', { waitClear: true }),
      ],
    ],
  },
  // Beside level 8: a dead satellite whose searchlights still sweep.
  {
    id: 's8a', anchor: 8, name: 'DEAD SATELLITE', node: 'moon_relay', theme: 'relay',
    desc: 'A MEDIUM RUN PAST A DEAD SATELLITE. HIDE BEHIND ITS DEBRIS FROM THE SEARCHLIGHTS.',
    hazards: [{ kind: 'satchunk', every: [2500, 3800] }, { kind: 'sweep', every: [6500, 9000] }, { kind: 'fence', every: [9000, 12000] }],
    segments: [
      [
        w(2500, 'phantom', 'pair'), w(3000, 'carrier', 'single', { x: 0.5 }),
        w(3500, 'lancer', 'line', { count: 3, waitClear: true }), w(2000, 'drone', 'swarm', { count: 10, x: 0.9 }),
        w(2500, 'phantom', 'line', { count: 3 }), w(3000, 'bulwark', 'single', { x: 0.5 }),
        w(2500, 'minelayer', 'pair', { waitClear: true }), w(2000, 'carrier', 'pair'),
        w(4000, 'gunboat', 'line', { count: 3 }), w(2500, 'phantom', 'pair'),
        w(2500, 'driller', 'pair', { waitClear: true }),
      ],
      [
        w(2500, 'carrier', 'single', { x: 0.3 }), w(1500, 'carrier', 'single', { x: 0.7 }),
        w(3500, 'phantom', 'line', { count: 4 }), w(3000, 'lancer', 'pair'),
        w(2500, 'bulwark', 'pair', { waitClear: true }), w(2000, 'drone', 'swarm', { count: 10, x: 0.1 }),
        w(0, 'drone', 'swarm', { count: 10, x: 0.9 }), w(3500, 'minelayer', 'single', { x: 0.5 }),
        w(2500, 'phantom', 'pair'), w(2500, 'gunboat', 'column', { count: 3, x: 0.5 }),
        w(3000, 'lancer', 'line', { count: 3 }), w(3000, 'carrier', 'pair'),
        w(3000, 'phantom', 'line', { count: 3, waitClear: true }),
      ],
    ],
  },
  // Beside level 8: short, and the lights keep going out.
  {
    id: 's8b', anchor: 8, name: 'ECLIPSE STATION', node: 'moon_eclipse', theme: 'blockade',
    desc: 'SHORT. THE STATION IS LOSING POWER AND THE LIGHTS KEEP GOING OUT.',
    hazards: [{ kind: 'blackout', every: [9000, 12000] }, { kind: 'turret', every: [7000, 10000] }],
    segments: [[
      w(2500, 'phantom', 'pair'), w(2500, 'weaver', 'line', { count: 5 }),
      w(3000, 'carrier', 'single', { x: 0.5, waitClear: true }), w(2000, 'phantom', 'line', { count: 3 }),
      w(2500, 'lancer', 'pair'), w(3000, 'drone', 'swarm', { count: 10, x: 0.1 }),
      w(2500, 'bulwark', 'single', { x: 0.5, waitClear: true }), w(2000, 'phantom', 'pair'),
      w(1500, 'minelayer', 'single', { x: 0.5 }), w(3000, 'gunboat', 'pair'),
      w(2500, 'phantom', 'line', { count: 4 }), w(3000, 'carrier', 'pair', { waitClear: true }),
    ]],
  },
  // Beside level 10: the Emperor's armory, all presses and blast doors.
  {
    id: 's10', anchor: 10, name: 'IMPERIAL ARMORY', node: 'moon_armory', theme: 'throne',
    desc: 'A LONG RUN THROUGH THE EMPEROR\'S ARMORY. BLAST DOORS, PRESSES AND HOLLOW INTRUDERS.',
    hazards: [{ kind: 'press', every: [7000, 9500] }, { kind: 'doors', every: [9000, 12000] }],
    segments: [
      [
        w(2500, 'bulwark', 'line', { count: 3 }), w(3000, 'tendril', 'pair'),
        w(3000, 'lancer', 'line', { count: 3, waitClear: true }), w(2000, 'spore', 'column', { count: 5, x: 0.5 }),
        w(2500, 'carrier', 'pair'), w(3500, 'phantom', 'line', { count: 3 }),
        w(3000, 'tendril', 'line', { count: 3, waitClear: true }), w(2000, 'minelayer', 'pair'),
        w(3000, 'gunboat', 'line', { count: 4 }), w(2500, 'spore', 'vee', { count: 7, x: 0.5 }),
        w(3000, 'bulwark', 'pair'), w(2500, 'tendril', 'single', { x: 0.5, waitClear: true }),
        w(2000, 'drone', 'swarm', { count: 12, x: 0.1 }), w(0, 'drone', 'swarm', { count: 12, x: 0.9 }),
        w(3500, 'lancer', 'pair'), w(2500, 'spore', 'line', { count: 5 }),
        w(3000, 'carrier', 'single', { x: 0.5 }), w(2500, 'tendril', 'pair', { waitClear: true }),
      ],
      [
        w(2500, 'spore', 'column', { count: 6, x: 0.3 }), w(0, 'spore', 'column', { count: 6, x: 0.7 }),
        w(3000, 'bulwark', 'line', { count: 3 }), w(3000, 'tendril', 'line', { count: 3 }),
        w(2500, 'phantom', 'pair', { waitClear: true }), w(2000, 'minelayer', 'pair'),
        w(2500, 'lancer', 'line', { count: 3 }), w(3000, 'carrier', 'pair'),
        w(3000, 'tendril', 'pair'), w(2500, 'spore', 'vee', { count: 7, x: 0.5, waitClear: true }),
        w(2000, 'gunboat', 'column', { count: 3, x: 0.2 }), w(0, 'gunboat', 'column', { count: 3, x: 0.8 }),
        w(3500, 'bulwark', 'pair'), w(2500, 'tendril', 'line', { count: 3 }),
        w(3000, 'phantom', 'line', { count: 4 }), w(2500, 'spore', 'line', { count: 5 }),
        w(3000, 'lancer', 'pair'), w(3000, 'tendril', 'line', { count: 3 }),
        w(2500, 'bulwark', 'line', { count: 3 }), w(3000, 'carrier', 'pair', { waitClear: true }),
      ],
    ],
  },
  // Beside level 12: strong currents through a spawning ground.
  {
    id: 's12a', anchor: 12, name: 'SPAWNING CURRENTS', node: 'moon_drift', theme: 'reef',
    desc: 'A MEDIUM RUN. STRONG CURRENTS SWEEP THROUGH THE HIVE\'S SPAWNING GROUNDS.',
    hazards: [{ kind: 'gust', every: [7500, 10000] }, { kind: 'wall', every: [10000, 14000] }],
    segments: [
      [
        w(2500, 'spore', 'line', { count: 5 }), w(3000, 'tendril', 'pair'),
        w(3000, 'brood', 'single', { x: 0.5 }), w(3500, 'mimic', 'pair', { waitClear: true }),
        w(2000, 'husk', 'single', { x: 0.3 }), w(2500, 'spore', 'column', { count: 6, x: 0.7 }),
        w(3000, 'tendril', 'line', { count: 3 }), w(3000, 'husk', 'single', { x: 0.7, waitClear: true }),
        w(2000, 'mimic', 'line', { count: 3 }), w(3000, 'brood', 'pair'),
        w(3000, 'tendril', 'pair'), w(2500, 'spore', 'vee', { count: 7, x: 0.5, waitClear: true }),
      ],
      [
        w(2500, 'husk', 'pair'), w(3000, 'tendril', 'line', { count: 3 }),
        w(2500, 'spore', 'column', { count: 6, x: 0.2 }), w(0, 'spore', 'column', { count: 6, x: 0.8 }),
        w(3000, 'mimic', 'pair', { waitClear: true }), w(2000, 'brood', 'single', { x: 0.3 }),
        w(1500, 'brood', 'single', { x: 0.7 }), w(3000, 'tendril', 'pair'),
        w(3000, 'husk', 'line', { count: 3 }), w(3000, 'mimic', 'line', { count: 3 }),
        w(3000, 'spore', 'line', { count: 7 }), w(2500, 'tendril', 'line', { count: 3, waitClear: true }),
      ],
    ],
  },
  // Beside level 12: short, with the Hollow Watcher at the end.
  {
    id: 's12b', anchor: 12, name: 'MIRROR POOL', node: 'moon_mirror', theme: 'deep',
    desc: 'SHORT. A STILL, DARK POOL THAT REFLECTS TOO MUCH. GRAVITY WELLS. MINI BOSS.',
    hazards: [{ kind: 'well', every: [9000, 12000] }, { kind: 'sweep', every: [7000, 9500] }],
    boss: 'hollowwatcher',
    segments: [[
      w(2500, 'mimic', 'pair'), w(3000, 'spore', 'vee', { count: 7, x: 0.5 }),
      w(3000, 'tendril', 'line', { count: 3, waitClear: true }), w(2000, 'husk', 'single', { x: 0.5 }),
      w(2500, 'mimic', 'line', { count: 3 }), w(3000, 'brood', 'single', { x: 0.5, waitClear: true }),
      w(2000, 'tendril', 'pair'), w(2500, 'spore', 'column', { count: 6, x: 0.5 }),
      w(3000, 'mimic', 'pair'), w(2500, 'husk', 'pair', { waitClear: true }),
    ]],
  },
  // Beside level 14: the nursery, with a Brood Mother at the end.
  {
    id: 's14', anchor: 14, name: 'BROOD NURSERY', node: 'moon_nursery', theme: 'bloom',
    desc: 'A LONG RUN IN THE HIVE\'S NURSERY. THE LIGHTS FAIL. A MATRIARCH GUARDS IT.',
    hazards: [{ kind: 'spores', every: [6000, 9000] }, { kind: 'blackout', every: [11000, 15000] }, { kind: 'tentacle', every: [9000, 13000] }],
    boss: 'broodmother',
    segments: [
      [
        w(2500, 'brood', 'pair'), w(3500, 'spore', 'line', { count: 7 }),
        w(3000, 'tendril', 'line', { count: 3, waitClear: true }), w(2000, 'husk', 'pair'),
        w(3000, 'mimic', 'line', { count: 3 }), w(3000, 'spore', 'column', { count: 6, x: 0.3 }),
        w(0, 'spore', 'column', { count: 6, x: 0.7 }), w(3000, 'brood', 'single', { x: 0.5, waitClear: true }),
        w(2000, 'tendril', 'pair'), w(2500, 'husk', 'line', { count: 3 }),
        w(3000, 'mimic', 'pair'), w(3000, 'brood', 'pair'),
        w(3000, 'tendril', 'line', { count: 3 }), w(3000, 'spore', 'vee', { count: 9, x: 0.5, waitClear: true }),
      ],
      [
        w(2500, 'husk', 'pair'), w(2500, 'tendril', 'line', { count: 3 }),
        w(3000, 'brood', 'pair', { waitClear: true }), w(2000, 'mimic', 'line', { count: 3 }),
        w(2500, 'spore', 'line', { count: 7 }), w(3000, 'husk', 'line', { count: 3 }),
        w(3000, 'tendril', 'pair'), w(2500, 'brood', 'single', { x: 0.5, waitClear: true }),
        w(2000, 'mimic', 'pair'), w(2500, 'spore', 'column', { count: 6, x: 0.5 }),
        w(3000, 'husk', 'pair'), w(3000, 'tendril', 'line', { count: 3 }),
        w(3000, 'brood', 'pair', { waitClear: true }),
      ],
    ],
  },
];

export const sideById = (id: string) => SIDES.find((s) => s.id === id);

// Systems of five levels: 1 to 5, 6 to 10, 11 to 15.
export const systemOf = (level: number) => Math.ceil(level / 5);

// Side missions in the ship's current system that it has reached.
export function openSides(state: SaveData) {
  return SIDES.filter((s) => s.anchor <= state.level && systemOf(s.anchor) === systemOf(state.level));
}

// Of those, the ones not beaten yet.
export const unbeatenSides = (state: SaveData) => openSides(state).filter((s) => !state.sides.includes(s.id));

// Whether flying the next level closes this system's side missions.
export const closesSystem = (level: number) => level % 5 === 0;
