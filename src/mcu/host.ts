/**
 * Microcontroller host — runs sketches inside the transient simulation.
 *
 * load() augments the circuit with one pin driver per connected board pin (before the solver is
 * built): a controlled source behind a switch (push-pull output) and a pull-up branch.
 * step() runs before every solver step: it resumes each sketch whose delay has elapsed, moves the
 * servos, then writes the pin state (direction / level / PWM / servo pulse) into the driver
 * elements. Reads use the node voltage from the last solved point, so the sketch sees the real
 * circuit (loads, dividers, floating pins).
 */
import type { Engine } from '@/engine/sim/solver';
import type { Element, SimCircuit } from '@/engine/sim/types';
import { CONSTANTS, createInterp, RunError, type McuIO, type NativeObj } from './lang/interp';
import { CompileError } from './lang/parser';
import { BOARDS, pinNameFor } from './boards';
import { AvrMachine } from './avr/machine';

export interface McuPinRef { node: number; pwm: boolean }   // node −1 = pin not wired to any net
/** A DHT sensor wired to a board pin: its environment values and where its supply is connected. */
export interface DhtSensor { model: number; temperature: number; humidity: number; vccNode: number }
export interface McuProgram {
  compId: string; board: string; code: string; vcc: number; vref: number;
  pins: Record<string, McuPinRef>;
  /** Sensors keyed by the board pin they are wired to. */
  sensors?: Record<string, DhtSensor>;
  /** Compiled program (Intel HEX). When present the sketch runs on the AVR emulator instead of the interpreter. */
  hex?: string;
  /** Compile errors reported by the compile service; the board does not run. */
  compileErrors?: { line: number; col: number; message: string }[];
}
export interface McuEvent { compId: string; kind: 'serial' | 'error' | 'status'; text: string }
export interface McuSnapshot { compId: string; running: boolean; pins: Record<string, { mode: string; value: number }>; servo?: Record<string, number>; error?: string }

const DRIVE_R = 25;          // pin driver output impedance (Ω)
const PULLUP_R = 45_000;     // internal pull-up (Ω), within the AVR datasheet range
const OFF_R = 1e9;           // open switch
const MODES = ['in', 'out', 'pullup'] as const;
const SERVO_PERIOD = 0.02;   // 50 Hz frame
const SERVO_SPEED = 600;     // °/s — typical micro servo (≈0,1 s for 60°)
const DHT_MIN_V = 3.0;       // supply needed for the DHT to answer

interface PinRt {
  name: string;
  node: number;
  pwm: boolean;
  mode: 'in' | 'out' | 'pullup';
  level: boolean;
  usePwm: boolean;
  duty: number;                       // 0..1 when PWM
  servo?: ServoObj;                   // when a Servo is attached, the pin carries its pulse train
  drv: number; sw: number; pullSw: number;   // element indices; −1 when the pin has no node
}

interface ProgRt {
  prog: McuProgram;
  spec: (typeof BOARDS)[string];
  consts: Map<string, number>;
  pins: Map<string, PinRt>;
  servos: ServoObj[];
  rx: number[];
  gen: Generator<{ ms: number }, void, void> | null;
  wakeAt: number;
  now: number;                        // simulation time (s) of the current step
  error?: string;
  /** AVR emulator, when the sketch is compiled. */
  avr?: AvrMachine;
  /** Simulation time at which the emulated CPU started. */
  t0?: number;
}

/** Servo SG90-type: the pin pulse width sets the target angle; the horn moves at a finite speed. */
class ServoObj implements NativeObj {
  pin: PinRt | null = null;
  target = 90;
  pos = 90;
  constructor(private resolvePin: (n: number) => PinRt) {}
  call(method: string, args: number[]): number {
    switch (method) {
      case 'attach': {
        this.pin = this.resolvePin(args[0]);
        this.pin.servo = this;
        this.pin.mode = 'out';
        return 0;
      }
      case 'write': this.target = Math.min(180, Math.max(0, args[0] ?? 0)); return 0;
      case 'read': return Math.round(this.pos);
      case 'attached': return this.pin ? 1 : 0;
      case 'detach': if (this.pin) { this.pin.servo = undefined; this.pin = null; } return 0;
      default: throw new RunError(`Servo.${method}() ainda não é suportado.`, 0);
    }
  }
  advance(dt: number) {
    const max = SERVO_SPEED * dt, d = this.target - this.pos;
    this.pos += Math.min(max, Math.max(-max, d));
  }
  /** High time of the 50 Hz pulse for the current horn position (1–2 ms). */
  widthS(): number { return (1 + this.pos / 180) / 1000; }
}

