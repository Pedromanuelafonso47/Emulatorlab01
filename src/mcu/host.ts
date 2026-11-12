/** Microcontroller host — runs sketches inside the simulation loop (implemented in Phase 5). */
import type { Engine } from '@/engine/sim/solver';
import type { SimCircuit } from '@/engine/sim/types';

export interface McuProgram { compId: string; board: string; code: string; pins: Record<string, McuPinRef> }
export interface McuPinRef { node: number; hi: number; lo: number; pu: number }
export interface McuEvent { compId: string; kind: 'serial' | 'error' | 'status'; text: string }
export interface McuSnapshot { compId: string; running: boolean; pins: Record<string, { mode: string; value: number }>; servo?: Record<string, number>; error?: string }

export class McuHost {
  load(_programs: McuProgram[], _circuit: SimCircuit) {}
  step(_t: number, _dt: number, _eng: Engine) {}
  serialIn(_compId: string, _text: string) {}
  drain(): McuEvent[] { return []; }
  snapshot(): McuSnapshot[] { return []; }
}
