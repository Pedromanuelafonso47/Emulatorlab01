import type { CircuitDocument } from '@/domain/types';
import type { Netlist } from '@/engine/netlist';
import { compile } from './compile';
import { solveDC } from './solver';
import { interpret } from './interpret';

/** Synchronous end-to-end DC simulation (used by tests and as a fallback when Workers are unavailable). */
export function simulateDC(doc: CircuitDocument, nl: Netlist, blown: Set<string> = new Set()) {
  const compiled = compile(doc, nl, blown);
  const result = solveDC(compiled.circuit);
  return { compiled, result, interp: interpret(doc, nl, compiled, result) };
}

export { compile, solveDC, interpret };
export { modelStatus } from './models';
