import { describe, expect, it } from 'vitest';
import '@/library';
import { defaultProps, getDef } from '@/library/registry';
import { emptyDocument, uid, type CircuitDocument, type Rotation } from '@/domain/types';
import { buildNetlist, pinKey } from '@/engine/netlist';
import { EXAMPLES } from '@/persistence/examples';
import { simulateDC } from './index';

function add(doc: CircuitDocument, type: string, props: Record<string, unknown> = {}, x = 0, y = 0, rotation: Rotation = 0) {
  const id = uid('c');
  doc.components[id] = { id, type, label: `${type}-${Object.keys(doc.components).length}`, x: x || Object.keys(doc.components).length * 1000, y, rotation, props: { ...defaultProps(getDef(type)!), ...props } as never };
  return id;
}
function w(doc: CircuitDocument, a: [string, string], b: [string, string]) {
  const id = uid('w');
  doc.wires[id] = { id, from: { kind: 'pin', compId: a[0], pinId: a[1] }, to: { kind: 'pin', compId: b[0], pinId: b[1] }, points: [], color: '#f00', style: 'wire' };
}
function run(doc: CircuitDocument) {
  const nl = buildNetlist(doc);
  const r = simulateDC(doc, nl);
  const v = (c: string, p: string) => r.interp.netVoltage.get(nl.pinNet.get(pinKey(c, p))!) ?? NaN;
  const i = (c: string, p: string) => r.result.pinCurrents[c]?.[p] ?? 0;
  return { ...r, v, i };
}

