import { describe, expect, it } from 'vitest';
import '@/library';
import { allDefs, defaultProps, getDef, getPins } from '@/library/registry';
import { emptyDocument, uid, type CircuitDocument, type Rotation } from '@/domain/types';
import { buildNetlist, pinKey } from './netlist';
import { runERC } from './erc';
import { parseSI, formatSI, resistorBands, BAND_COLORS, GOLD } from '@/domain/units';
import { transformPoint } from '@/domain/geometry';
import { EXAMPLES } from '@/persistence/examples';

function add(doc: CircuitDocument, type: string, x: number, y: number, props: Record<string, unknown> = {}, rotation: Rotation = 0) {
  const id = uid('c');
  doc.components[id] = { id, type, label: id, x, y, rotation, props: { ...defaultProps(getDef(type)!), ...props } as never };
  return id;
}
function wire(doc: CircuitDocument, a: [string, string], b: [string, string]) {
  const id = uid('w');
  doc.wires[id] = { id, from: { kind: 'pin', compId: a[0], pinId: a[1] }, to: { kind: 'pin', compId: b[0], pinId: b[1] }, points: [], color: '#f00', style: 'wire' };
  return id;
}
const sameNet = (doc: CircuitDocument, a: [string, string], b: [string, string]) => {
  const nl = buildNetlist(doc);
  return nl.pinNet.get(pinKey(...a)) === nl.pinNet.get(pinKey(...b));
};

describe('units', () => {
  it('parses SI and RKM notation', () => {
    expect(parseSI('4.7k')).toBeCloseTo(4700);
    expect(parseSI('4k7')).toBeCloseTo(4700);
    expect(parseSI('100n')).toBeCloseTo(100e-9);
    expect(parseSI('2M2')).toBeCloseTo(2.2e6);
    expect(parseSI('10µF')).toBeCloseTo(10e-6);
    expect(parseSI('220 Ω')).toBe(220);
    expect(parseSI('1,5')).toBe(1.5);
    expect(parseSI('abc')).toBeNaN();
  });
  it('formats SI', () => {
    expect(formatSI(4700, 'Ω')).toBe('4.7 kΩ');
    expect(formatSI(100e-9, 'F')).toBe('100 nF');
  });
  it('computes resistor colour bands', () => {
    // 220 Ω = red red brown gold
    expect(resistorBands(220)).toEqual([BAND_COLORS[2], BAND_COLORS[2], BAND_COLORS[1], GOLD]);
    // 4.7 kΩ = yellow violet red
    expect(resistorBands(4700).slice(0, 3)).toEqual([BAND_COLORS[4], BAND_COLORS[7], BAND_COLORS[2]]);
    // 10 Ω = brown black black
    expect(resistorBands(10).slice(0, 3)).toEqual([BAND_COLORS[1], BAND_COLORS[0], BAND_COLORS[0]]);
  });
});

describe('library integrity', () => {
  it('every component has unique pin ids on the 0.1" grid and renders', () => {
    for (const def of allDefs()) {
      const props = defaultProps(def);
      const pins = getPins(def, props);
      const ids = new Set(pins.map((p) => p.id));
      expect(ids.size, `${def.type} duplicate pin ids`).toBe(pins.length);
      for (const p of pins) {
        expect(Math.abs(p.x % 10), `${def.type}.${p.id} x off-grid`).toBe(0);
        expect(Math.abs(p.y % 10), `${def.type}.${p.id} y off-grid`).toBe(0);
      }
      expect(() => def.render({ props })).not.toThrow();
    }
  });
  it('has a substantial catalogue in every category', () => {
    const cats = new Map<string, number>();
    allDefs().forEach((d) => cats.set(d.category, (cats.get(d.category) ?? 0) + 1));
    expect(allDefs().length).toBeGreaterThan(80);
    for (const n of cats.values()) expect(n).toBeGreaterThanOrEqual(4);
  });
  it('rotation keeps pins on grid', () => {
    for (let r = 0; r < 4; r++) {
      const p = transformPoint({ x: 20, y: -10 }, { x: 30, y: 40 }, r as Rotation);
      expect(Math.abs(p.x % 10)).toBe(0); expect(Math.abs(p.y % 10)).toBe(0);
    }
  });
});

