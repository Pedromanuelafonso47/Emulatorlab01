/**
 * Real-time simulation runner. Owns a transient engine, advances simulated time in proportion to
 * real time (scaled), samples probe nodes for the oscilloscope/instruments and keeps per-element
 * state across circuit edits. Used inside the Web Worker (or on the main thread as fallback).
 */
import { Engine, Transient } from './solver';
import { isDynamic, type SimCircuit, type SimResult } from './types';

export interface RunnerSettings { dt: number; timeScale: number; probes: number[] }

export interface Frame {
  version: number;
  result: SimResult;
  t: number;
  dynamic: boolean;
  sampleT: number[];
  samples: number[][];      // per probe, aligned with sampleT
  speed: number;            // simulated seconds per real second (actual)
  failed: boolean;
}

/** Hook for the microcontroller runtime: called before each step with the engine (Phase 5). */
export type StepHook = (t: number, dt: number, eng: Engine) => void;

const MAX_STEPS = 6000;
const MAX_SAMPLES = 2500;

export class SimRunner {
  private tr: Transient | null = null;
  private dc: Engine | null = null;
  private dirty = true;
  private failed = false;
  t = 0;
  version = 0;
  dynamic = false;
  settings: RunnerSettings = { dt: 1e-4, timeScale: 1, probes: [] };
  hook?: StepHook;

  load(circuit: SimCircuit, version: number, settings: RunnerSettings) {
    const state = this.tr?.eng.saveState() ?? this.dc?.saveState() ?? {};
    this.version = version;
    this.settings = settings;
    this.dynamic = isDynamic(circuit.elements);
    this.failed = false;
    this.dirty = true;
    if (this.dynamic) {
      this.dc = null;
      this.tr = new Transient(circuit, state, this.t);
      this.hook?.(this.t, 0, this.tr.eng);
      if (!this.tr.start()) this.failed = true;
    } else {
      this.tr = null;
      this.dc = new Engine(circuit);
      this.dc.restoreState(state);
      const ctx = { dc: true, dt: 0, t: this.t };
      if (!this.dc.solvePoint(ctx)) this.failed = true;
      this.dc.commit(ctx);
    }
  }

  setSettings(s: Partial<RunnerSettings>) { this.settings = { ...this.settings, ...s }; }

  /** Advance by `realSec` of wall-clock time. Returns a frame, or null if nothing changed (static circuit). */
  advance(realSec: number): Frame | null {
    const probes = this.settings.probes;
    if (!this.dynamic || !this.tr) {
      if (!this.dirty || !this.dc) return null;
      this.dirty = false;
      return { version: this.version, result: this.dc.result(), t: this.t, dynamic: false, sampleT: [], samples: probes.map(() => []), speed: 0, failed: this.failed };
    }
    const { dt, timeScale } = this.settings;
    const target = Math.max(0, realSec * timeScale);
    const steps = Math.min(MAX_STEPS, Math.max(this.failed ? 0 : 1, Math.round(target / dt)));
    const dec = Math.max(1, Math.ceil(steps / MAX_SAMPLES));
    const sampleT: number[] = [];
    const samples: number[][] = probes.map(() => []);
    const t0 = this.t;
    const eng = this.tr.eng;
    for (let i = 0; i < steps && !this.failed; i++) {
      this.hook?.(eng.t, dt, eng);
      if (!this.tr.step(dt)) { this.failed = true; break; }
      if (i % dec === 0 || i === steps - 1) {
        sampleT.push(eng.t);
        probes.forEach((n, k) => samples[k].push(eng.V(n)));
      }
    }
    this.t = eng.t;
    return { version: this.version, result: eng.result(), t: this.t, dynamic: true, sampleT, samples, speed: realSec > 0 ? (this.t - t0) / realSec : 0, failed: this.failed };
  }
}