describe('DC solver — analytic checks', () => {
  it('voltage divider 12 V, 10k / 4.7k → 3.837 V', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 12 });
    const r1 = add(d, 'resistor', { resistance: 10e3 }), r2 = add(d, 'resistor', { resistance: 4700 });
    w(d, [ps, '+'], [r1, '1']); w(d, [r1, '2'], [r2, '1']); w(d, [r2, '2'], [ps, '-']);
    const s = run(d);
    expect(s.result.ok).toBe(true);
    expect(s.v(r1, '2')).toBeCloseTo(12 * 4700 / 14700, 4);
    expect(s.i(r1, '1')).toBeCloseTo(12 / 14700, 7);
    expect(s.interp.comps[r1].power).toBeCloseTo((12 / 14700) ** 2 * 10e3, 6);
  });

  it('battery internal resistance: 9 V, rint 1.5 Ω, 100 Ω load', () => {
    const d = emptyDocument();
    const b = add(d, 'battery-9v'), r = add(d, 'resistor', { resistance: 100 });
    w(d, [b, '+'], [r, '1']); w(d, [r, '2'], [b, '-']);
    const s = run(d);
    expect(s.v(r, '1') - s.v(r, '2')).toBeCloseTo(9 * 100 / 101.5, 3);
  });

  it('LED + 470 Ω on 9 V: ≈14–15 mA, lit, no warnings', () => {
    const doc = EXAMPLES.find((e) => e.id === 'led-9v')!.build();
    const s = run(doc);
    const led = Object.values(doc.components).find((c) => c.type === 'led')!.id;
    const I = s.i(led, 'A');
    expect(I).toBeGreaterThan(0.0135); expect(I).toBeLessThan(0.0155);
    expect(s.interp.states[led].brightness).toBeGreaterThan(0.8);
    expect(s.interp.issues.filter((x) => x.severity !== 'info')).toEqual([]);
  });

  it('LED straight across 9 V → quantitative overcurrent error', () => {
    const d = emptyDocument();
    const b = add(d, 'battery-9v'), led = add(d, 'led');
    w(d, [b, '+'], [led, 'A']); w(d, [led, 'K'], [b, '-']);
    const s = run(d);
    expect(s.i(led, 'A')).toBeGreaterThan(0.5);
    expect(s.interp.issues.some((x) => x.id === `sim-led-${led}` && x.severity === 'error' && /sobrecorrente/i.test(x.message))).toBe(true);
  });

  it('reversed LED does not conduct', () => {
    const d = emptyDocument();
    const b = add(d, 'battery-9v'), r = add(d, 'resistor', { resistance: 470 }), led = add(d, 'led');
    w(d, [b, '+'], [r, '1']); w(d, [r, '2'], [led, 'K']); w(d, [led, 'A'], [b, '-']);
    const s = run(d);
    expect(Math.abs(s.i(led, 'A'))).toBeLessThan(1e-6);
    expect(s.interp.states[led].brightness).toBe(0);
  });

  it('silicon diode drop ≈ 0.6–0.75 V at a few mA', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 5 }), r = add(d, 'resistor', { resistance: 1000 }), dd = add(d, 'diode');
    w(d, [ps, '+'], [r, '1']); w(d, [r, '2'], [dd, 'A']); w(d, [dd, 'K'], [ps, '-']);
    const vf = run(d).v(dd, 'A');
    expect(vf).toBeGreaterThan(0.6); expect(vf).toBeLessThan(0.75);
  });

  it('zener regulates at Vz', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 12 }), r = add(d, 'resistor', { resistance: 1000 }), z = add(d, 'zener', { vz: 5.1 });
    w(d, [ps, '+'], [r, '1']); w(d, [r, '2'], [z, 'K']); w(d, [z, 'A'], [ps, '-']);
    const vz = run(d).v(z, 'K');
    expect(vz).toBeGreaterThan(5.0); expect(vz).toBeLessThan(5.3);
  });

  it('NPN switch: 1k base from 5 V saturates and drives a 1k collector load', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 5 });
    const rb = add(d, 'resistor', { resistance: 1000 }), rc = add(d, 'resistor', { resistance: 1000 }), q = add(d, 'bjt-npn');
    w(d, [ps, '+'], [rb, '1']); w(d, [rb, '2'], [q, 'B']);
    w(d, [ps, '+'], [rc, '1']); w(d, [rc, '2'], [q, 'C']); w(d, [q, 'E'], [ps, '-']);
    const s = run(d);
    expect(s.v(q, 'B')).toBeGreaterThan(0.6); expect(s.v(q, 'B')).toBeLessThan(0.85);
    expect(s.v(q, 'C')).toBeLessThan(0.3); // saturated
    expect(s.i(q, 'C')).toBeCloseTo((5 - s.v(q, 'C')) / 1000, 4);
  });

  it('NPN active region: Ic ≈ β·Ib', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 10 });
    const rb = add(d, 'resistor', { resistance: 1e6 }), rc = add(d, 'resistor', { resistance: 1000 }), q = add(d, 'bjt-npn', { hfe: 100 });
    w(d, [ps, '+'], [rb, '1']); w(d, [rb, '2'], [q, 'B']); w(d, [ps, '+'], [rc, '1']); w(d, [rc, '2'], [q, 'C']); w(d, [q, 'E'], [ps, '-']);
    const s = run(d);
    expect(s.i(q, 'C') / s.i(q, 'B')).toBeCloseTo(100, 0);
  });

  it('PNP high-side switch conducts with base pulled low', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 5 });
    const rb = add(d, 'resistor', { resistance: 1000 }), rl = add(d, 'resistor', { resistance: 1000 }), q = add(d, 'bjt-pnp');
    w(d, [ps, '+'], [q, 'E']); w(d, [q, 'B'], [rb, '1']); w(d, [rb, '2'], [ps, '-']); w(d, [q, 'C'], [rl, '1']); w(d, [rl, '2'], [ps, '-']);
    const s = run(d);
    expect(s.v(q, 'C')).toBeGreaterThan(4.6);
  });

  it('N-MOSFET low-side switch: logic-level gate at 5 V turns the load on', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 12 }), g = add(d, 'variable-source', { voltage: 5 });
    const rl = add(d, 'resistor', { resistance: 100 }), m = add(d, 'mosfet-n', { model: 'IRLZ44N' });
    w(d, [ps, '+'], [rl, '1']); w(d, [rl, '2'], [m, 'D']); w(d, [m, 'S'], [ps, '-']); w(d, [g, '+'], [m, 'G']); w(d, [g, '-'], [ps, '-']);
    const s = run(d);
    expect(s.v(m, 'D')).toBeLessThan(0.1);
    expect(s.i(rl, '1')).toBeCloseTo(0.12, 2);
  });

  it('7805 regulates 9 V → 5 V and enters dropout at 6 V', () => {
    const mk = (vin: number) => {
      const d = emptyDocument();
      const ps = add(d, 'variable-source', { voltage: vin }), u = add(d, 'lm7805'), r = add(d, 'resistor', { resistance: 100 });
      w(d, [ps, '+'], [u, 'IN']); w(d, [u, 'GND'], [ps, '-']); w(d, [u, 'OUT'], [r, '1']); w(d, [r, '2'], [ps, '-']);
      return { s: run(d), u, ps };
    };
    const a = mk(9);
    expect(a.s.v(a.u, 'OUT')).toBeCloseTo(5, 1);
    expect(a.s.i(a.u, 'IN')).toBeGreaterThan(0.05); // input current ≈ output current
    const b = mk(6);
    expect(b.s.v(b.u, 'OUT')).toBeCloseTo(4, 1);
    expect(b.s.interp.issues.some((x) => x.id.startsWith('sim-reg-'))).toBe(true);
  });

  it('LM317 with 240 Ω / 720 Ω → 5 V', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 12 }), u = add(d, 'lm317');
    const r1 = add(d, 'resistor', { resistance: 240 }), r2 = add(d, 'resistor', { resistance: 720 });
    w(d, [ps, '+'], [u, 'IN']); w(d, [u, 'OUT'], [r1, '1']); w(d, [r1, '2'], [u, 'ADJ']); w(d, [u, 'ADJ'], [r2, '1']); w(d, [r2, '2'], [ps, '-']);
    expect(run(d).v(u, 'OUT')).toBeCloseTo(5, 1);
  });

  it('op-amp follower and comparator saturation (LM358)', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 9 }), vin = add(d, 'variable-source', { voltage: 2.5 }), u = add(d, 'lm358');
    w(d, [ps, '+'], [u, '8']); w(d, [u, '4'], [ps, '-']); w(d, [vin, '-'], [ps, '-']);
    w(d, [vin, '+'], [u, '3']); w(d, [u, '1'], [u, '2']);                     // channel 1: follower
    w(d, [vin, '+'], [u, '5']); w(d, [u, '6'], [ps, '-']);                    // channel 2: comparator vs 0 V
    const s = run(d);
    expect(s.v(u, '1')).toBeCloseTo(2.5, 2);
    expect(s.v(u, '7')).toBeCloseTo(9 - 1.5, 1);
  });

  it('bench supply current limit (CC mode)', () => {
    const d = emptyDocument();
    const ps = add(d, 'dc-supply', { voltage: 12, ilimit: 0.1 }), r = add(d, 'resistor', { resistance: 10 });
    w(d, [ps, '+'], [r, '1']); w(d, [r, '2'], [ps, '-']);
    const s = run(d);
    expect(s.i(r, '1')).toBeCloseTo(0.1, 3);
    expect(s.v(r, '1')).toBeCloseTo(1, 2);
    expect(s.interp.issues.some((x) => x.id.startsWith('sim-ps-'))).toBe(true);
  });

  it('NAND gate truth with static inputs', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 5 }), u = add(d, '7400');
    w(d, [ps, '+'], [u, '14']); w(d, [u, '7'], [ps, '-']);
    w(d, [ps, '+'], [u, '1']); w(d, [ps, '+'], [u, '2']);   // gate 1: 1,1 → 0
    w(d, [ps, '+'], [u, '4']); w(d, [u, '5'], [ps, '-']);   // gate 2: 1,0 → 1
    const s = run(d);
    expect(s.v(u, '3')).toBeLessThan(0.1);
    expect(s.v(u, '6')).toBeGreaterThan(4.9);
  });

  it('bridge rectifier from a DC source loses ≈2 diode drops', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 12 }), br = add(d, 'bridge-rectifier'), r = add(d, 'resistor', { resistance: 1000 });
    w(d, [ps, '+'], [br, 'AC1']); w(d, [ps, '-'], [br, 'AC2']); w(d, [br, '+'], [r, '1']); w(d, [r, '2'], [br, '-']);
    const s = run(d);
    const vout = s.v(r, '1') - s.v(r, '2');
    expect(vout).toBeGreaterThan(10.4); expect(vout).toBeLessThan(10.9);
  });

  it('relay module switches its contacts from IN', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 5 }), k = add(d, 'relay-module');
    const lamp = add(d, 'resistor', { resistance: 100 });
    w(d, [ps, '+'], [k, 'VCC']); w(d, [k, 'GND'], [ps, '-']); w(d, [ps, '+'], [k, 'IN']);
    w(d, [ps, '+'], [k, 'COM']); w(d, [k, 'NO'], [lamp, '1']); w(d, [lamp, '2'], [ps, '-']);
    const s = run(d);
    expect(s.interp.states[k].energized).toBe(true);
    expect(s.i(lamp, '1')).toBeCloseTo(0.05, 3);
  });

  it('fuse blows on overcurrent', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 12 }), f = add(d, 'fuse', { rating: 0.5 }), r = add(d, 'resistor', { resistance: 2 });
    w(d, [ps, '+'], [f, '1']); w(d, [f, '2'], [r, '1']); w(d, [r, '2'], [ps, '-']);
    const s = run(d);
    expect(s.interp.blown).toContain(f);
    expect(Math.abs(s.i(r, '1'))).toBeLessThan(1e-6);
  });

  it('floating MOSFET gate is reported', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 12 }), rl = add(d, 'resistor', { resistance: 100 }), m = add(d, 'mosfet-n');
    const rg = add(d, 'resistor', { resistance: 1000 });
    w(d, [ps, '+'], [rl, '1']); w(d, [rl, '2'], [m, 'D']); w(d, [m, 'S'], [ps, '-']); w(d, [m, 'G'], [rg, '1']);
    // rg's other end is open → gate net (gate + rg) floats
    const s = run(d);
    expect(s.interp.issues.some((x) => x.id.startsWith('sim-float-'))).toBe(true);
  });

  it('Arduino 5 V pin powers an LED + resistor on the breadboard', () => {
    const d = emptyDocument();
    const u = add(d, 'arduino-uno'), r = add(d, 'resistor', { resistance: 220 }), led = add(d, 'led');
    w(d, [u, '5V'], [r, '1']); w(d, [r, '2'], [led, 'A']); w(d, [led, 'K'], [u, 'GND_1']);
    const s = run(d);
    expect(s.i(led, 'A')).toBeGreaterThan(0.010); expect(s.i(led, 'A')).toBeLessThan(0.015);
  });

  it('unsupported parts are listed, not faked (NE555 example)', () => {
    const doc = EXAMPLES.find((e) => e.id === 'ne555-bb')!.build();
    const s = run(doc);
    const u1 = Object.values(doc.components).find((c) => c.type === 'ne555')!.id;
    expect(s.interp.issues.some((x) => x.id === `sim-uns-${u1}`)).toBe(true);
    expect(s.interp.comps[u1].simulated).toBe(false);
  });

  it('all examples solve', () => {
    for (const ex of EXAMPLES) {
      const s = run(ex.build());
      expect(s.result.ok, ex.id).toBe(true);
    }
  });
});
