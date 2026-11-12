/**
 * Circuit solver: Modified Nodal Analysis + Newton–Raphson with SPICE-style junction limiting,
 * gmin stepping and source stepping. DC operating point and transient analysis (Backward-Euler
 * companion models). Pure TypeScript — runs in a Web Worker or on the main thread.
 */
import type { Element, SimCircuit, SimResult, Wave } from './types';

const VT = 0.025852;
const GMIN = 1e-12;

export interface StepCtx { dc: boolean; dt: number; t: number }

function branchCount(e: Element): number {
  switch (e.k) {
    case 'V': case 'VT': case 'VCVS': case 'CCVS': case 'T555': case 'XFMR': return 1;
    case 'SUPPLY': return e.cc ? 0 : 1;
    case 'SEQ': return e.outs.length;
    default: return 0;
  }
}

export function waveValue(w: Wave, t: number): number {
  if (w.kind === 'dc' || w.freq <= 0) return w.offset + (w.kind === 'dc' ? w.amp : 0);
  const ph = ((t * w.freq + w.phase / 360) % 1 + 1) % 1;
  switch (w.kind) {
    case 'sine': return w.offset + w.amp * Math.sin(2 * Math.PI * ph);
    case 'square': return w.offset + (ph < w.duty ? w.amp : -w.amp);
    case 'triangle': return w.offset + w.amp * (ph < 0.5 ? 4 * ph - 1 : 3 - 4 * ph);
    case 'saw': return w.offset + w.amp * (2 * ph - 1);
  }
}

class Mna {
  G: Float64Array; b: Float64Array; n: number;
  constructor(n: number) { this.n = n; this.G = new Float64Array(n * n); this.b = new Float64Array(n); }
  g(r: number, c: number, v: number) { if (r > 0 && c > 0) this.G[(r - 1) * this.n + (c - 1)] += v; }
  gr(row: number, c: number, v: number) { if (c > 0) this.G[row * this.n + (c - 1)] += v; }
  rc(r: number, col: number, v: number) { if (r > 0) this.G[(r - 1) * this.n + col] += v; }
  raw(row: number, col: number, v: number) { this.G[row * this.n + col] += v; }
  rhs(r: number, v: number) { if (r > 0) this.b[r - 1] += v; }
  rhsRaw(row: number, v: number) { this.b[row] += v; }
  conductance(a: number, b: number, g: number) { this.g(a, a, g); this.g(b, b, g); this.g(a, b, -g); this.g(b, a, -g); }
  current(out: number, inn: number, I0: number, terms: { coef: number; p: number; m: number; v0: number }[]) {
    let ieq = I0;
    for (const t of terms) {
      this.g(out, t.p, t.coef); this.g(out, t.m, -t.coef);
      this.g(inn, t.p, -t.coef); this.g(inn, t.m, t.coef);
      ieq -= t.coef * t.v0;
    }
    this.rhs(out, -ieq); this.rhs(inn, ieq);
  }
  /** Voltage-source branch: V(p) − V(ref) − rout·I − Σ terms = c; current I enters p and returns through `ret`. */
  vsrc(row: number, p: number, ref: number, ret: number, c: number, rout = 0, terms: [number, number][] = []) {
    this.rc(p, row, 1); this.rc(ret, row, -1);
    this.gr(row, p, 1); this.gr(row, ref, -1);
    for (const [node, coef] of terms) this.gr(row, node, -coef);
    if (rout) this.raw(row, row, -rout);
    this.rhsRaw(row, c);
  }
}

function solveLinear(A: Float64Array, b: Float64Array, n: number): Float64Array | null {
  const M = A.slice(), x = b.slice();
  for (let k = 0; k < n; k++) {
    let p = k, max = Math.abs(M[k * n + k]);
    for (let i = k + 1; i < n; i++) { const v = Math.abs(M[i * n + k]); if (v > max) { max = v; p = i; } }
    if (max < 1e-18) return null;
    if (p !== k) {
      for (let j = 0; j < n; j++) { const t = M[k * n + j]; M[k * n + j] = M[p * n + j]; M[p * n + j] = t; }
      const t = x[k]; x[k] = x[p]; x[p] = t;
    }
    const piv = M[k * n + k];
    for (let i = k + 1; i < n; i++) {
      const f = M[i * n + k] / piv;
      if (f === 0) continue;
      for (let j = k; j < n; j++) M[i * n + j] -= f * M[k * n + j];
      x[i] -= f * x[k];
    }
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i];
    for (let j = i + 1; j < n; j++) s -= M[i * n + j] * x[j];
    x[i] = s / M[i * n + i];
  }
  for (let i = 0; i < n; i++) if (!isFinite(x[i])) return null;
  return x;
}

