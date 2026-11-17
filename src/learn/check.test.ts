import { describe, it, expect } from 'vitest';
import '@/library';
import { EXAMPLES } from '@/persistence/examples';
import { buildNetlist } from '@/engine/netlist';
import { allLessons } from './lessons';
import { checkLesson } from './check';
import type { CircuitDocument } from '@/domain/types';

const find = (id: string) => allLessons().find((x) => x.lesson.id === id)!.lesson;
const empty: CircuitDocument = EXAMPLES[0].build();

describe('lesson validation against the netlist', () => {
  it('accepts the Arduino blink example for the Uno lesson (D13 → resistor → LED → GND)', () => {
    const doc = structuredClone(EXAMPLES.find((e) => e.id === 'uno-blink-bb')!.build());
    const results = checkLesson(doc, buildNetlist(doc), find('uno-blink'));
    expect(results.slice(0, 3).every((r) => r.ok)).toBe(true);
  });

  it('reports missing parts and connections on an empty board', () => {
    const doc = structuredClone(empty);
    doc.components = {};
    doc.wires = {};
    const results = checkLesson(doc, buildNetlist(doc), find('led-resistor'));
    expect(results[0].ok).toBe(false);
    expect(results[0].missing.some((m) => m.includes('bateria'))).toBe(true);
    expect(results[1].ok).toBe(false);   // later steps wait for the first
  });

  it('every lesson step references parts that exist in the library', async () => {
    const { getDef } = await import('@/library/registry');
    for (const { lesson } of allLessons()) for (const s of lesson.steps) for (const p of s.parts) expect(getDef(p.type), p.type).toBeDefined();
  });
});

import { getDef, getPins, defaultProps } from '@/library/registry';
import { LEVELS } from './lessons';

describe('lesson content is consistent with the parts library', () => {
  it('every pin named in a lesson exists on that part', () => {
    const problems: string[] = [];
    for (const level of LEVELS) for (const lesson of level.lessons) {
      const typeOf = new Map<string, string>();
      for (const s of lesson.steps) for (const p of s.parts) typeOf.set(p.key, p.type);
      for (const s of lesson.steps) for (const [a, b] of s.connect) for (const end of [a, b]) {
        const type = typeOf.get(end.part);
        const def = type && getDef(type);
        if (!def) { problems.push(`${lesson.id}: parte ${end.part} sem tipo`); continue; }
        if (end.pin.startsWith('^')) continue;   // regex: matched against real ids at check time
        const ids = getPins(def, defaultProps(def)).map((p) => p.id);
        if (!ids.includes(end.pin)) problems.push(`${lesson.id}: ${type} não tem o pino "${end.pin}"`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('each lesson has at least one step and unique id', () => {
    const ids = LEVELS.flatMap((l) => l.lessons.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
    for (const l of LEVELS) for (const x of l.lessons) expect(x.steps.length).toBeGreaterThan(0);
  });
});
