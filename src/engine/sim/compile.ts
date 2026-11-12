/** Turns a circuit document + netlist into solver elements. Runs on the main thread (needs the library registry). */
import type { CircuitDocument } from '@/domain/types';
import { getDef, getPins } from '@/library/registry';
import { pinKey, type Netlist } from '@/engine/netlist';
import type { Element, Owner, SimCircuit } from './types';
import { INTERCONNECT, MODELS, type ModelCtx } from './models';

export interface Compiled {
  circuit: SimCircuit;
  netNode: Map<string, number>;       // net id → node index
  groundNet: string | null;
  hasSource: boolean;
  unsupported: { compId: string; note: string }[];
  elementOwner: (string | null)[];    // element index → compId
  sourceOwners: string[];
  hasSourceOtherThan: (compId: string) => boolean;
}

export function compile(doc: CircuitDocument, nl: Netlist, blown: Set<string> = new Set()): Compiled {
  // Ground: GND net → negative of the first source → (fallback) first node used.
  let groundNet: string | null = nl.meaningful.find((n) => n.name === 'GND')?.id ?? null;
  if (!groundNet) {
    for (const c of Object.values(doc.components)) {
      const def = getDef(c.type);
      if (!def || def.category !== 'power') continue;
      const neg = getPins(def, c.props).find((p) => p.polarity === '-');
      if (neg) { groundNet = nl.pinNet.get(pinKey(c.id, neg.id)) ?? null; break; }
    }
  }
  const first = build(doc, nl, blown, groundNet);
  if (groundNet || first.circuit.nodeCount < 2) return first;
  const firstReal = first.circuit.nodeNets.slice(1).find((n) => !n.startsWith('__'));
  return firstReal ? build(doc, nl, blown, firstReal) : first;
}

function build(doc: CircuitDocument, nl: Netlist, blown: Set<string>, groundNet: string | null): Compiled {
  const netNode = new Map<string, number>();
  const nodeNets: string[] = [groundNet ?? '__gnd'];
  if (groundNet) netNode.set(groundNet, 0);
  let nodeCount = 1;
  const nodeOfNet = (net: string) => {
    let n = netNode.get(net);
    if (n === undefined) { n = nodeCount++; netNode.set(net, n); nodeNets.push(net); }
    return n;
  };

  const elements: Element[] = [];
  const elementOwner: (string | null)[] = [];
  const unsupported: Compiled['unsupported'] = [];
  let hasSource = false;
  const sourceOwners: string[] = [];

  for (const inst of Object.values(doc.components)) {
    const def = getDef(inst.type);
    if (!def || def.tool || def.comingSoon || INTERCONNECT.has(inst.type)) continue;
    const model = MODELS[inst.type];
    if (!model?.build) {
      unsupported.push({ compId: inst.id, note: model?.note ?? 'Sem modelo elétrico nesta fase.' });
      continue;
    }
    const pins = getPins(def, inst.props);
    const props = blown.has(inst.id) ? { ...inst.props, blown: true } : inst.props;
    const ctx: ModelCtx = {
      props,
      node: (pinId) => {
        const net = nl.pinNet.get(pinKey(inst.id, pinId));
        if (!net) throw new Error(inst.type + ': pino desconhecido ' + pinId);
        return nodeOfNet(net);
      },
      pinByName: (name) => pins.find((p) => p.name === name)?.id,
      internal: () => { nodeNets.push('__int' + nodeCount); return nodeCount++; },
      add: (e) => {
        if (e.k === 'V' || e.k === 'I' || e.k === 'SUPPLY') { hasSource = true; sourceOwners.push(inst.id); }
        elements.push(e); elementOwner.push(inst.id); return elements.length - 1;
      },
      own: (...p): Owner => ({ compId: inst.id, pins: p }),
    };
    model.build(ctx);
  }
  return { circuit: { nodeCount, nodeNets, elements }, netNode, groundNet, hasSource, unsupported, elementOwner, sourceOwners, hasSourceOtherThan: (id) => sourceOwners.some((o) => o !== id) };
}