function pnjlim(vnew: number, vold: number, vt: number, vcrit: number): number {
  if (vnew > vcrit && Math.abs(vnew - vold) > 2 * vt) {
    if (vold > 0) {
      const arg = 1 + (vnew - vold) / vt;
      return arg > 0 ? vold + vt * Math.log(arg) : vcrit;
    }
    return vt * Math.log(vnew / vt);
  }
  return vnew;
}

let limited = false;
const lim = (a: number, b: number) => { if (Math.abs(a - b) > 1e-9) limited = true; return a; };
const expl = (x: number) => (x > 80 ? Math.exp(80) * (1 + x - 80) : Math.exp(x));

function diodeEval(v: number, is: number, n: number, bv?: number, ibv = 1e-3) {
  const nvt = n * VT;
  const e = expl(v / nvt);
  let i = is * (e - 1), g = (is * e) / nvt;
  if (bv !== undefined) { const eb = expl(-(v + bv) / VT); i -= ibv * eb; g += (ibv * eb) / VT; }
  return { i: i + GMIN * v, g: g + GMIN };
}

function mosEval(e: Extract<Element, { k: 'MOS' }>, vg: number, vd: number, vs: number) {
  const s = e.p ? -1 : 1;
  let vds = s * (vd - vs), swap = false;
  if (vds < 0) { vds = -vds; swap = true; }
  const vgs = s * (vg - (swap ? vd : vs));
  const vov = vgs - e.vth;
  let id = 0;
  if (vov > 0) id = vds < vov ? e.kp * (vov * vds - vds * vds / 2) * (1 + e.lambda * vds) : (e.kp / 2) * vov * vov * (1 + e.lambda * vds);
  return s * (swap ? -id : id);
}

/** Candidate state of a sequential element from its committed state + current inputs. */
function seqEval(e: Extract<Element, { k: 'SEQ' }>, V: (n: number) => number): { st: number[]; outs: number[]; clk: boolean[] } {
  const th = (V(e.vcc) - V(e.gnd)) / 2;
  const hi = (n: number) => V(n) - V(e.gnd) > th;
  if (e.kind === 'dff2') {
    const st = [...e.st], clk = [hi(e.ins[2]), hi(e.ins[6])];
    for (let k = 0; k < 2; k++) {
      const clr = hi(e.ins[4 * k]), d = hi(e.ins[4 * k + 1]), pre = hi(e.ins[4 * k + 3]);
      if (!clr) st[k] = 0; else if (!pre) st[k] = 1; else if (!e.prev[k] && clk[k]) st[k] = d ? 1 : 0;
    }
    return { st, clk, outs: [st[0], 1 - st[0], 1 - st[1], st[1]] };
  }
  if (e.kind === 'cd4017') {
    let c = e.st[0];
    const clk = hi(e.ins[0]), ce = hi(e.ins[1]), mr = hi(e.ins[2]);
    if (mr) c = 0; else if (!e.prev[0] && clk && !ce) c = (c + 1) % 10;
    return { st: [c], clk: [clk], outs: [...Array.from({ length: 10 }, (_, i) => (c === i ? 1 : 0)), c < 5 ? 1 : 0] };
  }
  let c = e.st[0];
  const clk = hi(e.ins[0]), mr = hi(e.ins[1]);
  if (mr) c = 0; else if (e.prev[0] && !clk) c = (c + 1) & 0x3fff;
  const bits = [12, 13, 14, 6, 5, 7, 4, 9, 8, 10];
  return { st: [c], clk: [clk], outs: bits.map((b) => (c >> (b - 1)) & 1) };
}

