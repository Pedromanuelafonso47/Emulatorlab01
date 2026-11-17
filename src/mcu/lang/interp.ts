/**
 * Tree-walking interpreter for the sketch subset produced by parser.ts.
 *
 * Execution is a generator: delay() (and the end of each loop() pass) yields a Wait, so the host
 * can advance simulated time between simulation steps without blocking the Web Worker. Hardware
 * access goes through the McuIO interface, which the host implements against the circuit's pins.
 */
import { parse, CLASSES, type Expr, type FuncDecl, type Program, type Stmt, type TypeRef, type VarDecl } from './parser';

export type Val = number | string | Val[] | NativeObj;
/** An object provided by the board runtime (Servo, DHT). Methods take and return numbers. */
export interface NativeObj { call(method: string, args: number[]): number }
export interface Wait { ms: number }
type G<T> = Generator<Wait, T, void>;
type Flow = undefined | { k: 'break' } | { k: 'continue' } | { k: 'return'; v: Val };
interface Cell { v: Val; t?: TypeRef }

export interface McuIO {
  pinMode(pin: number, mode: number): void;
  digitalWrite(pin: number, high: boolean): void;
  digitalRead(pin: number): boolean;
  /** Raw ADC count (0 … 2^bits − 1 for the board). */
  analogRead(pin: number): number;
  /** 0–255 PWM duty. */
  analogWrite(pin: number, value: number): void;
  millis(): number;
  micros(): number;
  serial(text: string): void;
  /** Bytes waiting in the serial receive buffer. */
  serialAvailable(): number;
  /** Next byte from the receive buffer, or −1 when empty. */
  serialRead(): number;
  /** Creates a library object (Servo, DHT) for this board, or undefined if the class is unsupported. */
  createObject?(cls: string, args: number[]): NativeObj | undefined;
}

export class RunError extends Error {
  constructor(message: string, public line: number) { super(message); }
}

/** Arduino constants available without #define. */
export const CONSTANTS = new Map<string, number>([
  ['HIGH', 1], ['LOW', 0], ['INPUT', 0], ['OUTPUT', 1], ['INPUT_PULLUP', 2], ['LED_BUILTIN', 13],
  ['A0', 14], ['A1', 15], ['A2', 16], ['A3', 17], ['A4', 18], ['A5', 19],
  ['DEC', 10], ['HEX', 16], ['OCT', 8], ['BIN', 2], ['true', 1], ['false', 0],
  ['PI', Math.PI], ['M_PI', Math.PI], ['LSBFIRST', 0], ['MSBFIRST', 1],
  ['CHANGE', 1], ['FALLING', 2], ['RISING', 3],
  ['DHT11', 11], ['DHT22', 22], ['DHT21', 21],
]);

const FLOAT_FUNCS = new Set(['sqrt', 'pow', 'sin', 'cos', 'tan', 'atan', 'atan2', 'log', 'log10', 'exp', 'fabs', 'radians', 'degrees']);
const MAX_OPS = 200_000;     // statements/iterations between two yields
const MAX_DEPTH = 150;       // call depth

class Scope {
  private m = new Map<string, Cell>();
  constructor(readonly up: Scope | null) {}
  def(name: string, cell: Cell) { this.m.set(name, cell); }
  find(name: string): Cell | undefined {
    for (let s: Scope | null = this; s; s = s.up) { const c = s.m.get(name); if (c) return c; }
    return undefined;
  }
}

const isFloatType = (t?: TypeRef) => !!t && !t.ptr && (t.base === 'float' || t.base === 'double');

/** Converts a value to the range and precision of an integer C type; floats pass through. */
export function coerce(t: TypeRef | undefined, v: Val): Val {
  if (!t || t.ptr || typeof v !== 'number') return v;
  const n = Math.trunc(v);
  switch (t.base) {
    case 'bool': case 'boolean': return v ? 1 : 0;
    case 'char': case 'int8_t': return t.unsigned ? n & 0xff : (n << 24) >> 24;
    case 'byte': case 'uint8_t': return n & 0xff;
    case 'int': case 'short': case 'int16_t': return t.unsigned ? n & 0xffff : (n << 16) >> 16;
    case 'word': case 'uint16_t': return n & 0xffff;
    case 'long': case 'int32_t': case 'int64_t': return t.unsigned ? n >>> 0 : n | 0;
    case 'uint32_t': case 'uint64_t': case 'size_t': return n >>> 0;
    case 'float': case 'double': return v;
    default: return v;
  }
}

function defaultValue(t: TypeRef): Val { return t.base === 'String' ? '' : 0; }

