import type Phaser from 'phaser';
import { FONT, H, W } from '../config';
import { ENEMY_KINDS, PATTERNS, type LevelDef, type Wave } from '../data/levels';
import { ENEMY_STATS } from '../data/enemies';
import { testSave } from '../combatTest';
import { TextError, itemLines, read } from './format';
import {
  applyTab, blankLevel, changes, deepCopy, gameDef, gameEntries, gameWave, isEdited, levelText, loadDrafts, newDraft,
  playAsFor, pushUndo, saveDrafts, SEG_LISTS, shiftWaveEvents, segName, tabText, type Draft, type Part, type Tab,
} from './model';
import { EditView, LINE_Y, PX, formation, segAt } from './view';
import { playtestReached } from './back';

// The Level Editor (?edit, or with ?test): a page over the game for changing
// levels and making new ones. A level opens in the scroll view (view.ts),
// the whole level laid out to scroll through, where tapping a wave opens the
// wave editor and tapping empty space adds one. CODE opens the code editor:
// each tab shows part of the level as text, in the same form as levels.ts,
// and changes wait until APPLY. PLAY flies the level from the play line (or
// the picked wave), without touching the real save, and the pause menu's
// RETURN TO EDITOR comes back to where the playtest got to. EXPORT gives the
// level as text to paste back in the project so it can be written into the
// code. Drafts are kept in this browser only.

export const editorEnabled = () => {
  const q = new URLSearchParams(location.search);
  return q.has('edit') || q.has('test');
};
export const editorLink = () => new URLSearchParams(location.search).has('edit');

// What the game needs to fly a draft (see GameScene's `edit`).
export interface EditPlay { level: LevelDef; num: number; side?: string; segment: number; wave: number }

let showEditor: (() => void) | null = null;
export const openEditor = () => showEditor?.();

const CSS = `
body.in-editor #tuner-btn { display: none; }
#editor { position: fixed; inset: 0; z-index: 20; background: #000; color: #fcfcfc; font: 8px/1.6 ${FONT};
  display: flex; flex-direction: column; user-select: none; -webkit-user-select: none; touch-action: manipulation; }
#editor * { box-sizing: border-box; }
#editor button, #editor select { font: inherit; color: inherit; background: #000; border: 1px solid currentColor; padding: 7px 6px; cursor: pointer; }
#editor button:active { background: #3c3c3c; }
#editor button:disabled { opacity: .35; }
#editor .top { display: flex; align-items: center; gap: 6px; padding: calc(env(safe-area-inset-top) + 8px) 10px 6px; }
#editor .top h1 { font-size: 10px; margin: 0; flex: 1; color: #f8b800; font-weight: normal; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: center; }
#editor .play { color: #58d854; }
#editor .tabs { display: flex; gap: 4px; padding: 0 10px 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; flex: none; }
#editor .tabs::-webkit-scrollbar { display: none; }
#editor .tabs button { flex: none; color: #7c7c7c; padding: 6px 7px; white-space: nowrap; }
#editor .tabs button.on { color: #f8b800; background: #3c2800; }
#editor .tabs button.dirty::after { content: ' *'; color: #f8b800; }
#editor .tabs .grow { flex: 1; }
#editor .body { flex: 1; overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 0 10px 10px; }
#editor .body.panel-open { padding-bottom: 56vh; }
#editor .home { display: grid; gap: 10px; max-width: 320px; margin: 40px auto 0; }
#editor .home h2 { font-size: 14px; text-align: center; color: #f8b800; font-weight: normal; margin: 0 0 12px; }
#editor .home button { padding: 12px 8px; font-size: 10px; }
#editor .sect { color: #7c7c7c; margin: 14px 0 6px; max-width: 520px; margin-inline: auto; }
#editor .lvl { display: flex; gap: 6px; max-width: 520px; margin: 0 auto 6px; }
#editor .lvl .open { flex: 1; text-align: left; display: flex; gap: 8px; }
#editor .lvl .open .n { color: #7c7c7c; width: 52px; flex: none; }
#editor .lvl .open .tag { margin-left: auto; color: #f8b800; }
#editor .lvl .drop { color: #d82800; width: 32px; }
#editor textarea { width: 100%; min-height: 60vh; font: 12px/1.5 ui-monospace, Menlo, monospace; color: #fcfcfc; background: #111;
  border: 1px solid #3c3c3c; padding: 8px; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2;
  user-select: text; -webkit-user-select: text; touch-action: auto; }
#editor textarea.bad { border-color: #d82800; }
#editor .wave { display: flex; align-items: center; gap: 6px; width: 100%; max-width: 520px; margin: 0 auto 3px; text-align: left; border-color: #3c3c3c; padding: 4px 6px; }
#editor .wave.sel { border-color: #f8b800; background: #3c2800; }
#editor .wave .t { color: #7c7c7c; width: 34px; flex: none; }
#editor .wave canvas { width: 24px; height: 24px; image-rendering: pixelated; flex: none; object-fit: contain; }
#editor .wave .k { flex: 1; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
#editor .wave .d { color: #7c7c7c; flex: none; }
#editor .wait { max-width: 520px; margin: 4px auto 3px; text-align: center; color: #3cbcfc; border-top: 1px dashed #3cbcfc; padding-top: 2px; }
#editor .add { display: block; width: 100%; max-width: 520px; margin: 8px auto; color: #58d854; }
#editor .danger { color: #d82800; display: block; margin: 10px auto 0; }
#editor .foot { border-top: 1px solid #3c3c3c; padding: 6px 10px calc(env(safe-area-inset-bottom) + 8px); flex: none; }
#editor .status { text-align: center; color: #7c7c7c; min-height: 13px; margin-bottom: 6px; }
#editor .status.err { color: #d82800; }
#editor .status.ok { color: #58d854; }
#editor .btns { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; max-width: 520px; margin: 0 auto; }
#editor .apply { color: #58d854; }
#editor .export { color: #f8b800; }
#editor .undo { color: #3cbcfc; }
#editor .note { color: #bcbcbc; max-width: 520px; margin: 6px auto; }
#editor .keys { position: fixed; left: 0; right: 0; z-index: 22; display: none; gap: 3px; padding: 4px; background: #1c1c1c; overflow-x: auto; }
#editor .keys.on.up { display: flex; }
#editor .keys button { flex: none; min-width: 34px; font: 13px ui-monospace, monospace; padding: 8px 6px; border-color: #7c7c7c; }
#editor .keys button.w { font: 8px ${FONT}; }
#editor .panel { position: fixed; left: 0; right: 0; bottom: 0; height: 54vh; z-index: 21; background: #000; border-top: 2px solid #f8b800;
  display: flex; flex-direction: column; padding: 8px 10px calc(env(safe-area-inset-bottom) + 8px); }
#editor .panel .in { flex: 1; overflow-y: auto; max-width: 520px; width: 100%; margin: 0 auto; }
#editor .panel .head { display: flex; align-items: center; gap: 6px; margin-bottom: 6px; }
#editor .panel .head h2 { flex: 1; margin: 0; font-size: 9px; font-weight: normal; color: #f8b800; }
#editor .panel canvas.pv { display: block; width: 100%; image-rendering: pixelated; background: #0c0c1c; border: 1px solid #3c3c3c; margin-bottom: 6px; }
#editor .panel .row { display: flex; align-items: center; gap: 6px; padding: 3px 0; }
#editor .panel .row .lbl { width: 54px; color: #7c7c7c; flex: none; }
#editor .panel select { flex: 1; min-width: 0; padding: 8px 4px; }
#editor .panel .step { width: 34px; padding: 8px 0; }
#editor .panel input.num { width: 70px; font: 12px ui-monospace, monospace; color: #fcfcfc; background: #000; border: 1px solid #7c7c7c; padding: 7px 4px; text-align: center; }
#editor .panel input[type=range] { flex: 1; accent-color: #f8b800; height: 28px; }
#editor .panel .xv { width: 34px; text-align: right; }
#editor .panel label.check { display: flex; align-items: center; gap: 8px; padding: 5px 0; cursor: pointer; }
#editor .panel label.check input { width: 18px; height: 18px; accent-color: #f8b800; margin: 0; }
#editor .panel .pbtns { display: grid; grid-template-columns: repeat(6, 1fr); gap: 3px; max-width: 520px; width: 100%; margin: 6px auto 0; }
#editor .panel .pbtns button { padding: 8px 0; }
#editor.view { background: transparent; pointer-events: none; }
#editor.view > * { pointer-events: auto; }
#editor.view .top { background: rgba(0, 0, 0, .75); }
#editor.view .top .t { flex: 1; text-align: center; color: #58d854; white-space: nowrap; }
#editor.view .status { position: fixed; left: 0; right: 0; pointer-events: none; text-shadow: 0 0 3px #000, 0 0 3px #000; }
#editor .strip { position: fixed; right: 0; width: 18px; touch-action: none; image-rendering: pixelated; }
#editor .pop { position: fixed; z-index: 23; display: grid; gap: 4px; background: #000; border: 1px solid #fcfcfc; padding: 4px; }
#editor .pop button { padding: 9px 10px; }
`;

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', txt = '') => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (txt) n.textContent = txt;
  return n;
};

