/// <reference lib="webworker" />
import { solveDC } from './solver';
import type { SimCircuit } from './types';

self.onmessage = (e: MessageEvent<{ id: number; circuit: SimCircuit }>) => {
  const t0 = performance.now();
  try {
    const result = solveDC(e.data.circuit);
    (self as unknown as Worker).postMessage({ id: e.data.id, result, ms: performance.now() - t0 });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id: e.data.id, error: String(err) });
  }
};
