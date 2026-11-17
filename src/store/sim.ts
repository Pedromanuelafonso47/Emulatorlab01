/**
 * Simulation session. Compiles the document on the main thread, runs the real-time transient
 * runner in a Web Worker (fallback: main thread), interprets each frame and keeps sample buffers
 * for the oscilloscope, frequency counter and AC meters.
 */
import { create } from 'zustand';
import type { CircuitDocument } from '@/domain/types';
import { pinKey, type Netlist } from '@/engine/netlist';
import { compile, type Compiled } from '@/engine/sim/compile';
import { interpret, meterFmt, type Interpretation } from '@/engine/sim/interpret';
import { SimRunner, type Frame, type RunnerSettings } from '@/engine/sim/runner';
import { SampleBuffer, acRms, buildScope, measure, type ScopeSettings } from '@/engine/sim/scope';
import type { McuEvent, McuProgram, McuSnapshot } from '@/mcu/host';
import { McuHost } from '@/mcu/host';
import { getDef } from '@/library/registry';
import { useEditor } from './editor';
import { analyze } from './derived';
import { buildPrograms } from '@/mcu/programs';
import { compileForBoard, isEmulatedBoard } from '@/mcu/avr/compile';

export type SpeedSetting = 'auto' | 1 | 0.1 | 0.01 | 0.001;

interface SimState {
  running: boolean;
  interp: Interpretation | null;
  simTime: number;
  speed: number;
  dynamic: boolean;
  dt: number;
  speedSetting: SpeedSetting;
  blown: Set<string>;
  serial: Record<string, string>;
  mcu: McuSnapshot[];
  start: () => void;
  stop: () => void;
  setSpeed: (s: SpeedSetting) => void;
  sendSerial: (compId: string, text: string) => void;
  clearSerial: (compId: string) => void;
}

interface Job { doc: CircuitDocument; nl: Netlist; compiled: Compiled; probeNets: string[] }

const buffer = new SampleBuffer();
export const sampleBuffer = buffer;
const jobs = new Map<number, Job>();
let version = 0;
let worker: Worker | null = null;
let workerBroken = false;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let fallback: { runner: SimRunner; mcu: McuHost; timer: ReturnType<typeof setInterval>; last: number } | null = null;

/** Instrument nodes that need waveform samples. */
function probesFor(doc: CircuitDocument, nl: Netlist, cp: Compiled): { nodes: number[]; nets: string[] } {
  const nets = new Set<string>();
  for (const c of Object.values(doc.components)) {
    const pins = c.type === 'oscilloscope' ? ['CH1', 'CH2', 'GND'] : c.type === 'frequency-counter' ? ['IN', 'GND'] : c.type === 'multimeter' && c.props.mode === 'acv' ? ['VOHM', 'COM'] : [];
    for (const p of pins) { const n = nl.pinNet.get(pinKey(c.id, p)); if (n && cp.netNode.has(n)) nets.add(n); }
  }
  const list = [...nets];
  return { nets: list, nodes: list.map((n) => cp.netNode.get(n)!) };
}

/** Time step: resolve the fastest source / scope time base; run as close to real time as the CPU budget allows. */
function timing(doc: CircuitDocument, speed: SpeedSetting): { dt: number; timeScale: number } {
  let dt = 1e-4;
  for (const c of Object.values(doc.components)) {
    const f = c.type === 'signal-generator' || c.type === 'ac-source' ? Number(c.props.frequency) : 0;
    if (f > 0) dt = Math.min(dt, 1 / (f * 80));
    if (c.type === 'oscilloscope') dt = Math.min(dt, Number(c.props.tdiv) * 10 / 500);
  }
  dt = Math.max(2e-7, Math.min(1e-3, dt));
  const budget = 120000 * dt;      // ≤ 120k steps per real second
  const timeScale = speed === 'auto' ? Math.min(1, budget) : speed;
  return { dt, timeScale };
}

