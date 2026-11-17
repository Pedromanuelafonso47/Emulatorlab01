import { describe, it, expect } from 'vitest';
import '@/library';
import { allDefs } from '@/library/registry';
import { MODELS } from './models';

describe('library status matches the electrical models', () => {
  it('every component shows the status of its engine model', () => {
    const mismatches = allDefs()
      .filter((d) => MODELS[d.type] && MODELS[d.type].status !== d.sim.status)
      .map((d) => `${d.type}: biblioteca=${d.sim.status}, modelo=${MODELS[d.type].status}`);
    expect(mismatches).toEqual([]);
  });
});
