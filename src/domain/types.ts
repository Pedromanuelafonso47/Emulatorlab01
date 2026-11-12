/** Core document model. Pure JSON — serialisable, diffable, history-friendly. */

export interface Point { x: number; y: number }

/** Rotation in quarter turns (0..3), clockwise. */
export type Rotation = 0 | 1 | 2 | 3;

export type PropValue = number | string | boolean;

export interface ComponentInstance {
  id: string;
  type: string;            // key into the component registry
  label: string;           // reference designator, e.g. "R1"
  x: number;               // world position of the component origin
  y: number;
  rotation: Rotation;
  flip?: boolean;          // mirror horizontally (before rotation)
  props: Record<string, PropValue>;
}

export type Endpoint =
  | { kind: 'pin'; compId: string; pinId: string }
  | { kind: 'junction'; junctionId: string };

export type WireStyle = 'wire' | 'jumper-mm' | 'jumper-mf' | 'jumper-ff';

export interface Wire {
  id: string;
  from: Endpoint;
  to: Endpoint;
  points: Point[];         // intermediate bend points (world coords)
  color: string;
  style: WireStyle;
}

export interface Junction { id: string; x: number; y: number }

export interface CircuitDocument {
  version: 1;
  name: string;
  components: Record<string, ComponentInstance>;
  wires: Record<string, Wire>;
  junctions: Record<string, Junction>;
}

export const GRID = 10; // world units; 1 grid = 0.1" = 2.54 mm (1 unit = 0.254 mm)

export function emptyDocument(name = 'Projeto sem título'): CircuitDocument {
  return { version: 1, name, components: {}, wires: {}, junctions: {} };
}

let idCounter = 0;
export function uid(prefix = 'id'): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}${idCounter.toString(36)}`;
}