/** Nodes without a DC path to ground. */
export function findFloating(N: number, els: Element[]): boolean[] {
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (const e of els) {
    switch (e.k) {
      case 'R': case 'L': join(e.a, e.b); break;
      case 'SW': if (e.on) join(e.a, e.b); break;
      case 'V': case 'VT': case 'SUPPLY': case 'I': join(e.p, e.n); break;
      case 'VCVS': join(e.p, e.n); if (e.from !== undefined) join(e.p, e.from); break;
      case 'CCVS': join(e.p, e.n); break;
      case 'D': join(e.a, e.c); break;
      case 'BJT': join(e.b, e.e); join(e.b, e.c); break;
      case 'MOS': join(e.d, e.s); break;
      case 'T555': join(e.out, e.gnd); join(e.out, e.vcc); join(e.dis, e.gnd); break;
      case 'SEQ': e.outs.forEach((o) => { join(o, e.gnd); join(o, e.vcc); }); break;
      case 'THY': if (e.on) join(e.a, e.c); break;
      case 'XFMR': join(e.s1, e.s2); break;
    }
  }
  const g = find(0);
  return Array.from({ length: N }, (_, i) => i !== 0 && find(i) !== g);
}

export class Engine {
  els: Element[];
  N: number;
  x: Float64Array | null = null;
  js = new Map<string, number>();
  bstart: number[] = [];
  nb = 0;
  iterations = 0;
  warnings: string[] = [];
  floating: boolean[];
  ok = true;
  error?: string;
  lastCurrents: Record<string, Record<string, number>> = {};
  t = 0;

  constructor(circuit: SimCircuit) {
    this.els = structuredClone(circuit.elements);
    this.N = circuit.nodeCount;
    this.floating = findFloating(this.N, this.els);
    this.layout();
  }

  private layout() {
    this.nb = 0;
    this.bstart = this.els.map((e) => { const s = this.nb; this.nb += branchCount(e); return s; });
  }

  V = (node: number) => (node > 0 && this.x ? this.x[node - 1] : 0);