function getWorker(): Worker | null {
  if (worker || workerBroken || typeof Worker === 'undefined') return worker;
  try {
    worker = new Worker(new URL('../engine/sim/worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e: MessageEvent<{ type: string; frame?: Frame | null; mcu?: McuEvent[]; mcuState?: McuSnapshot[]; error?: string }>) => {
      clearTimeout(watchdog);
      if (e.data.type === 'error') { useEditor.getState().notify(`Erro no simulador: ${e.data.error}`, 'error'); return; }
      onFrame(e.data.frame ?? null, e.data.mcu ?? [], e.data.mcuState ?? []);
    };
    worker.onerror = () => { worker?.terminate(); worker = null; workerBroken = true; startFallback(); };
  } catch { worker = null; workerBroken = true; }
  return worker;
}

function startFallback() {
  if (fallback || !useSim.getState().running) return;
  const runner = new SimRunner();
  const mcu = new McuHost();
  runner.hook = (t, dt, eng) => mcu.step(t, dt, eng);
  fallback = {
    runner, mcu, last: performance.now(),
    timer: setInterval(() => {
      const now = performance.now();
      const fr = runner.advance(Math.min(0.1, (now - fallback!.last) / 1000));
      fallback!.last = now;
      const ev = mcu.drain();
      if (fr || ev.length) onFrame(fr, ev, mcu.snapshot());
    }, 33),
  };
  useEditor.getState().log('warn', 'Web Worker indisponível — a simulação corre na thread principal.');
  load();
}

let loadSeq = 0;

/**
 * Compiles the sketches of the emulated boards (Uno, Nano) to HEX. A board whose sketch cannot be
 * compiled because the compile service is off, or because it needs a library the compiler does not
 * have, keeps running on the built-in interpreter; a real compile error stops that board and is shown.
 */
async function withFirmware(programs: McuProgram[]): Promise<McuProgram[]> {
  const out: McuProgram[] = [];
  for (const p of programs) {
    if (!isEmulatedBoard(p.board)) { out.push(p); continue; }
    const r = await compileForBoard(p.board, p.code);
    const label = useEditor.getState().doc.components[p.compId]?.label ?? p.compId;
    if (r.kind === 'hex') out.push({ ...p, hex: r.hex });
    else if (r.kind === 'error') {
      out.push({ ...p, compileErrors: r.errors });
      for (const e of r.errors) useEditor.getState().log('error', `${label} · linha ${e.line}: ${e.message}`);
    } else {
      const why = r.kind === 'library' ? `a biblioteca ${r.header} não existe no compilador` : r.reason;
      useEditor.getState().log('warn', `${label}: executa no interpretador (${why}).`);
      out.push(p);
    }
  }
  return out;
}

async function load() {
  const st = useSim.getState();
  if (!st.running) return;
  const seq = ++loadSeq;
  const doc = useEditor.getState().doc;
  const { nl } = analyze(doc);
  let compiled: Compiled;
  let programs: McuProgram[] = [];
  try {
    compiled = compile(doc, nl, st.blown);
    programs = buildPrograms(doc, nl, compiled);
  } catch (e) { useEditor.getState().notify(`Erro ao preparar o circuito: ${(e as Error).message}`, 'error'); return; }
  programs = await withFirmware(programs);
  if (seq !== loadSeq || !useSim.getState().running) return;   // a newer load superseded this one
  const { nodes, nets } = probesFor(doc, nl, compiled);
  const { dt, timeScale } = timing(doc, st.speedSetting);
  const settings: RunnerSettings = { dt, timeScale, probes: nodes };
  const v = ++version;
  jobs.set(v, { doc, nl, compiled, probeNets: nets });
  for (const k of jobs.keys()) if (k < v - 5) jobs.delete(k);
  useSim.setState({ dt });
  if (fallback) { fallback.runner.load(fallback.mcu.load(programs, compiled.circuit), v, settings); return; }
  const w = getWorker();
  if (!w) { startFallback(); return; }
  w.postMessage({ type: 'load', circuit: compiled.circuit, version: v, settings, programs });
  clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    if (!useSim.getState().interp && useSim.getState().running) { workerBroken = true; worker?.terminate(); worker = null; startFallback(); }
  }, 1500);
}

function scopeSettings(p: Record<string, unknown>): ScopeSettings {
  const n = (k: string, d: number) => (typeof p[k] === 'number' ? (p[k] as number) : p[k] !== undefined && isFinite(+String(p[k])) ? +String(p[k]) : d);
  return {
    tdiv: n('tdiv', 1e-3), vdiv1: n('vdiv1', 1), vdiv2: n('vdiv2', 1), off1: n('off1', 0), off2: n('off2', 0),
    trigSource: p.trigSource === 'ch2' ? 'ch2' : 'ch1', trigEdge: p.trigEdge === 'fall' ? 'fall' : 'rise', trigLevel: n('trigLevel', 0.5),
    coupling1: p.coupling1 === 'ac' ? 'ac' : 'dc', coupling2: p.coupling2 === 'ac' ? 'ac' : 'dc',
  };
}