const clock = (ms: number) => {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export function installEditor(game: Phaser.Game) {
  let { drafts, clip } = loadDrafts();
  const persist = () => saveDrafts(drafts, clip);

  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);

  const root = el('div');
  root.id = 'editor';
  // Keys typed here stay out of the game's own controls.
  for (const t of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
    root.addEventListener(t, (ev) => ev.stopPropagation());
  }

  // Where the editor is, kept while it's closed for a playtest.
  let screen: 'home' | 'list' | 'view' | 'edit' | 'export' = 'home';
  let cur: Draft | null = null;
  let tab: Tab = { seg: 0, part: 'waves' };
  let selSeg = 0; // the segment of the wave open in the wave editor
  const viewAt = new Map<string, number>(); // where each draft's scroll view was, by draft
  let textView = false; // the Waves tab as text instead of a list
  const pending = new Map<string, string>(); // tab text typed but not applied, by tab
  const scrolls = new Map<string, number>();
  let sel: number | null = null; // the wave open in the wave editor
  let status: { msg: string; kind: '' | 'err' | 'ok' } = { msg: '', kind: '' };
  let caretLine: number | null = null; // a line to put the cursor on after the next render

  const tabKey = (t: Tab) => (t.seg < 0 ? 'level' : `${t.seg}:${t.part}`);
  const usesText = () => tab.seg < 0 || tab.part !== 'waves' || textView;
  const locked = (d: Draft) => !!(d.def.hive || d.def.gate); // their tracks are laid part by part (hive.ts, mawgate.ts)

  const say = (msg: string, kind: '' | 'err' | 'ok' = '') => {
    status = { msg, kind };
    const s = root.querySelector('.status');
    if (s) { s.textContent = msg; s.className = `status ${kind}`; }
  };

  const show = () => {
    if (game.input.keyboard) game.input.keyboard.enabled = false;
    document.body.classList.add('in-editor');
    document.body.append(root);
    // Back from a playtest: the scroll view opens where it got to.
    const back = playtestReached.at;
    playtestReached.at = null;
    if (back && cur && screen === 'view') {
      const tl = view()?.tl;
      const spot = tl?.waves[back.segment]?.[back.wave - 1];
      viewAt.set(cur.key, spot ? spot.t : tl?.segs[back.segment]?.start ?? 0);
      sel = null;
    }
    render();
  };
  // `toTitle`: the scroll view gives way to the title screen (not a playtest).
  const hide = (toTitle = true) => {
    keepScroll();
    root.remove();
    document.body.classList.remove('in-editor');
    if (game.input.keyboard) game.input.keyboard.enabled = true;
    game.resume();
    if (toTitle && game.scene.isActive('EditView')) {
      game.scene.stop('EditView');
      game.scene.start('Title');
    }
  };
  showEditor = show;

  // --- The scroll view ---------------------------------------------------------------
  // A scene of its own, under the editor's buttons. The game only runs while
  // it's on screen; the editor's other pages cover it, so the game waits.

  const view = () => game.scene.getScene('EditView') as EditView | null;
  const hooks = {
    tapWave: (seg: number, i: number) => openPanel(seg, i),
    tapSpace: (t: number, x: number, cx: number, cy: number) => spaceMenu(t, x, cx, cy),
    editSeg: (seg: number) => openCode({ seg, part: tab.part }),
    addSeg: (at: number) => insertSegment(at),
    openEvent: (seg: number, k: number) => {
      const t: Tab = { seg, part: 'events' };
      caretLine = itemLines(tabText(cur!, t))[k] ?? 1;
      openCode(t);
    },
    moved: () => updateChrome(),
  };
  let shownKey = '';
  const syncGame = () => {
    if (screen !== 'view' || !cur) { game.pause(); return; }
    game.resume();
    if (!view()) game.scene.add('EditView', EditView);
    const v = view()!;
    v.hooks = hooks;
    if (!game.scene.isActive('EditView')) {
      for (const sc of game.scene.getScenes(true)) game.scene.stop(sc.scene.key);
      game.scene.start('EditView');
      shownKey = '';
    }
    if (shownKey !== cur.key) v.T = viewAt.get(cur.key) ?? 0;
    shownKey = cur.key;
    v.show({ def: cur.def, sel: sel === null ? null : { seg: selSeg, i: sel }, locked: locked(cur) });
    updateChrome();
  };
  // Keeps the scroll view's place for when it comes back.
  const keepView = () => { const v = view(); if (shownKey && v && game.scene.isActive('EditView')) viewAt.set(shownKey, v.T); };

  const keepScroll = () => {
    const body = root.querySelector('.body');
    if (body) scrolls.set(screen === 'edit' ? tabKey(tab) : screen, body.scrollTop);
  };

  // --- Drafts --------------------------------------------------------------------

  const open = (key: string, make: () => Draft) => {
    cur = drafts.get(key) ?? make();
    tab = { seg: 0, part: 'waves' };
    textView = false;
    sel = null;
    pending.clear();
    screen = 'view';
    say('');
    render();
  };

  const commit = (before: string) => {
    if (!cur) return;
    pushUndo(cur, before);
    drafts.set(cur.key, cur);
    persist();
  };

  // Applies every tab with typed changes. Returns false (and shows where) on a mistake.
  const applyPending = (): boolean => {
    if (!cur || !pending.size) return true;
    const before = levelText(cur.def);
    const trial = { def: deepCopy(cur.def), playAs: cur.playAs };
    for (const [k, txt] of pending) {
      const t: Tab = k === 'level' ? { seg: -1, part: 'waves' } : { seg: Number(k.split(':')[0]), part: k.split(':')[1] as Part };
      try {
        applyTab(trial, t, txt, itemLines);
      } catch (e) {
        const line = e instanceof TextError ? e.line : 1;
        tab = t;
        if (t.part === 'waves') textView = true;
        caretLine = line;
        render();
        say(`LINE ${line}: ${(e as Error).message}`, 'err');
        root.querySelector('textarea')?.classList.add('bad');
        return false;
      }
    }
    cur.def = trial.def;
    cur.playAs = trial.playAs;
    pending.clear();
    commit(before);
    return true;
  };

  const undo = () => {
    if (!cur) return;
    if (pending.size) {
      pending.clear();
      say('TYPED CHANGES DROPPED');
      render();
      return;
    }
    const prev = cur.undo.pop();
    if (prev === undefined) return;
    cur.def = read(prev) as unknown as LevelDef;
    if (tab.seg >= cur.def.segments.length) tab = { seg: cur.def.segments.length - 1, part: tab.part };
    sel = null;
    drafts.set(cur.key, cur);
    persist();
    render();
    say('UNDONE', 'ok');
  };

  // --- Playtest --------------------------------------------------------------------

  const play = () => {
    if (!cur) return;
    if (panelDirty()) applyPanel();
    if (!applyPending()) return;
    const d = cur;
    let seg = Math.max(0, tab.seg);
    let wave = 0;
    if (screen === 'view') {
      // The picked wave, or the first one on or above the play line.
      const v = view()!;
      if (sel !== null) { seg = selSeg; wave = sel; }
      else {
        const next = v.tl.waves.flat().find((w) => w.t >= v.T - 250);
        seg = next ? next.seg : segAt(v.tl, v.T);
        wave = next ? next.i : d.def.segments[seg].length;
      }
    } else if (tab.seg >= 0 && tab.part === 'waves') {
      if (sel !== null) wave = sel;
      else if (textView) {
        const ta = root.querySelector('textarea');
        if (ta) {
          const line = ta.value.slice(0, ta.selectionStart).split('\n').length;
          const lines = itemLines(ta.value);
          wave = Math.max(0, lines.filter((l) => l <= line).length - 1);
        }
      }
    }
    const state = testSave();
    state.level = d.playAs;
    const data: EditPlay = {
      level: deepCopy(d.def), num: d.playAs, side: d.base.kind === 'side' ? d.base.id : undefined,
      segment: seg, wave: Math.min(wave, d.def.segments[seg].length),
    };
    keepView();
    hide(false);
    for (const sc of game.scene.getScenes(true)) game.scene.stop(sc.scene.key);
    game.scene.start('Game', { state, edit: data });
  };

  // --- Wave editor ---------------------------------------------------------------

  let panelStart = ''; // the level when the wave editor opened or last applied
  let panelUndo: string[] = [];
  const panelDirty = () => sel !== null && !!cur && levelText(cur.def) !== panelStart;

  const openPanel = (seg: number, i: number) => {
    if (!cur) return;
    if (sel === i && selSeg === seg) return;
    if (panelDirty() && !confirm('THIS WAVE HAS CHANGES THAT AREN\'T APPLIED. DROP THEM?')) return;
    if (panelDirty()) cur.def = read(panelStart) as unknown as LevelDef;
    selSeg = seg;
    sel = i;
    panelStart = levelText(cur.def);
    panelUndo = [];
    render();
    root.querySelector('.wave.sel')?.scrollIntoView({ block: 'nearest' });
    if (screen === 'view') view()?.focus(seg, i);
  };
  const closePanel = () => {
    if (!cur) return;
    if (panelDirty()) {
      if (!confirm('DROP THE CHANGES TO THIS WAVE?')) return;
      cur.def = read(panelStart) as unknown as LevelDef;
    }
    sel = null;
    render();
  };
  const applyPanel = () => {
    if (!cur || !panelDirty()) return;
    commit(panelStart);
    panelStart = levelText(cur.def);
    panelUndo = [];
    say('APPLIED', 'ok');
  };

  // --- Rendering ---------------------------------------------------------------------

  function render() {
    keepScroll();
    keepView();
    root.replaceChildren();
    root.classList.toggle('view', screen === 'view');
    const top = el('div', 'top');
    root.append(top);
    syncGame();
    if (screen === 'view') { scrollView(top); return; }
    const body = el('div', 'body');
    if (screen === 'home') homeView(top, body);
    else if (screen === 'list') listView(top, body);
    else if (screen === 'export') exportView(top, body);
    else editView(top, body);
    const saved = scrolls.get(screen === 'edit' ? tabKey(tab) : screen);
    if (saved !== undefined) requestAnimationFrame(() => { body.scrollTop = saved; });
  }

  const backBtn = (top: HTMLElement, label: string, fn: () => void) => {
    const b = el('button', '', label);
    b.addEventListener('click', fn);
    top.append(b);
  };

  // The scroll view's buttons, over the level: LEVELS, the readout, CODE and
  // PLAY along the top, the level strip down the right, and the wave editor.
  function scrollView(top: HTMLElement) {
    const d = cur!;
    backBtn(top, 'LEVELS', () => {
      if (panelDirty() && !confirm('DROP THE CHANGES TO THIS WAVE?')) return;
      if (panelDirty()) d.def = read(panelStart) as unknown as LevelDef;
      sel = null;
      screen = 'list';
      say('');
      render();
    });
    top.append(el('span', 't'));
    backBtn(top, 'CODE', () => {
      const v = view();
      openCode({ seg: v ? segAt(v.tl, v.T) : 0, part: tab.seg < 0 ? 'waves' : tab.part });
    });
    const playBtn = el('button', 'play', 'PLAY');
    playBtn.addEventListener('click', play);
    top.append(playBtn);
    root.append(el('div', `status ${status.kind}`, status.msg));
    const strip = el('canvas', 'strip');
    root.append(strip);
    // Tap or drag on the strip to jump there.
    const jump = (ev: PointerEvent) => {
      const v = view();
      if (!v) return;
      const r = strip.getBoundingClientRect();
      const f = 1 - (ev.clientY - r.top) / r.height;
      v.setT(Math.max(0, Math.min(1, f)) * v.tl.end);
    };
    strip.addEventListener('pointerdown', (ev) => { strip.setPointerCapture(ev.pointerId); jump(ev); });
    strip.addEventListener('pointermove', (ev) => { if (strip.hasPointerCapture(ev.pointerId)) jump(ev); });
    if (sel !== null) wavePanel();
    requestAnimationFrame(updateChrome);
  }

  // The readout and the level strip, after the view moves or changes.
  function updateChrome() {
    const v = view();
    if (screen !== 'view' || !cur || !v) return;
    const tl = v.tl;
    const seg = segAt(tl, v.T);
    const t = root.querySelector('.top .t');
    if (t) t.textContent = `SEG ${seg + 1} · ${clock(Math.max(0, v.T - (tl.segs[seg]?.start ?? 0)))}`;
    const top = root.querySelector('.top') as HTMLElement | null;
    const panel = root.querySelector('.panel') as HTMLElement | null;
    const status = root.querySelector('.status') as HTMLElement | null;
    const y0 = top ? top.getBoundingClientRect().bottom : 0;
    if (status) status.style.top = `${y0 + 4}px`;
    const strip = root.querySelector('.strip') as HTMLCanvasElement | null;
    if (!strip) return;
    const y1 = panel ? panel.getBoundingClientRect().top : window.innerHeight;
    strip.style.top = `${y0}px`;
    strip.style.height = `${Math.max(40, y1 - y0)}px`;
    const w = 18, h = Math.round(Math.max(40, y1 - y0));
    if (strip.width !== w || strip.height !== h) { strip.width = w; strip.height = h; }
    const ctx = strip.getContext('2d')!;
    const end = Math.max(1, tl.end);
    const y = (ms: number) => Math.round(h - 4 - (ms / end) * (h - 8)); // the start at the bottom, like the view
    ctx.fillStyle = 'rgba(0, 0, 0, .8)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#f8b800';
    for (const s of tl.segs) ctx.fillRect(0, y(s.start), w, 1);
    tl.waves.forEach((list, s) => list.forEach((spot) => {
      const wave = cur!.def.segments[s][spot.i];
      ctx.fillStyle = wave?.waitClear ? '#3cbcfc' : '#bcbcbc';
      ctx.fillRect(7, y(spot.t), 4, 1);
    }));
    // What's on screen, and the play line.
    const top0 = v.T + LINE_Y / PX, bottom0 = v.T - (H - LINE_Y) / PX;
    ctx.strokeStyle = '#fcfcfc';
    ctx.strokeRect(1.5, y(Math.min(end, top0)) + 0.5, w - 3, Math.max(2, y(Math.max(0, bottom0)) - y(Math.min(end, top0))));
    ctx.fillStyle = '#58d854';
    ctx.fillRect(0, y(v.T), w, 2);
    if (sel !== null) {
      const spot = tl.waves[selSeg]?.[sel];
      if (spot) { ctx.fillStyle = '#f8b800'; ctx.fillRect(3, y(spot.t) - 1, 12, 3); }
    }
  }

  // Tapping empty space: a small menu there. For now, ADD WAVE.
  function spaceMenu(t: number, x: number, cx: number, cy: number) {
    root.querySelector('.pop')?.remove();
    if (!cur) return;
    if (sel !== null) { closePanel(); return; }
    const pop = el('div', 'pop');
    const add = el('button', 'apply', 'ADD WAVE');
    const cancel = el('button', '', 'CANCEL');
    add.addEventListener('click', () => { pop.remove(); addWaveAt(t, x); });
    cancel.addEventListener('click', () => pop.remove());
    pop.append(add, cancel);
    root.append(pop);
    const r = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(4, Math.min(window.innerWidth - r.width - 4, cx - r.width / 2))}px`;
    pop.style.top = `${Math.max(4, Math.min(window.innerHeight - r.height - 4, cy + 8))}px`;
  }

  // A wave at a moment and across-the-screen spot in the scroll view. Its delay
  // comes off the next wave's, so nothing after it moves, and it starts as a
  // copy of the nearest wave.
  function addWaveAt(t: number, x: number) {
    const d = cur!;
    const tl = view()!.tl;
    const seg = segAt(tl, t);
    const spots = tl.waves[seg];
    const start = tl.segs[seg].start;
    const at = Math.max(start, t);
    const i = spots.filter((s) => s.t <= at).length;
    const prev = i > 0 ? spots[i - 1].t : start;
    const delay = Math.max(0, Math.round((at - prev) / 100) * 100);
    const list = d.def.segments[seg];
    const near = [...spots].sort((a, b) => Math.abs(a.t - at) - Math.abs(b.t - at))[0];
    const like = near ? list[near.i] : { delay: 0, kind: 'dart', pattern: 'line', count: 5 } as Wave;
    const w: Wave = { delay, kind: like.kind, pattern: like.pattern };
    if (like.count !== undefined) w.count = like.count;
    if (!['line', 'pair'].includes(w.pattern) || like.x !== undefined) w.x = Math.round(Math.max(0, Math.min(1, x)) * 20) / 20;
    const before = levelText(d.def);
    list.splice(i, 0, w);
    shiftWaveEvents(d.def, seg, i, 1);
    if (list[i + 1]) list[i + 1].delay = Math.max(0, list[i + 1].delay - delay);
    commit(before);
    sel = null;
    openPanel(seg, i);
    say('WAVE ADDED', 'ok');
  }

  function homeView(top: HTMLElement, body: HTMLElement) {
    backBtn(top, 'CLOSE', () => hide());
    top.append(el('h1', '', 'LEVEL EDITOR'));
    root.append(body);
    const box = el('div', 'home');
    box.append(el('h2', '', 'LEVEL EDITOR'));
    const add = (label: string, fn: () => void, color = '') => {
      const b = el('button', '', label);
      if (color) b.style.color = color;
      b.addEventListener('click', fn);
      box.append(b);
    };
    if (cur) add(`CONTINUE: ${cur.def.name}`, () => { screen = 'view'; render(); }, '#58d854');
    add('NEW LEVEL', () => {
      let n = 1;
      while (drafts.has(`new:${n}`)) n++;
      open(`new:${n}`, () => newDraft(`new:${n}`, { kind: 'new' }, blankLevel(`new-${n}`)));
    }, '#f8b800');
    add('LOAD LEVEL', () => { screen = 'list'; render(); });
    body.append(box);
  }

  function listView(top: HTMLElement, body: HTMLElement) {
    backBtn(top, 'BACK', () => { screen = 'home'; render(); });
    top.append(el('h1', '', 'LOAD LEVEL'));
    root.append(body);
    const row = (label: string, name: string, key: string, make: () => Draft) => {
      const r = el('div', 'lvl');
      const b = el('button', 'open');
      b.append(el('span', 'n', label), el('span', '', name));
      const d = drafts.get(key);
      if (d && isEdited(d)) b.append(el('span', 'tag', d.base.kind === 'new' ? 'NEW' : 'EDITED'));
      b.addEventListener('click', () => open(key, make));
      r.append(b);
      if (d) {
        const x = el('button', 'drop', 'X');
        x.title = 'Drop this draft';
        x.addEventListener('click', () => {
          if (!confirm(`DROP YOUR DRAFT OF ${d.def.name}? THIS CAN'T BE UNDONE.`)) return;
          drafts.delete(key);
          if (cur?.key === key) cur = null;
          persist();
          render();
        });
        r.append(x);
      }
      body.append(r);
    };
    const entries = gameEntries();
    body.append(el('div', 'sect', 'STORY LEVELS'));
    for (const e of entries.filter((x) => x.base.kind === 'level')) row(e.label, (drafts.get(e.key)?.def ?? e.def).name, e.key, () => newDraft(e.key, e.base, e.def));
    body.append(el('div', 'sect', 'SIDE MISSIONS'));
    for (const e of entries.filter((x) => x.base.kind === 'side')) row(e.label, (drafts.get(e.key)?.def ?? e.def).name, e.key, () => newDraft(e.key, e.base, e.def));
    const mine = [...drafts.values()].filter((d) => d.base.kind === 'new');
    if (mine.length) {
      body.append(el('div', 'sect', 'YOUR NEW LEVELS'));
      for (const d of mine) row('NEW', d.def.name, d.key, () => d);
    }
  }

  function exportView(top: HTMLElement, body: HTMLElement) {
    backBtn(top, 'BACK', () => { screen = 'edit'; render(); });
    top.append(el('h1', '', 'EXPORT'));
    root.append(body);
    if (!cur) return;
    const date = new Date().toISOString().slice(0, 10);
    const lines = changes(cur);
    const where = cur.base.kind === 'level' ? `STORY LEVEL ${cur.base.n}` : cur.base.kind === 'side' ? `SIDE MISSION ${cur.base.id}` : `NEW LEVEL, FLIES AS LEVEL ${cur.playAs}`;
    const txt = [`// LEVEL EDITOR EXPORT ${date}: ${cur.def.id} (${where})`, ...lines.map((l) => `// ${l}`), levelText(cur.def)].join('\n');
    body.append(el('div', 'note', 'COPY THIS AND PASTE IT IN THE PROJECT CHAT TO HAVE IT ADDED TO THE GAME.'));
    for (const l of lines) body.append(el('div', 'note', l));
    const ta = el('textarea');
    ta.readOnly = true;
    ta.value = txt;
    body.append(ta);
    const foot = el('div', 'foot');
    const s = el('div', `status ${status.kind}`, status.msg);
    const copy = el('button', 'export', 'COPY');
    copy.style.width = '100%';
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(txt);
        copy.textContent = 'COPIED';
      } catch {
        ta.focus();
        ta.select();
        copy.textContent = 'SELECTED: COPY IT FROM THE MENU';
      }
    });
    foot.append(s, copy);
    root.append(foot);
  }

  function editView(top: HTMLElement, body: HTMLElement) {
    const d = cur!;
    backBtn(top, 'BACK', () => {
      // Typed changes come along when they read cleanly; otherwise stay to fix them.
      if (panelDirty()) applyPanel();
      if (!applyPending()) return;
      sel = null;
      screen = 'view';
      say('');
      render();
    });
    top.append(el('h1', '', d.def.name));
    const playBtn = el('button', 'play', 'PLAY');
    playBtn.addEventListener('click', play);
    top.append(playBtn);

    // Row one: the whole level, then each segment.
    const segs = el('div', 'tabs');
    const segTab = (seg: number, label: string) => {
      const dirty = [...pending.keys()].some((k) => (seg < 0 ? k === 'level' : k.startsWith(`${seg}:`)));
      const b = el('button', `${tab.seg === seg ? 'on' : ''} ${dirty ? 'dirty' : ''}`, label);
      b.addEventListener('click', () => switchTab({ seg, part: tab.part }));
      segs.append(b);
    };
    segTab(-1, '0. LEVEL');
    d.def.segments.forEach((_, i) => segTab(i, `${i + 1}. ${segName(d.def, i)}`));
    if (!locked(d)) {
      const plus = el('button', '', '+');
      plus.title = 'Add a segment';
      plus.addEventListener('click', () => insertSegment(d.def.segments.length));
      segs.append(plus);
    }
    root.append(segs);
    requestAnimationFrame(() => segs.querySelector('.on')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }));

    // Row two: the parts of a segment.
    if (tab.seg >= 0) {
      const parts = el('div', 'tabs');
      for (const [p, label] of [['waves', 'WAVES'], ['hazards', 'HAZARDS'], ['events', 'EVENTS'], ['segment', 'SEGMENT']] as [Part, string][]) {
        const dirty = pending.has(`${tab.seg}:${p}`);
        const b = el('button', `${tab.part === p ? 'on' : ''} ${dirty ? 'dirty' : ''}`, label);
        b.addEventListener('click', () => switchTab({ seg: tab.seg, part: p }));
        parts.append(b);
      }
      if (tab.part === 'waves') {
        parts.append(el('span', 'grow'));
        const v = el('button', '', textView ? 'LIST' : 'TEXT');
        v.addEventListener('click', toggleView);
        parts.append(v);
      }
      root.append(parts);
    }

    root.append(body);
    if (usesText()) textBody(body);
    else waveList(body);

    const foot = el('div', 'foot');
    foot.append(el('div', `status ${status.kind}`, status.msg));
    const btns = el('div', 'btns');
    const add = (cls: string, label: string, fn: () => void, enabled = true) => {
      const b = el('button', cls, label);
      b.disabled = !enabled;
      b.addEventListener('click', fn);
      btns.append(b);
    };
    add('undo', 'UNDO', undo, pending.size > 0 || d.undo.length > 0);
    add('apply', 'APPLY', () => { if (applyPending()) { render(); say('APPLIED', 'ok'); } }, pending.size > 0);
    add('export', 'EXPORT', () => {
      if (pending.size && !confirm('SOME TYPED CHANGES AREN\'T APPLIED, SO THEY WON\'T BE IN THE EXPORT. GO ON?')) return;
      screen = 'export';
      say('');
      render();
    });
    foot.append(btns);
    root.append(foot);

    if (sel !== null && !usesText()) wavePanel();
    else sel = null;
  }

  const switchTab = (t: Tab) => {
    if (panelDirty() && !confirm('DROP THE CHANGES TO THIS WAVE?')) return;
    if (panelDirty()) cur!.def = read(panelStart) as unknown as LevelDef;
    keepScroll();
    sel = null;
    tab = t;
    say('');
    render();
  };

  const toggleView = () => {
    if (textView && pending.has(tabKey(tab))) {
      if (!applyPending()) return;
      say('APPLIED', 'ok');
    }
    if (!textView && panelDirty() && !confirm('DROP THE CHANGES TO THIS WAVE?')) return;
    if (!textView && panelDirty()) cur!.def = read(panelStart) as unknown as LevelDef;
    textView = !textView;
    sel = null;
    render();
  };

  // A new segment with one wave, before segment `at` (or at the end).
  const insertSegment = (at: number) => {
    if (!cur || locked(cur)) return;
    if (panelDirty()) applyPanel();
    if (!applyPending()) return;
    const before = levelText(cur.def);
    const def = cur.def;
    const n = def.segments.length + 1;
    def.segments.splice(at, 0, [{ delay: 2500, kind: 'dart', pattern: 'line', count: 5 }]);
    def.segmentHazards?.splice(at, 0, []);
    for (const k of SEG_LISTS) {
      if (k === 'segmentHazards') continue;
      const list = def[k] as unknown[] | undefined;
      if (!list) continue;
      list.length = Math.max(list.length, n - 1);
      list.splice(at, 0, undefined);
    }
    if (def.segmentThemes) def.segmentThemes[at] = def.theme;
    if (def.riftAfter !== undefined && def.riftAfter >= at) def.riftAfter++;
    if (def.riftExitAfter !== undefined && def.riftExitAfter >= at) def.riftExitAfter++;
    commit(before);
    sel = null;
    tab = { seg: at, part: 'waves' };
    if (screen === 'view') {
      // Its start on the play line.
      render();
      const v = view();
      if (v) v.setT(v.tl.segs[at]?.start ?? 0);
    } else {
      textView = false;
      render();
    }
    say(`SEGMENT ${at + 1} ADDED`, 'ok');
  };

  // The code editor, on a tab.
  const openCode = (t: Tab) => {
    if (panelDirty()) applyPanel();
    sel = null;
    tab = t;
    screen = 'edit';
    say('');
    render();
  };

  // Puts the whole draft back to the game's version of the level (UNDO brings it back).
  const resetLevel = () => {
    if (!cur) return;
    const game = gameDef(cur.base);
    if (!game) return;
    if (!confirm(`PUT ${cur.def.name} BACK TO HOW IT IS IN THE GAME? UNDO CAN BRING YOUR CHANGES BACK.`)) return;
    const before = levelText(cur.def);
    cur.def = deepCopy(game);
    cur.playAs = playAsFor(cur.base);
    pending.clear();
    sel = null;
    if (tab.seg >= cur.def.segments.length) tab = { seg: cur.def.segments.length - 1, part: tab.part };
    commit(before);
    render();
    say('LEVEL RESET TO THE GAME\'S', 'ok');
  };

  const removeSegment = () => {
    if (!cur || cur.def.segments.length < 2) return;
    if (!confirm(`REMOVE SEGMENT ${tab.seg + 1} AND ITS WAVES?`)) return;
    const before = levelText(cur.def);
    const def = cur.def;
    const s = tab.seg;
    def.segments.splice(s, 1);
    for (const k of SEG_LISTS) {
      (def[k] as unknown[] | undefined)?.splice(s, 1);
    }
    for (const k of ['riftAfter', 'riftExitAfter'] as const) {
      const r = def[k];
      if (r === s) delete def[k];
      else if (r !== undefined && r > s) def[k] = r - 1;
    }
    pending.clear();
    commit(before);
    tab = { seg: Math.min(s, def.segments.length - 1), part: 'waves' };
    render();
    say('SEGMENT REMOVED', 'ok');
  };

  function textBody(body: HTMLElement) {
    const d = cur!;
    const k = tabKey(tab);
    const ta = el('textarea');
    ta.spellcheck = false;
    ta.autocapitalize = 'off';
    ta.setAttribute('autocorrect', 'off');
    ta.value = pending.get(k) ?? tabText(d, tab);
    const base = tabText(d, tab);
    ta.addEventListener('input', () => {
      ta.classList.remove('bad');
      if (ta.value === base) pending.delete(k);
      else pending.set(k, ta.value);
      // Mark the tab, and let APPLY and UNDO through, without redrawing over the typing.
      root.querySelectorAll('.tabs button.on').forEach((b) => b.classList.toggle('dirty', pending.has(k) || (tab.seg >= 0 && [...pending.keys()].some((p) => p.startsWith(`${tab.seg}:`)))));
      const [u, a] = root.querySelectorAll<HTMLButtonElement>('.btns button');
      if (u) u.disabled = !(pending.size > 0 || d.undo.length > 0);
      if (a) a.disabled = pending.size === 0;
    });
    ta.addEventListener('focus', () => keys.classList.add('on'));
    ta.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== ta) keys.classList.remove('on'); }, 150));
    body.append(ta);
    // Grow to fit, so the page scrolls rather than the box.
    requestAnimationFrame(() => {
      ta.style.height = `${Math.max(ta.scrollHeight + 4, body.clientHeight * 0.6)}px`;
      if (caretLine !== null) {
        const lines = ta.value.split('\n');
        const at = lines.slice(0, caretLine - 1).reduce((n, l) => n + l.length + 1, 0);
        ta.focus();
        ta.setSelectionRange(at, at + (lines[caretLine - 1]?.length ?? 0));
        body.scrollTop = Math.max(0, (caretLine - 4) * 18);
        caretLine = null;
      }
    });
    if (tab.seg >= 0 && tab.part === 'segment' && !locked(d) && d.def.segments.length > 1) {
      const rm = el('button', 'danger', 'REMOVE THIS SEGMENT');
      rm.addEventListener('click', removeSegment);
      body.append(rm);
    }
    if (locked(d) && tab.seg < 0) body.append(el('div', 'note', 'THIS LEVEL\'S SET PIECE IS BUILT PART BY PART, SO ITS SEGMENTS CAN\'T BE ADDED OR REMOVED.'));
    if (tab.seg < 0 && d.base.kind !== 'new') {
      const rs = el('button', 'danger', 'RESET LEVEL TO THE GAME\'S');
      rs.addEventListener('click', resetLevel);
      body.append(rs);
    }
  }

  function waveList(body: HTMLElement) {
    const d = cur!;
    const waves = d.def.segments[tab.seg];
    if (sel !== null) body.classList.add('panel-open');
    let t = 0;
    waves.forEach((w, i) => {
      t += w.delay;
      if (w.waitClear) body.append(el('div', 'wait', 'WAIT FOR CLEAR'));
      const b = el('button', `wave ${sel === i ? 'sel' : ''}`);
      b.append(el('span', 't', clock(t)), sprite(w.kind));
      const shape = w.pattern === 'single' || w.pattern === 'pair' ? w.pattern.toUpperCase() : `${w.pattern.toUpperCase()} ${w.count ?? 1}`;
      const at = w.x !== undefined && !['line', 'pair'].includes(w.pattern) ? ` @${w.x}` : '';
      b.append(el('span', 'k', `${w.kind.toUpperCase()} ${shape}${at}`), el('span', 'd', `+${(w.delay / 1000).toFixed(1)}S`));
      b.addEventListener('click', () => openPanel(tab.seg, i));
      body.append(b);
    });
    if (!waves.length) body.append(el('div', 'note', 'NO WAVES YET.'));
    const add = el('button', 'add', '+ ADD WAVE');
    add.addEventListener('click', () => {
      if (panelDirty() && !confirm('DROP THE CHANGES TO THIS WAVE?')) return;
      if (panelDirty()) d.def = read(panelStart) as unknown as LevelDef;
      const before = levelText(d.def);
      const last = d.def.segments[tab.seg][d.def.segments[tab.seg].length - 1];
      d.def.segments[tab.seg].push(last ? { ...last, delay: 2500, waitClear: undefined } : { delay: 2500, kind: 'dart', pattern: 'line', count: 5 });
      commit(before);
      sel = null;
      openPanel(tab.seg, d.def.segments[tab.seg].length - 1);
      say('WAVE ADDED', 'ok');
    });
    body.append(add);
  }

  // The first frame of an enemy's picture, drawn small.
  const sprite = (kind: string) => {
    const c = el('canvas');
    const key = ENEMY_STATS[kind as keyof typeof ENEMY_STATS]?.texture ?? kind;
    if (!game.textures.exists(key)) { c.width = c.height = 1; return c; }
    const f = game.textures.get(key).get();
    c.width = f.cutWidth;
    c.height = f.cutHeight;
    c.getContext('2d')!.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight, 0, 0, f.cutWidth, f.cutHeight);
    return c;
  };

  function wavePanel() {
    const d = cur!;
    const seg = selSeg;
    const waves = d.def.segments[seg];
    const i = sel!;
    const w = waves?.[i];
    if (!w) { sel = null; return; }
    const panel = el('div', 'panel');
    const inner = el('div', 'in');
    const head = el('div', 'head');
    const time = waves.slice(0, i + 1).reduce((n, x) => n + x.delay, 0);
    head.append(el('h2', '', `${screen === 'view' ? `SEG ${seg + 1} · ` : ''}WAVE ${i + 1} OF ${waves.length} · ${clock(time)}`));
    const del = el('button', '', 'DELETE');
    del.style.color = '#d82800';
    del.addEventListener('click', () => {
      if (!confirm(`DELETE WAVE ${i + 1}?`)) return;
      const before = panelStart;
      waves.splice(i, 1);
      shiftWaveEvents(d.def, seg, i, -1);
      commit(before);
      sel = null;
      render();
      say('WAVE DELETED', 'ok');
    });
    const close = el('button', '', 'CLOSE');
    close.addEventListener('click', closePanel);
    head.append(del, close);
    inner.append(head);

    // A picture of where the ships come in, redrawn as values change.
    const PV_H = 64;
    const pv = el('canvas', 'pv');
    pv.width = W;
    pv.height = PV_H;
    const drawPreview = () => {
      const ctx = pv.getContext('2d')!;
      ctx.clearRect(0, 0, W, PV_H);
      ctx.fillStyle = '#3c3c3c';
      ctx.fillRect(0, PV_H - 14, W, 1);
      const key = ENEMY_STATS[w.kind]?.texture ?? w.kind;
      const f = game.textures.exists(key) ? game.textures.get(key).get() : null;
      for (const p of formation(w)) {
        const y = PV_H - 14 + p.y;
        if (!f) { ctx.fillStyle = '#f8b800'; ctx.fillRect(p.x - 2, y - 2, 4, 4); continue; }
        ctx.drawImage(f.source.image as CanvasImageSource, f.cutX, f.cutY, f.cutWidth, f.cutHeight,
          Math.round(p.x - f.cutWidth / 2), Math.round(y - f.cutHeight / 2), f.cutWidth, f.cutHeight);
      }
    };
    inner.append(pv);

    // Every change is shown at once; UNDO steps back through them.
    const before = () => panelUndo.push(levelText(d.def));
    const changed = () => {
      drawPreview();
      refreshRow();
      say(panelDirty() ? 'NOT APPLIED YET' : '');
    };
    const refreshRow = () => {
      if (screen === 'view') { syncGame(); return; }
      const body = root.querySelector('.body');
      if (!body) return;
      // Redraw the list under the panel, keeping its scroll.
      const top = body.scrollTop;
      body.replaceChildren();
      waveList(body as HTMLElement);
      body.scrollTop = top;
    };

    const row = (label: string) => {
      const r = el('div', 'row');
      r.append(el('span', 'lbl', label));
      inner.append(r);
      return r;
    };
    const select = (label: string, list: readonly string[], get: () => string, set: (v: string) => void) => {
      const s = el('select');
      for (const v of list) {
        const o = el('option', '', v.toUpperCase());
        o.value = v;
        s.append(o);
      }
      s.value = get();
      s.addEventListener('change', () => { before(); set(s.value); changed(); });
      row(label).append(s);
      return s;
    };
    const kindSel = select('KIND', ENEMY_KINDS, () => w.kind, (v) => { w.kind = v as Wave['kind']; });
    const patSel = select('PATTERN', PATTERNS, () => w.pattern, (v) => { w.pattern = v as Wave['pattern']; });

    // A number with - and +, and typed in by tapping it (the keyboard only shows then).
    const stepper = (label: string, get: () => number, set: (v: number) => void, step: number, show: (v: number) => string, parse: (s: string) => number) => {
      const r = row(label);
      const minus = el('button', 'step', '-');
      const plus = el('button', 'step', '+');
      const inp = el('input', 'num');
      inp.inputMode = 'decimal';
      inp.value = show(get());
      const nudge = (by: number) => { before(); set(get() + by); inp.value = show(get()); changed(); };
      minus.addEventListener('click', () => nudge(-step));
      plus.addEventListener('click', () => nudge(step));
      inp.addEventListener('focus', () => inp.select());
      inp.addEventListener('change', () => {
        const v = parse(inp.value);
        if (Number.isFinite(v)) { before(); set(v); changed(); }
        inp.value = show(get());
      });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') inp.blur(); });
      r.append(minus, inp, plus);
      return () => { inp.value = show(get()); };
    };
    const showCount = stepper('COUNT', () => w.count ?? 1, (v) => { w.count = Math.max(1, Math.round(v)); }, 1, String, Number);

    const xr = row('X');
    const slider = el('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '1';
    slider.step = '0.05';
    slider.value = String(w.x ?? 0.5);
    const xv = el('span', 'xv', String(w.x ?? 0.5));
    let sliding = false;
    slider.addEventListener('input', () => {
      if (!sliding) { before(); sliding = true; }
      w.x = Math.round(Number(slider.value) * 100) / 100;
      xv.textContent = String(w.x);
      changed();
    });
    slider.addEventListener('change', () => { sliding = false; });
    xr.append(slider, xv);

    const counter = el('input');
    const showDelay = stepper('DELAY', () => w.delay, (v) => {
      const next = Math.max(0, Math.round(v / 50) * 50);
      const by = next - w.delay;
      w.delay = next;
      // Counter offset: the next wave comes that much sooner, so it stays where it was.
      if (counter.checked && waves[i + 1]) waves[i + 1].delay = Math.max(0, waves[i + 1].delay - by);
    }, 1000, (v) => `${(v / 1000).toFixed(2).replace(/0$/, '')}S`, (s) => parseFloat(s) * 1000);

    const check = (label: string, input: HTMLInputElement) => {
      const l = el('label', 'check');
      input.type = 'checkbox';
      l.append(input, el('span', '', label));
      inner.append(l);
    };
    const wait = el('input');
    wait.checked = !!w.waitClear;
    wait.addEventListener('change', () => { before(); w.waitClear = wait.checked || undefined; changed(); });
    check('WAIT FOR CLEAR', wait);
    counter.checked = offsetNext;
    counter.addEventListener('change', () => { offsetNext = counter.checked; });
    check('COUNTER OFFSET NEXT WAVE', counter);
    panel.append(inner);

    // Puts every control back in line with the wave (after UNDO or PASTE).
    const sync = () => {
      kindSel.value = w.kind;
      patSel.value = w.pattern;
      showCount();
      slider.value = String(w.x ?? 0.5);
      xv.textContent = String(w.x ?? 0.5);
      showDelay();
      wait.checked = !!w.waitClear;
      changed();
    };

    const pb = el('div', 'pbtns');
    const pbtn = (cls: string, label: string, fn: () => void) => {
      const b = el('button', cls, label);
      b.addEventListener('click', fn);
      pb.append(b);
    };
    pbtn('undo', 'UNDO', () => {
      const prev = panelUndo.pop();
      if (prev === undefined) return;
      d.def = read(prev) as unknown as LevelDef;
      render();
    });
    pbtn('', 'RESET', () => {
      const orig = gameWave(d, seg, i);
      if (!orig) { say(d.base.kind === 'new' ? 'NEW LEVEL: NOTHING TO RESET TO' : 'A NEW WAVE: NOTHING TO RESET TO', 'err'); return; }
      if ((['delay', 'kind', 'pattern', 'count', 'x', 'waitClear'] as const).every((k) => orig[k] === w[k])) { say('ALREADY THE SAME AS THE GAME', 'ok'); return; }
      before();
      for (const k of ['count', 'x', 'waitClear'] as const) delete w[k];
      Object.assign(w, deepCopy(orig));
      sync();
      say('BACK TO THE GAME\'S WAVE. APPLY TO KEEP IT', 'ok');
    });
    pbtn('', 'COPY', () => {
      clip = deepCopy(w);
      persist();
      try { void navigator.clipboard?.writeText(JSON.stringify(w)); } catch { /* the editor's own clipboard still has it */ }
      say('WAVE COPIED', 'ok');
    });
    pbtn('', 'PASTE', () => {
      if (!clip) { say('NOTHING COPIED YET', 'err'); return; }
      before();
      for (const k of ['count', 'x', 'waitClear'] as const) delete w[k];
      Object.assign(w, deepCopy(clip));
      sync();
      say('WAVE PASTED', 'ok');
    });
    pbtn('', 'CODE', () => {
      if (panelDirty()) applyPanel();
      tab = { seg, part: 'waves' };
      caretLine = itemLines(tabText(d, tab))[i] ?? 1;
      textView = true;
      sel = null;
      screen = 'edit';
      render();
    });
    pbtn('apply', 'APPLY', applyPanel);
    panel.append(pb);
    root.append(panel);
    drawPreview();
    if (panelDirty()) say('NOT APPLIED YET');
  }
  let offsetNext = false;

  // Keys that are hard to reach on a phone keyboard, over the keyboard while typing.
  const keys = el('div', 'keys');
  const insert = (s: string) => {
    const ta = root.querySelector('textarea');
    if (!ta || ta.readOnly) return;
    ta.setRangeText(s, ta.selectionStart, ta.selectionEnd, 'end');
    ta.dispatchEvent(new Event('input'));
  };
  for (const k of ['{', '}', '[', ']', ':', '\'', ',', '.', '-']) {
    const b = el('button', '', k);
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); insert(k); });
    keys.append(b);
  }
  const waveKey = el('button', 'w', 'WAVE');
  waveKey.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    insert('{ delay: 2500, kind: \'dart\', pattern: \'line\', count: 5 },');
  });
  keys.append(waveKey);
  // Names, picked from a list and typed in quotes.
  const picker = (label: string, list: readonly string[]) => {
    const s = el('select');
    s.style.cssText = `font: 8px ${FONT}; color: #fcfcfc; background: #000; border: 1px solid #7c7c7c; padding: 6px 2px;`;
    s.append(el('option', '', label));
    for (const v of list) { const o = el('option', '', v); o.value = v; s.append(o); }
    s.addEventListener('change', () => {
      if (s.selectedIndex > 0) insert(`'${s.value}'`);
      s.selectedIndex = 0;
      root.querySelector('textarea')?.focus();
    });
    keys.append(s);
  };
  picker('KIND', ENEMY_KINDS);
  picker('PATTERN', PATTERNS);
  // Sit on top of the phone's keyboard, wherever it leaves the page, and
  // only while it's up (a keyboard on a desk leaves the page as it is).
  const placeKeys = () => {
    const vv = window.visualViewport;
    const bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    keys.classList.toggle('up', !!vv && vv.height < window.innerHeight - 120);
    keys.style.top = `${bottom - keys.offsetHeight}px`;
  };
  window.visualViewport?.addEventListener('resize', placeKeys);
  window.visualViewport?.addEventListener('scroll', placeKeys);
  new ResizeObserver(placeKeys).observe(keys);
  const reattach = root.replaceChildren.bind(root);
  root.replaceChildren = (...nodes: (Node | string)[]) => { reattach(...nodes, keys); keys.classList.remove('on'); };
  root.append(keys);
}
