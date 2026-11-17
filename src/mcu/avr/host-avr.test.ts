import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { McuHost, type McuProgram } from '../host';
import { SimRunner } from '@/engine/sim/runner';
import type { SimCircuit } from '@/engine/sim/types';

const hex = readFileSync(join(__dirname, 'fixtures', 'blink.hex'), 'utf8');
const circuit: SimCircuit = { nodeCount: 2, nodeNets: ['GND', 'PIN'], elements: [{ k: 'R', a: 1, b: 0, r: 1000 }] };

describe('compiled sketch on the AVR emulator, through the simulation host', () => {
  it('drives the D13 node high, then low after 0.5 s of simulated time', () => {
    const prog: McuProgram = { compId: 'U1', board: 'arduino-uno', code: '', hex, vcc: 5, vref: 5, pins: { D13: { node: 1, pwm: false } } };
    const host = new McuHost();
    const runner = new SimRunner();
    runner.hook = (t, dt, eng) => host.step(t, dt, eng);
    runner.load(host.load([prog], circuit), 1, { dt: 1e-4, timeScale: 1, probes: [1] });
    const high = runner.advance(0.4)!.samples[0];
    const low = runner.advance(0.3)!.samples[0];
    expect(Math.max(...high)).toBeGreaterThan(4.5);
    expect(Math.min(...low.slice(-500))).toBeLessThan(0.5);
    expect(host.snapshot()[0].error).toBeUndefined();
    expect(host.snapshot()[0].pins.D13.mode).toBe('out');
  });

  it('reports a compile error and does not run the board', () => {
    const prog: McuProgram = { compId: 'U1', board: 'arduino-uno', code: '', pins: {}, vcc: 5, vref: 5, compileErrors: [{ line: 3, col: 1, message: 'erro de teste' }] };
    const host = new McuHost();
    host.load([prog], circuit);
    const ev = host.drain();
    expect(ev[0].kind).toBe('error');
    expect(ev[0].text).toContain('linha 3');
    expect(host.snapshot()[0].running).toBe(false);
  });
});
