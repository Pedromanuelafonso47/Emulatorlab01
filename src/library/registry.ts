import type { PropValue } from '@/domain/types';
import type { Rect } from '@/domain/geometry';
import type { ComponentDef, PinDef } from './types';
import { MODELS } from '@/engine/sim/models';

const registry = new Map<string, ComponentDef>();

export function registerComponent(def: ComponentDef) {
  if (registry.has(def.type)) throw new Error(`Componente duplicado: ${def.type}`);
  // The electrical model in the engine is the single source of truth for the simulation status shown in the library.
  const model = MODELS[def.type];
  const sim = model ? { ...def.sim, status: model.status, note: model.note ?? def.sim.note } : def.sim;
  registry.set(def.type, { ...def, sim });
}

export function getDef(type: string): ComponentDef | undefined {
  return registry.get(type);
}

export function allDefs(): ComponentDef[] {
  return [...registry.values()];
}

export function defaultProps(def: ComponentDef): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const p of def.props ?? []) out[p.key] = p.default;
  return out;
}

const pinCache = new WeakMap<ComponentDef, Map<string, PinDef[]>>();

export function getPins(def: ComponentDef, props: Record<string, PropValue>): PinDef[] {
  if (Array.isArray(def.pins)) return def.pins;
  let m = pinCache.get(def);
  if (!m) { m = new Map(); pinCache.set(def, m); }
  const key = JSON.stringify(props);
  let pins = m.get(key);
  if (!pins) { pins = def.pins(props); m.set(key, pins); }
  return pins;
}

export function getBBox(def: ComponentDef, props: Record<string, PropValue>): Rect {
  return typeof def.bbox === 'function' ? def.bbox(props) : def.bbox;
}

export function getInternal(def: ComponentDef, props: Record<string, PropValue>): string[][] {
  if (!def.internalConnections) return [];
  return typeof def.internalConnections === 'function' ? def.internalConnections(props) : def.internalConnections;
}

export function valueLabel(def: ComponentDef, props: Record<string, PropValue>): string {
  return def.valueLabel ? def.valueLabel(props) : '';
}
