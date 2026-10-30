// The Level Editor's text: levels written out the way levels.ts writes them
// (TypeScript object literals, one wave per line), and read back. The reader
// takes plain values only: objects, arrays, quoted strings, numbers, true,
// false, null and undefined, with // and /* */ comments and trailing commas.

export type Value = string | number | boolean | null | undefined | Value[] | { [k: string]: Value };

const KEY = /^[A-Za-z_$][\w$]*$/;
const WIDE = 110; // past this many characters, an object or array breaks over lines

const str = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;

function inline(v: Value): string {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  if (typeof v === 'string') return str(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) return `[${v.map(inline).join(', ')}]`;
  const parts = Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => `${KEY.test(k) ? k : str(k)}: ${inline(x)}`);
  return parts.length ? `{ ${parts.join(', ')} }` : '{}';
}

// A value as text, starting `pad` in. Short values stay on one line; longer
// ones put each part on its own line. Arrays of objects always do, so every
// wave gets a line of its own.
export function write(v: Value, pad = ''): string {
  const one = inline(v);
  const listOfObjects = Array.isArray(v) && v.some((x) => x !== null && typeof x === 'object');
  if (!listOfObjects && pad.length + one.length <= WIDE) return one;
  if (v === null || typeof v !== 'object') return one;
  const inner = pad + '  ';
  if (Array.isArray(v)) {
    if (!v.length) return '[]';
    return `[\n${v.map((x) => `${inner}${write(x, inner)},`).join('\n')}\n${pad}]`;
  }
  const parts = Object.entries(v).filter(([, x]) => x !== undefined);
  if (!parts.length) return '{}';
  return `{\n${parts.map(([k, x]) => `${inner}${KEY.test(k) ? k : str(k)}: ${write(x, inner)},`).join('\n')}\n${pad}}`;
}

// A mistake in the text, with the line it's on (1-based).
export class TextError extends Error {
  constructor(msg: string, public line: number) { super(msg); }
}

interface Tok { t: string; v?: Value; line: number; pos: number }

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0, line = 1;
  while (i < src.length) {
    const c = src[i];
    if (c === '\n') { line++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      if (end < 0) throw new TextError('A /* COMMENT NEVER ENDS', line);
      for (let k = i; k < end; k++) if (src[k] === '\n') line++;
      i = end + 2;
      continue;
    }
    if ('{}[]:,'.includes(c)) { out.push({ t: c, line, pos: i }); i++; continue; }
    if (c === '\'' || c === '"' || c === '`') {
      const start = line, at = i;
      let s = '';
      i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === '\n') throw new TextError('A QUOTE IS NEVER CLOSED', start);
        if (src[i] === '\\') {
          const e = src[i + 1];
          s += e === 'n' ? '\n' : e === 't' ? '\t' : e;
          i += 2;
        } else s += src[i++];
      }
      if (i >= src.length) throw new TextError('A QUOTE IS NEVER CLOSED', start);
      i++;
      out.push({ t: 'val', v: s, line: start, pos: at });
      continue;
    }
    const m = /^-?(\d[\d_]*\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (m) {
      out.push({ t: 'val', v: Number(m[0].replace(/_/g, '')), line, pos: i });
      i += m[0].length;
      continue;
    }
    const w = /^[A-Za-z_$][\w$]*/.exec(src.slice(i));
    if (w) {
      const word = w[0];
      const lit: Record<string, Value> = { true: true, false: false, null: null, undefined };
      out.push(word in lit ? { t: 'val', v: lit[word], line, pos: i } : { t: 'word', v: word, line, pos: i });
      i += word.length;
      continue;
    }
    throw new TextError(`DON'T KNOW WHAT ${c} IS HERE`, line);
  }
  return out;
}

// Reads one value from the text. Only a trailing comma or semicolon may follow it.
export function read(src: string): Value {
  const toks = tokenize(src);
  let p = 0;
  const lastLine = toks.length ? toks[toks.length - 1].line : 1;
  const peek = () => toks[p];
  const need = (t: string) => {
    const k = toks[p];
    if (!k) throw new TextError(`MISSING ${t} AT THE END`, lastLine);
    if (k.t !== t) throw new TextError(`EXPECTED ${t} HERE`, k.line);
    p++;
    return k;
  };
  const value = (): Value => {
    const k = toks[p];
    if (!k) throw new TextError('SOMETHING IS MISSING AT THE END', lastLine);
    if (k.t === 'val') { p++; return k.v; }
    if (k.t === '[') {
      p++;
      const arr: Value[] = [];
      while (peek() && peek().t !== ']') {
        // Holes, like [, 'x'], count as undefined.
        if (peek().t === ',') { arr.push(undefined); p++; continue; }
        arr.push(value());
        if (peek()?.t === ',') p++;
        else if (peek() && peek().t !== ']') throw new TextError('MISSING A COMMA BEFORE THIS', peek().line);
      }
      need(']');
      return arr;
    }
    if (k.t === '{') {
      p++;
      const obj: { [key: string]: Value } = {};
      while (peek() && peek().t !== '}') {
        const kt = toks[p];
        if (kt.t !== 'word' && !(kt.t === 'val' && typeof kt.v === 'string')) throw new TextError('EXPECTED A NAME, LIKE kind:', kt.line);
        p++;
        need(':');
        const key = kt.v as string;
        if (key in obj) throw new TextError(`${key} IS THERE TWICE`, kt.line);
        obj[key] = value();
        if (peek()?.t === ',') p++;
        else if (peek() && peek().t !== '}') throw new TextError('MISSING A COMMA BEFORE THIS', peek().line);
      }
      need('}');
      return obj;
    }
    if (k.t === 'word') throw new TextError(`${k.v} NEEDS QUOTES: '${k.v}'`, k.line);
    throw new TextError(`DIDN'T EXPECT ${k.t} HERE`, k.line);
  };
  const v = value();
  if (peek()?.t === ',') p++;
  if (peek()) throw new TextError('EXTRA TEXT AFTER THE END', peek().line);
  return v;
}

// The line (1-based) where each top-level item of an array starts, for
// finding a wave in the text.
export function itemLines(src: string): number[] {
  const toks = tokenize(src);
  const lines: number[] = [];
  let depth = 0, fresh = false;
  for (const k of toks) {
    if (k.t === '[' || k.t === '{') {
      if (depth === 1 && fresh) { lines.push(k.line); fresh = false; }
      depth++;
      if (depth === 1) fresh = true;
    } else if (k.t === ']' || k.t === '}') depth--;
    else if (depth === 1 && k.t === ',') fresh = true;
    else if (depth === 1 && fresh) { lines.push(k.line); fresh = false; }
  }
  return lines;
}
