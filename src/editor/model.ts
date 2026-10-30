import {
  BOSS_KINDS, ENEMY_KINDS, HAZARD_KINDS, LEVELS, PATTERNS, THEMES, segmentEnd,
  type HazardSpec, type LevelDef, type LevelEvent, type SegmentEnd, type Wave,
} from '../data/levels';
import { SIDES } from '../data/sides';
import { TextError, read, write, type Value } from './format';

// The Level Editor's data: drafts of levels kept in this browser, and how a
// draft splits into the text of each tab and comes back together.

// Which level a draft is of: a story level, a side mission or a new one.
export type Base = { kind: 'level'; n: number } | { kind: 'side'; id: string } | { kind: 'new' };

export interface Draft {
  key: string; // 'level:outpost', 'side:s2', 'new:1'
  base: Base;
  playAs: number; // the level number it flies as: enemy shot speed, credits, tips
  def: LevelDef;
  undo: string[]; // the level before each APPLY, newest last
}

export const STORE = 'sv-editor';
const UNDO_KEEP = 40;

export const deepCopy = <T>(v: T): T => structuredClone(v);

// The game's own version of a level, if it has one.
export function gameDef(base: Base): LevelDef | undefined {
  if (base.kind === 'level') return LEVELS[base.n - 1];
  if (base.kind === 'side') return SIDES.find((s) => s.id === base.id);
  return undefined;
}

export const levelText = (def: LevelDef) => write(def as unknown as Value);

// Every story level and side mission, in map order.
export function gameEntries(): { key: string; base: Base; label: string; def: LevelDef }[] {
  const out: { key: string; base: Base; label: string; def: LevelDef }[] = [];
  LEVELS.forEach((def, i) => out.push({ key: `level:${def.id}`, base: { kind: 'level', n: i + 1 }, label: `LV ${i + 1}`, def }));
  for (const s of SIDES) out.push({ key: `side:${s.id}`, base: { kind: 'side', id: s.id }, label: `SIDE ${s.anchor}`, def: s });
  return out;
}

export function playAsFor(base: Base) {
  if (base.kind === 'level') return base.n;
  if (base.kind === 'side') return SIDES.find((s) => s.id === base.id)?.anchor ?? 1;
  return 1;
}

export function newDraft(key: string, base: Base, def: LevelDef): Draft {
  return { key, base, playAs: playAsFor(base), def: deepCopy(def), undo: [] };
}

export function blankLevel(id: string): LevelDef {
  return {
    id, name: 'NEW LEVEL', desc: '', node: 'node_gas', theme: 'outpost',
    segments: [[{ delay: 2500, kind: 'dart', pattern: 'line', count: 5 }]],
  };
}

// --- Storage -----------------------------------------------------------------

interface Stored { v?: number; drafts: { key: string; base: Base; playAs: number; text: string; undo: string[] }[]; clip?: Wave }
const VERSION = 2; // 2: radio calls became events (segmentEvents)

// A draft from before events: its segmentRadio calls become events, and a
// game level's own events (the call that opens it) come in.
function migrate(def: LevelDef & { segmentRadio?: (string | undefined)[] }, base: Base) {
  const game = gameDef(base);
  if (!def.segmentEvents && game?.segmentEvents) def.segmentEvents = deepCopy(game.segmentEvents);
  const radio = def.segmentRadio;
  delete def.segmentRadio;
  if (!radio) return;
  const evs = def.segments.map((_, i) => (def.segmentEvents?.[i] ?? []).filter((e) => e.at || e.wave || e.radio === undefined));
  radio.forEach((r, i) => { if (r && evs[i]) evs[i].unshift({ radio: r }); });
  def.segmentEvents = evs.map((l) => (l.length ? l : undefined));
}

export function loadDrafts(): { drafts: Map<string, Draft>; clip: Wave | null } {
  const drafts = new Map<string, Draft>();
  let clip: Wave | null = null;
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Stored | null;
    for (const d of raw?.drafts ?? []) {
      try {
        const def = read(d.text) as unknown as LevelDef;
        if ((raw?.v ?? 1) < VERSION) migrate(def, d.base);
        drafts.set(d.key, { key: d.key, base: d.base, playAs: d.playAs ?? playAsFor(d.base), def, undo: (raw?.v ?? 1) < VERSION ? [] : d.undo ?? [] });
      } catch { /* a draft that can't be read is dropped */ }
    }
    clip = raw?.clip ?? null;
  } catch { /* storage blocked or bad data: start clean */ }
  return { drafts, clip };
}

