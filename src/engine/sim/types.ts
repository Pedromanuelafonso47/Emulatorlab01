/**
 * Simulation data model — plain, serialisable data (posted to a Web Worker).
 * Node 0 is the reference (ground). Nodes 1..N-1 are unknown voltages.
 */

/** Maps an element terminal to a component pin, so terminal currents can be reported per pin. */
export interface Owner { compId: string; pins: (string | null)[] }

export interface Wave { kind: 'sine' | 'square' | 'triangle' | 'saw' | 'dc'; amp: number; freq: number; offset: number; phase: number; duty: number }

export type Element =
  /** Resistor a–b. */
  | { k: 'R'; a: number; b: number; r: number; own?: Owner; key?: string }
  /** Independent voltage source: V(p) − V(n) = v. */
  | { k: 'V'; p: number; n: number; v: number; own?: Owner; key?: string }
  /** Time-dependent voltage source. */
  | { k: 'VT'; p: number; n: number; wave: Wave; own?: Owner; key?: string }
  /** Independent current source: pushes i out of terminal p into the circuit (returns via n). */
  | { k: 'I'; p: number; n: number; i: number; own?: Owner; key?: string }
  /** Capacitor (open in DC; Backward-Euler companion in transient). vprev = committed voltage. */
  | { k: 'C'; a: number; b: number; c: number; vprev: number; own?: Owner; key?: string }
  /** Inductor (short in DC; companion model in transient). iprev = committed current a→b. */
  | { k: 'L'; a: number; b: number; l: number; iprev: number; own?: Owner; key?: string }
  /** Diode / LED (anode a, cathode c). Optional reverse breakdown (zener). */
  | { k: 'D'; a: number; c: number; is: number; n: number; bv?: number; ibv?: number; own?: Owner; key?: string }
  /** Bipolar transistor (Ebers–Moll transport model). */
  | { k: 'BJT'; c: number; b: number; e: number; pnp: boolean; is: number; bf: number; br: number; own?: Owner; key?: string }
  /** MOSFET / JFET square-law (level 1). For JFETs vth is the pinch-off voltage. */
  | { k: 'MOS'; d: number; g: number; s: number; p: boolean; vth: number; kp: number; lambda: number; own?: Owner; key?: string }
  /**
   * Controlled voltage source with discrete modes (behavioural ICs).
   * In mode m: V(p) − V(n) = Σ coef·V(node) + c.  Branch current is drawn from `from` (default n).
   */
  | { k: 'VCVS'; p: number; n: number; from?: number; modes: { terms: [number, number][]; c: number }[]; mode: number; rule: ModeRule; own?: Owner; key?: string }
  /** Bench supply with constant-voltage / constant-current modes. */
  | { k: 'SUPPLY'; p: number; n: number; v: number; ilim: number; cc: boolean; own?: Owner; key?: string }
  /** Switch whose state is decided by a rule evaluated on the previous solution. */
  | { k: 'SW'; a: number; b: number; on: boolean; ron: number; roff: number; rule: SwitchRule; own?: Owner; key?: string }
  /** Current-controlled voltage source: V(p)−V(n) = gain·I(ctrl) + Σ terms + c; ctrl = index of the element whose branch current is sensed. */
  | { k: 'CCVS'; p: number; n: number; ctrl: number; gain: number; terms: [number, number][]; c: number; own?: Owner; key?: string }
  /** NE555 behavioural model (comparators + SR latch + output stage + discharge transistor). x = internal ⅓·Vcc node. */
  | { k: 'T555'; vcc: number; gnd: number; trig: number; thr: number; ctrl: number; x: number; reset: number; out: number; dis: number; q: boolean; own?: Owner; key?: string }
  /** Sequential logic (edge-triggered) with voltage outputs. st = committed state, prev = committed clock levels, cand = candidate state. */
  | { k: 'SEQ'; kind: 'dff2' | 'cd4017' | 'cd4060'; vcc: number; gnd: number; ins: number[]; outs: number[]; st: number[]; prev: boolean[]; cand: number[]; own?: Owner; key?: string }
  /** Thyristor (SCR) / TRIAC: latching switch a–c triggered from gate g. */
  | { k: 'THY'; a: number; c: number; g: number; triac: boolean; on: boolean; cand: boolean; ih: number; own?: Owner; key?: string }
  /** Ideal transformer: V(s1)−V(s2) = n·(V(p1)−V(p2)), Ip = −n·Is. */
  | { k: 'XFMR'; p1: number; p2: number; s1: number; s2: number; n: number; own?: Owner; key?: string };

/** How a VCVS chooses its mode after each converged solve. */
export type ModeRule =
  | { kind: 'fixed' }
  /** Op-amp: mode 0 linear, 1 saturated high, 2 saturated low. */
  | { kind: 'opamp'; out: number; hi: [number, number]; lo: [number, number] }
  /** Linear regulator: mode 0 regulating, 1 dropout. */
  | { kind: 'regulator'; vin: number; dropout: number }
  /** Output active only while the device is powered: mode 0 normal, 1 off. */
  | { kind: 'powered'; vcc: number; gnd: number; min: number }
  /** Logic gate output: mode 0 low, 1 high. */
  | { kind: 'logic'; fn: 'nand' | 'and' | 'or' | 'nor' | 'xor' | 'not'; inputs: number[]; vcc: number; gnd: number }
  /** Driven by the microcontroller runtime (mode set externally). */
  | { kind: 'mcu' };

export type SwitchRule =
  | { kind: 'fixed' }
  /** Relay contact: energised when V(ctrl)−V(gnd) (or reverse for active-low) exceeds threshold and the module is powered. */
  | { kind: 'relay'; vcc: number; gnd: number; ctrl: number; activeHigh: boolean; normallyOpen: boolean }
  /** Closed while V(ctrl) − V(ref) > vth. */
  | { kind: 'threshold'; ctrl: number; ref: number; vth: number }
  /** Closed when (A AND EN), or (NOT A AND EN) if invert, with thresholds at the supply midpoint. */
  | { kind: 'and2'; a: number; en: number; vcc: number; gnd: number; invert: boolean }
  /** Fuse: opens permanently when |I| exceeds the rating. */
  | { kind: 'fuse'; rating: number }
  /** Controlled by the microcontroller runtime (pin output stage / pull-up). */
  | { kind: 'mcu' };

export interface SimCircuit {
  nodeCount: number;          // including ground (index 0)
  nodeNets: string[];         // node index → net id
  elements: Element[];
  /** Set when a time-driven runtime (microcontroller sketches) must step the circuit even if it has no dynamic parts. */
  dynamic?: boolean;
}

export interface SimResult {
  ok: boolean;
  error?: string;
  iterations: number;
  voltages: number[];                                   // per node
  floating: boolean[];                                  // node has no DC path to ground
  pinCurrents: Record<string, Record<string, number>>;  // compId → pinId → current INTO the pin (A)
  elementStates: { mode?: number; on?: boolean; cc?: boolean; q?: boolean; st?: number[] }[];
  warnings: string[];
  time?: number;
}

/** True if the circuit needs time stepping (otherwise a single DC solve is exact). */
export function isDynamic(els: Element[]): boolean {
  return els.some((e) => e.k === 'C' || e.k === 'L' || e.k === 'VT' || e.k === 'T555' || e.k === 'SEQ' || e.k === 'THY' || e.k === 'XFMR'
    || (e.k === 'VCVS' && e.rule.kind === 'mcu') || (e.k === 'SW' && e.rule.kind === 'mcu'));
}
