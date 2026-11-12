import { describe, expect, it } from 'vitest';
import '@/library';
import { defaultProps, getDef } from '@/library/registry';
import { emptyDocument, uid, type CircuitDocument } from '@/domain/types';
import { buildNetlist, pinKey } from '@/engine/netlist';
import { compile } from './compile';
import { Transient } from './solver';
import { measure } from './scope';
import { EXAMPLES } from '@/persistence/examples';

function add(doc: CircuitDocument, type: string, props: Record<string, unknown> = {}) {
  const id = uid('c');
  doc.components[id] = { id, type, label: id, x: Object.keys(doc.components).length * 1000, y: 0, rotation: 0, props: { ...defaultProps(getDef(type)!), ...props } as never };
  return id;
}
const w = (d: CircuitDocument, a: [string, string], b: [string, string]) => {
  const id = uid('w');
  d.wires[id] = { id, from: { kind: 'pin', compId: a[0], pinId: a[1] }, to: { kind: 'pin', compId: b[0], pinId: b[1] }, points: [], color: '#000', style: 'wire' };
};

/** Run a transient and record the voltage difference between two pins. */
function run(d: CircuitDocument, dt: number, tEnd: number, probe: [string, string], ref?: [string, string]) {
  const nl = buildNetlist(d);
  const cp = compile(d, nl);
  const node = (c: string, p: string) => cp.netNode.get(nl.pinNet.get(pinKey(c, p))!)!;
  const tr = new Transient(cp.circuit);
  expect(tr.start()).toBe(true);
  const t: number[] = [], v: number[] = [];
  const n1 = node(...probe), n0 = ref ? node(...ref) : 0;
  while (tr.eng.t < tEnd - 1e-12) {
    expect(tr.step(dt)).toBe(true);
    t.push(tr.eng.t); v.push(tr.eng.V(n1) - tr.eng.V(n0));
  }
  return { t, v, at: (time: number) => v[Math.min(v.length - 1, Math.round(time / dt) - 1)], tr, cp, nl, node };
}

