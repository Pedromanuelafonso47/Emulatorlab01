import { describe, expect, it } from 'vitest';
import '@/library';
import { defaultProps, getDef } from '@/library/registry';
import { emptyDocument, uid, type CircuitDocument } from '@/domain/types';
import { buildNetlist } from './netlist';
import { runERC } from './erc';
import { simulateDC } from './sim';
import { analyzeCircuit, e12Above } from './analysis';
import { meterFmt } from './sim/interpret';
import { EXAMPLES } from '@/persistence/examples';

function add(doc: CircuitDocument, type: string, props: Record<string, unknown> = {}) {
  const id = uid('c');
  doc.components[id] = { id, type, label: `${getDef(type)!.prefix}${Object.keys(doc.components).length + 1}`, x: Object.keys(doc.components).length * 1000, y: 0, rotation: 0, props: { ...defaultProps(getDef(type)!), ...props } as never };
  return id;
}
const w = (d: CircuitDocument, a: [string, string], b: [string, string]) => {
  const id = uid('w');
  d.wires[id] = { id, from: { kind: 'pin', compId: a[0], pinId: a[1] }, to: { kind: 'pin', compId: b[0], pinId: b[1] }, points: [], color: '#000', style: 'wire' };
};
const sim = (d: CircuitDocument) => simulateDC(d, buildNetlist(d));

function divider() {
  const d = emptyDocument();
  const ps = add(d, 'variable-source', { voltage: 10 }), r1 = add(d, 'resistor', { resistance: 1000 }), r2 = add(d, 'resistor', { resistance: 1000 });
  w(d, [ps, '+'], [r1, '1']); w(d, [r1, '2'], [r2, '1']); w(d, [r2, '2'], [ps, '-']);
  return { d, ps, r1, r2 };
}

describe('instruments', () => {
  it('meter display formatting auto-ranges', () => {
    expect(meterFmt(4.9912, 'V')).toEqual({ display: '4.991', unit: 'V' });
    expect(meterFmt(0.01463, 'A')).toEqual({ display: '14.63', unit: 'mA' });
    expect(meterFmt(4700, 'Ω')).toEqual({ display: '4.700', unit: 'kΩ' });
  });
  it('multimeter DCV reads the divider midpoint (10 MΩ barely loads it)', () => {
    const { d, r1, r2 } = divider();
    const m = add(d, 'multimeter', { mode: 'dcv' });
    w(d, [m, 'VOHM'], [r1, '2']); w(d, [m, 'COM'], [r2, '2']);
    const s = sim(d);
    expect(parseFloat(s.interp.states[m].display as string)).toBeCloseTo(5, 2);
  });
  it('multimeter DCA in series reads the loop current', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 10 }), r = add(d, 'resistor', { resistance: 1000 }), m = add(d, 'multimeter', { mode: 'dca' });
    w(d, [ps, '+'], [m, 'VOHM']); w(d, [m, 'COM'], [r, '1']); w(d, [r, '2'], [ps, '-']);
    const st = sim(d).interp.states[m];
    expect(st.unit).toBe('mA');
    expect(parseFloat(st.display as string)).toBeCloseTo(9.995, 2);
  });
  it('ammeter across a source (parallel) blows the mA fuse and warns', () => {
    const d = emptyDocument();
    const b = add(d, 'battery-9v'), m = add(d, 'multimeter', { mode: 'dca' });
    w(d, [b, '+'], [m, 'VOHM']); w(d, [m, 'COM'], [b, '-']);
    const s = sim(d);
    expect(s.interp.states[m].display).toBe('FUSE');
    expect(s.interp.issues.some((i) => i.id.startsWith('sim-dmmfuse'))).toBe(true);
  });
  it('ohmmeter measures an isolated resistor; OL when open', () => {
    const d = emptyDocument();
    const r = add(d, 'resistor', { resistance: 2200 }), m = add(d, 'multimeter', { mode: 'ohm' });
    w(d, [m, 'VOHM'], [r, '1']); w(d, [m, 'COM'], [r, '2']);
    const st = sim(d).interp.states[m];
    expect(st.unit).toBe('kΩ');
    expect(parseFloat(st.display as string)).toBeCloseTo(2.2, 2);
    const d2 = emptyDocument();
    const m2 = add(d2, 'multimeter', { mode: 'ohm' });
    expect(sim(d2).interp.states[m2].display).toBe('OL');
  });
  it('diode test shows forward voltage, OL reversed', () => {
    const mk = (fwd: boolean) => {
      const d = emptyDocument();
      const dd = add(d, 'diode'), m = add(d, 'multimeter', { mode: 'diode' });
      w(d, [m, 'VOHM'], [dd, fwd ? 'A' : 'K']); w(d, [m, 'COM'], [dd, fwd ? 'K' : 'A']);
      return sim(d).interp.states[m].display as string;
    };
    const v = parseFloat(mk(true));
    expect(v).toBeGreaterThan(0.5); expect(v).toBeLessThan(0.8);
    expect(mk(false)).toBe('OL');
  });
  it('continuity beeps on a wire, not on 1 kΩ', () => {
    const d = emptyDocument();
    const r = add(d, 'resistor', { resistance: 10 }), m = add(d, 'multimeter', { mode: 'cont' });
    w(d, [m, 'VOHM'], [r, '1']); w(d, [m, 'COM'], [r, '2']);
    expect(sim(d).interp.states[m].beep).toBe(true);
  });
  it('wattmeter reads load power', () => {
    const d = emptyDocument();
    const ps = add(d, 'variable-source', { voltage: 10 }), r = add(d, 'resistor', { resistance: 100 }), pw = add(d, 'wattmeter');
    w(d, [ps, '+'], [pw, 'I+']); w(d, [pw, 'I-'], [r, '1']); w(d, [r, '2'], [ps, '-']);
    w(d, [pw, 'V+'], [r, '1']); w(d, [pw, 'V-'], [r, '2']);
    const st = sim(d).interp.states[pw];
    expect(parseFloat(st.display as string)).toBeCloseTo(999.8, 0); // 0.9998 W (shunt drop)
    expect(st.unit).toBe('mW');
  });
});

