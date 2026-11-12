/**
 * Local project storage (Phase 1). Phase 7 replaces the backend of these functions with the REST API;
 * the document format stays the same.
 */
import type { CircuitDocument } from '@/domain/types';

const KEY = 'electrolab.projects.v1';
const LAST = 'electrolab.lastProject';

export interface StoredProject { id: string; name: string; updatedAt: number; doc: CircuitDocument }

function readAll(): Record<string, StoredProject> {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}'); } catch { return {}; }
}
function writeAll(all: Record<string, StoredProject>) {
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function listProjects(): StoredProject[] {
  return Object.values(readAll()).sort((a, b) => b.updatedAt - a.updatedAt);
}

export function saveProject(id: string, doc: CircuitDocument): StoredProject {
  const all = readAll();
  const p = { id, name: doc.name, updatedAt: Date.now(), doc };
  all[id] = p;
  writeAll(all);
  localStorage.setItem(LAST, id);
  return p;
}

export function loadProject(id: string): StoredProject | null {
  return readAll()[id] ?? null;
}

export function deleteProject(id: string) {
  const all = readAll();
  delete all[id];
  writeAll(all);
}

export function lastProjectId(): string | null {
  try { return localStorage.getItem(LAST); } catch { return null; }
}

export function validateDocument(x: unknown): x is CircuitDocument {
  const d = x as CircuitDocument;
  return !!d && d.version === 1 && typeof d.components === 'object' && typeof d.wires === 'object' && typeof d.junctions === 'object';
}