function makeArray(dims: number[], t: TypeRef): Val[] {
  if (dims.length === 1) return Array.from({ length: dims[0] }, () => defaultValue(t));
  return Array.from({ length: dims[0] }, () => makeArray(dims.slice(1), t));
}

/** Interpreter state for one sketch. Create once per compile; call run() to get the generator. */
export class Interp {
  private glob = new Scope(null);
  private funcs = new Map<string, FuncDecl>();
  private ops = 0;
  private depth = 0;
  private line = 0;

  constructor(private prog: Program, private io: McuIO, private consts: Map<string, number> = CONSTANTS) {
    for (const f of prog.funcs) this.funcs.set(f.name, f);
  }

  /** Globals, then setup() once, then loop() forever. Each yield is a delay request (ms). */
  *run(): G<void> {
    for (const d of this.prog.globals) yield* this.declare(d, this.glob);
    const setup = this.funcs.get('setup');
    if (setup) yield* this.callUser(setup, [], 0);
    const loop = this.funcs.get('loop');
    if (!loop) throw new RunError('Falta a função void loop()', 1);
    for (;;) {
      yield* this.callUser(loop, [], 0);
      this.ops = 0;
      yield { ms: 0 };
    }
  }

  private fail(msg: string, line = this.line): never { throw new RunError(msg, line); }

  private tick() {
    if (++this.ops > MAX_OPS) this.fail('O programa não devolve o controlo (ciclo sem delay() ou condição que nunca termina).');
  }

  private num(v: Val): number {
    if (typeof v === 'number') return v;
    return this.fail(Array.isArray(v) ? 'Um array não pode ser usado como número.' : `Texto "${v}" não pode ser usado como número.`);
  }

  // ───────── declarations ─────────
  private *declare(d: VarDecl, sc: Scope): G<void> {
    this.line = d.line;
    if (CLASSES.has(d.type.base)) {
      // Library object: `Servo s;` or `DHT dht(2, DHT11);`
      const args: number[] = [];
      for (const a of d.ctor ?? []) args.push(this.num(yield* this.ev(a, sc)));
      const obj = this.io.createObject?.(d.type.base, args);
      if (!obj) this.fail(`'${d.type.base}' não é suportado nesta placa.`, d.line);
      sc.def(d.name, { v: obj, t: d.type });
      return;
    }
    if (d.dims.length) {
      const dims: number[] = [];
      for (let i = 0; i < d.dims.length; i++) {
        const de = d.dims[i];
        if (de) dims.push(this.num(yield* this.ev(de, sc)));
        else if (i === 0 && d.initList) dims.push(d.initList.length);
        else this.fail(`Dimensão em falta no array '${d.name}'.`, d.line);
      }
      const arr = makeArray(dims, d.type);
      if (d.initList) {
        if (d.initList.length > dims[0]) this.fail(`Demasiados valores para o array '${d.name}'.`, d.line);
        for (let i = 0; i < d.initList.length; i++) arr[i] = coerce(d.type, yield* this.ev(d.initList[i], sc));
      }
      sc.def(d.name, { v: arr, t: d.type });
      return;
    }
    const v = d.init ? coerce(d.type, yield* this.ev(d.init, sc)) : defaultValue(d.type);
    sc.def(d.name, { v, t: d.type });
  }

