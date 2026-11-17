import { describe, it, expect } from 'vitest';
import { createInterp, RunError, type McuIO } from './interp';
import { CompileError } from './parser';

function fakeIO() {
  const io = {
    pins: new Map<number, boolean>(), modes: new Map<number, number>(), out: '', now: 0,
    pinMode(p: number, m: number) { io.modes.set(p, m); },
    digitalWrite(p: number, h: boolean) { io.pins.set(p, h); },
    digitalRead(p: number) { return io.pins.get(p) ?? false; },
    analogRead(_p: number) { return 512; },
    analogWrite(_p: number, _v: number) {},
    millis() { return io.now; },
    micros() { return io.now * 1000; },
    serial(t: string) { io.out += t; },
    serialAvailable() { return 0; },
    serialRead() { return -1; },
  };
  return io satisfies McuIO & Record<string, unknown>;
}

/** Runs the sketch until `n` delay/yield points; returns the requested delays in order. */
function steps(src: string, n: number) {
  const io = fakeIO();
  const gen = createInterp(src, io).run();
  const waits: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = gen.next();
    if (r.done) break;
    waits.push(r.value.ms);
  }
  return { io, waits };
}

describe('sketch interpreter', () => {
  it('blink: alterna o pino e pede delays', () => {
    const { io, waits } = steps(`
      #define LED 13
      void setup() { pinMode(LED, OUTPUT); }
      void loop() { digitalWrite(LED, HIGH); delay(500); digitalWrite(LED, LOW); delay(250); }`, 4);
    expect(io.modes.get(13)).toBe(1);
    // delay(500), delay(250), fim da passagem de loop() (0), nova passagem: delay(500)
    expect(waits).toEqual([500, 250, 0, 500]);
    expect(io.pins.get(13)).toBe(true); // segunda passagem começou com HIGH
  });

  it('inteiros são de 16 bits e a divisão de inteiros trunca', () => {
    const { io } = steps(`
      int a = 7 / 2;
      float f = 7 / 2.0;
      int wrap = 40000;
      int neg = -5 / 2;
      void setup() { Serial.println(a); Serial.println(f); Serial.println(wrap); Serial.println(neg); }
      void loop() {}`, 1);
    expect(io.out).toBe('3\n3.50\n-25536\n-2\n');
  });

  it('arrays, for e compound assignment', () => {
    const { io } = steps(`
      int arr[4] = {1, 2, 3, 4};
      int total = 0;
      void setup() { for (int i = 0; i < 4; i++) { total += arr[i] * 2; } Serial.print(total); }
      void loop() {}`, 1);
    expect(io.out).toBe('20');
  });

  it('funções recursivas e retorno', () => {
    const { io } = steps(`
      long fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }
      void setup() { Serial.println(fact(6)); }
      void loop() {}`, 1);
    expect(io.out).toBe('720\n');
  });

  it('switch com fall-through e break', () => {
    const { io } = steps(`
      void setup() {
        for (int k = 0; k < 4; k++) {
          switch (k) { case 0: Serial.print("zero "); case 1: Serial.print("um "); break; default: Serial.print("x "); }
        }
      }
      void loop() {}`, 1);
    expect(io.out).toBe('zero um um x x ');
  });

  it('map() e constrain() com aritmética de Arduino', () => {
    const { io } = steps(`
      void setup() { Serial.println(map(512, 0, 1023, 0, 255)); Serial.println(constrain(300, 0, 255)); }
      void loop() {}`, 1);
    expect(io.out).toBe('127\n255\n');
  });

  it('loop sem delay é interrompido pelo watchdog', () => {
    const gen = createInterp(`void setup() {} void loop() { while (1) { } }`, fakeIO()).run();
    expect(() => gen.next()).toThrow(RunError);
  });

  it('erros de execução indicam a linha', () => {
    const gen = createInterp(`void setup() {}\nvoid loop() {\n  int x = y + 1;\n}`, fakeIO()).run();
    try { gen.next(); expect.unreachable(); } catch (e) {
      expect(e).toBeInstanceOf(RunError);
      expect((e as RunError).line).toBe(3);
      expect((e as RunError).message).toContain("'y'");
    }
  });

  it('divisão por zero e índice fora dos limites são erros', () => {
    expect(() => steps(`void setup() { int z = 0; int q = 5 / z; } void loop() {}`, 1)).toThrow(/Divisão por zero/);
    expect(() => steps(`int a[2]; void setup() { a[5] = 1; } void loop() {}`, 1)).toThrow(/fora dos limites/);
  });

  it('erros de sintaxe são CompileError', () => {
    expect(() => createInterp(`void setup() { int x = 1 }`, fakeIO())).toThrow(CompileError);
  });
});