  private stampAll(m: Mna, x: Float64Array, ctx: StepCtx, gmin: number, scale: number) {
    const V = (node: number) => (node > 0 ? x[node - 1] : 0);
    const off = this.N - 1;
    for (let n = 1; n < this.N; n++) m.g(n, n, gmin + (this.floating[n] ? 1e-9 : 0));
    this.els.forEach((e, idx) => {
      const row = off + this.bstart[idx];
      switch (e.k) {
        case 'R': m.conductance(e.a, e.b, 1 / Math.max(e.r, 1e-6)); break;
        case 'SW': m.conductance(e.a, e.b, 1 / (e.on ? e.ron : e.roff)); break;
        case 'THY': m.conductance(e.a, e.c, e.on ? 20 : 1e-8); break;
        case 'V': m.vsrc(row, e.p, e.n, e.n, e.v * scale); break;
        case 'VT': m.vsrc(row, e.p, e.n, e.n, waveValue(e.wave, ctx.t) * scale); break;
        case 'I': m.rhs(e.p, e.i * scale); m.rhs(e.n, -e.i * scale); break;
        case 'SUPPLY':
          if (e.cc) { m.rhs(e.p, e.ilim * scale); m.rhs(e.n, -e.ilim * scale); m.conductance(e.p, e.n, 1e-6); }
          else m.vsrc(row, e.p, e.n, e.n, e.v * scale, 1e-3);
          break;
        case 'C':
          if (!ctx.dc) { const G = e.c / ctx.dt; m.conductance(e.a, e.b, G); m.rhs(e.a, G * e.vprev); m.rhs(e.b, -G * e.vprev); }
          break;
        case 'L':
          if (ctx.dc) m.conductance(e.a, e.b, 1e3);
          else { const G = ctx.dt / e.l; m.conductance(e.a, e.b, G); m.rhs(e.a, -e.iprev); m.rhs(e.b, e.iprev); }
          break;
        case 'VCVS': {
          const md = e.modes[e.mode] ?? e.modes[0];
          m.vsrc(row, e.p, e.n, e.from ?? e.n, md.c * scale, 1, md.terms);
          break;
        }
        case 'CCVS':
          m.vsrc(row, e.p, e.n, e.n, e.c * scale, 1, e.terms);
          m.raw(row, off + this.bstart[e.ctrl], -e.gain);
          break;
        case 'T555':
          if (e.q) m.vsrc(row, e.out, e.vcc, e.vcc, -1.7, 10); else m.vsrc(row, e.out, e.gnd, e.gnd, 0.1, 10);
          m.conductance(e.dis, e.gnd, e.q ? 1e-9 : 0.1);
          break;
        case 'SEQ':
          e.outs.forEach((o, i) => { const hi = e.cand[i] === 1; m.vsrc(row + i, o, hi ? e.vcc : e.gnd, hi ? e.vcc : e.gnd, 0, 50); });
          break;
        case 'XFMR':
          m.rc(e.s1, row, 1); m.rc(e.s2, row, -1); m.rc(e.p1, row, -e.n); m.rc(e.p2, row, e.n);
          m.gr(row, e.s1, 1); m.gr(row, e.s2, -1); m.gr(row, e.p1, -e.n); m.gr(row, e.p2, e.n);
          m.raw(row, row, -1e-3);
          break;
        case 'D': {
          const nvt = e.n * VT, vcrit = nvt * Math.log(nvt / (Math.SQRT2 * e.is));
          const key = `d${idx}`, vraw = V(e.a) - V(e.c), vold = this.js.get(key) ?? 0;
          let v = pnjlim(vraw, vold, nvt, vcrit);
          if (e.bv !== undefined && v < -e.bv) v = -pnjlim(-v, -vold, VT, e.bv + VT * 5);
          lim(v, vraw); this.js.set(key, v);
          const d = diodeEval(v, e.is, e.n, e.bv, e.ibv);
          m.current(e.a, e.c, d.i, [{ coef: d.g, p: e.a, m: e.c, v0: v }]);
          break;
        }
        case 'BJT': {
          const s = e.pnp ? -1 : 1, vcrit = VT * Math.log(VT / (Math.SQRT2 * e.is));
          const vbeRaw = s * (V(e.b) - V(e.e)), vbcRaw = s * (V(e.b) - V(e.c));
          const vbe = pnjlim(vbeRaw, this.js.get(`be${idx}`) ?? 0, VT, vcrit), vbc = pnjlim(vbcRaw, this.js.get(`bc${idx}`) ?? 0, VT, vcrit);
          lim(vbe, vbeRaw); lim(vbc, vbcRaw);
          this.js.set(`be${idx}`, vbe); this.js.set(`bc${idx}`, vbc);
          const ef = expl(vbe / VT), er = expl(vbc / VT);
          const If = e.is * (ef - 1), Ir = e.is * (er - 1);
          const gf = (e.is * ef) / VT + GMIN, gr = (e.is * er) / VT + GMIN;
          const Ic = If - Ir * (1 + 1 / e.br), Ib = If / e.bf + Ir / e.br;
          const tbe = { p: e.b, m: e.e, v0: s * vbe }, tbc = { p: e.b, m: e.c, v0: s * vbc };
          m.current(e.c, e.e, s * Ic, [{ coef: gf, ...tbe }, { coef: -gr * (1 + 1 / e.br), ...tbc }]);
          m.current(e.b, e.e, s * Ib, [{ coef: gf / e.bf, ...tbe }, { coef: gr / e.br, ...tbc }]);
          break;
        }
        case 'MOS': {
          const s = e.p ? -1 : 1;
          let d = e.d, src = e.s;
          let vds = s * (V(d) - V(src));
          if (vds < 0) { [d, src] = [src, d]; vds = -vds; }
          let vgs = s * (V(e.g) - V(src));
          const key = `g${idx}`, old = this.js.get(key);
          if (old !== undefined && Math.abs(vgs - old) > 1) { vgs = old + Math.sign(vgs - old); limited = true; }
          this.js.set(key, vgs);
          const vov = vgs - e.vth;
          let id = 0, gm = 0, gds = 0;
          if (vov > 0) {
            const cl = 1 + e.lambda * vds;
            if (vds < vov) { id = e.kp * (vov * vds - vds * vds / 2) * cl; gm = e.kp * vds * cl; gds = e.kp * (vov - vds) * cl + e.kp * (vov * vds - vds * vds / 2) * e.lambda; }
            else { id = (e.kp / 2) * vov * vov * cl; gm = e.kp * vov * cl; gds = (e.kp / 2) * vov * vov * e.lambda; }
          }
          gds += GMIN;
          m.current(d, src, s * id, [{ coef: gm, p: e.g, m: src, v0: s * vgs }, { coef: gds, p: d, m: src, v0: s * vds }]);
          break;
        }
      }
    });
  }