describe('netlist', () => {
  it('joins pins through wires and junctions', () => {
    const d = emptyDocument();
    const r1 = add(d, 'resistor', 0, 0), r2 = add(d, 'resistor', 100, 0), r3 = add(d, 'resistor', 200, 0);
    wire(d, [r1, '2'], [r2, '1']);
    d.junctions.j1 = { id: 'j1', x: 0, y: 50 };
    d.wires.wa = { id: 'wa', from: { kind: 'pin', compId: r2, pinId: '2' }, to: { kind: 'junction', junctionId: 'j1' }, points: [], color: '#000', style: 'wire' };
    d.wires.wb = { id: 'wb', from: { kind: 'junction', junctionId: 'j1' }, to: { kind: 'pin', compId: r3, pinId: '1' }, points: [], color: '#000', style: 'wire' };
    expect(sameNet(d, [r1, '2'], [r2, '1'])).toBe(true);
    expect(sameNet(d, [r2, '2'], [r3, '1'])).toBe(true);
    expect(sameNet(d, [r1, '1'], [r1, '2'])).toBe(false);
  });

  it('breadboard: column strips a–e / f–j, channel isolates, rails run along', () => {
    const d = emptyDocument();
    const bb = add(d, 'breadboard-half', 0, 0);
    const nl = buildNetlist(d);
    const n = (p: string) => nl.pinNet.get(pinKey(bb, p));
    expect(n('a1')).toBe(n('e1'));
    expect(n('f1')).toBe(n('j1'));
    expect(n('e1')).not.toBe(n('f1'));     // centre channel
    expect(n('a1')).not.toBe(n('a2'));     // neighbouring columns isolated
    expect(n('TP3')).toBe(n('TP29'));      // rail continuous
    expect(n('TP3')).not.toBe(n('TN3'));
    expect(n('TP3')).not.toBe(n('BP3'));
  });

  it('breadboard: split rails option', () => {
    const d = emptyDocument();
    const bb = add(d, 'breadboard-full', 0, 0, { splitRails: true });
    const nl = buildNetlist(d);
    expect(nl.pinNet.get(pinKey(bb, 'TP3'))).not.toBe(nl.pinNet.get(pinKey(bb, 'TP62')));
  });

  it('component leads inserted in breadboard holes connect through the strip', () => {
    const d = emptyDocument();
    const bb = add(d, 'breadboard-half', 0, 0);
    // resistor pins at (-100,-30)=c5 and (-60,-30)=c9 ; LED anode at (-60,-40)=b9
    const r = add(d, 'resistor', -80, -30);
    const led = add(d, 'led', -60, -70);
    expect(sameNet(d, [r, '2'], [led, 'A'])).toBe(true);
    expect(sameNet(d, [r, '1'], [bb, 'a5'])).toBe(true);
    expect(sameNet(d, [r, '1'], [r, '2'])).toBe(false);
  });

  it('DIP IC straddling the channel has every pin isolated', () => {
    const d = emptyDocument();
    add(d, 'breadboard-half', 0, 0);
    const u = add(d, 'ne555', -60, 0);
    const nl = buildNetlist(d);
    const nets = new Set(['1', '2', '3', '4', '5', '6', '7', '8'].map((p) => nl.pinNet.get(pinKey(u, p))));
    expect(nets.size).toBe(8);
  });

  it('switch state changes connectivity', () => {
    const d = emptyDocument();
    const sw = add(d, 'toggle-switch', 0, 0);
    expect(sameNet(d, [sw, '1'], [sw, '2'])).toBe(false);
    d.components[sw].props.closed = true;
    expect(sameNet(d, [sw, '1'], [sw, '2'])).toBe(true);
  });

  it('arduino GND pins are tied on the board', () => {
    const d = emptyDocument();
    const u = add(d, 'arduino-uno', 0, 0);
    expect(sameNet(d, [u, 'GND_1'], [u, 'GND_3'])).toBe(true);
  });
});