function onFrame(frame: Frame | null, events: McuEvent[], mcuState: McuSnapshot[]) {
  const st = useSim.getState();
  if (!st.running) return;
  if (events.length) {
    const serial = { ...st.serial };
    for (const ev of events) {
      if (ev.kind === 'serial') serial[ev.compId] = ((serial[ev.compId] ?? '') + ev.text).slice(-20000);
      else useEditor.getState().log(ev.kind === 'error' ? 'error' : 'info', ev.text);
    }
    useSim.setState({ serial });
  }
  if (mcuState.length) useSim.setState({ mcu: mcuState });
  if (!frame) return;
  const job = jobs.get(frame.version);
  if (!job) return;
  buffer.push(frame.sampleT, job.probeNets, frame.samples);
  const diff = (a: string | undefined, b: string | undefined) => {
    const va = a ? buffer.get(a) : null, vb = b ? buffer.get(b) : null;
    if (!va) return null;
    return va.map((x, i) => x - (vb ? vb[i] : 0));
  };
  const net = (c: string, p: string) => job.nl.pinNet.get(pinKey(c, p));
  const interp = interpret(job.doc, job.nl, job.compiled, frame.result, {
    acRms: (compId) => {
      const v = diff(net(compId, 'VOHM'), net(compId, 'COM'));
      if (!v || v.length < 4) return 0;
      const n0 = Math.max(0, v.length - 4000);
      return acRms(buffer.t.slice(n0), v.slice(n0));
    },
  });
  // Instruments that read waveforms
  for (const c of Object.values(job.doc.components)) {
    if (c.type === 'oscilloscope') {
      const g = net(c.id, 'GND');
      const v1 = diff(net(c.id, 'CH1'), g), v2 = diff(net(c.id, 'CH2'), g);
      const view = buildScope(buffer.t, v1, v2, scopeSettings(c.props));
      interp.states[c.id] = { ...(interp.states[c.id] ?? {}), view };
    } else if (c.type === 'frequency-counter') {
      const v = diff(net(c.id, 'IN'), net(c.id, 'GND'));
      const n0 = v ? Math.max(0, v.length - 20000) : 0;
      const m = v ? measure(buffer.t.slice(n0), v.slice(n0)) : null;
      interp.states[c.id] = m?.freq ? meterFmt(m.freq, 'Hz') : { display: frame.dynamic ? '0.000' : '- - - -', unit: 'Hz' };
    }
  }
  let blown = st.blown;
  if (interp.blown.some((id) => !blown.has(id))) blown = new Set([...blown, ...interp.blown]);
  useSim.setState({ interp, simTime: frame.t, speed: frame.speed, dynamic: frame.dynamic, blown });
}

let timer: ReturnType<typeof setTimeout> | undefined;
let unsub: (() => void) | null = null;

export const useSim = create<SimState>()((set, get) => ({
  running: false,
  interp: null,
  simTime: 0,
  speed: 0,
  dynamic: false,
  dt: 1e-4,
  speedSetting: 'auto',
  blown: new Set(),
  serial: {},
  mcu: [],
  start: () => {
    buffer.reset();
    set({ running: true, blown: new Set(), interp: null, simTime: 0, serial: {}, mcu: [] });
    load();
    unsub?.();
    unsub = useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc) return;
      clearTimeout(timer);
      timer = setTimeout(load, 30);
    });
    useEditor.getState().log('ok', 'Simulação iniciada');
  },
  stop: () => {
    unsub?.(); unsub = null; clearTimeout(timer); clearTimeout(watchdog);
    worker?.postMessage({ type: 'stop' });
    worker?.terminate(); worker = null;
    if (fallback) { clearInterval(fallback.timer); fallback = null; }
    buffer.reset();
    set({ running: false, interp: null, blown: new Set(), simTime: 0, speed: 0, mcu: [] });
    useEditor.getState().log('info', 'Simulação parada');
  },
  setSpeed: (s) => { set({ speedSetting: s }); if (get().running) load(); },
  sendSerial: (compId, text) => {
    if (fallback) fallback.mcu.serialIn(compId, text);
    else worker?.postMessage({ type: 'serial-in', compId, text });
  },
  clearSerial: (compId) => set({ serial: { ...get().serial, [compId]: '' } }),
}));

export function isInstrument(type: string) { return getDef(type)?.category === 'instruments'; }
