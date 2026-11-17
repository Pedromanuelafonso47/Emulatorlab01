/** End-to-end: a real circuit document (Uno + LED on a breadboard) → netlist → compile → sketch → solver. */
import { describe, it, expect } from 'vitest';
import '@/library';
import { EXAMPLES } from '@/persistence/examples';
import { analyze } from '@/store/derived';
import { compile } from '@/engine/sim/compile';
import { SimRunner } from '@/engine/sim/runner';
import { pinKey } from '@/engine/netlist';
import { McuHost } from './host';
import { buildPrograms } from './programs';
import { SKETCH_EXAMPLES } from './examples';

describe('Uno blink on the real circuit', () => {
  it('drives the D13 net high and low through the LED circuit', () => {
    const doc = structuredClone(EXAMPLES.find((e) => e.id === 'uno-blink-bb')!.build());
    const uno = Object.values(doc.components).find((c) => c.type === 'arduino-uno')!;
    uno.props.sketch = SKETCH_EXAMPLES.find((s) => s.id === 'blink')!.code;

    const { nl } = analyze(doc);
    const compiled = compile(doc, nl);
    const programs = buildPrograms(doc, nl, compiled);
    expect(programs).toHaveLength(1);
    const d13Net = nl.pinNet.get(pinKey(uno.id, 'D13'))!;
    const probe = compiled.netNode.get(d13Net)!;
    expect(probe).toBeGreaterThan(0);

    const host = new McuHost();
    const runner = new SimRunner();
    runner.hook = (t, dt, eng) => host.step(t, dt, eng);
    runner.load(host.load(programs, compiled.circuit), 1, { dt: 1e-4, timeScale: 1, probes: [probe] });
    const high = runner.advance(0.4)!.samples[0];   // 0–0.4 s: HIGH
    const low = runner.advance(0.4)!.samples[0];    // 0.4–0.8 s: LOW from 0.5 s

    expect(Math.max(...high)).toBeGreaterThan(1.5);           // LED conducting (≈2 V forward drop)
    expect(Math.min(...low.slice(-200))).toBeLessThan(0.2);   // LED off, pin pulled to GND
    expect(host.snapshot()[0].error).toBeUndefined();
    expect(host.snapshot()[0].pins.D13.mode).toBe('out');
  });
});
