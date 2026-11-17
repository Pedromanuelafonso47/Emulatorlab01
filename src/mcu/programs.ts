/**
 * Builds the microcontroller programs for the simulation: one per board that has a sketch,
 * with the netlist node of each board pin (−1 when the pin is not wired) and the DHT sensors
 * wired to those pins.
 */
import type { CircuitDocument } from '@/domain/types';
import { pinKey, type Netlist } from '@/engine/netlist';
import type { Compiled } from '@/engine/sim/compile';
import { getDef, getPins } from '@/library/registry';
import { BOARDS } from './boards';
import type { DhtSensor, McuPinRef, McuProgram } from './host';

export { isExecutableBoard } from './boards';

export function buildPrograms(doc: CircuitDocument, nl: Netlist, cp: Compiled): McuProgram[] {
  const out: McuProgram[] = [];
  const dhts = Object.values(doc.components).filter((c) => c.type.startsWith('dht'));
  for (const c of Object.values(doc.components)) {
    const spec = BOARDS[c.type];
    const code = c.props.sketch;
    if (!spec || typeof code !== 'string' || !code.trim()) continue;
    const def = getDef(c.type);
    if (!def) continue;
    const nodeOf = (compId: string, pinId: string): number => {
      const net = nl.pinNet.get(pinKey(compId, pinId));
      const node = net !== undefined ? cp.netNode.get(net) : undefined;
      return node ?? -1;
    };
    const pins: Record<string, McuPinRef> = {};
    for (const p of getPins(def, c.props)) {
      if (!/^[DA]\d+$/.test(p.id)) continue;   // only digital and analog I/O are driven
      pins[p.id] = { node: nodeOf(c.id, p.id), pwm: spec.pwm === 'all' || spec.pwm.has(p.id) };
    }
    // DHT sensors whose DATA pin shares a net with one of this board's pins
    const sensors: Record<string, DhtSensor> = {};
    for (const d of dhts) {
      const dataNet = nl.pinNet.get(pinKey(d.id, 'DATA'));
      if (!dataNet) continue;
      for (const pinId of Object.keys(pins)) {
        if (nl.pinNet.get(pinKey(c.id, pinId)) !== dataNet) continue;
        sensors[pinId] = {
          model: d.type === 'dht22' ? 22 : 11,
          temperature: Number(d.props.temperature),
          humidity: Number(d.props.humidity),
          vccNode: nodeOf(d.id, 'VCC'),
        };
      }
    }
    out.push({ compId: c.id, board: c.type, code, vcc: spec.vcc, vref: spec.vref, pins, sensors });
  }
  return out;
}
