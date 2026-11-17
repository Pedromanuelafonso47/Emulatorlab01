import { describe, it, expect } from 'vitest';
import { McuHost, type McuProgram } from './host';
import { SimRunner } from '@/engine/sim/runner';
import type { SimCircuit } from '@/engine/sim/types';

const BLINK = `
void setup() { pinMode(13, OUTPUT); }
void loop() { digitalWrite(13, HIGH); delay(500); digitalWrite(13, LOW); delay(500); }`;

/** Runs a sketch wired to node 1 of `circuit` through the real transient solver. */
function run(code: string, circuit: SimCircuit, pins: Record<string, number>, seconds: number[]) {
  const host = new McuHost();
  const prog: McuProgram = {
    compId: 'U1', board: 'arduino-uno', code, vcc: 5, vref: 5,
    pins: Object.fromEntries(Object.entries(pins).map(([n, node]) => [n, { node, pwm: /^D(3|5|6|9|10|11)$/.test(n) }])),
  };
  const runner = new SimRunner();
  runner.hook = (t, dt, eng) => host.step(t, dt, eng);
  runner.load(host.load([prog], circuit), 1, { dt: 1e-4, timeScale: 1, probes: [1] });
  const frames = seconds.map((s) => runner.advance(s));
  return { host, frames, runner };
}

const LOAD_1K: SimCircuit = { nodeCount: 2, nodeNets: ['GND', 'PIN'], elements: [{ k: 'R', a: 1, b: 0, r: 1000 }] };

describe('microcontroller host', () => {
  it('blink: the pin drives the node high, then low, on the sketch delays', () => {
    const { frames } = run(BLINK, LOAD_1K, { D13: 1 }, [0.4, 0.4]);
    const first = frames[0]!.samples[0], second = frames[1]!.samples[0];
    expect(first[first.length - 1]).toBeGreaterThan(4.5);   // t ≈ 0.4 s: HIGH
    expect(second[second.length - 1]).toBeLessThan(0.5);    // t ≈ 0.8 s: LOW since 0.5 s
  });

  it('snapshot reports the pin mode and level', () => {
    const { host } = run(BLINK, LOAD_1K, { D13: 1 }, [0.1]);
    const s = host.snapshot()[0];
    expect(s.running).toBe(true);
    expect(s.error).toBeUndefined();
    expect(s.pins.D13).toEqual({ mode: 'out', value: 1 });
  });

  it('Serial.println goes to the event queue', () => {
    const { host } = run(`void setup() { Serial.begin(9600); Serial.println(42); } void loop() { delay(1000); }`, LOAD_1K, { D13: 1 }, [0.05]);
    const serial = host.drain().filter((e) => e.kind === 'serial').map((e) => e.text).join('');
    expect(serial).toBe('42\n');
  });

  it('serialIn feeds Serial.available() / Serial.read()', () => {
    const code = `void loop() { if (Serial.available()) { Serial.print(Serial.read()); } delay(100); }`;
    const host = new McuHost();
    const prog: McuProgram = { compId: 'U1', board: 'arduino-uno', code, vcc: 5, vref: 5, pins: {} };
    const runner = new SimRunner();
    runner.hook = (t, dt, eng) => host.step(t, dt, eng);
    runner.load(host.load([prog], LOAD_1K), 1, { dt: 1e-4, timeScale: 1, probes: [] });
    host.serialIn('U1', 'A');
    runner.advance(0.15);   // loop(): read at ~0 s, next pass at 0.1 s
    const out = host.drain().filter((e) => e.kind === 'serial').map((e) => e.text).join('');
    expect(out).toBe('65');
  });

  it('analogRead converts the node voltage to 10 bits', () => {
    const circuit: SimCircuit = { nodeCount: 2, nodeNets: ['GND', 'PIN'], elements: [{ k: 'V', p: 1, n: 0, v: 2.5 }] };
    const { host } = run(`void loop() { Serial.println(analogRead(A0)); delay(1000); }`, circuit, { A0: 1 }, [0.05]);
    const n = Number(host.drain().filter((e) => e.kind === 'serial').map((e) => e.text).join('').trim());
    expect(n).toBeGreaterThanOrEqual(511);
    expect(n).toBeLessThanOrEqual(513);
  });

  it('runtime errors are reported as events with the line', () => {
    const host = new McuHost();
    const prog: McuProgram = { compId: 'U1', board: 'arduino-uno', code: 'void loop() { int x = oops; }', vcc: 5, vref: 5, pins: {} };
    const runner = new SimRunner();
    runner.hook = (t, dt, eng) => host.step(t, dt, eng);
    runner.load(host.load([prog], LOAD_1K), 1, { dt: 1e-4, timeScale: 1, probes: [] });
    runner.advance(0.01);
    const err = host.drain().find((e) => e.kind === 'error');
    expect(err?.text).toContain('Linha 1');
    expect(err?.text).toContain("'oops'");
    expect(host.snapshot()[0].running).toBe(false);
  });

  it('syntax errors are reported when the circuit loads', () => {
    const host = new McuHost();
    const prog: McuProgram = { compId: 'U1', board: 'arduino-uno', code: 'void loop( {', vcc: 5, vref: 5, pins: {} };
    host.load([prog], LOAD_1K);
    const err = host.drain()[0];
    expect(err.kind).toBe('error');
    expect(err.text).toContain('Erro na linha');
  });

  it('pins that are not wired to any net get no driver elements', () => {
    const host = new McuHost();
    const prog: McuProgram = { compId: 'U1', board: 'arduino-uno', code: BLINK, vcc: 5, vref: 5, pins: { D13: { node: -1, pwm: false } } };
    const out = host.load([prog], LOAD_1K);
    expect(out.elements.length).toBe(LOAD_1K.elements.length);
    expect(out.nodeCount).toBe(LOAD_1K.nodeCount);
  });
});