export function saveDrafts(drafts: Map<string, Draft>, clip: Wave | null) {
  const out: Stored = {
    v: VERSION,
    drafts: [...drafts.values()].map((d) => ({ key: d.key, base: d.base, playAs: d.playAs, text: levelText(d.def), undo: d.undo.slice(-UNDO_KEEP) })),
    clip: clip ?? undefined,
  };
  try { localStorage.setItem(STORE, JSON.stringify(out)); } catch { /* storage blocked: drafts last until reload */ }
}

export function pushUndo(d: Draft, before: string) {
  if (d.undo[d.undo.length - 1] === before) return;
  d.undo.push(before);
  if (d.undo.length > UNDO_KEEP) d.undo.shift();
}

// --- Tabs ----------------------------------------------------------------------

export type Part = 'waves' | 'hazards' | 'events' | 'segment';
// Segment -1 is the "0. LEVEL" tab.
export interface Tab { seg: number; part: Part }

// Things set per segment, each kept as its own list on the level.
const PER_SEG = ['segments', 'hazards', 'segmentHazards', 'segmentThemes', 'segmentBoss', 'segmentEvents', 'segmentEnds', 'segmentNames'] as const;
// The lists kept one entry per segment (inserting or removing a segment changes each).
export const SEG_LISTS = ['segmentHazards', 'segmentThemes', 'segmentBoss', 'segmentEvents', 'segmentEnds', 'segmentNames'] as const;

export const segName = (def: LevelDef, seg: number) => def.segmentNames?.[seg] || `SEGMENT ${seg + 1}`;
export const segHazards = (def: LevelDef, seg: number): HazardSpec[] => def.segmentHazards?.[seg] ?? def.hazards ?? [];
export const segEvents = (def: LevelDef, seg: number): LevelEvent[] => def.segmentEvents?.[seg] ?? [];

// How a segment would end without its own segmentEnds entry.
function usualEnd(def: LevelDef, seg: number): SegmentEnd {
  return segmentEnd({ ...def, segmentEnds: undefined }, seg);
}

// The ends a segment can have, as GameScene.endSegment runs them.
export function endsFor(def: LevelDef, seg: number): SegmentEnd[] {
  const last = seg >= def.segments.length - 1;
  if (def.gate && last) return ['gate'];
  return last ? ['boss', 'treasure', 'clear'] : ['vendor', 'on', 'rift', 'riftExit'];
}

// The moment an event happens, in ms from its segment's start, given when
// each of the segment's waves comes in.
export function eventTime(ev: LevelEvent, waveTimes: number[]): number {
  const from = ev.wave ? waveTimes[ev.wave - 1] ?? waveTimes[waveTimes.length - 1] ?? 0 : 0;
  return from + (ev.at ?? 0);
}

// Keeps events tied to waves on the same waves when waves are added to or
// taken out of a segment: `by` waves added (or, below 0, removed) at index
// `at`. An event on a removed wave moves to the wave before (or the start).
export function shiftWaveEvents(def: LevelDef, seg: number, at: number, by: number) {
  for (const ev of def.segmentEvents?.[seg] ?? []) {
    if (!ev.wave || ev.wave <= at) continue;
    if (by < 0 && ev.wave <= at - by) {
      if (at) ev.wave = at;
      else delete ev.wave;
    } else ev.wave += by;
  }
}

