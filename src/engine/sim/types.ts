/**
 * Simulation data model — plain, serialisable data (posted to a Web Worker).
 * Node 0 is the reference (ground). Nodes 1..N-1 are unknown voltages.
 */

/** Maps an element terminal to a component pin, so terminal currents can be reported per pin. */
export interface Owner { compId: string; pins: (string | null)[] }

export type Element =
  /** Resistor a–b. */
  | { k: 'R'; a: number; b: number; r: number; own?: Owner }
  /** Independent voltage source: V(p) − V(n) = v. */
  | { k: 'V'; p: number; n: number; v: number; own?: Owner }
  /** Independent current source: pushes i out of terminal p into the circuit (returns via n). */
  | { k: 'I'; p: number; n: number; i: number; own?: Owner }
  /** Diode / LED (anode a, cathode c). Optional reverse breakdown (zener). */
  | { k: 'D'; a: number; c: number; is: number; n: number; bv?: number; ibv?: number; own?: Owner }
  /** Bipolar transistor (Ebers–Moll transport model). */
  | { k: 'BJT'; c: number; b: number; e: number; pnp: boolean; is: number; bf: number; br: number; own?: Owner }
  /** MOSFET / JFET square-law (level 1). For JFETs vth is the pinch-off voltage. */
  | { k: 'MOS'; d: number; g: number; s: number; p: boolean; vth: number; kp: number; lambda: number; own?: Owner }
  /**
   * Controlled voltage source with discrete modes (behavioural ICs).
   * In mode m: V(p) − V(n) = Σ coef·V(node) + c.  Branch current is drawn from `from` (default n).
   */
  | { k: 'VCVS'; p: number; n: number; from?: number; modes: { terms: [number, number][]; c: number }[]; mode: number; rule: ModeRule; own?: Owner }
  /** Bench supply with constant-voltage / constant-current modes. */
  | { k: 'SUPPLY'; p: number; n: number; v: number; ilim: number; cc: boolean; own?: Owner }
  /** Switch whose state is decided by a rule evaluated on the previous solution. */
  | { k: 'SW'; a: number; b: number; on: boolean; ron: number; roff: number; rule: SwitchRule; own?: Owner }
  /** Current-controlled voltage source (Hall current sensors): V(p)−V(n) = gain·I(ctrl) + Σ terms + c; ctrl = index of the element whose branch current is sensed. */
  | { k: 'CCVS'; p: number; n: number; ctrl: number; gain: number; terms: [number, number][]; c: number; own?: Owner };

/** How a VCVS chooses its mode after each converged solve. */
export type ModeRule =
  | { kind: 'fixed' }
  /** Op-amp: mode 0 linear, 1 saturated high, 2 saturated low. */
  | { kind: 'opamp'; out: number; hi: [number, number]; lo: [number, number] } // hi/lo: [node, offset] limits
  /** Linear regulator: mode 0 regulating, 1 dropout. */
  | { kind: 'regulator'; vin: number; dropout: number }
  /** Logic gate output: mode 0 low, 1 high. */
  /** Output active only while the device is powered: mode 0 normal, 1 off. */
  | { kind: 'powered'; vcc: number; gnd: number; min: number }
  | { kind: 'logic'; fn: 'nand' | 'and' | 'or' | 'nor' | 'xor' | 'not'; inputs: number[]; vcc: number; gnd: number };

export type SwitchRule =
  | { kind: 'fixed' }
  /** Relay contact: energised when V(ctrl)−V(ref) (or reverse for activeLow) exceeds threshold and the module is powered. */
  | { kind: 'relay'; vcc: number; gnd: number; ctrl: number; activeHigh: boolean; normallyOpen: boolean }
  /** Closed while V(ctrl) − V(ref) > vth. */
  | { kind: 'threshold'; ctrl: number; ref: number; vth: number }
  /** Fuse: opens permanently when |I| exceeds the rating. */
  | { kind: 'fuse'; rating: number };

export interface SimCircuit {
  nodeCount: number;          // including ground (index 0)
  nodeNets: string[];         // node index → net id
  elements: Element[];
}

export interface SimResult {
  ok: boolean;
  error?: string;
  iterations: number;
  voltages: number[];                                   // per node
  floating: boolean[];                                  // node has no DC path to ground
  pinCurrents: Record<string, Record<string, number>>;  // compId → pinId → current INTO the pin (A)
  elementStates: { mode?: number; on?: boolean; cc?: boolean }[];
  warnings: string[];
}
