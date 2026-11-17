/**
 * Validates lesson steps against the circuit netlist: a step is done when every required part is
 * on the board and every connection's two pins share a net.
 */
import type { CircuitDocument, ComponentInstance } from '@/domain/types';
import type { Netlist } from '@/engine/netlist';
import { pinKey } from '@/engine/netlist';
import type { Lesson, LessonEnd, LessonStep } from './lessons';

export interface StepResult { ok: boolean; missing: string[] }

const labelOrder = (a: ComponentInstance, b: ComponentInstance) => a.label.localeCompare(b.label, undefined, { numeric: true });

/** Resolves lesson part keys to circuit components: the k-th key of a type maps to the k-th component of that type. */
export function resolveParts(doc: CircuitDocument, lesson: Lesson, upTo: number): Map<string, ComponentInstance> {
  const out = new Map<string, ComponentInstance>();
  const seen = new Map<string, number>();
  const all = Object.values(doc.components);
  const declared = lesson.steps.slice(0, upTo + 1).flatMap((s) => s.parts);
  for (const p of declared) {
    const index = seen.get(p.type) ?? 0;
    seen.set(p.type, index + 1);
    const candidates = all.filter((c) => c.type === p.type).sort(labelOrder);
    const found = candidates[index];
    if (found) out.set(p.key, found);
  }
  return out;
}

/** Exact pin id, or — when the spec starts with "^" — a regular expression (e.g. "^GND" matches GND_1, GND_2…). */
const pinMatches = (spec: string, id: string) => {
  if (!spec.startsWith('^')) return spec === id || (spec.startsWith('\\') && spec.slice(1) === id);
  try { return new RegExp(spec).test(id); } catch { return false; }
};

/** The pin ids of a component that match a lesson pin spec (exact id or regex). */
function matchingPins(nl: Netlist, inst: ComponentInstance, spec: string): string[] {
  const ids: string[] = [];
  for (const key of nl.pinNet.keys()) {
    const [cid, pid] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
    if (cid === inst.id && pinMatches(spec, pid)) ids.push(pid);
  }
  return ids;
}

/** Nets reached by any pin of the lesson end (a regex such as "^GND" may match several pins). */
function endNets(nl: Netlist, parts: Map<string, ComponentInstance>, end: LessonEnd): Set<string> {
  const inst = parts.get(end.part);
  const nets = new Set<string>();
  if (!inst) return nets;
  for (const pid of matchingPins(nl, inst, end.pin)) {
    const net = nl.pinNet.get(pinKey(inst.id, pid));
    if (net) nets.add(net);
  }
  return nets;
}

export function checkStep(doc: CircuitDocument, nl: Netlist, lesson: Lesson, index: number): StepResult {
  const step: LessonStep = lesson.steps[index];
  const parts = resolveParts(doc, lesson, index);
  const missing: string[] = [];
  for (const p of step.parts) if (!parts.has(p.key)) missing.push(`falta ${p.type === 'battery-9v' ? 'a bateria' : p.type}`);
  for (const [a, b] of step.connect) {
    const na = endNets(nl, parts, a), nb = endNets(nl, parts, b);
    const shared = [...na].some((n) => nb.has(n));
    if (!shared) missing.push(`ligar ${a.part} (${a.pin}) a ${b.part} (${b.pin})`);
  }
  return { ok: missing.length === 0, missing };
}

/** Checks steps in order; a step only counts once every earlier step is done. */
export function checkLesson(doc: CircuitDocument, nl: Netlist, lesson: Lesson): StepResult[] {
  const results: StepResult[] = [];
  let ready = true;
  lesson.steps.forEach((_, i) => {
    if (!ready) { results.push({ ok: false, missing: ['conclua o passo anterior'] }); return; }
    const r = checkStep(doc, nl, lesson, i);
    results.push(r);
    ready = r.ok;
  });
  return results;
}