  private runNR(ctx: StepCtx, gmin: number, scale: number, start: Float64Array | null): Float64Array | null {
    this.layout();
    const size = this.N - 1 + this.nb;
    let cur = start && start.length === size ? start.slice() : new Float64Array(size);
    for (let it = 0; it < 150; it++) {
      this.iterations++;
      const m = new Mna(size);
      limited = false;
      this.stampAll(m, cur, ctx, gmin, scale);
      const next = solveLinear(m.G, m.b, size);
      if (!next) return null;
      let conv = true;
      for (let i = 0; i < size; i++) {
        const d = Math.abs(next[i] - cur[i]);
        const tol = i < this.N - 1 ? 1e-6 + 1e-4 * Math.abs(next[i]) : 1e-9 + 1e-4 * Math.abs(next[i]);
        if (d > tol) { conv = false; break; }
      }
      cur = next;
      if (conv && !limited && it > 0) return cur;
    }
    return null;
  }

  private robust(ctx: StepCtx, start: Float64Array | null): Float64Array | null {
    let r = this.runNR(ctx, GMIN, 1, start);
    if (r) return r;
    let s: Float64Array | null = start;
    for (let g = 1e-2; g >= 1e-12; g /= 10) { s = this.runNR(ctx, g, 1, s); if (!s) break; }
    if (s) { r = this.runNR(ctx, GMIN, 1, s); if (r) return r; }
    if (!ctx.dc) return null;
    s = null;
    for (const sc of [0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1]) { s = this.runNR(ctx, GMIN, sc, s); if (!s) return null; }
    return s;
  }

  /** Solve one time point (or the DC operating point), iterating discrete modes to a fixed point. */
  solvePoint(ctx: StepCtx): boolean {
    let x = this.x;
    for (let outer = 0; outer < 40; outer++) {
      x = this.robust(ctx, x);
      if (!x) {
        this.ok = false;
        this.error = 'O sistema de equações não tem solução: verifique se existem fontes de tensão ligadas em paralelo/curto (laço de fontes) ou uma fonte de corrente sem caminho de retorno.';
        return false;
      }
      this.x = x;
      if (!this.updateModes(x)) { this.ok = true; this.error = undefined; return true; }
      if (outer === 39 && !this.warnings.length) this.warnings.push('Os estados discretos (saturação/regulação/lógica) não estabilizaram — o resultado pode oscilar.');
    }
    return true;
  }

  private updateModes(x: Float64Array): boolean {
    const V = (node: number) => (node > 0 ? x[node - 1] : 0);
    const off = this.N - 1;
    let changed = false;
    this.els.forEach((e, i) => {
      if (e.k === 'VCVS') {
        const r = e.rule;
        let mode = e.mode;
        if (r.kind === 'opamp') {
          const lin = e.modes[0];
          const target = V(e.n) + lin.terms.reduce((s, [n, c]) => s + c * V(n), 0) + lin.c;
          mode = target > V(r.hi[0]) + r.hi[1] ? 1 : target < V(r.lo[0]) + r.lo[1] ? 2 : 0;
        } else if (r.kind === 'regulator') mode = V(r.vin) - (V(e.n) + e.modes[0].c) < r.dropout ? 1 : 0;
        else if (r.kind === 'powered') mode = V(r.vcc) - V(r.gnd) >= r.min ? 0 : 1;
        else if (r.kind === 'logic') {
          const vcc = V(r.vcc) - V(r.gnd);
          const bits = r.inputs.map((n) => V(n) - V(r.gnd) > vcc / 2);
          const out = r.fn === 'nand' ? !bits.every(Boolean) : r.fn === 'and' ? bits.every(Boolean) : r.fn === 'or' ? bits.some(Boolean)
            : r.fn === 'nor' ? !bits.some(Boolean) : r.fn === 'xor' ? bits.filter(Boolean).length % 2 === 1 : !bits[0];
          mode = out ? 1 : 0;
        }
        if (mode !== e.mode) { e.mode = mode; changed = true; }
      } else if (e.k === 'SUPPLY') {
        if (!e.cc) { if (-x[off + this.bstart[i]] > e.ilim * 1.0001) { e.cc = true; changed = true; } }
        else if (V(e.p) - V(e.n) > e.v + 1e-6) { e.cc = false; changed = true; }
      } else if (e.k === 'SW') {
        const r = e.rule;
        if (r.kind === 'relay') {
          const energised = V(r.vcc) - V(r.gnd) > 3.5 && (r.activeHigh ? V(r.ctrl) - V(r.gnd) > 2 : V(r.vcc) - V(r.ctrl) > 2);
          const on = r.normallyOpen ? energised : !energised;
          if (on !== e.on) { e.on = on; changed = true; }
        } else if (r.kind === 'threshold') {
          const on = V(r.ctrl) - V(r.ref) > r.vth;
          if (on !== e.on) { e.on = on; changed = true; }
        } else if (r.kind === 'and2') {
          const th = (V(r.vcc) - V(r.gnd)) / 2;
          const a = V(r.a) - V(r.gnd) > th, en = V(r.en) - V(r.gnd) > th;
          const on = en && (r.invert ? !a : a);
          if (on !== e.on) { e.on = on; changed = true; }
        } else if (r.kind === 'fuse' && e.on && Math.abs(V(e.a) - V(e.b)) / e.ron > r.rating * 1.35) { e.on = false; changed = true; }
      } else if (e.k === 'SEQ') {
        const c = seqEval(e, V).outs;
        if (c.some((b, k) => b !== e.cand[k])) { e.cand = c; changed = true; }
      } else if (e.k === 'THY') {
        const I = (V(e.a) - V(e.c)) * (e.on ? 20 : 1e-8);
        const vg = V(e.g) - V(e.c);
        const trig = e.triac ? Math.abs(vg) > 0.7 : vg > 0.7 && V(e.a) > V(e.c);
        const on = e.cand ? Math.abs(I) > e.ih || trig : trig;
        if (on !== e.on) { e.on = on; changed = true; }
      }
    });
    return changed;
  }