  // ───────── statements ─────────
  private *exec(s: Stmt, sc: Scope): G<Flow> {
    this.line = s.line;
    this.tick();
    switch (s.t) {
      case 'block': {
        const inner = new Scope(sc);
        for (const st of s.body) { const f = yield* this.exec(st, inner); if (f) return f; }
        return undefined;
      }
      case 'vars':
        for (const d of s.decls) yield* this.declare(d, sc);
        return undefined;
      case 'expr':
        yield* this.ev(s.e, sc);
        return undefined;
      case 'if':
        if (this.num(yield* this.ev(s.test, sc))) return yield* this.exec(s.cons, sc);
        if (s.alt) return yield* this.exec(s.alt, sc);
        return undefined;
      case 'while':
        while (this.num(yield* this.ev(s.test, sc))) {
          this.tick();
          const f = yield* this.exec(s.body, sc);
          if (f?.k === 'break') break;
          if (f?.k === 'return') return f;
        }
        return undefined;
      case 'do':
        for (;;) {
          this.tick();
          const f = yield* this.exec(s.body, sc);
          if (f?.k === 'break') break;
          if (f?.k === 'return') return f;
          if (!this.num(yield* this.ev(s.test, sc))) break;
        }
        return undefined;
      case 'for': {
        const fs = new Scope(sc);
        if (s.init) yield* this.exec(s.init, fs);
        for (;;) {
          if (s.test && !this.num(yield* this.ev(s.test, fs))) break;
          this.tick();
          const f = yield* this.exec(s.body, fs);
          if (f?.k === 'break') break;
          if (f?.k === 'return') return f;
          if (s.update) yield* this.ev(s.update, fs);
        }
        return undefined;
      }
      case 'switch': {
        const d = this.num(yield* this.ev(s.disc, sc));
        let start = -1;
        for (let i = 0; i < s.cases.length && start < 0; i++) {
          const t = s.cases[i].test;
          if (t && this.num(yield* this.ev(t, sc)) === d) start = i;
        }
        if (start < 0) start = s.cases.findIndex((c) => c.test === null);
        if (start < 0) return undefined;
        const inner = new Scope(sc);
        for (let i = start; i < s.cases.length; i++) {
          for (const st of s.cases[i].body) {
            const f = yield* this.exec(st, inner);
            if (f?.k === 'break') return undefined;
            if (f) return f;
          }
        }
        return undefined;
      }
      case 'break': return { k: 'break' };
      case 'continue': return { k: 'continue' };
      case 'return': return { k: 'return', v: s.e ? yield* this.ev(s.e, sc) : 0 };
      case 'empty': return undefined;
    }
  }

  private *callUser(f: FuncDecl, args: Val[], line: number): G<Val> {
    if (args.length !== f.params.length) this.fail(`'${f.name}' espera ${f.params.length} argumento(s) e recebeu ${args.length}.`, line);
    if (++this.depth > MAX_DEPTH) this.fail('Recursão demasiado profunda.', line);
    try {
      const sc = new Scope(this.glob);
      f.params.forEach((p, i) => sc.def(p.name, { v: p.array || p.type.ptr ? args[i] : coerce(p.type, args[i]), t: p.type }));
      const flow = yield* this.exec(f.body, sc);
      return flow?.k === 'return' ? flow.v : 0;
    } finally {
      this.depth--;
    }
  }

  // ───────── expressions ─────────
  /** Whether an expression has floating-point type (decides between / and integer division). */
  private floatish(e: Expr, sc: Scope): boolean {
    switch (e.t) {
      case 'num': return e.isFloat;
      case 'cast': return isFloatType(e.type);
      case 'id': return isFloatType(sc.find(e.name)?.t);
      case 'index': { let b: Expr = e; while (b.t === 'index') b = b.arr; return b.t === 'id' && isFloatType(sc.find(b.name)?.t); }
      case 'unary': return this.floatish(e.arg, sc);
      case 'bin': return ['+', '-', '*', '/', '%'].includes(e.op) && (this.floatish(e.l, sc) || this.floatish(e.r, sc));
      case 'assign': return this.floatish(e.target, sc);
      case 'update': return this.floatish(e.arg, sc);
      case 'cond': return this.floatish(e.cons, sc) || this.floatish(e.alt, sc);
      case 'call': return FLOAT_FUNCS.has(e.name);
      case 'mcall': return e.method === 'readTemperature' || e.method === 'readHumidity';
      default: return false;
    }
  }