// The text a tab shows.
export function tabText(d: Draft, tab: Tab): string {
  const def = d.def;
  if (tab.seg < 0) {
    const rest: Record<string, unknown> = { playAs: d.playAs };
    for (const [k, v] of Object.entries(def)) if (!(PER_SEG as readonly string[]).includes(k)) rest[k] = v;
    return [
      '// THE WHOLE LEVEL. playAs IS FOR THE EDITOR ONLY:',
      '// THE LEVEL NUMBER IT FLIES AS (SHOT SPEED, CREDITS, TIPS).',
      write(rest as Value),
    ].join('\n');
  }
  const s = tab.seg;
  if (tab.part === 'waves') return write(def.segments[s] as unknown as Value);
  if (tab.part === 'hazards') {
    const shared = !def.segmentHazards && def.segments.length > 1;
    return `${shared ? '// SHARED BY EVERY SEGMENT UNTIL ONE CHANGES\n' : ''}${write(segHazards(def, s) as unknown as Value)}`;
  }
  if (tab.part === 'events') {
    const list: Value[] = [...segEvents(def, s) as unknown as Value[], { end: segmentEnd(def, s) }];
    const ends = endsFor(def, s);
    return [
      '// WHAT HAPPENS IN THIS SEGMENT. at: MS AFTER IT STARTS, OR AFTER',
      '// wave (1 IS ITS FIRST WAVE). THEN ONE OF radio: \'NAME: WORDS\',',
      '// alarm: \'WARNING!\', arena: true OR false (ENEMIES HOLD NEAR THE TOP),',
      '// hazards: false (PAUSED) OR true.',
      `// LAST, HOW IT ENDS: ${ends.join(', ')}${ends.includes('rift') ? ' (on IS STRAIGHT ON; rift AND riftExit ARE THE RIFT CINEMATICS)' : ''}`,
      write(list),
    ].join('\n');
  }
  const seg: Record<string, Value> = {
    name: def.segmentNames?.[s],
    theme: def.segmentThemes?.[s] ?? def.theme,
    boss: def.segmentBoss?.[s],
  };
  return [
    '// boss: A MINI BOSS AT THE END OF THIS SEGMENT. RADIO CALLS ARE IN EVENTS.',
    `// BOSSES: ${BOSS_KINDS.join(', ')}`,
    write(seg),
  ].join('\n');
}

// --- Checking ------------------------------------------------------------------

type Obj = Record<string, Value>;

// Where in the text each problem is: the line of the n-th item in a list.
function check(ok: boolean, msg: string, line: number) {
  if (!ok) throw new TextError(msg, line);
}

const isObj = (v: Value): v is Obj => v !== null && typeof v === 'object' && !Array.isArray(v);
const oneOf = (list: readonly string[], v: Value) => typeof v === 'string' && list.includes(v);
const num = (v: Value, min = -Infinity, max = Infinity) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const whole = (v: Value, min = -Infinity) => num(v, min) && Number.isInteger(v);

export function checkWave(w: Value, line: number): Wave {
  check(isObj(w), 'EACH WAVE IS { ... }', line);
  const o = w as Obj;
  for (const k of Object.keys(o)) check(['delay', 'kind', 'pattern', 'count', 'x', 'waitClear'].includes(k), `A WAVE HAS NO ${k}`, line);
  check(num(o.delay, 0), 'delay IS MS, 0 OR MORE', line);
  check(oneOf(ENEMY_KINDS, o.kind), `NO ENEMY CALLED ${String(o.kind)}`, line);
  check(oneOf(PATTERNS, o.pattern), `pattern IS ONE OF ${PATTERNS.join(', ')}`, line);
  check(o.count === undefined || whole(o.count, 1), 'count IS A WHOLE NUMBER, 1 OR MORE', line);
  check(o.x === undefined || num(o.x, 0, 1), 'x IS FROM 0 TO 1', line);
  check(o.waitClear === undefined || typeof o.waitClear === 'boolean', 'waitClear IS true OR false', line);
  return o as unknown as Wave;
}

function lineOf(lines: number[], i: number) { return lines[i] ?? 1; }