/** DHT11/DHT22 seen from the sketch. Reads are taken from the sensor component's environment. */
class DhtObj implements NativeObj {
  constructor(private sensor: DhtSensor | undefined, private powered: () => boolean) {}
  call(method: string): number {
    switch (method) {
      case 'begin': return 0;
      case 'readTemperature': return this.sensor && this.powered() ? this.sensor.temperature : NaN;
      case 'readHumidity': return this.sensor && this.powered() ? this.sensor.humidity : NaN;
      default: throw new RunError(`DHT.${method}() ainda não é suportado.`, 0);
    }
  }
}

export class McuHost {
  private progs: ProgRt[] = [];
  private events: McuEvent[] = [];
  private eng: Engine | null = null;

  /** Adds the pin drivers for the programs and returns the circuit that must be simulated. */
  load(programs: McuProgram[], circuit: SimCircuit): SimCircuit {
    this.progs = [];
    this.events = [];
    let nodeCount = circuit.nodeCount;
    const nodeNets = [...circuit.nodeNets];
    const elements: Element[] = [...circuit.elements];
    const newNode = (tag: string) => { nodeNets.push(tag); return nodeCount++; };

    for (const prog of programs) {
      const spec = BOARDS[prog.board];
      if (!spec) {
        this.progs.push({ prog, spec: BOARDS['arduino-uno'], consts: new Map(), pins: new Map(), servos: [], rx: [], gen: null, wakeAt: 0, now: 0, error: `A placa ${prog.board} ainda não executa código.` });
        this.events.push({ compId: prog.compId, kind: 'error', text: `A placa ${prog.board} ainda não executa código.` });
        continue;
      }
      const pins = new Map<string, PinRt>();
      for (const [name, ref] of Object.entries(prog.pins)) {
        const pin: PinRt = { name, node: ref.node, pwm: ref.pwm, mode: 'in', level: false, usePwm: false, duty: 0, drv: -1, sw: -1, pullSw: -1 };
        if (ref.node >= 0) {
          const mid = newNode(`__drv_${prog.compId}_${name}`);
          const pu = newNode(`__pu_${prog.compId}_${name}`);
          const m2 = newNode(`__pus_${prog.compId}_${name}`);
          pin.drv = elements.length;
          elements.push({ k: 'VCVS', p: mid, n: 0, modes: [{ terms: [], c: 0 }, { terms: [], c: prog.vcc }, { terms: [], c: 0 }], mode: 0, rule: { kind: 'mcu' } });
          pin.sw = elements.length;
          elements.push({ k: 'SW', a: mid, b: ref.node, on: false, ron: DRIVE_R, roff: OFF_R, rule: { kind: 'mcu' } });
          elements.push({ k: 'VCVS', p: pu, n: 0, modes: [{ terms: [], c: prog.vcc }], mode: 0, rule: { kind: 'fixed' } });
          elements.push({ k: 'R', a: pu, b: m2, r: PULLUP_R });
          pin.pullSw = elements.length;
          elements.push({ k: 'SW', a: m2, b: ref.node, on: false, ron: 1, roff: OFF_R, rule: { kind: 'mcu' } });
        }
        pins.set(name, pin);
      }
      const consts = new Map(CONSTANTS);
      for (const [k, v] of Object.entries(spec.analogConsts ?? {})) consts.set(k, v);
      const rt: ProgRt = { prog, spec, consts, pins, servos: [], rx: [], gen: null, wakeAt: 0, now: 0 };
      if (prog.compileErrors?.length) {
        const e = prog.compileErrors[0];
        rt.error = `Erro de compilação na linha ${e.line}: ${e.message}`;
        this.events.push({ compId: prog.compId, kind: 'error', text: rt.error });
      } else if (prog.hex) {
        try { rt.avr = new AvrMachine(prog.hex); } catch (e) {
          rt.error = `Não foi possível carregar o programa: ${(e as Error).message}`;
          this.events.push({ compId: prog.compId, kind: 'error', text: rt.error });
        }
      } else {
        try {
          rt.gen = createInterp(prog.code, this.io(rt), consts).run();
        } catch (e) {
          rt.error = e instanceof CompileError ? `Erro na linha ${e.line}: ${e.message}` : String((e as Error).message ?? e);
          this.events.push({ compId: prog.compId, kind: 'error', text: rt.error });
        }
      }
      this.progs.push(rt);
    }
    return { nodeCount, nodeNets, elements, dynamic: programs.length > 0 };
  }

