/** Builds the microcontroller programs for the simulation (implemented in Phase 5). */
import type { CircuitDocument } from '@/domain/types';
import type { Netlist } from '@/engine/netlist';
import type { Compiled } from '@/engine/sim/compile';
import type { McuProgram } from './host';

export function buildPrograms(_doc: CircuitDocument, _nl: Netlist, _cp: Compiled): McuProgram[] { return []; }
