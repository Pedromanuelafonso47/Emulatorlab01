/** Oscilloscope / frequency-counter signal processing (pure). */

export interface Measurements { vmax: number; vmin: number; vpp: number; vavg: number; vrms: number; freq: number | null; period: number | null }

export function measure(t: ArrayLike<number>, v: ArrayLike<number>): Measurements | null {
  const n = v.length;
  if (n < 2) return null;
  let vmax = -Infinity, vmin = Infinity, sum = 0, sum2 = 0, w = 0;
  for (let i = 0; i < n; i++) {
    const dt = i > 0 ? t[i] - t[i - 1] : 0;
    vmax = Math.max(vmax, v[i]); vmin = Math.min(vmin, v[i]);
    if (i > 0) { const m = (v[i] + v[i - 1]) / 2; sum += m * dt; sum2 += m * m * dt; w += dt; }
  }
  const vavg = w > 0 ? sum / w : v[n - 1];
  const vrms = w > 0 ? Math.sqrt(sum2 / w) : Math.abs(v[n - 1]);
  // Frequency from rising crossings of the mid level with hysteresis
  const mid = (vmax + vmin) / 2, hyst = (vmax - vmin) * 0.1;
  const crossings: number[] = [];
  let armed = false;
  if (vmax - vmin > 1e-3) {
    for (let i = 1; i < n; i++) {
      if (v[i] < mid - hyst) armed = true;
      if (armed && v[i - 1] < mid && v[i] >= mid) {
        const f = (mid - v[i - 1]) / (v[i] - v[i - 1] || 1);
        crossings.push(t[i - 1] + f * (t[i] - t[i - 1]));
        armed = false;
      }
    }
  }
  const period = crossings.length >= 2 ? (crossings[crossings.length - 1] - crossings[0]) / (crossings.length - 1) : null;
  return { vmax, vmin, vpp: vmax - vmin, vavg, vrms, freq: period ? 1 / period : null, period };
}

/** RMS of the AC component (true-RMS meter behaviour). */
export function acRms(t: ArrayLike<number>, v: ArrayLike<number>): number {
  const m = measure(t, v);
  if (!m) return 0;
  return Math.sqrt(Math.max(0, m.vrms * m.vrms - m.vavg * m.vavg));
}

export interface ScopeSettings {
  tdiv: number; vdiv1: number; vdiv2: number; off1: number; off2: number;
  trigSource: 'ch1' | 'ch2'; trigLevel: number; trigEdge: 'rise' | 'fall'; coupling1: 'dc' | 'ac'; coupling2: 'dc' | 'ac';
}

export interface ScopeView {
  ch1: [number, number][]; ch2: [number, number][];   // x in divisions 0..10, y in divisions (−4..4)
  triggered: boolean;
  m1: Measurements | null; m2: Measurements | null;
}

/** Build the 10×8-division screen from sampled traces with edge triggering. */
export function buildScope(t: number[], v1: number[] | null, v2: number[] | null, s: ScopeSettings): ScopeView {
  const win = s.tdiv * 10;
  const n = t.length;
  const empty: ScopeView = { ch1: [], ch2: [], triggered: false, m1: null, m2: null };
  if (n < 2) return empty;
  const tEnd = t[n - 1];
  const src = s.trigSource === 'ch2' ? v2 : v1;
  let start = tEnd - win, triggered = false;
  if (src) {
    for (let i = n - 1; i > 0; i--) {
      if (t[i] + win > tEnd) continue;
      const a = src[i - 1], b = src[i];
      const cross = s.trigEdge === 'rise' ? a < s.trigLevel && b >= s.trigLevel : a > s.trigLevel && b <= s.trigLevel;
      if (cross) { start = t[i]; triggered = true; break; }
    }
  }
  const i0 = Math.max(0, lowerBound(t, start)), i1 = lowerBound(t, start + win);
  const seg = (v: number[] | null, vdiv: number, off: number, ac: boolean): [number, number][] => {
    if (!v) return [];
    let mean = 0;
    if (ac) { const m = measure(t.slice(i0, i1), v.slice(i0, i1)); mean = m?.vavg ?? 0; }
    const out: [number, number][] = [];
    const step = Math.max(1, Math.floor((i1 - i0) / 600));
    for (let i = i0; i < i1; i += step) out.push([(t[i] - start) / s.tdiv, Math.max(-4.4, Math.min(4.4, (v[i] - mean) / vdiv + off))]);
    return out;
  };
  const mWin = (v: number[] | null) => (v ? measure(t.slice(Math.max(0, lowerBound(t, tEnd - Math.max(win, 0.05)))), v.slice(Math.max(0, lowerBound(t, tEnd - Math.max(win, 0.05))))) : null);
  return { ch1: seg(v1, s.vdiv1, s.off1, s.coupling1 === 'ac'), ch2: seg(v2, s.vdiv2, s.off2, s.coupling2 === 'ac'), triggered, m1: mWin(v1), m2: mWin(v2) };
}

function lowerBound(a: number[], x: number): number {
  let lo = 0, hi = a.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (a[m] < x) lo = m + 1; else hi = m; }
  return lo;
}

/** Rolling sample store keyed by net id (all probes share the time axis). */
export class SampleBuffer {
  t: number[] = [];
  v = new Map<string, number[]>();
  constructor(public maxPoints = 60000) {}
  reset() { this.t = []; this.v.clear(); }
  push(times: number[], nets: string[], values: number[][]) {
    if (!times.length) return;
    if (this.t.length && times[0] < this.t[this.t.length - 1]) this.reset();
    const known = new Set(this.v.keys());
    if (nets.length !== known.size || nets.some((n) => !known.has(n))) { this.reset(); nets.forEach((n) => this.v.set(n, [])); }
    this.t.push(...times);
    nets.forEach((n, k) => this.v.get(n)!.push(...values[k]));
    const extra = this.t.length - this.maxPoints;
    if (extra > 0) { this.t.splice(0, extra); this.v.forEach((a) => a.splice(0, extra)); }
  }
  get(net: string) { return this.v.get(net) ?? null; }
}
