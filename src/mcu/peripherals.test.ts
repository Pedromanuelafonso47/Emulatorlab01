import { describe, it, expect } from 'vitest';
import { McuHost, type McuProgram } from './host';
import { SimRunner } from '@/engine/sim/runner';
import type { SimCircuit } from '@/engine/sim/types';

function runProgram(prog: McuProgram, circuit: SimCircuit, seconds: number[], probes: number[] = []) {
  const host = new McuHost();
  const runner = new SimRunner();
  runner.hook = (t, dt, eng) => host.step(t, dt, eng);
  runner.load(host.load([prog], circuit), 1, { dt: 1e-4, timeScale: 1, probes });
  const frames = seconds.map((s) => runner.advance(s));
  return { host, frames };
}

const serialText = (host: McuHost) => host.drain().filter((e) => e.kind === 'serial').map((e) => e.text).join('');

describe('Servo', () => {
  it('moves to the commanded angle at a finite speed and drives a 50 Hz pulse train', () => {
    const circuit: SimCircuit = { nodeCount: 2, nodeNets: ['GND', 'SIG'], elements: [{ k: 'R', a: 1, b: 0, r: 10_000 }] };
    const code = `#include <Servo.h>
Servo s;
void setup() { s.attach(9); }
void loop() { s.write(180); delay(1000); }`;
    const prog: McuProgram = { compId: 'U1', board: 'arduino-uno', code, vcc: 5, vref: 5, pins: { D9: { node: 1, pwm: true } } };
    const { host, frames } = runProgram(prog, circuit, [0.4, 0.2], [1]);
    // 90° → 180° at 600°/s takes 0,15 s: the horn has arrived after 0,4 s
    expect(host.snapshot()[0].servo?.D9).toBe(180);
    // at 2 ms high out of every 20 ms the pulse train averages ≈10 % high
    const samples = frames[1]!.samples[0];
    const high = samples.filter((v) => v > 2.5).length / samples.length;
    expect(high).toBeGreaterThan(0.06);
    expect(high).toBeLessThan(0.14);
  });
});

describe('DHT sensor', () => {
  const circuit: SimCircuit = {
    nodeCount: 3, nodeNets: ['GND', 'DATA', 'VCC'],
    elements: [{ k: 'R', a: 1, b: 0, r: 100_000 }, { k: 'V', p: 2, n: 0, v: 5 }],
  };
  const code = `DHT dht(2, DHT11);
void setup() { dht.begin(); }
void loop() { Serial.println(dht.readTemperature()); Serial.println(dht.readHumidity()); delay(1000); }`;

  it('reads the environment of the sensor wired to the pin when it is powered', () => {
    const prog: McuProgram = {
      compId: 'U1', board: 'arduino-uno', code, vcc: 5, vref: 5,
      pins: { D2: { node: 1, pwm: false } },
      sensors: { D2: { model: 11, temperature: 24.5, humidity: 55, vccNode: 2 } },
    };
    const { host } = runProgram(prog, circuit, [0.05]);
    expect(serialText(host)).toBe('24.50\n55.00\n');
  });

  it('returns NaN when the sensor has no supply', () => {
    const prog: McuProgram = {
      compId: 'U1', board: 'arduino-uno', code, vcc: 5, vref: 5,
      pins: { D2: { node: 1, pwm: false } },
      sensors: { D2: { model: 11, temperature: 24.5, humidity: 55, vccNode: -1 } },
    };
    const { host } = runProgram(prog, circuit, [0.05]);
    expect(serialText(host)).toBe('NaN\nNaN\n');
  });
});

describe('Board specifications', () => {
  it('Arduino Mega: A0 is pin 54 and the ADC reads 10 bits against 5 V', () => {
    const circuit: SimCircuit = { nodeCount: 2, nodeNets: ['GND', 'PIN'], elements: [{ k: 'V', p: 1, n: 0, v: 2.5 }] };
    const prog: McuProgram = { compId: 'U1', board: 'arduino-mega', code: 'void loop() { Serial.println(analogRead(A0)); delay(1000); }', vcc: 5, vref: 5, pins: { A0: { node: 1, pwm: false } } };
    const { host } = runProgram(prog, circuit, [0.05]);
    const n = Number(serialText(host).trim());
    expect(n).toBeGreaterThanOrEqual(511);
    expect(n).toBeLessThanOrEqual(513);
  });

  it('ESP32: digital pins are named by GPIO and the ADC reads 12 bits against 3,3 V', () => {
    const circuit: SimCircuit = { nodeCount: 2, nodeNets: ['GND', 'PIN'], elements: [{ k: 'V', p: 1, n: 0, v: 1.65 }] };
    const prog: McuProgram = { compId: 'U1', board: 'esp32-devkit', code: 'void loop() { Serial.println(analogRead(34)); delay(1000); }', vcc: 3.3, vref: 3.3, pins: { D34: { node: 1, pwm: false } } };
    const { host } = runProgram(prog, circuit, [0.05]);
    const n = Number(serialText(host).trim());
    expect(n).toBeGreaterThanOrEqual(2040);
    expect(n).toBeLessThanOrEqual(2056);
  });
});
