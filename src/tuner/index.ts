import type Phaser from 'phaser';
import { FONT } from '../config';
import { TUNE_HISTORY, type TuneChange } from '../data/tuneHistory';
import { DTYPES } from '../data/enemies';
import { DTYPE_COLOR, atLv, MAX_WEAPON_LEVEL } from '../data/items';
import {
  BY_PATH, CATS, ENTRIES, GAME_VALUES, flatPath, levelPath, levelPropOf, pathOf, propOf, type TuneCat, type TuneEntry,
} from './entries';

// The Tuner (?tune, or with ?test): a page over the game for changing the
// numbers of weapons, gear, items and foes while playing. Edits wait until APPLY, then take effect at once.
// EXPORT lists only the values that differ from the game, as text to paste
// back in the project so they can be written into the code. CLEAR puts every
// value back to the game's. HISTORY lists exports already added to the game
// and can put values back to how they were before any of them.
// Applied values and unadded exports are kept in this browser only.

const STORE = 'sv-tuner';

interface LocalExport { date: string; changes: TuneChange[] }
interface Stored { applied: Record<string, number>; exports: LocalExport[] }

export const tunerEnabled = () => {
  const q = new URLSearchParams(location.search);
  return q.has('tune') || q.has('test');
};

const fmt = (v: number) => String(Math.round(v * 1000) / 1000);

function load(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) ?? 'null') as Stored | null;
    if (raw && typeof raw === 'object') return { applied: raw.applied ?? {}, exports: raw.exports ?? [] };
  } catch { /* storage blocked or bad data: start clean */ }
  return { applied: {}, exports: [] };
}

function save(s: Stored) {
  try { localStorage.setItem(STORE, JSON.stringify(s)); } catch { /* storage blocked: applied values last until reload */ }
}

const CSS = `
#tuner-btn { position: fixed; top: calc(env(safe-area-inset-top) + 4px); left: 50%; transform: translateX(-50%);
  z-index: 10; font: 8px ${FONT}; color: #f8b800; background: #000c; border: 1px solid #f8b800; padding: 5px 8px; }
#tuner { position: fixed; inset: 0; z-index: 20; background: #000; color: #fcfcfc; font: 8px/1.6 ${FONT};
  display: flex; flex-direction: column; user-select: text; -webkit-user-select: text; touch-action: auto; }
#tuner * { box-sizing: border-box; }
#tuner button { font: inherit; color: inherit; background: #000; border: 1px solid currentColor; padding: 7px 6px; cursor: pointer; }
#tuner button:active { background: #3c3c3c; }
#tuner button:disabled { opacity: .35; }
#tuner .top { display: flex; align-items: center; gap: 6px; padding: calc(env(safe-area-inset-top) + 8px) 10px 6px; }
#tuner .top h1 { font-size: 12px; margin: 0; flex: 1; color: #f8b800; font-weight: normal; }
#tuner .tabs { display: flex; gap: 4px; padding: 0 10px 8px; }
#tuner .tabs button { flex: 1; color: #7c7c7c; padding: 6px 2px; }
#tuner .tabs button.on { color: #f8b800; background: #3c2800; }
#tuner .body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 0 10px 10px; }
#tuner .card { border: 1px solid #3c3c3c; padding: 8px; margin-bottom: 8px; max-width: 520px; margin-inline: auto; }
#tuner .card h2 { font-size: 10px; margin: 0 0 4px; font-weight: normal; color: #fc7460; }
#tuner .card .head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
#tuner .card .head h2 { margin: 0; }
#tuner .card .pic { flex: none; image-rendering: pixelated; }
#tuner .desc { color: #bcbcbc; margin-bottom: 6px; }
#tuner .stat { padding: 5px 0 3px; border-top: 1px solid #1c1c1c; }
#tuner .stat .lbl { color: #bcbcbc; }
#tuner .stat .lvls { color: #7c7c7c; }
#tuner .shots { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; padding: 4px 0 2px; }
#tuner .shots .cell { display: flex; flex-direction: column; align-items: center; gap: 3px; color: #7c7c7c; }
#tuner .shots input { width: 100%; font: 11px ${FONT}; color: #fcfcfc; background: #000; border: 1px solid #7c7c7c;
  padding: 6px 2px; text-align: center; }
#tuner .shots .tuned input { border-color: #3cbcfc; color: #3cbcfc; }
#tuner .shots .draft input { border-color: #f8b800; color: #f8b800; }
#tuner .stat > .game { color: #3cbcfc; }
#tuner .row { display: flex; align-items: center; gap: 4px; padding: 2px 0; }
#tuner .row .lbl { flex: 1; color: #7c7c7c; }
#tuner .row .game { display: block; color: #3cbcfc; }
#tuner .row button { width: 28px; padding: 6px 0; }
#tuner .row input { width: 64px; font: 11px ${FONT}; color: #fcfcfc; background: #000; border: 1px solid #7c7c7c;
  padding: 6px 4px; text-align: center; }
#tuner .row.tuned input { border-color: #3cbcfc; color: #3cbcfc; }
#tuner .row.draft input { border-color: #f8b800; color: #f8b800; }
#tuner .note { color: #7c7c7c; text-align: center; padding: 16px 8px; max-width: 520px; margin: 0 auto; }
#tuner .foot { border-top: 1px solid #3c3c3c; padding: 6px 10px calc(env(safe-area-inset-bottom) + 8px); }
#tuner .status { text-align: center; color: #7c7c7c; min-height: 13px; margin-bottom: 6px; }
#tuner .btns { display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; max-width: 520px; margin: 0 auto; }
#tuner .apply { color: #58d854; }
#tuner .clear { color: #d82800; }
#tuner .export { color: #f8b800; }
#tuner .hist { color: #3cbcfc; }
#tuner textarea { width: 100%; height: 160px; font: 9px/1.6 monospace; color: #fcfcfc; background: #111; border: 1px solid #7c7c7c; padding: 6px; }
#tuner .rev { border: 1px solid #3c3c3c; padding: 8px; margin-bottom: 8px; max-width: 520px; margin-inline: auto; }
#tuner .rev h2 { font-size: 9px; margin: 0 0 4px; font-weight: normal; }
#tuner .rev ul { margin: 0 0 6px; padding-left: 14px; color: #bcbcbc; }
`;

