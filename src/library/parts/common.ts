import type { PropValue } from '@/domain/types';
import { formatSI } from '@/domain/units';
import type { PropDef } from '../types';

export const num = (key: string, label: string, def: number, unit: string, extra: Partial<PropDef> = {}): PropDef =>
  ({ key, label, type: 'number', default: def, unit, si: true, ...extra });

export const sel = (key: string, label: string, def: string, options: [string, string][], extra: Partial<PropDef> = {}): PropDef =>
  ({ key, label, type: 'select', default: def, options: options.map(([value, label]) => ({ value, label })), ...extra });

export const bool = (key: string, label: string, def: boolean, extra: Partial<PropDef> = {}): PropDef =>
  ({ key, label, type: 'boolean', default: def, ...extra });

export const txt = (key: string, label: string, def: string, extra: Partial<PropDef> = {}): PropDef =>
  ({ key, label, type: 'text', default: def, ...extra });

export const si = (v: PropValue | undefined, unit: string) => formatSI(Number(v ?? 0), unit);

export const NO_SIM = { model: 'none', status: 'none' as const, note: 'Modelo elétrico previsto para a Fase 2/4.' };
export const sim = (model: string, note?: string) => ({ model, status: 'none' as const, note: note ?? 'Modelo definido; solver disponível a partir da Fase 2.' });
