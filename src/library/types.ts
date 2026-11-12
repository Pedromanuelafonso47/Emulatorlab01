import type { ReactNode } from 'react';
import type { PropValue } from '@/domain/types';
import type { Rect } from '@/domain/geometry';

export type PinRole = 'passive' | 'power' | 'ground' | 'input' | 'output' | 'io' | 'analog' | 'nc';

export interface PinDef {
  id: string;
  name: string;          // shown to user, e.g. "Ânodo (+)", "D13", "VCC"
  x: number;             // local coords — must be multiples of GRID
  y: number;
  role?: PinRole;
  polarity?: '+' | '-';
  description?: string;
}

export type PropType = 'number' | 'select' | 'text' | 'boolean' | 'color';

export interface PropDef {
  key: string;
  label: string;
  type: PropType;
  default: PropValue;
  unit?: string;           // SI unit for number props (Ω, F, H, V, A, Hz, W)
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  /** Number props shown in SI notation (4.7 kΩ) */
  si?: boolean;
  hint?: string;
}

export type CategoryId =
  | 'passive' | 'semis' | 'ics' | 'power' | 'sensors' | 'actuators' | 'mcu' | 'assembly' | 'instruments';

/** Visual state driven by the simulator (Phase 2+). */
export interface VisualState {
  brightness?: number;     // LEDs, lamps: 0..1
  segments?: boolean[];    // 7-segment display
  angle?: number;          // motors / servo (deg)
  pressed?: boolean;
  [k: string]: unknown;
}

export interface RenderArgs {
  props: Record<string, PropValue>;
  state?: VisualState;
}

export type SimStatus = 'implemented' | 'partial' | 'none';

export interface ComponentDef {
  type: string;
  name: string;
  category: CategoryId;
  subcategory?: string;
  prefix: string;               // reference designator prefix: R, C, D, Q, U, ...
  description: string;
  tags?: string[];
  /** Local bounding box (for selection, hit, thumbnails). */
  bbox: Rect | ((props: Record<string, PropValue>) => Rect);
  pins: PinDef[] | ((props: Record<string, PropValue>) => PinDef[]);
  props?: PropDef[];
  /** Groups of pin ids that are internally connected (breadboard strips, tactile buttons...). */
  internalConnections?: string[][] | ((props: Record<string, PropValue>) => string[][]);
  render: (args: RenderArgs) => ReactNode;
  /** Short label for the canvas (value), e.g. "220 Ω". */
  valueLabel?: (props: Record<string, PropValue>) => string;
  datasheet?: { summary?: string; specs?: Record<string, string>; notes?: string[] };
  /** Electrical model metadata. Phase 1: declared only — no solver yet. */
  sim: { model: string; status: SimStatus; note?: string };
  /** Hide from library (e.g. internal) or mark as future */
  comingSoon?: string;
  /** Library entries that activate a tool instead of placing a component. */
  tool?: { kind: 'wire'; style: 'wire' | 'jumper-mm' | 'jumper-mf' | 'jumper-ff' };
  /** Components that act as a substrate (breadboard / perfboard): drawn below others, pins accept insertion. */
  substrate?: boolean;
}