describe('transient analysis', () => {
  it('RC charging follows 1 − e^(−t/RC)', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 5 }), r = add(d, 'resistor', { resistance: 1000 }), c = add(d, 'capacitor-electrolytic', { capacitance: 100e-6 });
    w(d, [ps, '+'], [r, '1']); w(d, [r, '2'], [c, '1']); w(d, [c, '2'], [ps, '-']);
    const s = run(d, 1e-4, 0.5, [c, '1'], [c, '2']);
    const tau = 0.1;
    expect(s.at(tau)).toBeCloseTo(5 * (1 - Math.exp(-1)), 1);          // 3.16 V
    expect(s.at(3 * tau)).toBeCloseTo(5 * (1 - Math.exp(-3)), 1);      // 4.75 V
  });

  it('RL current rises with τ = L/R', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 10 }), r = add(d, 'resistor', { resistance: 100 }), l = add(d, 'inductor', { inductance: 0.1, rdc: 0.001 });
    w(d, [ps, '+'], [r, '1']); w(d, [r, '2'], [l, '1']); w(d, [l, '2'], [ps, '-']);
    const s = run(d, 1e-5, 0.003, [r, '1'], [r, '2']);         // V across R ∝ current
    expect(s.at(0.001)).toBeCloseTo(10 * (1 - Math.exp(-1)), 0);
  });

  it('NE555 astable oscillates at f ≈ 1.44/((R1+2R2)C)', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 9 }), u = add(d, 'ne555');
    const r1 = add(d, 'resistor', { resistance: 1000 }), r2 = add(d, 'resistor', { resistance: 10000 }), c = add(d, 'capacitor-ceramic', { capacitance: 10e-6, voltage: 50 });
    w(d, [ps, '+'], [u, '8']); w(d, [ps, '+'], [u, '4']); w(d, [u, '1'], [ps, '-']);
    w(d, [ps, '+'], [r1, '1']); w(d, [r1, '2'], [u, '7']); w(d, [u, '7'], [r2, '1']); w(d, [r2, '2'], [u, '6']); w(d, [u, '6'], [u, '2']);
    w(d, [u, '6'], [c, '1']); w(d, [c, '2'], [ps, '-']);
    const s = run(d, 2e-5, 1.2, [u, '3']);
    const steady = s.t.findIndex((x) => x > 0.4);
    const m = measure(s.t.slice(steady), s.v.slice(steady))!;
    const fTheory = 1.44 / ((1000 + 2 * 10000) * 10e-6);   // 6.86 Hz
    expect(m.freq!).toBeGreaterThan(fTheory * 0.9);
    expect(m.freq!).toBeLessThan(fTheory * 1.1);
    expect(m.vmax).toBeGreaterThan(7);    // high ≈ Vcc − 1.7
    expect(m.vmin).toBeLessThan(0.2);
  });

  it('half-wave rectifier with filter capacitor: DC ≈ Vpeak − Vf with ripple', () => {
    const d = emptyDocument();
    const ac = add(d, 'ac-source', { vrms: 12, frequency: 50 }), dd = add(d, 'diode'), c = add(d, 'capacitor-electrolytic', { capacitance: 470e-6, voltage: 35 }), r = add(d, 'resistor', { resistance: 1000 });
    w(d, [ac, '1'], [dd, 'A']); w(d, [dd, 'K'], [c, '1']); w(d, [c, '2'], [ac, '2']); w(d, [r, '1'], [c, '1']); w(d, [r, '2'], [ac, '2']);
    const s = run(d, 5e-5, 0.3, [c, '1'], [c, '2']);
    const steady = s.t.findIndex((x) => x > 0.2);
    const m = measure(s.t.slice(steady), s.v.slice(steady))!;
    expect(m.vmax).toBeGreaterThan(15.5); expect(m.vmax).toBeLessThan(16.9);   // 16.97 − ~0.8
    const rippleTheory = m.vmax / (1000 * 50 * 470e-6);                            // ≈0.7 V
    expect(m.vpp).toBeGreaterThan(rippleTheory * 0.6); expect(m.vpp).toBeLessThan(rippleTheory * 1.4);
  });

  it('transformer steps 230 Vrms down to ≈12 Vrms (light load)', () => {
    const d = emptyDocument();
    const ac = add(d, 'ac-source', { vrms: 230, frequency: 50 }), t = add(d, 'transformer', { vp: 230, vs: 12, va: 6 }), r = add(d, 'resistor', { resistance: 1000 });
    w(d, [ac, '1'], [t, 'P1']); w(d, [ac, '2'], [t, 'P2']); w(d, [t, 'S1'], [r, '1']); w(d, [t, 'S2'], [r, '2']); w(d, [t, 'S2'], [ac, '2']);
    const s = run(d, 5e-5, 0.1, [r, '1'], [r, '2']);
    const steady = s.t.findIndex((x) => x > 0.05);
    const m = measure(s.t.slice(steady), s.v.slice(steady))!;
    expect(m.vrms).toBeGreaterThan(11); expect(m.vrms).toBeLessThan(12.5);
    expect(m.freq!).toBeCloseTo(50, 0);
  });

  it('CD4017 advances one output per clock edge', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 5 }), u = add(d, 'cd4017');
    const clk = add(d, 'signal-generator', { wave: 'square', frequency: 100, amplitude: 2.5, offset: 2.5 });
    w(d, [ps, '+'], [u, '16']); w(d, [u, '8'], [ps, '-']); w(d, [u, '13'], [ps, '-']); w(d, [u, '15'], [ps, '-']);
    w(d, [clk, '1'], [u, '14']); w(d, [clk, '-'], [ps, '-']);
    const s = run(d, 1e-4, 0.0352, [u, '3']);
    // 100 Hz with rising edges at t = 0, 10, 20, 30 ms → count 3 after 35 ms (first edge at start counts once the level rises)
    const states = s.tr.eng.result().elementStates.find((x) => x.st)!;
    expect(states.st![0]).toBeGreaterThanOrEqual(3);
    expect(states.st![0]).toBeLessThanOrEqual(4);
  });

  it('SCR latches after a gate pulse and stays on', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 12 }), scr = add(d, 'scr'), rl = add(d, 'resistor', { resistance: 100 });
    const sw = add(d, 'toggle-switch', { closed: true }), rg = add(d, 'resistor', { resistance: 1000 });
    w(d, [ps, '+'], [rl, '1']); w(d, [rl, '2'], [scr, 'A']); w(d, [scr, 'K'], [ps, '-']);
    w(d, [ps, '+'], [sw, '1']); w(d, [sw, '2'], [rg, '1']); w(d, [rg, '2'], [scr, 'G']);
    const nl = buildNetlist(d);
    const cp = compile(d, nl);
    const tr = new Transient(cp.circuit);
    tr.start(); for (let i = 0; i < 10; i++) tr.step(1e-4);
    const state = tr.eng.saveState();
    // open the gate switch: rebuild with state preserved
    d.components[sw].props.closed = false;
    const nl2 = buildNetlist(d), cp2 = compile(d, nl2);
    const tr2 = new Transient(cp2.circuit, state, tr.eng.t);
    tr2.start(); for (let i = 0; i < 10; i++) tr2.step(1e-4);
    const i = tr2.eng.result().pinCurrents[rl]['1'];
    expect(i).toBeGreaterThan(0.1);
  });

  it('555 example on the breadboard now oscillates (LED blinks)', () => {
    const doc = EXAMPLES.find((e) => e.id === 'ne555-bb')!.build();
    const nl = buildNetlist(doc);
    const cp = compile(doc, nl);
    expect(cp.unsupported).toEqual([]);
    const u1 = Object.values(doc.components).find((c) => c.type === 'ne555')!;
    const out = cp.netNode.get(nl.pinNet.get(pinKey(u1.id, '3'))!)!;
    const tr = new Transient(cp.circuit);
    tr.start();
    const t: number[] = [], v: number[] = [];
    for (let i = 0; i < 2500; i++) { tr.step(1e-3); t.push(tr.eng.t); v.push(tr.eng.V(out)); }
    const m = measure(t.slice(800), v.slice(800))!;
    expect(m.freq!).toBeGreaterThan(1.46 * 0.85); expect(m.freq!).toBeLessThan(1.46 * 1.15);
  });
});
