/**
 * Netlist extraction — the bridge between the visual document and the electrical solver.
 * Nodes are joined by: wires, junctions, component-internal connections (breadboard strips,
 * switches, tied power pins) and coincident pins (a lead inserted into a breadboard hole/socket).
 */
import type { CircuitDocument, ComponentInstance, Endpoint, Point } from '@/domain/types';
import { transformPoint } from '@/domain/geometry';
import { getDef, getInternal, getPins } from '@/library/registry';
import type { PinDef } from '@/library/types';

export interface PinRef { compId: string; pinId: string }
export interface Net {
  id: string;
  name: string;
  pins: PinRef[];           // all pins, incl. breadboard holes
  devicePins: PinRef[];     // pins of real devices (not substrate)
  wires: string[];
  junctions: string[];
}
export interface Netlist {
  nets: Net[];
  netById: Map<string, Net>;
  pinNet: Map<string, string>;        // "compId:pinId" → net id
  wireNet: Map<string, string>;
  junctionNet: Map<string, string>;
  /** Nets worth showing: ≥1 device pin and (≥2 device pins or a wire) */
  meaningful: Net[];
}

export const pinKey = (compId: string, pinId: string) => `${compId}:${pinId}`;

export function pinWorld(inst: ComponentInstance, pin: PinDef): Point {
  return transformPoint(pin, inst, inst.rotation, inst.flip);
}

export function endpointWorld(doc: CircuitDocument, ep: Endpoint): Point | null {
  if (ep.kind === 'junction') {
    const j = doc.junctions[ep.junctionId];
    return j ? { x: j.x, y: j.y } : null;
  }
  const inst = doc.components[ep.compId];
  if (!inst) return null;
  const def = getDef(inst.type);
  if (!def) return null;
  const pin = getPins(def, inst.props).find((p) => p.id === ep.pinId);
  return pin ? pinWorld(inst, pin) : null;
}

class UnionFind {
  parent = new Map<string, string>();
  add(k: string) { if (!this.parent.has(k)) this.parent.set(k, k); }
  find(k: string): string {
    let r = k;
    while (this.parent.get(r) !== r) r = this.parent.get(r)!;
    let c = k;
    while (c !== r) { const n = this.parent.get(c)!; this.parent.set(c, r); c = n; }
    return r;
  }
  union(a: string, b: string) { this.add(a); this.add(b); const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.parent.set(ra, rb); }
}

const epKey = (ep: Endpoint) => (ep.kind === 'pin' ? `p:${pinKey(ep.compId, ep.pinId)}` : `j:${ep.junctionId}`);

export function buildNetlist(doc: CircuitDocument): Netlist {
  const uf = new UnionFind();
  const buckets = new Map<string, string[]>();
  const pinInfo = new Map<string, { ref: PinRef; pin: PinDef; substrate: boolean }>();

  for (const inst of Object.values(doc.components)) {
    const def = getDef(inst.type);
    if (!def || def.tool) continue;
    for (const pin of getPins(def, inst.props)) {
      const k = `p:${pinKey(inst.id, pin.id)}`;
      uf.add(k);
      pinInfo.set(k, { ref: { compId: inst.id, pinId: pin.id }, pin, substrate: !!def.substrate });
      const w = pinWorld(inst, pin);
      const bk = `${Math.round(w.x)},${Math.round(w.y)}`;
      const b = buckets.get(bk);
      if (b) b.push(k); else buckets.set(bk, [k]);
    }
    for (const group of getInternal(def, inst.props)) {
      for (let i = 1; i < group.length; i++) uf.union(`p:${pinKey(inst.id, group[0])}`, `p:${pinKey(inst.id, group[i])}`);
    }
  }
  // Coincident pins of *different* components are electrically joined (inserted lead).
  for (const keys of buckets.values()) {
    if (keys.length < 2) continue;
    for (let i = 1; i < keys.length; i++) {
      const a = pinInfo.get(keys[0])!, b = pinInfo.get(keys[i])!;
      if (a.ref.compId !== b.ref.compId) uf.union(keys[0], keys[i]);
    }
  }
  for (const j of Object.values(doc.junctions)) uf.add(`j:${j.id}`);
  for (const w of Object.values(doc.wires)) {
    const a = epKey(w.from), b = epKey(w.to);
    if (uf.parent.has(a) && uf.parent.has(b)) uf.union(a, b);
  }

  const groups = new Map<string, Net>();
  const get = (root: string) => {
    let n = groups.get(root);
    if (!n) { n = { id: root, name: '', pins: [], devicePins: [], wires: [], junctions: [] }; groups.set(root, n); }
    return n;
  };
  for (const [k, info] of pinInfo) {
    const n = get(uf.find(k));
    n.pins.push(info.ref);
    if (!info.substrate) n.devicePins.push(info.ref);
  }
  for (const j of Object.values(doc.junctions)) get(uf.find(`j:${j.id}`)).junctions.push(j.id);
  for (const w of Object.values(doc.wires)) {
    const a = epKey(w.from);
    if (uf.parent.has(a)) get(uf.find(a)).wires.push(w.id);
  }

  const nets = [...groups.values()];
  const meaningful = nets.filter((n) => new Set(n.devicePins.map((p) => p.compId)).size >= 2 || (n.devicePins.length >= 1 && n.wires.length > 0));

  // Naming: GND, <source>+, named supply pins, otherwise N1, N2…
  let counter = 1;
  const used = new Set<string>();
  for (const n of meaningful) {
    let name = '';
    for (const r of n.devicePins) {
      const info = pinInfo.get(`p:${pinKey(r.compId, r.pinId)}`)!;
      const comp = doc.components[r.compId];
      if (info.pin.role === 'ground' && (info.pin.polarity === '-' || /GND|VSS/i.test(info.pin.name))) { name = 'GND'; break; }
      if (info.pin.role === 'power' && info.pin.polarity === '+' && comp) name ||= `${comp.label}+`;
      else if (info.pin.role === 'power' && /^(5V|3V3|3\.3V|VIN|VCC|VDD)/i.test(info.pin.name)) name ||= info.pin.name.toUpperCase();
    }
    if (!name) name = `N${counter++}`;
    else if (name !== 'GND' && used.has(name)) name = `${name}_${counter++}`;
    used.add(name);
    n.name = name;
  }
  for (const n of nets) if (!n.name) n.name = '(sem ligação)';

  const pinNet = new Map<string, string>(), wireNet = new Map<string, string>(), junctionNet = new Map<string, string>(), netById = new Map<string, Net>();
  for (const n of nets) {
    netById.set(n.id, n);
    n.pins.forEach((p) => pinNet.set(pinKey(p.compId, p.pinId), n.id));
    n.wires.forEach((w) => wireNet.set(w, n.id));
    n.junctions.forEach((j) => junctionNet.set(j, n.id));
  }
  return { nets, netById, pinNet, wireNet, junctionNet, meaningful };
}

/** True if the given pin is connected to anything besides its own component (wire, other device, or substrate). */
export function isPinConnected(nl: Netlist, compId: string, pinId: string): boolean {
  const id = nl.pinNet.get(pinKey(compId, pinId));
  if (!id) return false;
  const n = nl.netById.get(id)!;
  return n.wires.length > 0 || n.pins.some((p) => p.compId !== compId);
}