export function installTuner(game: Phaser.Game) {
  const stored = load();
  // Applied values the game now ships with anyway are dropped, and so are
  // exports whose every change is now in the game.
  for (const [path, v] of Object.entries(stored.applied)) {
    if (!BY_PATH.has(path) || GAME_VALUES.get(path) === v) delete stored.applied[path];
  }
  stored.exports = stored.exports.filter((x) => x.changes.some((c) => BY_PATH.has(c.path) && GAME_VALUES.get(c.path) !== c.to));
  save(stored);

  // Put the live values to the game's, then the applied ones on top.
  const setLive = () => {
    for (const [path, { obj, prop }] of BY_PATH) obj[prop] = stored.applied[path] ?? GAME_VALUES.get(path)!;
  };
  setLive();

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const open = document.createElement('button');
  open.id = 'tuner-btn';
  open.textContent = 'TUNER';
  document.body.append(open);

  // The tab open and how far down each tab was scrolled, so the Tuner reopens where it was left.
  let cat: TuneCat = 'weapons';
  const scrolls: Partial<Record<TuneCat, number>> = {};
  const keepScroll = () => {
    const body = root.querySelector('.body');
    if (body && view === 'cards') scrolls[cat] = body.scrollTop;
  };
  const restoreScroll = () => {
    const body = root.querySelector('.body');
    if (body) body.scrollTop = scrolls[cat] ?? 0;
  };
  let view: 'cards' | 'export' | 'history' = 'cards';
  const draft: Record<string, number> = {}; // edits not applied yet
  const current = (path: string) => draft[path] ?? stored.applied[path] ?? GAME_VALUES.get(path)!;
  const tunedPaths = () => Object.keys(stored.applied);

  const root = document.createElement('div');
  root.id = 'tuner';
  // Keys typed here stay out of the game's own controls.
  for (const t of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
    root.addEventListener(t, (ev) => ev.stopPropagation());
  }

  const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', txt = '') => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt) n.textContent = txt;
    return n;
  };

  const show = () => {
    game.pause();
    if (game.input.keyboard) game.input.keyboard.enabled = false;
    view = 'cards';
    document.body.append(root);
    render();
    restoreScroll();
  };
  const hide = () => {
    keepScroll();
    root.remove();
    if (game.input.keyboard) game.input.keyboard.enabled = true;
    game.resume();
  };
  open.addEventListener('click', show);

  const flash = (msg: string) => {
    const s = root.querySelector('.status');
    if (s) { s.textContent = msg; (s as HTMLElement).style.color = '#f8b800'; }
  };

  function render() {
    root.replaceChildren();
    const top = el('div', 'top');
    top.append(el('h1', '', view === 'export' ? 'EXPORT' : view === 'history' ? 'HISTORY' : 'TUNER'));
    const close = el('button', '', view === 'cards' ? 'CLOSE' : 'BACK');
    close.addEventListener('click', () => { if (view === 'cards') hide(); else { view = 'cards'; render(); restoreScroll(); } });
    top.append(close);
    root.append(top);

    const body = el('div', 'body');
    if (view === 'cards') {
      const tabs = el('div', 'tabs');
      for (const c of CATS) {
        const b = el('button', c.id === cat ? 'on' : '', c.label);
        b.addEventListener('click', () => { keepScroll(); cat = c.id; render(); restoreScroll(); });
        tabs.append(b);
      }
      root.append(tabs);
      const list = ENTRIES.filter((e) => e.cat === cat);
      for (const e of list) body.append(card(e));
    } else if (view === 'export') exportView(body);
    else historyView(body);
    root.append(body);

    const foot = el('div', 'foot');
    const pending = Object.keys(draft).length;
    const tuned = tunedPaths().length;
    foot.append(el('div', 'status', pending ? `${pending} EDIT${pending > 1 ? 'S' : ''} NOT APPLIED`
      : tuned ? `${tuned} VALUE${tuned > 1 ? 'S' : ''} DIFFER FROM THE GAME` : 'ALL VALUES AS THE GAME SHIPS'));
    const btns = el('div', 'btns');
    const add = (cls: string, label: string, fn: () => void, enabled = true) => {
      const b = el('button', cls, label);
      b.disabled = !enabled;
      b.addEventListener('click', fn);
      btns.append(b);
    };
    add('apply', 'APPLY', apply, pending > 0);
    add('clear', 'CLEAR', clear, pending + tuned > 0);
    add('export', 'EXPORT', () => { keepScroll(); view = 'export'; render(); });
    add('hist', 'HISTORY', () => { keepScroll(); view = 'history'; render(); });
    foot.append(btns);
    root.append(foot);
  }

  function card(e: TuneEntry) {
    const c = el('div', 'card');
    const head = el('div', 'head');
    const pic = e.image && picture(e.image.key, e.image.tint);
    if (pic) head.append(pic);
    head.append(el('h2', '', e.name));
    c.append(head);
    if (e.desc) c.append(el('div', 'desc', e.desc));
    // Weapons and gear: what they cost at each level, the buy price then each
    // Base vendor upgrade, as one row.
    const costs = e.flat.some((f) => f.key === 'cost2');
    if (costs) {
      const cells = ['price', 'cost2', 'cost3', 'cost4', 'cost5'].map((k, n) => ({ path: flatPath(e, k), label: `LV ${n + 1}` }));
      c.append(grid('COST PER LEVEL (CREDITS: LV 1 BUYS IT, 2-5 UPGRADE IT)', cells, { min: 0, max: 100000, whole: true }));
    }
    // Single numbers next, each a row of its own.
    for (const f of e.flat) {
      if (costs && (f.key === 'price' || f.key.startsWith('cost'))) continue;
      const stat = el('div', 'stat');
      stat.append(stepper(flatPath(e, f.key), f.label, f.step, () => {}));
      c.append(stat);
    }
    for (const t of e.taken) {
      c.append(grid(t.label, DTYPES.map((d) => ({ path: `${flatPath(e, t.key)}.${d}`, label: d.slice(0, 3).toUpperCase(), color: DTYPE_COLOR[d] })),
        { min: 0, max: 10000 }));
    }
    const levelKeys = Object.keys(e.levels);
    if (e.levels.shots) c.append(levelGrid(e, 'shots'));
    // Spread sits under the shot counts it fans out.
    const keys = Object.keys(e.values).sort((a, b) => Number(b === 'angle') - Number(a === 'angle'));
    for (const key of keys) {
      const prop = propOf(e, key);
      const from = prop.from ?? 1;
      const stat = el('div', 'stat');
      // What the pair works out to at each level, as it stands with edits.
      const lvls = el('div', 'lvls');
      const showLevels = () => {
        const pair = [current(pathOf(e, key, 0)), current(pathOf(e, key, 1))] as [number, number];
        const at = Array.from({ length: MAX_WEAPON_LEVEL }, (_, n) => fmt(atLv(pair, n + 1, from)));
        lvls.textContent = `LV 1-5: ${at.join(' ')}`;
      };
      stat.append(el('div', 'lbl', prop.label), lvls);
      stat.append(
        stepper(pathOf(e, key, 0), from > 1 ? `AT LV ${from}` : 'AT LV 1', prop.step, showLevels),
        stepper(pathOf(e, key, 1), 'PER LV', prop.step, showLevels),
      );
      showLevels();
      c.append(stat);
      // Numbers set level by level that belong with this one go right under it.
      for (const lk of levelKeys) if (levelPropOf(e, lk).after === key) c.append(levelGrid(e, lk));
    }
    // The other numbers set level by level go at the bottom.
    for (const lk of levelKeys) {
      const after = levelPropOf(e, lk).after;
      if (lk !== 'shots' && !(after && after in e.values)) c.append(levelGrid(e, lk));
    }
    return c;
  }

  // A card's picture: the game's own texture, drawn 3x, tinted the way the game tints it.
  const pics = new Map<string, string>();
  function picture(key: string, tint?: number) {
    if (key === 'barriercell') return barrierCell();
    if (!game.textures.exists(key)) return null;
    const id = `${key}:${tint ?? ''}`;
    if (!pics.has(id)) {
      const src = game.textures.get(key).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
      const cv = document.createElement('canvas');
      cv.width = src.width;
      cv.height = src.height;
      const ctx = cv.getContext('2d')!;
      ctx.drawImage(src, 0, 0);
      if (tint !== undefined) {
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `#${tint.toString(16).padStart(6, '0')}`;
        ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(src, 0, 0);
      }
      pics.set(id, cv.toDataURL());
    }
    const tex = game.textures.get(key).getSourceImage();
    return pictureImg(pics.get(id)!, tex.width, tex.height);
  }

  // Up to 3x, no taller than 48 px or wider than 120 px.
  function pictureImg(src: string, w: number, h: number) {
    const k = Math.min(3, 48 / h, 120 / w);
    const img = el('img', 'pic');
    img.src = src;
    img.alt = '';
    img.style.width = `${Math.round(w * k)}px`;
    img.style.height = `${Math.round(h * k)}px`;
    return img;
  }

  // A Hive barrier cell has no texture (the game draws it each frame), so it's drawn here the same way.
  function barrierCell() {
    const cv = document.createElement('canvas');
    cv.width = 30;
    cv.height = 12;
    const ctx = cv.getContext('2d')!;
    ctx.fillStyle = '#6c0c3c';
    ctx.beginPath(); ctx.roundRect(1, 0, 28, 12, 4); ctx.fill();
    ctx.fillStyle = '#a40080';
    ctx.beginPath(); ctx.roundRect(3, 2, 24, 7, 3); ctx.fill();
    ctx.fillStyle = '#f878f8';
    ctx.fillRect(5, 3, 4, 1);
    return pictureImg(cv.toDataURL(), cv.width, cv.height);
  }

  // A number set level by level: a box for each of levels 1 to 5.
  function levelGrid(e: TuneEntry, key: string) {
    const prop = levelPropOf(e, key);
    return grid(prop.label, Array.from({ length: MAX_WEAPON_LEVEL }, (_, n) => ({ path: levelPath(e, key, n + 1), label: `LV ${n + 1}` })), prop);
  }

  // A row of boxes, each one number, with what the game ships under it where they differ.
  function grid(label: string, cells: { path: string; label: string; color?: number }[], prop: { min: number; max: number; whole?: boolean }) {
    const stat = el('div', 'stat');
    stat.append(el('div', 'lbl', label));
    const row = el('div', 'shots');
    for (const { path, label: name, color } of cells) {
      const cell = el('label', 'cell');
      const input = el('input');
      input.type = 'text';
      input.inputMode = 'decimal';
      input.value = fmt(current(path));
      cell.classList.toggle('draft', path in draft);
      cell.classList.toggle('tuned', !(path in draft) && path in stored.applied);
      input.addEventListener('change', () => {
        let v = parseFloat(input.value);
        if (prop.whole) v = Math.round(v);
        setValue(path, Number.isFinite(v) ? Math.min(prop.max, Math.max(prop.min, v)) : current(path));
      });
      const tag = el('span', '', name);
      if (color !== undefined) tag.style.color = `#${color.toString(16).padStart(6, '0')}`;
      cell.append(tag, input);
      row.append(cell);
    }
    stat.append(row);
    const changed = cells.filter(({ path }) => current(path) !== GAME_VALUES.get(path))
      .map(({ path, label: name }) => `${name} ${fmt(GAME_VALUES.get(path)!)}`);
    if (changed.length) stat.append(el('div', 'game', `GAME: ${changed.join(', ')}`));
    return stat;
  }

  // A number edited: kept as an edit until APPLY, unless it's back to what's applied.
  function setValue(path: string, v: number) {
    if (!Number.isFinite(v)) return;
    v = Math.round(v * 1000) / 1000;
    if (v === (stored.applied[path] ?? GAME_VALUES.get(path))) delete draft[path];
    else draft[path] = v;
    refreshFoot();
  }

  // One editable number: its name, - and + buttons, and the game's value under
  // the name when it differs (tap it to go back).
  function stepper(path: string, name: string, step: number, onChange: () => void) {
    const game0 = GAME_VALUES.get(path)!;
    const row = el('div', 'row');
    const lbl = el('div', 'lbl', name);
    const gameLbl = el('span', 'game');
    lbl.append(gameLbl);
    const input = el('input');
    input.type = 'text';
    input.inputMode = 'decimal';
    const minus = el('button', '', '-');
    const plus = el('button', '', '+');
    const paint = () => {
      const v = current(path);
      if (document.activeElement !== input) input.value = fmt(v);
      row.classList.toggle('draft', path in draft);
      row.classList.toggle('tuned', !(path in draft) && path in stored.applied);
      gameLbl.textContent = v !== game0 ? `GAME: ${fmt(game0)} (TAP)` : '';
    };
    const set = (v: number) => {
      setValue(path, v);
      paint();
      onChange();
    };
    minus.addEventListener('click', () => set(current(path) - step));
    plus.addEventListener('click', () => set(current(path) + step));
    input.addEventListener('change', () => { set(parseFloat(input.value)); input.value = fmt(current(path)); });
    gameLbl.addEventListener('click', () => set(game0));
    paint();
    row.append(lbl, minus, input, plus);
    return row;
  }

  // The footer's count and buttons, without rebuilding the cards (and losing scroll).
  function refreshFoot() {
    const body = root.querySelector('.body');
    const scroll = body?.scrollTop ?? 0;
    render();
    const nb = root.querySelector('.body');
    if (nb) nb.scrollTop = scroll;
  }

  function apply() {
    for (const [path, v] of Object.entries(draft)) {
      if (v === GAME_VALUES.get(path)) delete stored.applied[path];
      else stored.applied[path] = v;
      delete draft[path];
    }
    save(stored);
    setLive();
    refreshFoot();
    flash('APPLIED. CLOSE TO PLAY WITH THEM.');
  }

  function clear() {
    if (!confirm('Put every value back to the game\'s? This drops applied and unapplied changes.')) return;
    for (const k of Object.keys(draft)) delete draft[k];
    stored.applied = {};
    save(stored);
    setLive();
    refreshFoot();
    flash('CLEARED. EVERYTHING IS AS THE GAME SHIPS.');
  }

  const describe = (path: string) => {
    const at = BY_PATH.get(path);
    if (!at) return path;
    const name = at.entry.name;
    if (at.kind === 'flat') return `${name}: ${at.label!.toLowerCase()}`;
    if (at.kind === 'taken') {
      const part = at.key === 'taken' ? '' : ` (${at.key.slice(0, -5).replace(/([A-Z])/g, ' $1').toLowerCase()})`;
      return `${name}: damage taken %${part}, ${at.prop}`;
    }
    if (at.kind === 'level') return `${name}: ${levelPropOf(at.entry, at.key).label.toLowerCase()}, lv ${at.i + 1}`;
    const from = propOf(at.entry, at.key).from ?? 1;
    return `${name}: ${propOf(at.entry, at.key).label.toLowerCase()}, ${at.i ? 'per lv' : `at lv ${from}`}`;
  };
  const exportText = (x: LocalExport) => [
    `TUNER EXPORT ${x.date}`,
    ...x.changes.map((c) => `${c.path}: ${fmt(c.from)} -> ${fmt(c.to)}  (${describe(c.path)})`),
  ].join('\n');

  function exportView(body: HTMLElement) {
    if (Object.keys(draft).length) {
      body.append(el('div', 'note', 'SOME EDITS AREN\'T APPLIED YET. ONLY APPLIED VALUES ARE EXPORTED.'));
    }
    const changes: TuneChange[] = tunedPaths().sort()
      .map((path) => ({ path, from: GAME_VALUES.get(path)!, to: stored.applied[path] }));
    if (!changes.length) {
      body.append(el('div', 'note', 'NOTHING TO EXPORT. APPLY SOME CHANGES FIRST.'));
      return;
    }
    const d = new Date();
    const x: LocalExport = { date: `${d.toISOString().slice(0, 10)} ${d.toTimeString().slice(0, 5)}`, changes };
    // Kept so it can be copied again from History until it's in the game.
    const last = stored.exports[stored.exports.length - 1];
    if (!last || JSON.stringify(last.changes) !== JSON.stringify(changes)) {
      stored.exports.push(x);
      save(stored);
    }
    body.append(el('div', 'note', `${changes.length} CHANGED VALUE${changes.length > 1 ? 'S' : ''}. COPY THIS AND PASTE IT IN THE PROJECT CHAT TO ADD IT TO THE GAME.`));
    body.append(copyBox(exportText(last && JSON.stringify(last.changes) === JSON.stringify(changes) ? last : x)));
  }

  function copyBox(txt: string) {
    const wrap = el('div', 'rev');
    const ta = el('textarea');
    ta.readOnly = true;
    ta.value = txt;
    const copy = el('button', 'export', 'COPY');
    copy.style.marginTop = '6px';
    copy.style.width = '100%';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(txt); copy.textContent = 'COPIED'; } catch {
        ta.focus(); ta.select(); copy.textContent = 'SELECTED: COPY IT FROM THE MENU';
      }
    });
    wrap.append(ta, copy);
    return wrap;
  }

  function historyView(body: HTMLElement) {
    if (stored.exports.length) {
      body.append(el('div', 'note', 'EXPORTED, NOT IN THE GAME YET'));
      for (const x of stored.exports.slice().reverse()) body.append(copyBox(exportText(x)));
    }
    body.append(el('div', 'note', TUNE_HISTORY.length ? 'IN THE GAME, NEWEST FIRST' : 'NO EXPORTS HAVE BEEN ADDED TO THE GAME YET.'));
    for (const rev of TUNE_HISTORY.slice().reverse()) {
      const box = el('div', 'rev');
      box.append(el('h2', '', `REVISION ${rev.n} · ${rev.date}`));
      const ul = el('ul');
      for (const c of rev.changes) ul.append(el('li', '', `${describe(c.path)}: ${fmt(c.from)} -> ${fmt(c.to)}`));
      const back = el('button', 'hist', `GO BACK TO BEFORE REVISION ${rev.n}`);
      back.style.width = '100%';
      back.addEventListener('click', () => revertTo(rev.n));
      box.append(ul, back);
      body.append(box);
    }
  }

  // Values as they were before revision n: each value any revision from n on
  // changed goes back to its value before the first of them. They come in as
  // edits, ready to APPLY, then EXPORT to make the step back stick.
  function revertTo(n: number) {
    const before = new Map<string, number>();
    for (const rev of TUNE_HISTORY.filter((r) => r.n >= n).sort((a, b) => b.n - a.n)) {
      for (const c of rev.changes) before.set(c.path, c.from);
    }
    for (const [path, v] of before) {
      if (!BY_PATH.has(path)) continue;
      if (v === (stored.applied[path] ?? GAME_VALUES.get(path))) delete draft[path];
      else draft[path] = v;
    }
    view = 'cards';
    render();
    flash(`VALUES FROM BEFORE REVISION ${n} ARE READY. APPLY TO TRY THEM.`);
  }
}