  /** Accept the current solution: record currents and update committed state (capacitor voltage, latches, counters). */
  commit(ctx: StepCtx) {
    const x = this.x;
    if (!x) return;
    const V = this.V;
    const off = this.N - 1;
    const out: Record<string, Record<string, number>> = {};
    const add = (e: Element, t: number, i: number) => {
      const pin = e.own?.pins[t];
      if (!e.own || !pin) return;
      const c = (out[e.own.compId] ??= {});
      c[pin] = (c[pin] ?? 0) + i;
    };
    this.els.forEach((e, idx) => {
      const br = (k = 0) => x[off + this.bstart[idx] + k];
      switch (e.k) {
        case 'R': { const i = (V(e.a) - V(e.b)) / e.r; add(e, 0, i); add(e, 1, -i); break; }
        case 'SW': { const i = (V(e.a) - V(e.b)) / (e.on ? e.ron : e.roff); add(e, 0, i); add(e, 1, -i); break; }
        case 'THY': { const i = (V(e.a) - V(e.c)) * (e.on ? 20 : 1e-8); add(e, 0, i); add(e, 1, -i); e.cand = e.on; break; }
        case 'V': case 'VT': case 'CCVS': case 'VCVS': add(e, 0, br()); add(e, 1, -br()); break;
        case 'SUPPLY': { const i = e.cc ? -e.ilim : br(); add(e, 0, i); add(e, 1, -i); break; }
        case 'I': add(e, 0, -e.i); add(e, 1, e.i); break;
        case 'C': {
          const v = V(e.a) - V(e.b);
          const i = ctx.dc ? 0 : (e.c / ctx.dt) * (v - e.vprev);
          add(e, 0, i); add(e, 1, -i);
          e.vprev = v;
          break;
        }
        case 'L': {
          const v = V(e.a) - V(e.b);
          const i = ctx.dc ? v * 1e3 : e.iprev + (ctx.dt / e.l) * v;
          add(e, 0, i); add(e, 1, -i);
          e.iprev = i;
          break;
        }
        case 'D': { const d = diodeEval(V(e.a) - V(e.c), e.is, e.n, e.bv, e.ibv); add(e, 0, d.i); add(e, 1, -d.i); break; }
        case 'BJT': {
          const s = e.pnp ? -1 : 1;
          const vbe = s * (V(e.b) - V(e.e)), vbc = s * (V(e.b) - V(e.c));
          const If = e.is * (expl(vbe / VT) - 1), Ir = e.is * (expl(vbc / VT) - 1);
          const Ic = s * (If - Ir * (1 + 1 / e.br)), Ib = s * (If / e.bf + Ir / e.br);
          add(e, 0, Ic); add(e, 1, Ib); add(e, 2, -Ic - Ib); break;
        }
        case 'MOS': { const id = mosEval(e, V(e.g), V(e.d), V(e.s)); add(e, 0, id); add(e, 1, 0); add(e, 2, -id); break; }
        case 'T555': {
          const iout = br(), idis = (V(e.dis) - V(e.gnd)) * (e.q ? 1e-9 : 0.1);
          add(e, 0, iout); add(e, 1, idis); add(e, 2, -iout - idis);
          // SR latch decided on the accepted solution (acts as propagation delay; avoids same-instant chatter)
          let q = e.q;
          if (V(e.reset) - V(e.gnd) < 0.7) q = false;
          else if (V(e.trig) < V(e.x)) q = true;
          else if (V(e.thr) > V(e.ctrl)) q = false;
          e.q = q; (e as { qc?: boolean }).qc = q;
          break;
        }
        case 'SEQ': {
          e.outs.forEach((_, k) => add(e, k, br(k)));
          const r = seqEval(e, V);
          e.st = r.st; e.prev = r.clk; e.cand = r.outs;
          break;
        }
        case 'XFMR': { const i = br(); add(e, 0, -e.n * i); add(e, 1, e.n * i); add(e, 2, i); add(e, 3, -i); break; }
      }
    });
    this.lastCurrents = out;
    this.t = ctx.t;
  }

