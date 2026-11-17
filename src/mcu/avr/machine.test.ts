import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AvrMachine, parseIntelHex } from './machine';
import { ATMEGA328P, ATMEGA2560 } from './devices';

const fixture = (name: string) => readFileSync(join(__dirname, 'fixtures', name), 'utf8');

describe('Intel HEX loader', () => {
  it('places the bytes of the first record at address 0 as little-endian words', () => {
    const words = parseIntelHex(':0400000001020304F2\n:00000001FF\n', 16);
    expect(words[0]).toBe(0x0201);
    expect(words[1]).toBe(0x0403);
  });

  it('rejects a program larger than flash', () => {
    expect(() => parseIntelHex(':0100100000EF\n:00000001FF\n', 8)).toThrow(/maior/);
  });
});

describe('pin names', () => {
  it('maps the Uno pins to their ports and A0–A5 to PORTC', () => {
    expect(ATMEGA328P.pin('D0')).toEqual({ port: 'D', bit: 0 });
    expect(ATMEGA328P.pin('D8')).toEqual({ port: 'B', bit: 0 });
    expect(ATMEGA328P.pin('D13')).toEqual({ port: 'B', bit: 5 });
    expect(ATMEGA328P.pin('A3')).toEqual({ port: 'C', bit: 3 });
    expect(ATMEGA328P.pin('D20')).toBeNull();
    expect(ATMEGA328P.analogChannel('A7')).toBeNull();
  });

  it('maps the Mega pins from the Arduino core table', () => {
    expect(ATMEGA2560.pin('D13')).toEqual({ port: 'B', bit: 7 });
    expect(ATMEGA2560.pin('D22')).toEqual({ port: 'A', bit: 0 });
    expect(ATMEGA2560.pin('D54')).toEqual({ port: 'F', bit: 0 });
    expect(ATMEGA2560.analogChannel('A3')).toBe(3);
  });
});

describe('ATmega328P running a compiled Blink', () => {
  it('toggles D13 every 500 ms of CPU time', () => {
    const m = new AvrMachine(fixture('blink.hex'));
    const edges: number[] = [];
    let last = m.pinState('D13')?.high ?? false;
    for (let t = 0; t <= 1.2; t += 0.001) {
      m.runUntil(t);
      const now = m.pinState('D13')?.high ?? false;
      if (now !== last) { edges.push(Number(t.toFixed(3))); last = now; }
    }
    // first rise at ≈0 s, fall at ≈0.5 s, rise at ≈1.0 s
    expect(edges.length).toBeGreaterThanOrEqual(3);
    expect(edges[0]).toBeLessThan(0.01);
    expect(Math.abs(edges[1] - 0.5)).toBeLessThan(0.01);
    expect(Math.abs(edges[2] - 1.0)).toBeLessThan(0.01);
  });
});

describe('ATmega328P serial output', () => {
  it('sends the text printed by the sketch through the USART', () => {
    const m = new AvrMachine(fixture('serial.hex'));
    m.runUntil(0.15);
    expect(m.drainSerial()).toContain('OK42!\r\n');
  });
});