// Reads a tab's text back into the draft (a copy: the draft only changes once
// every tab being applied reads cleanly).
export function applyTab(d: { def: LevelDef; playAs: number }, tab: Tab, text: string, itemLines: (src: string) => number[]) {
  const v = read(text);
  const def = d.def;
  if (tab.seg < 0) {
    check(isObj(v), 'THE LEVEL IS { ... }', 1);
    const o = v as Obj;
    const known: Record<string, (x: Value) => boolean> = {
      id: (x) => typeof x === 'string', name: (x) => typeof x === 'string', desc: (x) => typeof x === 'string',
      node: (x) => typeof x === 'string', theme: (x) => oneOf(THEMES, x), boss: (x) => oneOf(BOSS_KINDS, x),
      bossHazards: (x) => typeof x === 'boolean', treasure: (x) => num(x, 0), storm: (x) => typeof x === 'boolean',
      riftAfter: (x) => whole(x, 0), riftExitAfter: (x) => whole(x, 0), noCrates: (x) => Array.isArray(x) && x.every((n) => whole(n, 0)),
      allies: (x) => whole(x, 0), dark: (x) => typeof x === 'boolean', vendorless: (x) => typeof x === 'boolean',
      hive: (x) => typeof x === 'boolean', gate: (x) => typeof x === 'boolean', warps: isObj,
      enemies: (x) => Array.isArray(x), anchor: (x) => whole(x, 1), playAs: (x) => whole(x, 1),
    };
    const textLines = text.split('\n');
    const keyLine = (k: string) => Math.max(1, textLines.findIndex((l) => new RegExp(`^\\s*${k}\\s*:`).test(l)) + 1);
    for (const [k, x] of Object.entries(o)) {
      check(k in known, `A LEVEL HAS NO ${k}`, keyLine(k));
      if (x !== undefined) check(known[k](x), `${k} DOESN'T LOOK RIGHT`, keyLine(k));
    }
    for (const k of ['id', 'name', 'node', 'theme']) check(o[k] !== undefined, `THE LEVEL NEEDS ${k}`, 1);
    if (o.playAs !== undefined) d.playAs = o.playAs as number;
    const next: Obj = {};
    for (const [k, x] of Object.entries(o)) if (k !== 'playAs' && x !== undefined) next[k] = x;
    for (const k of PER_SEG) if (def[k] !== undefined) next[k] = def[k] as unknown as Value;
    d.def = next as unknown as LevelDef;
    return;
  }
  const s = tab.seg;
  if (tab.part === 'waves') {
    check(Array.isArray(v), 'THE WAVES ARE A LIST: [ ... ]', 1);
    const lines = itemLines(text);
    def.segments[s] = (v as Value[]).map((w, i) => checkWave(w, lineOf(lines, i)));
    return;
  }
  if (tab.part === 'hazards') {
    check(Array.isArray(v), 'THE HAZARDS ARE A LIST: [ ... ]', 1);
    const lines = itemLines(text);
    const list = (v as Value[]).map((h, i) => {
      const line = lineOf(lines, i);
      check(isObj(h), 'EACH HAZARD IS { ... }', line);
      const o = h as Obj;
      for (const k of Object.keys(o)) check(['kind', 'every', 'ramp'].includes(k), `A HAZARD HAS NO ${k}`, line);
      check(oneOf(HAZARD_KINDS, o.kind), `NO HAZARD CALLED ${String(o.kind)}. THEY ARE: ${HAZARD_KINDS.join(', ')}`, line);
      const e = o.every;
      check(Array.isArray(e) && e.length === 2 && num(e[0], 100) && num(e[1], 100) && (e[0] as number) <= (e[1] as number),
        'every IS [FEWEST MS, MOST MS] BETWEEN EACH ONE', line);
      check(o.ramp === undefined || num(o.ramp, 0.1), 'ramp IS A NUMBER, LIKE 2', line);
      return o as unknown as HazardSpec;
    });
    const all = def.segments.map((_, i) => (i === s ? list : segHazards(def, i)));
    const same = all.every((l) => JSON.stringify(l) === JSON.stringify(all[0]));
    delete def.segmentHazards;
    delete def.hazards;
    if (!same) def.segmentHazards = all;
    else if (all[0].length) def.hazards = all[0];
    return;
  }
  if (tab.part === 'events') {
    check(Array.isArray(v), 'THE EVENTS ARE A LIST: [ ... ]', 1);
    const lines = itemLines(text);
    const n = def.segments[s].length;
    const events: LevelEvent[] = [];
    let end: SegmentEnd | undefined;
    (v as Value[]).forEach((e, i) => {
      const line = lineOf(lines, i);
      check(isObj(e), 'EACH EVENT IS { ... }', line);
      const o = e as Obj;
      if ('end' in o) {
        check(Object.keys(o).length === 1, 'THE END IS ON ITS OWN: { end: \'vendor\' }', line);
        check(end === undefined, 'THERE\'S ONLY ONE end', line);
        const ends = endsFor(def, s);
        check(oneOf(ends, o.end), `THIS SEGMENT CAN END WITH ${ends.join(', ')}`, line);
        end = o.end as SegmentEnd;
        return;
      }
      for (const k of Object.keys(o)) check(['at', 'wave', 'radio', 'alarm', 'arena', 'hazards'].includes(k), `AN EVENT HAS NO ${k}`, line);
      check(o.at === undefined || num(o.at, 0), 'at IS MS, 0 OR MORE', line);
      check(o.wave === undefined || (whole(o.wave, 1) && (o.wave as number) <= n), `wave IS FROM 1 TO ${n}`, line);
      const does = ['radio', 'alarm', 'arena', 'hazards'].filter((k) => o[k] !== undefined);
      check(does.length === 1, 'EACH EVENT DOES ONE THING: radio, alarm, arena OR hazards', line);
      check(o.radio === undefined || typeof o.radio === 'string', 'radio IS TEXT IN QUOTES', line);
      check(o.alarm === undefined || typeof o.alarm === 'string', 'alarm IS TEXT IN QUOTES', line);
      check(o.arena === undefined || typeof o.arena === 'boolean', 'arena IS true OR false', line);
      check(o.hazards === undefined || typeof o.hazards === 'boolean', 'hazards IS true OR false', line);
      const ev: Obj = {};
      for (const [k, x] of Object.entries(o)) if (x !== undefined && !(k === 'at' && x === 0)) ev[k] = x;
      events.push(ev as unknown as LevelEvent);
    });
    const count = def.segments.length;
    const evs = Array.from({ length: count }, (_, i) => (i === s ? events : segEvents(def, i)));
    if (evs.some((l) => l.length)) def.segmentEvents = evs.map((l) => (l.length ? l : undefined));
    else delete def.segmentEvents;
    // Only an end that differs from the usual one is kept.
    const endList = Array.from({ length: count }, (_, i) => def.segmentEnds?.[i]);
    endList[s] = end && end !== usualEnd(def, s) ? end : undefined;
    if (endList.some((x) => x)) def.segmentEnds = endList;
    else delete def.segmentEnds;
    return;
  }
  check(isObj(v), 'THE SEGMENT IS { ... }', 1);
  const o = v as Obj;
  const line = 3;
  for (const k of Object.keys(o)) check(['name', 'theme', 'boss'].includes(k), `A SEGMENT HAS NO ${k}`, line);
  check(o.name === undefined || typeof o.name === 'string', 'name IS TEXT IN QUOTES', line);
  check(o.theme === undefined || oneOf(THEMES, o.theme), `theme IS ONE OF ${THEMES.join(', ')}`, line);
  check(o.boss === undefined || oneOf(BOSS_KINDS, o.boss), `NO BOSS CALLED ${String(o.boss)}`, line);
  const n = def.segments.length;
  // Each per-segment list is kept only while something in it is set
  // (for themes: while one differs from the level's).
  const setList = <K extends 'segmentNames' | 'segmentThemes' | 'segmentBoss'>(key: K, val: Value, fallback?: Value) => {
    const cur = Array.from({ length: n }, (_, i) => (def[key] as Value[] | undefined)?.[i] ?? fallback);
    cur[s] = val === '' ? undefined : val ?? fallback;
    if (cur.every((x) => x === undefined || x === fallback)) delete def[key];
    else (def as unknown as Obj)[key] = cur;
  };
  setList('segmentNames', o.name);
  setList('segmentThemes', o.theme, def.theme);
  setList('segmentBoss', o.boss);

}