describe('analysis assistant', () => {
  it('E12 rounding', () => {
    expect(e12Above(467)).toBe(470);
    expect(e12Above(1050)).toBe(1200);
    expect(e12Above(330)).toBe(330);
  });
  it('recognises a voltage divider and quotes the simulated value', () => {
    const { d } = divider();
    const nl = buildNetlist(d);
    const s = simulateDC(d, nl);
    const a = analyzeCircuit(d, nl, runERC(d, nl), s.interp);
    const item = a.items.find((i) => /divisor/i.test(i.title));
    expect(item?.text).toMatch(/5 V/);
  });
  it('explains why a reversed LED is dark', () => {
    const d = emptyDocument();
    const b = add(d, 'battery-9v'), r = add(d, 'resistor', { resistance: 470 }), led = add(d, 'led');
    w(d, [b, '+'], [r, '1']); w(d, [r, '2'], [led, 'K']); w(d, [led, 'A'], [b, '-']);
    const nl = buildNetlist(d);
    const a = analyzeCircuit(d, nl, runERC(d, nl), simulateDC(d, nl).interp);
    expect(a.items.find((i) => i.title.includes('não acende'))?.text).toMatch(/inversamente/);
  });
  it('suggests a resistor when LED current is too high', () => {
    const d = emptyDocument();
    const b = add(d, 'battery-9v'), r = add(d, 'resistor', { resistance: 100 }), led = add(d, 'led');
    w(d, [b, '+'], [r, '1']); w(d, [r, '2'], [led, 'A']); w(d, [led, 'K'], [b, '-']);
    const nl = buildNetlist(d);
    const a = analyzeCircuit(d, nl, runERC(d, nl), simulateDC(d, nl).interp);
    expect(a.items.find((i) => i.kind === 'suggest')?.text).toMatch(/E12/);
  });
  it('identifies transistor saturation in the button example (pressed)', () => {
    const doc = EXAMPLES.find((e) => e.id === 'npn-button')!.build();
    const btn = Object.values(doc.components).find((c) => c.type === 'push-button')!;
    btn.props.pressed = true;
    const nl = buildNetlist(doc);
    const a = analyzeCircuit(doc, nl, runERC(doc, nl), simulateDC(doc, nl).interp);
    expect(a.items.find((i) => i.title.includes('transístor'))?.text).toMatch(/SATURAÇÃO/);
  });
});