  /** Called by the runner before each solver step. Sketches start once the circuit has a solution. */
  step(t: number, dt: number, eng: Engine) {
    if (!eng.x) return;
    this.eng = eng;
    for (const rt of this.progs) {
      rt.now = t;
      if (rt.avr) { this.stepAvr(rt, t, eng); continue; }
      if (rt.gen && t + 1e-12 >= rt.wakeAt) {
        try {
          const r = rt.gen.next();
          if (r.done) rt.gen = null;
          else rt.wakeAt = t + r.value.ms / 1000;
        } catch (e) {
          rt.gen = null;
          rt.error = e instanceof RunError && e.line > 0 ? `Linha ${e.line}: ${e.message}` : (e as Error).message;
          this.events.push({ compId: rt.prog.compId, kind: 'error', text: rt.error });
        }
      }
      for (const s of rt.servos) s.advance(dt);
      this.applyPins(rt, eng, t);
    }
  }

  serialIn(compId: string, text: string) {
    const rt = this.progs.find((p) => p.prog.compId === compId);
    if (!rt) return;
    if (rt.avr) { rt.avr.receive(text); return; }
    for (const ch of text) rt.rx.push(ch.charCodeAt(0));
    if (rt.rx.length > 256) rt.rx.splice(0, rt.rx.length - 256);
  }

  drain(): McuEvent[] {
    for (const rt of this.progs) {
      const text = rt.avr?.drainSerial();
      if (text) this.events.push({ compId: rt.prog.compId, kind: 'serial', text });
    }
    const e = this.events; this.events = []; return e;
  }

  snapshot(): McuSnapshot[] {
    return this.progs.map((rt) => {
      const pins: McuSnapshot['pins'] = {};
      const servo: Record<string, number> = {};
      for (const p of rt.pins.values()) {
        if (p.servo) { servo[p.name] = Math.round(p.servo.pos); pins[p.name] = { mode: 'servo', value: Math.round(p.servo.pos) }; continue; }
        if (p.node < 0 && p.mode === 'in') continue;
        if (p.mode === 'out') pins[p.name] = p.usePwm ? { mode: 'pwm', value: Math.round(p.duty * 255) } : { mode: 'out', value: +p.level };
        else pins[p.name] = { mode: p.mode, value: this.readLevel(rt, p) ? 1 : 0 };
      }
      return { compId: rt.prog.compId, running: !!rt.gen || !!rt.avr, pins, servo: Object.keys(servo).length ? servo : undefined, error: rt.error };
    });
  }

  // ───────── internals ─────────

  /** Runs the emulated CPU up to the simulation time, then copies the pin states to the circuit. */
  private stepAvr(rt: ProgRt, t: number, eng: Engine) {
    const m = rt.avr!;
    if (rt.t0 === undefined) rt.t0 = t;
    try {
      m.runUntil(Math.max(0, t - rt.t0));
    } catch (e) {
      rt.avr = undefined;
      rt.error = (e as Error).message;
      this.events.push({ compId: rt.prog.compId, kind: 'error', text: rt.error });
      return;
    }
    for (const p of rt.pins.values()) {
      const st = m.pinState(p.name);
      if (st) {
        p.usePwm = false;
        p.mode = st.mode;
        p.level = st.high;
        if (st.mode !== 'out') m.setInput(p.name, this.readLevel(rt, p));
      }
      if (/^Ad+$/.test(p.name)) m.setAnalog(p.name, p.node >= 0 ? eng.V(p.node) : 0);
    }
    this.applyPins(rt, eng, t);
  }