describe('ERC', () => {
  it('flags an LED wired straight across a battery (no resistor)', () => {
    const d = emptyDocument();
    const bat = add(d, 'battery-9v', 0, 0);
    const led = add(d, 'led', 100, 0);
    wire(d, [bat, '+'], [led, 'A']);
    wire(d, [led, 'K'], [bat, '-']);
    const issues = runERC(d, buildNetlist(d));
    const i = issues.find((x) => x.id.startsWith('ocur-'));
    expect(i?.severity).toBe('error');
    expect(i?.message).toMatch(/resistência/);
  });
  it('flags reversed LED polarity', () => {
    const d = emptyDocument();
    const bat = add(d, 'battery-9v', 0, 0);
    const led = add(d, 'led', 100, 0);
    wire(d, [bat, '+'], [led, 'K']);
    wire(d, [led, 'A'], [bat, '-']);
    expect(runERC(d, buildNetlist(d)).some((x) => x.id.startsWith('rev-'))).toBe(true);
  });
  it('flags a direct short across a source', () => {
    const d = emptyDocument();
    const bat = add(d, 'battery-aa', 0, 0);
    wire(d, [bat, '+'], [bat, '-']);
    expect(runERC(d, buildNetlist(d))[0].id).toBe(`short-${bat}`);
  });
  it('flags a resistor with both leads in the same breadboard column', () => {
    const d = emptyDocument();
    add(d, 'breadboard-half', 0, 0);
    const r = add(d, 'resistor', -100, -30, {}, 1); // vertical: (−100,−50) & (−100,−10) → a5 & e5
    const i = runERC(d, buildNetlist(d)).find((x) => x.id === `self-${r}`);
    expect(i?.message).toMatch(/mesma coluna/);
  });
  it('built-in examples are clean (no errors / warnings)', () => {
    for (const ex of EXAMPLES) {
      const doc = ex.build();
      const bad = runERC(doc, buildNetlist(doc)).filter((i) => i.severity !== 'info');
      expect(bad, `${ex.id}: ${bad.map((b) => b.title).join('; ')}`).toEqual([]);
      for (const w of Object.values(doc.wires)) {
        for (const ep of [w.from, w.to]) if (ep.kind === 'pin') {
          const c = doc.components[ep.compId];
          expect(getPins(getDef(c.type)!, c.props).some((p) => p.id === ep.pinId), `${ex.id}: pin ${c.type}.${ep.pinId}`).toBe(true);
        }
      }
    }
  });
  it('555 example: timing network is correctly connected', () => {
    const doc = EXAMPLES.find((e) => e.id === 'ne555-bb')!.build();
    const nl = buildNetlist(doc);
    const byLabel = (l: string) => Object.values(doc.components).find((c) => c.label === l)!.id;
    const net = (l: string, p: string) => nl.pinNet.get(pinKey(byLabel(l), p));
    expect(net('U1', '6')).toBe(net('U1', '2'));           // THR = TRIG
    expect(net('U1', '7')).toBe(net('R1', '2'));           // DIS — R1
    expect(net('U1', '8')).toBe(net('BT1', '+'));          // VCC
    expect(net('U1', '4')).toBe(net('BT1', '+'));          // RESET high
    expect(net('U1', '1')).toBe(net('BT1', '-'));          // GND
    expect(net('C1', '1')).toBe(net('U1', '2'));           // C1+ on TRIG/THR
    expect(net('D1', 'K')).toBe(net('BT1', '-'));
    expect(net('R3', '1')).toBe(net('U1', '3'));           // OUT → R3
  });
});