  result(): SimResult {
    const voltages = [0];
    for (let n = 1; n < this.N; n++) voltages.push(this.V(n));
    return {
      ok: this.ok, error: this.error, iterations: this.iterations, voltages, floating: this.floating,
      pinCurrents: this.lastCurrents, warnings: this.warnings, time: this.t,
      elementStates: this.els.map((e) => (e.k === 'VCVS' ? { mode: e.mode } : e.k === 'SW' || e.k === 'THY' ? { on: e.on } : e.k === 'SUPPLY' ? { cc: e.cc } : e.k === 'T555' ? { q: e.q } : e.k === 'SEQ' ? { st: e.st } : {})),
    };
  }

  /** Persistent per-element state (by element key) so edits during a run do not reset capacitors/latches. */
  saveState(): Record<string, unknown> {
    const s: Record<string, unknown> = {};
    for (const e of this.els) {
      if (!e.key) continue;
      if (e.k === 'C') s[e.key] = { vprev: e.vprev };
      else if (e.k === 'L') s[e.key] = { iprev: e.iprev };
      else if (e.k === 'T555') s[e.key] = { q: e.q, qc: (e as { qc?: boolean }).qc };
      else if (e.k === 'SEQ') s[e.key] = { st: e.st, prev: e.prev, cand: e.cand };
      else if (e.k === 'THY') s[e.key] = { on: e.on, cand: e.cand };
      else if (e.k === 'SW' && e.rule.kind === 'fuse') s[e.key] = { on: e.on };
    }
    return s;
  }
  restoreState(s: Record<string, unknown>) {
    for (const e of this.els) if (e.key && s[e.key]) Object.assign(e, s[e.key]);
  }
}

/** Single DC operating point. */
export function solveDC(circuit: SimCircuit): SimResult {
  const eng = new Engine(circuit);
  const ctx = { dc: true, dt: 0, t: 0 };
  eng.solvePoint(ctx);
  eng.commit(ctx);
  return eng.result();
}

/** Transient analysis with fixed Backward-Euler steps. Capacitors start from their (restored) state, discharged by default. */
export class Transient {
  eng: Engine;
  constructor(circuit: SimCircuit, state?: Record<string, unknown>, t0 = 0) {
    this.eng = new Engine(circuit);
    if (state) this.eng.restoreState(state);
    this.eng.t = t0;
  }
  start(): boolean {
    const ctx = { dc: false, dt: 1e-9, t: this.eng.t };
    const ok = this.eng.solvePoint(ctx);
    this.eng.commit(ctx);
    return ok;
  }
  step(dt: number): boolean {
    const ctx = { dc: false, dt, t: this.eng.t + dt };
    if (!this.eng.solvePoint(ctx)) return false;
    this.eng.commit(ctx);
    return true;
  }
}
