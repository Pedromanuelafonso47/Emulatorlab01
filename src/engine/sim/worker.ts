/// <reference lib="webworker" />
import { SimRunner, type RunnerSettings } from './runner';
import type { SimCircuit } from './types';
import { McuHost, type McuProgram } from '@/mcu/host';

type Msg =
  | { type: 'load'; circuit: SimCircuit; version: number; settings: RunnerSettings; programs?: McuProgram[] }
  | { type: 'settings'; settings: Partial<RunnerSettings> }
  | { type: 'serial-in'; compId: string; text: string }
  | { type: 'stop' };

const runner = new SimRunner();
const mcu = new McuHost();
runner.hook = (t, dt, eng) => mcu.step(t, dt, eng);
let timer: ReturnType<typeof setInterval> | null = null;
let last = 0;

function loop() {
  const now = performance.now();
  const real = Math.min(0.1, (now - last) / 1000);
  last = now;
  const frame = runner.advance(real);
  const mcuOut = mcu.drain();
  if (frame || mcuOut.length) (self as unknown as Worker).postMessage({ type: 'frame', frame, mcu: mcuOut, mcuState: mcu.snapshot() });
}

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data;
  try {
    if (m.type === 'load') {
      mcu.load(m.programs ?? [], m.circuit);
      runner.load(m.circuit, m.version, m.settings);
      if (!timer) { last = performance.now(); timer = setInterval(loop, 33); }
      loop();
    } else if (m.type === 'settings') runner.setSettings(m.settings);
    else if (m.type === 'serial-in') mcu.serialIn(m.compId, m.text);
    else if (m.type === 'stop') { if (timer) clearInterval(timer); timer = null; }
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', error: String((err as Error)?.message ?? err) });
  }
};
