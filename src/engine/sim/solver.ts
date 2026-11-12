/**
 * DC operating-point solver: Modified Nodal Analysis + Newton–Raphson with SPICE-style
 * junction voltage limiting, gmin stepping and source stepping. Pure TypeScript (Worker-safe).
 */
import type { Element, SimCircuit, SimResult } from './types';

const VT = 0.025852; // thermal voltage at 300 K
const GMIN = 1e-12;

/** Indices of branch-current unknowns for elements that need one. */
function hasBranch(e: Element): boolean {
  return e.k === 'V' || e.k === 'VCVS' || e.k === 'CCVS' || (e.k === 'SUPPLY' && !e.cc);
}

class Mna {
  G: Float64Array; b: Float64Array; n: number;
  constructor(n: number) { this.n = n; this.G = new Float64Array(n * n); this.b = new Float64Array(n); }
  /** Node index → row (ground row is dropped). */
  g(r: number, c: number, v: number) { if (r > 0 && c > 0) this.G[(r - 1) * this.n + (c - 1)] += v; }
  gr(row: number, c: number, v: number) { if (c > 0) this.G[row * this.n + (c - 1)] += v; } // raw row (branch), node column
  rc(r: number, col: number, v: number) { if (r > 0) this.G[(r - 1) * this.n + col] += v; }  // node row, raw column
  raw(row: number, col: number, v: number) { this.G[row * this.n + col] += v; }
  rhs(r: number, v: number) { if (r > 0) this.b[r - 1] += v; }
  rhsRaw(row: number, v: number) { this.b[row] += v; }
  conductance(a: number, b: number, g: number) { this.g(a, a, g); this.g(b, b, g); this.g(a, b, -g); this.g(b, a, -g); }
  /** Linearised current I = I0 + Σ coef·(V(p)−V(m) − v0), flowing OUT of node `out` INTO node `inn` through the device. */
  current(out: number, inn: number, I0: number, terms: { coef: number; p: number; m: number; v0: number }[]) {
    let ieq = I0;
    for (const t of terms) {
      this.g(out, t.p, t.coef); this.g(out, t.m, -t.coef);
      this.g(inn, t.p, -t.coef); this.g(inn, t.m, t.coef);
      ieq -= t.coef * t.v0;
    }
    this.rhs(out, -ieq); this.rhs(inn, ieq);
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

/** SPICE pnjlim: limit the change of a junction voltage between iterations. */
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

/** Set by device stamps when junction/gate limiting altered the linearisation point (iteration not converged). */
let limited = false;
const lim = (a: number, b: number) => { if (Math.abs(a - b) > 1e-9) limited = true; return a; };

const expl = (x: number) => (x > 80 ? Math.exp(80) * (1 + x - 80) : Math.exp(x)); // linearised beyond 80 to avoid overflow

interface DiodeEval { i: number; g: number }
function diodeEval(v: number, is: number, n: number, bv?: number, ibv = 1e-3): DiodeEval {
  const nvt = n * VT;
  const e = expl(v / nvt);
  let i = is * (e - 1), g = (is * e) / nvt;
  if (bv !== undefined) {
    const eb = expl(-(v + bv) / VT);
    i -= ibv * eb; g += (ibv * eb) / VT;
  }
  return { i: i + GMIN * v, g: g + GMIN };
}

export interface SolveOptions { maxIter?: number; gmin?: number; sourceScale?: number; x0?: Float64Array }

export function solveDC(circuit: SimCircuit): SimResult {
  const els = circuit.elements.map((e) => ({ ...e })) as Element[];
  const N = circuit.nodeCount;
  const branchOf: number[] = [];
  let nb = 0;
  els.forEach((e, i) => { branchOf[i] = hasBranch(e) ? nb++ : -1; });

  const warnings: string[] = [];
  const floating = findFloating(circuit.nodeCount, els);
  let totalIter = 0;
  let x: Float64Array | null = null;
  const junctionState = new Map<string, number>();

  const runNR = (gmin: number, scale: number, start: Float64Array | null): Float64Array | null => {
    // branch layout may change (SUPPLY CV↔CC) → recompute
    nb = 0; els.forEach((e, i) => { branchOf[i] = hasBranch(e) ? nb++ : -1; });
    const size = N - 1 + nb;
    let cur = start && start.length === size ? start.slice() : new Float64Array(size);
    for (let it = 0; it < 200; it++) {
      totalIter++;
      const m = new Mna(size);
      limited = false;
      const V = (node: number) => (node > 0 ? cur[node - 1] : 0);
      for (let n = 1; n < N; n++) m.g(n, n, gmin + (floating[n] ? 1e-9 : 0));
      els.forEach((e, idx) => stamp(m, e, idx, V, branchOf, N - 1, scale, junctionState));
      const next = solveLinear(m.G, m.b, size);
      if (!next) return null;
      let converged = true;
      for (let i = 0; i < size; i++) {
        const d = Math.abs(next[i] - cur[i]);
        const tol = i < N - 1 ? 1e-6 + 1e-4 * Math.abs(next[i]) : 1e-9 + 1e-4 * Math.abs(next[i]);
        if (d > tol) { converged = false; break; }
      }
      cur = next;
      if (converged && !limited && it > 0) return cur;
    }
    return null;
  };

  const robust = (start: Float64Array | null): Float64Array | null => {
    let r = runNR(GMIN, 1, start);
    if (r) return r;
    // gmin stepping
    let s: Float64Array | null = start;
    for (let g = 1e-2; g >= 1e-12; g /= 10) { s = runNR(g, 1, s); if (!s) break; }
    if (s) { r = runNR(GMIN, 1, s); if (r) return r; }
    // source stepping
    s = null;
    for (const sc of [0.05, 0.1, 0.2, 0.35, 0.5, 0.7, 0.85, 1]) { s = runNR(GMIN, sc, s); if (!s) return null; }
    return s;
  };

  // Outer loop: discrete modes (op-amp saturation, regulator dropout, logic levels, CC/CV, relays, fuses)
  let ok = false;
  for (let outer = 0; outer < 40; outer++) {
    x = robust(x);
    if (!x) break;
    const V = (node: number) => (node > 0 ? x![node - 1] : 0);
    const changed = updateModes(els, V, x, branchOf, N - 1);
    if (!changed) { ok = true; break; }
    if (outer === 39) warnings.push('Os estados discretos (saturação/regulação/lógica) não estabilizaram — o resultado pode oscilar.');
  }
  if (!x) {
    return {
      ok: false, iterations: totalIter, voltages: new Array(N).fill(0), floating, pinCurrents: {}, elementStates: els.map(() => ({})), warnings,
      error: 'O sistema de equações não tem solução: verifique se existem fontes de tensão ligadas em paralelo/curto (laço de fontes) ou uma fonte de corrente sem caminho de retorno.',
    };
  }
  const voltages = [0];
  for (let n = 1; n < N; n++) voltages.push(x[n - 1]);
  const pinCurrents = terminalCurrents(els, voltages, x, branchOf, N - 1);
  const elementStates = els.map((e) => (e.k === 'VCVS' ? { mode: e.mode } : e.k === 'SW' ? { on: e.on } : e.k === 'SUPPLY' ? { cc: e.cc } : {}));
  return { ok, iterations: totalIter, voltages, floating, pinCurrents, elementStates, warnings };
}

function stamp(m: Mna, e: Element, idx: number, V: (n: number) => number, branchOf: number[], off: number, scale: number, js: Map<string, number>) {
  const br = branchOf[idx];
  switch (e.k) {
    case 'R': m.conductance(e.a, e.b, 1 / Math.max(e.r, 1e-6)); break;
    case 'SW': m.conductance(e.a, e.b, 1 / (e.on ? e.ron : e.roff)); break;
    case 'V': {
      const row = off + br;
      m.rc(e.p, row, 1); m.rc(e.n, row, -1);
      m.gr(row, e.p, 1); m.gr(row, e.n, -1);
      m.rhsRaw(row, e.v * scale);
      break;
    }
    case 'SUPPLY': {
      if (e.cc) { m.rhs(e.p, e.ilim * scale); m.rhs(e.n, -e.ilim * scale); m.conductance(e.p, e.n, 1e-6); break; }
      const row = off + br;
      m.rc(e.p, row, 1); m.rc(e.n, row, -1);
      m.gr(row, e.p, 1); m.gr(row, e.n, -1); m.raw(row, row, -1e-3); // 1 mΩ internal resistance
      m.rhsRaw(row, e.v * scale);
      break;
    }
    case 'I': m.rhs(e.p, e.i * scale); m.rhs(e.n, -e.i * scale); break;
    case 'VCVS': {
      const row = off + br;
      const mode = e.modes[e.mode];
      m.rc(e.p, row, 1); m.rc(e.from ?? e.n, row, -1);
      m.gr(row, e.p, 1); m.gr(row, e.n, -1);
      for (const [node, coef] of mode.terms) m.gr(row, node, -coef);
      m.raw(row, row, -1); // 1 Ω output resistance keeps loops of ideal sources solvable
      m.rhsRaw(row, mode.c * scale);
      break;
    }
    case 'CCVS': {
      const row = off + br;
      m.rc(e.p, row, 1); m.rc(e.n, row, -1);
      m.gr(row, e.p, 1); m.gr(row, e.n, -1);
      for (const [node, coef] of e.terms) m.gr(row, node, -coef);
      m.raw(row, off + branchOf[e.ctrl], -e.gain);
      m.raw(row, row, -1);
      m.rhsRaw(row, e.c * scale);
      break;
    }
    case 'D': {
      const nvt = e.n * VT;
      const vcrit = nvt * Math.log(nvt / (Math.SQRT2 * e.is));
      const key = `d${idx}`;
      const vraw = V(e.a) - V(e.c);
      const vold = js.get(key) ?? 0;
      let v = pnjlim(vraw, vold, nvt, vcrit);
      if (e.bv !== undefined && v < -e.bv) v = -pnjlim(-v, -vold, VT, e.bv + VT * 5); // breakdown side
      lim(v, vraw);
      js.set(key, v);
      const d = diodeEval(v, e.is, e.n, e.bv, e.ibv);
      m.current(e.a, e.c, d.i, [{ coef: d.g, p: e.a, m: e.c, v0: v }]);
      break;
    }
    case 'BJT': {
      const s = e.pnp ? -1 : 1;
      const vcrit = VT * Math.log(VT / (Math.SQRT2 * e.is));
      const vbeRaw = s * (V(e.b) - V(e.e)), vbcRaw = s * (V(e.b) - V(e.c));
      const vbe = pnjlim(vbeRaw, js.get(`be${idx}`) ?? 0, VT, vcrit);
      const vbc = pnjlim(vbcRaw, js.get(`bc${idx}`) ?? 0, VT, vcrit);
      lim(vbe, vbeRaw); lim(vbc, vbcRaw);
      js.set(`be${idx}`, vbe); js.set(`bc${idx}`, vbc);
      const ef = expl(vbe / VT), er = expl(vbc / VT);
      const If = e.is * (ef - 1), Ir = e.is * (er - 1);
      const gf = (e.is * ef) / VT + GMIN, gr = (e.is * er) / VT + GMIN;
      // currents INTO collector/base (npn polarity)
      const Ic = If - Ir * (1 + 1 / e.br);
      const Ib = If / e.bf + Ir / e.br;
      // Linearised in (vbe, vbc); terminal voltages (b−e) and (b−c) scaled by polarity s.
      // Current into collector flows c → e inside the device; base current b → e.
      const tbe = { p: e.b, m: e.e, v0: s * vbe }, tbc = { p: e.b, m: e.c, v0: s * vbc };
      // For pnp, currents and voltages flip sign: I_pnp(Vterm) = −I_npn(−Vterm) → coefficients unchanged, I0 negated
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
      const key = `g${idx}`;
      const old = js.get(key);
      if (old !== undefined && Math.abs(vgs - old) > 1) { vgs = old + Math.sign(vgs - old); limited = true; } // fetlim-like
      js.set(key, vgs);
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
}

/** Re-evaluate discrete modes from a converged solution. Returns true if anything changed. */
function updateModes(els: Element[], V: (n: number) => number, x: Float64Array, branchOf: number[], off: number): boolean {
  let changed = false;
  els.forEach((e, i) => {
    if (e.k === 'VCVS') {
      const r = e.rule;
      let mode = e.mode;
      if (r.kind === 'opamp') {
        const hi = V(r.hi[0]) + r.hi[1], lo = V(r.lo[0]) + r.lo[1];
        const lin = e.modes[0];
        const target = V(e.n) + lin.terms.reduce((s, [n, c]) => s + c * V(n), 0) + lin.c;
        mode = target > hi ? 1 : target < lo ? 2 : 0;
      } else if (r.kind === 'regulator') {
        const desired = V(e.n) + e.modes[0].c;
        mode = V(r.vin) - desired < r.dropout ? 1 : 0;
      } else if (r.kind === 'powered') {
        mode = V(r.vcc) - V(r.gnd) >= r.min ? 0 : 1;
      } else if (r.kind === 'logic') {
        const vcc = V(r.vcc) - V(r.gnd);
        const bits = r.inputs.map((n) => V(n) - V(r.gnd) > vcc / 2);
        const out = r.fn === 'nand' ? !bits.every(Boolean) : r.fn === 'and' ? bits.every(Boolean) : r.fn === 'or' ? bits.some(Boolean)
          : r.fn === 'nor' ? !bits.some(Boolean) : r.fn === 'xor' ? bits.filter(Boolean).length % 2 === 1 : !bits[0];
        mode = out ? 1 : 0;
      }
      if (mode !== e.mode) { e.mode = mode; changed = true; }
    } else if (e.k === 'SUPPLY') {
      if (!e.cc) {
        const I = -x[off + branchOf[i]]; // current delivered out of +
        if (I > e.ilim * 1.0001) { e.cc = true; changed = true; }
      } else if (V(e.p) - V(e.n) > e.v + 1e-6) { e.cc = false; changed = true; }
    } else if (e.k === 'SW') {
      const r = e.rule;
      if (r.kind === 'relay') {
        const powered = V(r.vcc) - V(r.gnd) > 3.5;
        const act = r.activeHigh ? V(r.ctrl) - V(r.gnd) > 2 : V(r.vcc) - V(r.ctrl) > 2;
        const energised = powered && act;
        const on = r.normallyOpen ? energised : !energised;
        if (on !== e.on) { e.on = on; changed = true; }
      } else if (r.kind === 'threshold') {
        const on = V(r.ctrl) - V(r.ref) > r.vth;
        if (on !== e.on) { e.on = on; changed = true; }
      } else if (r.kind === 'fuse' && e.on) {
        const I = Math.abs(V(e.a) - V(e.b)) / e.ron;
        if (I > r.rating * 1.35) { e.on = false; changed = true; }
      }
    }
  });
  return changed;
}

function terminalCurrents(els: Element[], v: number[], x: Float64Array, branchOf: number[], off: number) {
  const out: Record<string, Record<string, number>> = {};
  const add = (e: Element, t: number, i: number) => {
    const pin = e.own?.pins[t];
    if (!e.own || !pin) return;
    const c = (out[e.own.compId] ??= {});
    c[pin] = (c[pin] ?? 0) + i;
  };
  els.forEach((e, idx) => {
    const br = branchOf[idx] >= 0 ? x[off + branchOf[idx]] : 0;
    switch (e.k) {
      case 'R': { const i = (v[e.a] - v[e.b]) / e.r; add(e, 0, i); add(e, 1, -i); break; }
      case 'SW': { const i = (v[e.a] - v[e.b]) / (e.on ? e.ron : e.roff); add(e, 0, i); add(e, 1, -i); break; }
      case 'V': case 'CCVS': add(e, 0, br); add(e, 1, -br); break;
      case 'VCVS': add(e, 0, br); add(e, 1, -br); break; // terminal 1 = supply-side pin (from ?? n)
      case 'SUPPLY': {
        const i = e.cc ? -e.ilim : br; add(e, 0, i); add(e, 1, -i); break;
      }
      case 'I': add(e, 0, -e.i); add(e, 1, e.i); break;
      case 'D': { const d = diodeEval(v[e.a] - v[e.c], e.is, e.n, e.bv, e.ibv); add(e, 0, d.i); add(e, 1, -d.i); break; }
      case 'BJT': {
        const s = e.pnp ? -1 : 1;
        const vbe = s * (v[e.b] - v[e.e]), vbc = s * (v[e.b] - v[e.c]);
        const If = e.is * (expl(vbe / VT) - 1), Ir = e.is * (expl(vbc / VT) - 1);
        const Ic = s * (If - Ir * (1 + 1 / e.br)), Ib = s * (If / e.bf + Ir / e.br);
        add(e, 0, Ic); add(e, 1, Ib); add(e, 2, -Ic - Ib); break;
      }
      case 'MOS': {
        const s = e.p ? -1 : 1;
        let vds = s * (v[e.d] - v[e.s]); let swap = false;
        if (vds < 0) { vds = -vds; swap = true; }
        const vgs = s * (v[e.g] - (swap ? v[e.d] : v[e.s]));
        const vov = vgs - e.vth;
        let id = 0;
        if (vov > 0) id = vds < vov ? e.kp * (vov * vds - vds * vds / 2) * (1 + e.lambda * vds) : (e.kp / 2) * vov * vov * (1 + e.lambda * vds);
        const idd = s * (swap ? -id : id);
        add(e, 0, idd); add(e, 1, 0); add(e, 2, -idd); break;
      }
    }
  });
  return out;
}

/** Nodes without a DC path to ground (through conductive elements). */
export function findFloating(N: number, els: Element[]): boolean[] {
  const parent = Array.from({ length: N }, (_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  for (const e of els) {
    switch (e.k) {
      case 'R': join(e.a, e.b); break;
      case 'SW': if (e.on) join(e.a, e.b); break;
      case 'V': case 'SUPPLY': case 'I': join(e.p, e.n); break;
      case 'VCVS': join(e.p, e.n); if (e.from !== undefined) join(e.p, e.from); break;
      case 'CCVS': join(e.p, e.n); break;
      case 'D': join(e.a, e.c); break;
      case 'BJT': join(e.b, e.e); join(e.b, e.c); break;
      case 'MOS': join(e.d, e.s); break; // gate is insulated
    }
  }
  const g = find(0);
  return Array.from({ length: N }, (_, i) => i !== 0 && find(i) !== g);
}
