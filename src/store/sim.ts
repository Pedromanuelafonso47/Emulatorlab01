/**
 * Simulation session: compiles the document on the main thread, solves in a Web Worker,
 * interprets the result and re-runs automatically whenever the circuit changes while running.
 */
import { create } from 'zustand';
import type { CircuitDocument } from '@/domain/types';
import type { Netlist } from '@/engine/netlist';
import { compile, type Compiled } from '@/engine/sim/compile';
import { interpret, type Interpretation } from '@/engine/sim/interpret';
import { solveDC } from '@/engine/sim/solver';
import type { SimResult } from '@/engine/sim/types';
import { useEditor } from './editor';
import { analyze } from './derived';

interface SimState {
  running: boolean;
  interp: Interpretation | null;
  result: SimResult | null;
  solveMs: number;
  blown: Set<string>;
  start: () => void;
  stop: () => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let watchdog: ReturnType<typeof setTimeout> | undefined;

/** Solve outstanding jobs on the main thread (Worker unavailable or unresponsive). */
function flushPendingSync() {
  const last = pending.get(seq);
  pending.clear();
  if (last && useSim.getState().running) { const t = performance.now(); apply(last.doc, last.nl, last.compiled, solveDC(last.compiled.circuit), performance.now() - t); }
}
let seq = 0;
const pending = new Map<number, { doc: CircuitDocument; nl: Netlist; compiled: Compiled }>();

function getWorker(): Worker | null {
  if (worker || workerBroken || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('../engine/sim/worker.ts', import.meta.url), { type: 'module' });
    worker.onerror = () => { worker?.terminate(); worker = null; workerBroken = true; flushPendingSync(); };
    worker.onmessage = (e: MessageEvent<{ id: number; result?: SimResult; error?: string; ms?: number }>) => {
      const job = pending.get(e.data.id);
      pending.delete(e.data.id);
      clearTimeout(watchdog);
      if (!job || e.data.id !== seq || !useSim.getState().running) return; // stale
      if (e.data.error || !e.data.result) { useEditor.getState().notify(`Erro no simulador: ${e.data.error}`, 'error'); return; }
      apply(job.doc, job.nl, job.compiled, e.data.result, e.data.ms ?? 0);
    };
  } catch { worker = null; }
  return worker;
}

function apply(doc: CircuitDocument, nl: Netlist, compiled: Compiled, result: SimResult, ms: number) {
  const interp = interpret(doc, nl, compiled, result);
  const st = useSim.getState();
  let blown = st.blown;
  if (interp.blown.some((id) => !blown.has(id))) blown = new Set([...blown, ...interp.blown]);
  useSim.setState({ interp, result, solveMs: ms, blown });
}

function run() {
  const doc = useEditor.getState().doc;
  const { nl } = analyze(doc);
  let compiled: Compiled;
  try { compiled = compile(doc, nl, useSim.getState().blown); }
  catch (e) { useEditor.getState().notify(`Erro ao preparar o circuito: ${(e as Error).message}`, 'error'); return; }
  const id = ++seq;
  const w = getWorker();
  if (w) {
    pending.set(id, { doc, nl, compiled });
    w.postMessage({ id, circuit: compiled.circuit });
    clearTimeout(watchdog);
    watchdog = setTimeout(() => { if (pending.has(id)) { workerBroken = true; worker?.terminate(); worker = null; flushPendingSync(); useEditor.getState().log('warn', 'Web Worker sem resposta — a simulação passou a correr na thread principal.'); } }, 1500);
  }
  else { const t = performance.now(); apply(doc, nl, compiled, solveDC(compiled.circuit), performance.now() - t); }
}

let timer: ReturnType<typeof setTimeout> | undefined;
let unsub: (() => void) | null = null;

export const useSim = create<SimState>()((set) => ({
  running: false,
  interp: null,
  result: null,
  solveMs: 0,
  blown: new Set(),
  start: () => {
    set({ running: true, blown: new Set(), interp: null, result: null });
    run();
    unsub?.();
    unsub = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      clearTimeout(timer);
      timer = setTimeout(run, 16);
    });
    useEditor.getState().log('ok', 'Simulação DC iniciada');
  },
  stop: () => {
    unsub?.(); unsub = null; clearTimeout(timer);
    set({ running: false, interp: null, result: null, blown: new Set() });
    useEditor.getState().log('info', 'Simulação parada');
  },
}));
