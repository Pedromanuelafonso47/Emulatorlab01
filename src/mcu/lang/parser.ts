/**
 * Lexer + recursive-descent parser for the Arduino C/C++ subset used by sketches:
 * globals, functions, control flow, arrays, #define, objects (Servo, DHT), Serial/WiFi calls.
 */

export class CompileError extends Error {
  constructor(message: string, public line: number, public col = 1) { super(message); }
}

// ───────────────────────── Lexer ─────────────────────────
export type TokKind = 'num' | 'str' | 'char' | 'id' | 'op' | 'eof';
export interface Tok { k: TokKind; v: string; line: number; col: number; num?: number; isFloat?: boolean }

const OPS = ['<<=', '>>=', '&&', '||', '==', '!=', '<=', '>=', '++', '--', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<', '>>', '->', '::',
  '+', '-', '*', '/', '%', '=', '<', '>', '!', '~', '&', '|', '^', '?', ':', ';', ',', '.', '(', ')', '{', '}', '[', ']'];

export interface PreResult { src: string; includes: string[] }

/** Minimal preprocessor: strips comments, records #include, expands object-like #define. */
export function preprocess(src: string): PreResult {
  const includes: string[] = [];
  const defines = new Map<string, string>();
  // remove block comments keeping newlines
  src = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const lines = src.split('\n').map((line) => {
    const noComment = line.replace(/\/\/.*$/, (m) => (/(["'])/.test(m.slice(0, 1)) ? m : ''));
    const t = noComment.trim();
    if (t.startsWith('#include')) { const m = t.match(/[<"]([^>"]+)[>"]/); if (m) includes.push(m[1]); return ''; }
    if (t.startsWith('#define')) {
      const m = t.match(/^#define\s+([A-Za-z_]\w*)\s*(.*)$/);
      if (m && !m[2].startsWith('(')) defines.set(m[1], m[2].trim() || '1');
      return '';
    }
    if (t.startsWith('#')) return '';
    return noComment;
  });
  let out = lines.join('\n');
  if (defines.size) {
    for (let pass = 0; pass < 3; pass++) {
      out = out.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|\b[A-Za-z_]\w*\b/g, (m) => (m[0] === '"' || m[0] === "'" ? m : defines.has(m) ? defines.get(m)! : m));
    }
  }
  return { src: out, includes };
}

export function lex(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0, line = 1, col = 1;
  const adv = (n = 1) => { for (let k = 0; k < n; k++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } };
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { adv(); continue; }
    const L = line, C = col;
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1]))) {
      let m = src.slice(i).match(/^0[xX][0-9a-fA-F]+[uUlL]*/) ?? src.slice(i).match(/^0[bB][01]+[uUlL]*/) ?? src.slice(i).match(/^(\d+\.?\d*([eE][-+]?\d+)?|\.\d+([eE][-+]?\d+)?)[fFuUlL]*/);
      if (!m) throw new CompileError('Número inválido', L, C);
      const raw = m[0];
      const clean = raw.replace(/[uUlLfF]+$/, '');
      const isFloat = /[.eE]/.test(clean) && !/^0[xX]/.test(clean) || /[fF]$/.test(raw) && /\./.test(raw);
      const num = /^0[bB]/.test(clean) ? parseInt(clean.slice(2), 2) : /^0[xX]/.test(clean) ? parseInt(clean, 16) : parseFloat(clean);
      toks.push({ k: 'num', v: raw, line: L, col: C, num, isFloat });
      adv(raw.length);
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = src.slice(i).match(/^[A-Za-z_]\w*/)!;
      // Arduino binary literal B1010
      if (/^B[01]{1,8}$/.test(m[0])) { toks.push({ k: 'num', v: m[0], line: L, col: C, num: parseInt(m[0].slice(1), 2) }); adv(m[0].length); continue; }
      toks.push({ k: 'id', v: m[0], line: L, col: C });
      adv(m[0].length);
      continue;
    }
    if (c === '"') {
      let s = ''; adv();
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\n') throw new CompileError('Texto (string) sem aspas de fecho', L, C);
        if (src[i] === '\\') { adv(); s += ({ n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', '"': '"', "'": "'" } as Record<string, string>)[src[i]] ?? src[i]; adv(); }
        else { s += src[i]; adv(); }
      }
      adv();
      const prev = toks[toks.length - 1];
      if (prev?.k === 'str') prev.v += s; else toks.push({ k: 'str', v: s, line: L, col: C });   // adjacent literal concatenation
      continue;
    }
    if (c === "'") {
      adv();
      let ch = src[i];
      if (ch === '\\') { adv(); ch = ({ n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'" } as Record<string, string>)[src[i]] ?? src[i]; }
      adv();
      if (src[i] !== "'") throw new CompileError('Carácter mal formado', L, C);
      adv();
      toks.push({ k: 'char', v: ch, line: L, col: C, num: ch.charCodeAt(0) });
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new CompileError(`Carácter inesperado '${c}'`, L, C);
    toks.push({ k: 'op', v: op, line: L, col: C });
    adv(op.length);
  }
  toks.push({ k: 'eof', v: '', line, col });
  return toks;
}

// ───────────────────────── AST ─────────────────────────
export interface TypeRef { base: string; unsigned: boolean; isConst: boolean; ptr?: boolean }
export type Expr =
  | { t: 'num'; value: number; isFloat: boolean; line: number }
  | { t: 'str'; value: string; line: number }
  | { t: 'char'; value: number; line: number }
  | { t: 'id'; name: string; line: number }
  | { t: 'unary'; op: string; arg: Expr; line: number }
  | { t: 'update'; op: '++' | '--'; prefix: boolean; arg: Expr; line: number }
  | { t: 'bin'; op: string; l: Expr; r: Expr; line: number }
  | { t: 'assign'; op: string; target: Expr; value: Expr; line: number }
  | { t: 'cond'; test: Expr; cons: Expr; alt: Expr; line: number }
  | { t: 'call'; name: string; args: Expr[]; line: number }
  | { t: 'mcall'; obj: string; method: string; args: Expr[]; line: number }
  | { t: 'member'; obj: string; prop: string; line: number }
  | { t: 'index'; arr: Expr; index: Expr; line: number }
  | { t: 'cast'; type: TypeRef; arg: Expr; line: number };

export interface VarDecl { type: TypeRef; name: string; dims: (Expr | null)[]; init?: Expr; initList?: Expr[]; ctor?: Expr[]; line: number }
export type Stmt =
  | { t: 'block'; body: Stmt[]; line: number }
  | { t: 'vars'; decls: VarDecl[]; line: number }
  | { t: 'expr'; e: Expr; line: number }
  | { t: 'if'; test: Expr; cons: Stmt; alt?: Stmt; line: number }
  | { t: 'while'; test: Expr; body: Stmt; line: number }
  | { t: 'do'; test: Expr; body: Stmt; line: number }
  | { t: 'for'; init?: Stmt; test?: Expr; update?: Expr; body: Stmt; line: number }
  | { t: 'switch'; disc: Expr; cases: { test: Expr | null; body: Stmt[] }[]; line: number }
  | { t: 'break'; line: number } | { t: 'continue'; line: number }
  | { t: 'return'; e?: Expr; line: number }
  | { t: 'empty'; line: number };
export interface FuncDecl { ret: TypeRef; name: string; params: { type: TypeRef; name: string; array: boolean }[]; body: Stmt & { t: 'block' }; line: number }
export interface Program { globals: VarDecl[]; funcs: FuncDecl[]; includes: string[] }

const TYPE_WORDS = new Set(['void', 'int', 'long', 'short', 'float', 'double', 'char', 'byte', 'bool', 'boolean', 'word', 'String', 'size_t',
  'int8_t', 'int16_t', 'int32_t', 'uint8_t', 'uint16_t', 'uint32_t', 'int64_t', 'uint64_t']);
const QUALIFIERS = new Set(['const', 'static', 'volatile', 'unsigned', 'signed', 'extern', 'inline', 'constexpr']);
export const CLASSES = new Set(['Servo', 'DHT']);

// ───────────────────────── Parser ─────────────────────────
export function parse(source: string): Program {
  const pre = preprocess(source);
  const toks = lex(pre.src);
  let p = 0;
  const peek = (o = 0) => toks[Math.min(p + o, toks.length - 1)];
  const next = () => toks[p++];
  const is = (v: string, o = 0) => { const t = peek(o); return (t.k === 'op' || t.k === 'id') && t.v === v; };
  const expect = (v: string, what?: string) => {
    const t = peek();
    if ((t.k === 'op' || t.k === 'id') && t.v === v) return next();
    throw new CompileError(`Esperava '${v}'${what ? ` ${what}` : ''} mas encontrou '${t.v || 'fim do ficheiro'}'${v === ';' ? ' — falta um ponto e vírgula no fim da instrução anterior?' : ''}`, v === ';' ? toks[p - 1]?.line ?? t.line : t.line, t.col);
  };
  const ident = () => { const t = peek(); if (t.k !== 'id') throw new CompileError(`Esperava um nome mas encontrou '${t.v}'`, t.line, t.col); return next().v; };

  const startsType = (o = 0): boolean => {
    let k = o;
    while (peek(k).k === 'id' && QUALIFIERS.has(peek(k).v)) k++;
    const t = peek(k);
    if (t.k !== 'id') return k > o; // e.g. "unsigned x"
    return TYPE_WORDS.has(t.v) || CLASSES.has(t.v);
  };
  const parseType = (): TypeRef => {
    let unsigned = false, isConst = false, base = '';
    for (;;) {
      const t = peek();
      if (t.k === 'id' && QUALIFIERS.has(t.v)) { next(); if (t.v === 'unsigned') unsigned = true; if (t.v === 'const' || t.v === 'constexpr') isConst = true; continue; }
      break;
    }
    if (peek().k === 'id' && (TYPE_WORDS.has(peek().v) || CLASSES.has(peek().v))) {
      base = next().v;
      if ((base === 'long' || base === 'short') && is('int')) next();
      if (base === 'long' && is('long')) next();
      if (base === 'long' && is('double')) { next(); base = 'double'; }
    } else if (unsigned) base = 'int';
    else { const t = peek(); throw new CompileError(`Tipo desconhecido '${t.v}'`, t.line, t.col); }
    let ptr = false;
    while (is('*') || is('&')) { next(); ptr = true; }
    return { base, unsigned, isConst, ptr };
  };

  // ── expressions (precedence climbing) ──
  const BIN: Record<string, number> = { '||': 1, '&&': 2, '|': 3, '^': 4, '&': 5, '==': 6, '!=': 6, '<': 7, '>': 7, '<=': 7, '>=': 7, '<<': 8, '>>': 8, '+': 9, '-': 9, '*': 10, '/': 10, '%': 10 };
  const ASSIGN = new Set(['=', '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '<<=', '>>=']);

  function expression(): Expr {
    let e = assignment();
    while (is(',') && false) next(); // comma operator not supported (only in for-loops, handled there)
    return e;
  }
  function assignment(): Expr {
    const line = peek().line;
    const left = conditional();
    if (peek().k === 'op' && ASSIGN.has(peek().v)) {
      const op = next().v;
      if (!(left.t === 'id' || left.t === 'index')) throw new CompileError('Só é possível atribuir a variáveis ou elementos de arrays', line);
      return { t: 'assign', op, target: left, value: assignment(), line };
    }
    return left;
  }
  function conditional(): Expr {
    const line = peek().line;
    const test = binary(1);
    if (is('?')) { next(); const cons = assignment(); expect(':'); const alt = assignment(); return { t: 'cond', test, cons, alt, line }; }
    return test;
  }
  function binary(minPrec: number): Expr {
    let left = unary();
    for (;;) {
      const t = peek();
      const prec = t.k === 'op' ? BIN[t.v] : undefined;
      if (prec === undefined || prec < minPrec) return left;
      next();
      const right = binary(prec + 1);
      left = { t: 'bin', op: t.v, l: left, r: right, line: t.line };
    }
  }
  function unary(): Expr {
    const t = peek();
    if (t.k === 'op' && ['!', '~', '-', '+'].includes(t.v)) { next(); return { t: 'unary', op: t.v, arg: unary(), line: t.line }; }
    if (t.k === 'op' && (t.v === '++' || t.v === '--')) { next(); return { t: 'update', op: t.v, prefix: true, arg: unary(), line: t.line }; }
    if (t.k === 'op' && t.v === '(' && startsType(1)) {
      // C-style cast
      next(); const type = parseType(); expect(')');
      return { t: 'cast', type, arg: unary(), line: t.line };
    }
    return postfix(primary());
  }
  function postfix(e: Expr): Expr {
    for (;;) {
      const t = peek();
      if (is('[')) { next(); const index = expression(); expect(']'); e = { t: 'index', arr: e, index, line: t.line }; continue; }
      if (t.k === 'op' && (t.v === '++' || t.v === '--')) { next(); e = { t: 'update', op: t.v as '++', prefix: false, arg: e, line: t.line }; continue; }
      return e;
    }
  }
  function args(): Expr[] {
    expect('(');
    const a: Expr[] = [];
    if (!is(')')) { do { a.push(assignment()); } while (is(',') && next()); }
    expect(')');
    return a;
  }
  function primary(): Expr {
    const t = peek();
    if (t.k === 'num') { next(); return { t: 'num', value: t.num!, isFloat: !!t.isFloat, line: t.line }; }
    if (t.k === 'str') { next(); return { t: 'str', value: t.v, line: t.line }; }
    if (t.k === 'char') { next(); return { t: 'char', value: t.num!, line: t.line }; }
    if (is('(')) { next(); const e = expression(); expect(')'); return e; }
    if (t.k === 'id') {
      // functional cast: int(x), float(x), String(x), byte(x)
      if (TYPE_WORDS.has(t.v) && is('(', 1)) {
        next();
        const a = args();
        if (t.v === 'String') return { t: 'call', name: 'String', args: a, line: t.line };
        return { t: 'cast', type: { base: t.v, unsigned: false, isConst: false }, arg: a[0], line: t.line };
      }
      next();
      if (is('.') || is('->')) {
        next(); const prop = ident();
        if (is('(')) return { t: 'mcall', obj: t.v, method: prop, args: args(), line: t.line };
        return { t: 'member', obj: t.v, prop, line: t.line };
      }
      if (is('::')) { next(); const prop = ident(); return { t: 'member', obj: t.v, prop, line: t.line }; }
      if (is('(')) return { t: 'call', name: t.v, args: args(), line: t.line };
      return { t: 'id', name: t.v, line: t.line };
    }
    throw new CompileError(`Expressão inesperada '${t.v || 'fim do ficheiro'}'`, t.line, t.col);
  }

  // ── declarations & statements ──
  function varDecls(type: TypeRef, firstName?: string): VarDecl[] {
    const decls: VarDecl[] = [];
    let name = firstName;
    for (;;) {
      const line = peek().line;
      while (is('*') || is('&')) next();
      name ??= ident();
      const dims: (Expr | null)[] = [];
      while (is('[')) { next(); dims.push(is(']') ? null : expression()); expect(']'); }
      const d: VarDecl = { type, name, dims, line };
      if (CLASSES.has(type.base) && is('(')) d.ctor = args();
      else if (is('=')) {
        next();
        if (is('{')) {
          next(); d.initList = [];
          if (!is('}')) { do { if (is('}')) break; d.initList.push(assignment()); } while (is(',') && next()); }
          expect('}');
        } else d.init = assignment();
      } else if (is('{')) { // brace init int x{3};
        next(); d.initList = []; if (!is('}')) { do { d.initList.push(assignment()); } while (is(',') && next()); } expect('}');
        if (!dims.length) { d.init = d.initList[0]; d.initList = undefined; }
      }
      decls.push(d);
      name = undefined;
      if (is(',')) { next(); continue; }
      return decls;
    }
  }
  function statement(): Stmt {
    const t = peek();
    const line = t.line;
    if (is('{')) return block();
    if (is(';')) { next(); return { t: 'empty', line }; }
    if (t.k === 'id') {
      switch (t.v) {
        case 'if': { next(); expect('('); const test = expression(); expect(')'); const cons = statement(); let alt: Stmt | undefined; if (is('else')) { next(); alt = statement(); } return { t: 'if', test, cons, alt, line }; }
        case 'while': { next(); expect('('); const test = expression(); expect(')'); return { t: 'while', test, body: statement(), line }; }
        case 'do': { next(); const body = statement(); expect('while'); expect('('); const test = expression(); expect(')'); expect(';'); return { t: 'do', test, body, line }; }
        case 'for': {
          next(); expect('(');
          let init: Stmt | undefined;
          if (!is(';')) init = startsType() ? { t: 'vars', decls: varDecls(parseType()), line } : { t: 'expr', e: expression(), line };
          expect(';');
          const test = is(';') ? undefined : expression();
          expect(';');
          let update: Expr | undefined;
          if (!is(')')) {
            update = expression();
            while (is(',')) { next(); const e2 = expression(); update = { t: 'bin', op: ',', l: update, r: e2, line }; }
          }
          expect(')');
          return { t: 'for', init, test, update, body: statement(), line };
        }
        case 'switch': {
          next(); expect('('); const disc = expression(); expect(')'); expect('{');
          const cases: { test: Expr | null; body: Stmt[] }[] = [];
          while (!is('}')) {
            if (is('case')) { next(); const test = conditional(); expect(':'); cases.push({ test, body: [] }); }
            else if (is('default')) { next(); expect(':'); cases.push({ test: null, body: [] }); }
            else { if (!cases.length) throw new CompileError('Instrução fora de um "case"', peek().line); cases[cases.length - 1].body.push(statement()); }
          }
          expect('}');
          return { t: 'switch', disc, cases, line };
        }
        case 'break': next(); expect(';'); return { t: 'break', line };
        case 'continue': next(); expect(';'); return { t: 'continue', line };
        case 'return': { next(); const e = is(';') ? undefined : expression(); expect(';'); return { t: 'return', e, line }; }
      }
      if (startsType()) { const decls = varDecls(parseType()); expect(';'); return { t: 'vars', decls, line }; }
    }
    const e = expression();
    expect(';');
    return { t: 'expr', e, line };
  }
  function block(): Stmt & { t: 'block' } {
    const line = expect('{').line;
    const body: Stmt[] = [];
    while (!is('}')) { if (peek().k === 'eof') throw new CompileError('Falta fechar a chaveta "}"', line); body.push(statement()); }
    expect('}');
    return { t: 'block', body, line };
  }

  const prog: Program = { globals: [], funcs: [], includes: pre.includes };
  while (peek().k !== 'eof') {
    if (is(';')) { next(); continue; }
    const t = peek();
    if (!startsType()) throw new CompileError(`Declaração inesperada '${t.v}' — fora de funções só pode declarar variáveis e funções`, t.line, t.col);
    const type = parseType();
    const nameTok = peek();
    const name = ident();
    // `DHT dht(2, DHT11);` at file scope is an object declaration, not a function
    if (is('(') && !CLASSES.has(type.base)) {
      next();
      const params: FuncDecl['params'] = [];
      if (!is(')')) {
        if (is('void') && is(')', 1)) next();
        else do {
          const pt = parseType(); const pn = peek().k === 'id' ? ident() : `_p${params.length}`;
          let array = false; while (is('[')) { next(); if (!is(']')) expression(); expect(']'); array = true; }
          params.push({ type: pt, name: pn, array });
        } while (is(',') && next());
      }
      expect(')');
      if (is(';')) { next(); continue; } // prototype
      prog.funcs.push({ ret: type, name, params, body: block(), line: nameTok.line });
    } else {
      prog.globals.push(...varDecls(type, name));
      expect(';');
    }
  }
  return prog;
}