// --- Export ----------------------------------------------------------------------

// What changed from the game's version, in a few short lines.
export function changes(d: Draft): string[] {
  const game = gameDef(d.base);
  if (!game) return [`NEW LEVEL: ${d.def.segments.length} SEGMENTS, ${d.def.segments.reduce((n, s) => n + s.length, 0)} WAVES`];
  const out: string[] = [];
  const keys = new Set([...Object.keys(game), ...Object.keys(d.def)]);
  const same = (a: unknown, b: unknown) => write(a as Value) === write(b as Value);
  const top = [...keys].filter((k) => !(PER_SEG as readonly string[]).includes(k) && !same((game as unknown as Obj)[k], (d.def as unknown as Obj)[k]));
  if (top.length) out.push(`LEVEL: ${top.join(', ')} CHANGED`);
  const n = Math.max(game.segments.length, d.def.segments.length);
  for (let s = 0; s < n; s++) {
    const a = game.segments[s], b = d.def.segments[s];
    const name = segName(d.def, s);
    if (!a) { out.push(`SEG ${s + 1} ${name}: NEW, ${b.length} WAVES`); continue; }
    if (!b) { out.push(`SEG ${s + 1}: REMOVED`); continue; }
    const bits: string[] = [];
    const both = Math.min(a.length, b.length);
    let changed = 0;
    for (let i = 0; i < both; i++) if (!same(a[i], b[i])) changed++;
    if (changed) bits.push(`${changed} WAVE${changed > 1 ? 'S' : ''} CHANGED`);
    if (b.length > a.length) bits.push(`${b.length - a.length} ADDED`);
    if (b.length < a.length) bits.push(`${a.length - b.length} REMOVED`);
    if (!same(segHazards(game, s), segHazards(d.def, s))) bits.push('HAZARDS CHANGED');
    if (!same(segEvents(game, s), segEvents(d.def, s))) bits.push('EVENTS CHANGED');
    if (segmentEnd(game, s) !== segmentEnd(d.def, s)) bits.push(`ENDS WITH ${segmentEnd(d.def, s).toUpperCase()}`);
    for (const k of ['segmentNames', 'segmentThemes', 'segmentBoss'] as const) {
      if (!same(game[k]?.[s], d.def[k]?.[s])) bits.push(`${k.replace('segment', '').toUpperCase()} CHANGED`);
    }
    if (bits.length) out.push(`SEG ${s + 1} ${name}: ${bits.join(', ')}`);
  }
  return out.length ? out : ['NO CHANGES FROM THE GAME'];
}

