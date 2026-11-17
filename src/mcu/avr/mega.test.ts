import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AvrMachine } from './machine';
import { ATMEGA2560 } from './devices';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('ATmega2560 (Arduino Mega) running compiled sketches', () => {
  it('toggles D13 (PB7) every 500 ms', () => {
    const m = new AvrMachine(fixture('mega-blink.hex'), ATMEGA2560);
    const edges: number[] = [];
    let last = m.pinState('D13')?.high ?? false;
    for (let t = 0; t <= 1.2; t += 0.001) {
      m.runUntil(t);
      const now = m.pinState('D13')?.high ?? false;
      if (now !== last) { edges.push(Number(t.toFixed(3))); last = now; }
    }
    expect(edges.length).toBeGreaterThanOrEqual(3);
    expect(Math.abs(edges[1] - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(edges[2] - 1.0)).toBeLessThan(0.01);
  });

  it('PWM on D2 (Timer3, OC3B) with analogWrite(2, 128) has about 50 % duty', () => {
    const m = new AvrMachine(fixture('mega-pwm.hex'), ATMEGA2560);
    m.runUntil(0.02);                       // let the core configure Timer3
    let high = 0, total = 0;
    for (let t = 0.02; t < 0.1; t += 0.00002) {
      m.runUntil(t);
      total++;
      if (m.pinState('D2')?.high) high++;
    }
    const duty = high / total;
    expect(duty).toBeGreaterThan(0.4);
    expect(duty).toBeLessThan(0.6);
  });
});
