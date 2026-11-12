/** Editor-level hit testing helpers (pure functions over the document). */
import type { CircuitDocument, Point, Wire } from '@/domain/types';
import { dist2, projectOnSegment } from '@/domain/geometry';
import { getDef, getPins } from '@/library/registry';
import { endpointWorld, pinWorld } from '@/engine/netlist';

export interface PinHit { compId: string; pinId: string; x: number; y: number; name: string; substrate: boolean }

/** World positions of all pins (device pins listed after substrate pins). */
export function collectPins(doc: CircuitDocument): PinHit[] {
  const out: PinHit[] = [];
  const devices: PinHit[] = [];
  for (const inst of Object.values(doc.components)) {
    const def = getDef(inst.type);
    if (!def || def.tool) continue;
    const list = def.substrate ? out : devices;
    for (const pin of getPins(def, inst.props)) {
      const w = pinWorld(inst, pin);
      list.push({ compId: inst.id, pinId: pin.id, x: w.x, y: w.y, name: pin.name, substrate: !!def.substrate });
    }
  }
  return out.concat(devices);
}

/** Nearest pin within radius; device pins win over substrate holes at equal distance. */
export function hitPin(pins: PinHit[], p: Point, radius: number): PinHit | null {
  let best: PinHit | null = null;
  let bd = radius * radius;
  for (const pin of pins) {
    const d = dist2(pin, p);
    if (d < bd || (best && d <= bd + 0.01 && best.substrate && !pin.substrate)) { bd = d; best = pin; }
  }
  return best;
}

export function wirePath(doc: CircuitDocument, w: Wire): Point[] | null {
  const a = endpointWorld(doc, w.from), b = endpointWorld(doc, w.to);
  if (!a || !b) return null;
  return [a, ...w.points, b];
}

export interface WireHit { wireId: string; point: Point; segment: number }

export function hitWire(doc: CircuitDocument, p: Point, tol: number): WireHit | null {
  let best: WireHit | null = null;
  let bd = tol * tol;
  for (const w of Object.values(doc.wires)) {
    const pts = wirePath(doc, w);
    if (!pts) continue;
    for (let i = 0; i < pts.length - 1; i++) {
      const pr = projectOnSegment(p, pts[i], pts[i + 1]);
      if (pr.d2 < bd) { bd = pr.d2; best = { wireId: w.id, point: pr.point, segment: i }; }
    }
  }
  return best;
}

export const toPolyline = (pts: Point[]) => pts.map((p) => `${p.x},${p.y}`).join(' ');