  private arith(op: string, a: number, b: number, floatDiv: boolean): number {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) this.fail('Divisão por zero.');
        return floatDiv ? a / b : Math.trunc(a / b);
      case '%':
        if (b === 0) this.fail('Resto da divisão por zero.');
        return a % b;
      case '<<': return a << b;
      case '>>': return a >> b;
      case '&': return a & b;
      case '|': return a | b;
      case '^': return a ^ b;
      case '==': return +(a === b);
      case '!=': return +(a !== b);
      case '<': return +(a < b);
      case '>': return +(a > b);
      case '<=': return +(a <= b);
      case '>=': return +(a >= b);
    }
    return this.fail(`Operador '${op}' não suportado.`);
  }

  /** An assignable location: a variable or an array element. */
  private *lref(e: Expr, sc: Scope): G<{ get(): Val; set(v: Val): void; t?: TypeRef }> {
    this.line = e.line;
    if (e.t === 'id') {
      const c = sc.find(e.name);
      if (!c) this.fail(`'${e.name}' não foi declarado neste âmbito.`);
      return { get: () => c.v, set: (v) => { c.v = v; }, t: c.t };
    }
    if (e.t === 'index') {
      const arr = yield* this.ev(e.arr, sc);
      const i = this.num(yield* this.ev(e.index, sc));
      if (!Array.isArray(arr)) this.fail('Indexação de algo que não é um array.');
      if (i < 0 || i >= arr.length) this.fail(`Índice ${i} fora dos limites (0 a ${arr.length - 1}).`);
      let b: Expr = e; while (b.t === 'index') b = b.arr;
      const t = b.t === 'id' ? sc.find(b.name)?.t : undefined;
      return { get: () => arr[i], set: (v) => { arr[i] = v; }, t };
    }
    return this.fail('Só é possível atribuir a variáveis ou elementos de arrays.');
  }

  private *ev(e: Expr, sc: Scope): G<Val> {
    this.line = e.line;
    switch (e.t) {
      case 'num': case 'char': case 'str': return e.value;
      case 'id': {
        const c = sc.find(e.name);
        if (c) return c.v;
        const k = this.consts.get(e.name);
        if (k !== undefined) return k;
        return this.fail(`'${e.name}' não foi declarado neste âmbito.`);
      }
      case 'unary': {
        const a = this.num(yield* this.ev(e.arg, sc));
        switch (e.op) {
          case '!': return a ? 0 : 1;
          case '-': return -a;
          case '~': return ~a;
          default: return a;
        }
      }
      case 'update': {
        const r = yield* this.lref(e.arg, sc);
        const old = this.num(r.get());
        const nv = coerce(r.t, old + (e.op === '++' ? 1 : -1));
        r.set(nv);
        return e.prefix ? nv : old;
      }
      case 'bin': {
        if (e.op === '&&') return this.num(yield* this.ev(e.l, sc)) && this.num(yield* this.ev(e.r, sc)) ? 1 : 0;
        if (e.op === '||') return this.num(yield* this.ev(e.l, sc)) || this.num(yield* this.ev(e.r, sc)) ? 1 : 0;
        if (e.op === ',') { yield* this.ev(e.l, sc); return yield* this.ev(e.r, sc); }
        const a = this.num(yield* this.ev(e.l, sc));
        const b = this.num(yield* this.ev(e.r, sc));
        return this.arith(e.op, a, b, this.floatish(e.l, sc) || this.floatish(e.r, sc));
      }
      case 'assign': {
        const r = yield* this.lref(e.target, sc);
        const rhs = yield* this.ev(e.value, sc);
        let nv: Val;
        if (e.op === '=') nv = rhs;
        else {
          const fl = this.floatish(e.target, sc) || this.floatish(e.value, sc);
          nv = this.arith(e.op.slice(0, -1), this.num(r.get()), this.num(rhs), fl);
        }
        if (Array.isArray(nv)) this.fail('Não é possível atribuir um array inteiro.');
        const out = coerce(r.t, nv);
        r.set(out);
        return out;
      }
      case 'cond':
        return this.num(yield* this.ev(e.test, sc)) ? yield* this.ev(e.cons, sc) : yield* this.ev(e.alt, sc);
      case 'call': {
        const f = this.funcs.get(e.name);
        if (f) {
          const args: Val[] = [];
          for (const a of e.args) args.push(yield* this.ev(a, sc));
          return yield* this.callUser(f, args, e.line);
        }
        const r = yield* this.builtin(e.name, e.args, sc, e.line);
        if (r === undefined) this.fail(`Função '${e.name}' desconhecida.`);
        return r;
      }
      case 'mcall': {
        const c = sc.find(e.obj);
        if (c && typeof c.v === 'object' && !Array.isArray(c.v)) {
          const args: number[] = [];
          for (const a of e.args) args.push(this.num(yield* this.ev(a, sc)));
          return (c.v as NativeObj).call(e.method, args);
        }
        return yield* this.method(e.obj, e.method, e.args, sc, e.line);
      }
      case 'member': return this.fail(`'${e.obj}::${e.prop}' ainda não é suportado.`);
      case 'index': {
        const arr = yield* this.ev(e.arr, sc);
        const i = this.num(yield* this.ev(e.index, sc));
        if (!Array.isArray(arr)) this.fail('Indexação de algo que não é um array.');
        if (i < 0 || i >= arr.length) this.fail(`Índice ${i} fora dos limites (0 a ${arr.length - 1}).`);
        return arr[i];
      }
      case 'cast': return coerce(e.type, this.num(yield* this.ev(e.arg, sc)));
    }
  }

  /** Text of a value as Serial.print shows it: floats with 2 decimals, chars as characters. */
  private format(e: Expr, v: Val, sc: Scope, base?: number): string {
    if (typeof v === 'string') return v;
    if (typeof v !== 'number') this.fail('Não é possível imprimir este valor diretamente.', e.line);
    if (base !== undefined) return Math.trunc(v).toString(base).toUpperCase();
    if (e.t === 'char' || (e.t === 'id' && sc.find(e.name)?.t?.base === 'char')) return String.fromCharCode(v);
    if (this.floatish(e, sc)) return v.toFixed(2);
    return String(v);
  }

  private *method(obj: string, name: string, argEs: Expr[], sc: Scope, line: number): G<Val> {
    if (obj !== 'Serial') this.fail(`'${obj}.${name}()' ainda não é suportado nesta versão.`, line);
    switch (name) {
      case 'begin': case 'end': case 'flush': return 0;
      case 'available': return this.io.serialAvailable();
      case 'read': return this.io.serialRead();
      case 'print': case 'println': {
        let text = '';
        if (argEs.length) {
          const v = yield* this.ev(argEs[0], sc);
          const base = argEs[1] ? this.num(yield* this.ev(argEs[1], sc)) : undefined;
          text = this.format(argEs[0], v, sc, base);
        }
        this.io.serial(name === 'println' ? text + '\n' : text);
        return 0;
      }
      default: return this.fail(`Serial.${name}() ainda não é suportado.`, line);
    }
  }

  /** Arduino core functions. Returns undefined if the name is not a built-in. */
  private *builtin(name: string, argEs: Expr[], sc: Scope, line: number): G<Val | undefined> {
    switch (name) {
      case 'pinMode': case 'digitalWrite': case 'digitalRead': case 'analogRead': case 'analogWrite':
      case 'delay': case 'delayMicroseconds': case 'millis': case 'micros':
      case 'abs': case 'min': case 'max': case 'constrain': case 'map': case 'sq': case 'random':
      case 'sqrt': case 'pow': case 'sin': case 'cos': case 'tan': case 'atan2': case 'log': case 'exp':
      case 'fabs': case 'floor': case 'ceil': case 'round': case 'radians': case 'degrees': break;
      default: return undefined;
    }
    const args: number[] = [];
    for (const a of argEs) args.push(this.num(yield* this.ev(a, sc)));
    const [a0 = 0, a1 = 0, a2 = 0, a3 = 0, a4 = 0] = args;
    switch (name) {
      case 'pinMode': this.io.pinMode(a0, a1); return 0;
      case 'digitalWrite': this.io.digitalWrite(a0, a1 !== 0); return 0;
      case 'digitalRead': return this.io.digitalRead(a0) ? 1 : 0;
      case 'analogRead': return Math.max(0, Math.round(this.io.analogRead(a0)));   // resolution comes from the board (10/12 bits)
      case 'analogWrite': this.io.analogWrite(a0, Math.max(0, Math.min(255, a1))); return 0;
      case 'delay': this.ops = 0; yield { ms: Math.max(0, a0) }; return 0;
      case 'delayMicroseconds': this.ops = 0; yield { ms: Math.max(0, a0) / 1000 }; return 0;
      case 'millis': return this.io.millis();
      case 'micros': return this.io.micros();
      case 'abs': return Math.abs(a0);
      case 'min': return Math.min(a0, a1);
      case 'max': return Math.max(a0, a1);
      case 'constrain': return Math.min(Math.max(a0, a1), a2);
      case 'map': {
        if (a2 === a1) this.fail('map(): in_min e in_max não podem ser iguais.', line);
        return Math.trunc((a0 - a1) * (a4 - a3) / (a2 - a1)) + a3;
      }
      case 'sq': return a0 * a0;
      case 'random':
        if (argEs.length === 1) return a0 > 0 ? Math.floor(Math.random() * a0) : 0;
        return a1 > a0 ? a0 + Math.floor(Math.random() * (a1 - a0)) : a0;
      case 'sqrt': return Math.sqrt(a0);
      case 'pow': return Math.pow(a0, a1);
      case 'sin': return Math.sin(a0);
      case 'cos': return Math.cos(a0);
      case 'tan': return Math.tan(a0);
      case 'atan2': return Math.atan2(a0, a1);
      case 'log': return Math.log(a0);
      case 'exp': return Math.exp(a0);
      case 'fabs': return Math.abs(a0);
      case 'floor': return Math.floor(a0);
      case 'ceil': return Math.ceil(a0);
      case 'round': return Math.round(a0);
      case 'radians': return a0 * Math.PI / 180;
      case 'degrees': return a0 * 180 / Math.PI;
    }
    return undefined;
  }
}

/** Parses and prepares a sketch for execution. Throws CompileError on syntax errors. */
export function createInterp(source: string, io: McuIO, consts?: Map<string, number>): Interp {
  return new Interp(parse(source), io, consts ?? CONSTANTS);
}