  private readLevel(rt: ProgRt, p: PinRt): boolean {
    if (p.node < 0 || !this.eng) return false;
    return this.eng.V(p.node) > rt.prog.vcc / 2;
  }

  /** Writes the pin state into the driver elements; takes effect at the next solver step. */
  private applyPins(rt: ProgRt, eng: Engine, t: number) {
    for (const p of rt.pins.values()) {
      if (p.drv < 0) continue;
      const drv = eng.els[p.drv], sw = eng.els[p.sw], pu = eng.els[p.pullSw];
      if (drv?.k !== 'VCVS' || sw?.k !== 'SW' || pu?.k !== 'SW') continue;
      if (p.servo) {
        // servo pulse train: high for 1–2 ms at the start of every 20 ms frame
        p.mode = 'out';
        p.usePwm = false;
        p.level = (t % SERVO_PERIOD) < p.servo.widthS();
      }
      const driving = p.mode === 'out';
      sw.on = driving;
      if (driving) {
        if (p.usePwm) { drv.modes[2].c = p.duty * rt.prog.vcc; drv.mode = 2; }
        else drv.mode = p.level ? 1 : 0;
      }
      pu.on = p.mode === 'pullup';
    }
  }

  /** Sketch pin number → pin of this board (D0–D53, A0… as the board defines them). */
  private pin(rt: ProgRt, n: number): PinRt {
    const name = pinNameFor(rt.spec, n);
    const p = rt.pins.get(name);
    if (!p) throw new RunError(`A placa ${rt.prog.board} não tem o pino ${name}.`, 0);
    return p;
  }

  /** Sensor powered when its supply pin sits at the board's logic level. */
  private powered(sensor: DhtSensor | undefined): boolean {
    if (!sensor || sensor.vccNode < 0 || !this.eng) return false;
    return this.eng.V(sensor.vccNode) >= DHT_MIN_V;
  }

  private io(rt: ProgRt): McuIO {
    const self = this;
    const adcMax = 2 ** rt.spec.adcBits - 1;
    return {
      pinMode(n, m) {
        const p = self.pin(rt, n);
        p.mode = MODES[m] ?? 'in';
        p.usePwm = false;
      },
      digitalWrite(n, high) {
        const p = self.pin(rt, n);
        p.level = high;
        p.usePwm = false;
        if (p.mode === 'in' && high) p.mode = 'pullup';   // Arduino: HIGH on an input enables the pull-up
        else if (p.mode !== 'pullup') p.mode = 'out';
      },
      digitalRead(n) {
        const p = self.pin(rt, n);
        return p.mode === 'out' ? p.level : self.readLevel(rt, p);
      },
      analogRead(n) {
        const p = self.pin(rt, n);
        if (p.node < 0 || !self.eng) return 0;
        return Math.round(Math.min(1, Math.max(0, self.eng.V(p.node) / rt.prog.vref)) * adcMax);
      },
      analogWrite(n, value) {
        const p = self.pin(rt, n);
        p.mode = 'out';
        if (!p.pwm) { p.level = value >= 128; p.usePwm = false; return; }   // non-PWM pin: Arduino treats as digital
        p.duty = Math.min(255, Math.max(0, value)) / 255;
        p.usePwm = true;
      },
      millis: () => Math.floor(rt.now * 1000),
      micros: () => Math.floor(rt.now * 1e6),
      serial(text) { self.events.push({ compId: rt.prog.compId, kind: 'serial', text }); },
      serialAvailable: () => rt.rx.length,
      serialRead: () => (rt.rx.length ? rt.rx.shift()! : -1),
      createObject(cls, args) {
        if (cls === 'Servo') {
          const s = new ServoObj((n) => self.pin(rt, n));
          rt.servos.push(s);
          return s;
        }
        if (cls === 'DHT') {
          const pin = self.pin(rt, args[0] ?? -1);
          const sensor = rt.prog.sensors?.[pin.name];
          return new DhtObj(sensor, () => self.powered(sensor));
        }
        return undefined;
      },
    };
  }
}