// Whether a draft differs from the game at all (not just in the order its parts are written).
export const isEdited = (d: Draft) => !gameDef(d.base) || changes(d)[0] !== 'NO CHANGES FROM THE GAME';

// Pairs up equal items of two lists, keeping their order, as many as can be:
// [index in a, index in b] for each pair.
function matchUp(a: string[], b: string[]): [number, number][] {
  const n = a.length, m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let x = n - 1; x >= 0; x--) {
    for (let y = m - 1; y >= 0; y--) L[x][y] = a[x] === b[y] ? L[x + 1][y + 1] + 1 : Math.max(L[x + 1][y], L[x][y + 1]);
  }
  const out: [number, number][] = [];
  let x = 0, y = 0;
  while (x < n && y < m) {
    if (a[x] === b[y]) out.push([x++, y++]);
    else if (L[x + 1][y] >= L[x][y + 1]) x++;
    else y++;
  }
  return out;
}

// The game's version of a wave in a draft, found by lining the segment up
// with the game's. Waves that still match pair up first. Between those, waves
// alike but for their delay pair up next (adding a wave changes the next
// one's delay), and then, where the same number are left on both sides, the
// rest pair in order. Undefined for a wave the draft added.
export function gameWave(d: Draft, seg: number, i: number): Wave | undefined {
  const game = gameDef(d.base)?.segments[seg];
  const mine = d.def.segments[seg];
  if (!game || !mine) return undefined;
  const full = (w: Wave) => write(w as unknown as Value);
  const shape = (w: Wave) => write({ ...w, delay: 0 } as unknown as Value);
  const pair = new Array<number>(mine.length).fill(-1);
  const anchors = matchUp(mine.map(full), game.map(full));
  let px = 0, py = 0;
  for (const [ax, ay] of [...anchors, [mine.length, game.length] as [number, number]]) {
    // The gap before this anchor, on both sides.
    const gx = Array.from({ length: ax - px }, (_, k) => px + k);
    const gy = Array.from({ length: ay - py }, (_, k) => py + k);
    const alike = matchUp(gx.map((k) => shape(mine[k])), gy.map((k) => shape(game[k])));
    for (const [x, y] of alike) pair[gx[x]] = gy[y];
    const rx = gx.filter((_, k) => !alike.some(([x]) => x === k));
    const ry = gy.filter((_, k) => !alike.some(([, y]) => y === k));
    if (rx.length === ry.length) rx.forEach((x, k) => { pair[x] = ry[k]; });
    if (ax < mine.length) pair[ax] = ay;
    px = ax + 1;
    py = ay + 1;
  }
  return pair[i] >= 0 ? game[pair[i]] : undefined;
}
