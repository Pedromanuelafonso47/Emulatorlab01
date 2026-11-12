/** Parametric package generators: DIP-n, TO-92, TO-220, generic PCB modules with header pins. */
import type { ReactNode } from 'react';
import type { Rect } from '@/domain/geometry';
import type { PinDef, PinRole } from '../types';
import { HeaderPin, Lead, LeadPath, MountHole, Txt } from './primitives';

export interface PinSpec { name: string; role?: PinRole; description?: string; polarity?: '+' | '-' }
export type PinSpecInput = string | PinSpec;
const spec = (p: PinSpecInput): PinSpec => (typeof p === 'string' ? { name: p } : p);

/** Guess pin role from a conventional name. */
export function guessRole(name: string): PinRole {
  const n = name.toUpperCase();
  if (/^(GND|VSS|VEE|0V|-|V-|K|CATHODE)$/.test(n) || n.startsWith('GND')) return 'ground';
  if (/^(VCC|VDD|V\+|\+|5V|3V3|3\.3V|VIN|VBAT|VS|IOREF|\+VS)$/.test(n)) return 'power';
  if (n === 'NC') return 'nc';
  if (/OUT|^Q\d?$|^Y\d?$|^TX/.test(n)) return 'output';
  if (/^A\d+$/.test(n)) return 'analog';
  if (/^(D|GP|GPIO|IO|P[A-D])\d+/.test(n)) return 'io';
  return 'input';
}

// ───────────────────────────── DIP ─────────────────────────────

export function dipLayout(n: number) {
  const half = n / 2;
  const off = Math.floor((half - 1) / 2) * 10;
  const xs = Array.from({ length: half }, (_, i) => i * 10 - off);
  return { half, xs, minX: xs[0], maxX: xs[half - 1], yBottom: 20, yTop: -10 };
}

export function dipPins(names: PinSpecInput[]): PinDef[] {
  const n = names.length;
  const { half, xs, yBottom, yTop } = dipLayout(n);
  return names.map((raw, i) => {
    const s = spec(raw);
    const bottom = i < half;
    const x = bottom ? xs[i] : xs[n - 1 - i];
    return {
      id: String(i + 1), name: `${i + 1} · ${s.name}`, x, y: bottom ? yBottom : yTop,
      role: s.role ?? guessRole(s.name), description: s.description, polarity: s.polarity,
    };
  });
}

export function dipBBox(n: number): Rect {
  const { minX, maxX } = dipLayout(n);
  return { x: minX - 7, y: -12, w: maxX - minX + 14, h: 34 };
}

export function DipBody({ n, label, sub, color = 'url(#g-black-flat)', textColor = '#d9dde2' }: {
  n: number; label: string; sub?: string; color?: string; textColor?: string;
}) {
  const { xs, minX, maxX, yBottom, yTop } = dipLayout(n);
  const x0 = minX - 6.5, x1 = maxX + 6.5;
  const by0 = -4.5, by1 = 14.5; // body y range (rows at -10 and 20)
  return (
    <g>
      {xs.map((x) => (
        <g key={x}>
          <rect x={x - 2.2} y={yTop - 2} width={4.4} height={by0 - yTop + 3} rx={0.6} fill="url(#g-metal-h)" stroke="#6f7782" strokeWidth={0.3} />
          <rect x={x - 2.2} y={by1 - 1} width={4.4} height={yBottom - by1 + 3} rx={0.6} fill="url(#g-metal-h)" stroke="#6f7782" strokeWidth={0.3} />
        </g>
      ))}
      <rect x={x0} y={by0} width={x1 - x0} height={by1 - by0} rx={1.2} fill={color} stroke="#000" strokeWidth={0.4} />
      <rect x={x0 + 0.6} y={by0 + 0.6} width={x1 - x0 - 1.2} height={1.2} fill="#fff" opacity={0.07} />
      <path d={`M${x0} ${5 - 3} A3 3 0 0 1 ${x0} ${5 + 3}`} fill="#0b0c0e" stroke="#000" strokeWidth={0.3} transform={`translate(0 0)`} />
      <circle cx={x0 + 3.2} cy={by1 - 3.2} r={1.1} fill="#0a0a0b" stroke="#3a3d42" strokeWidth={0.3} />
      <Txt x={(x0 + x1) / 2 + 1.5} y={sub ? 3 : 5} size={Math.min(5, (x1 - x0) / (label.length * 0.75))} fill={textColor}>{label}</Txt>
      {sub && <Txt x={(x0 + x1) / 2 + 1.5} y={8.6} size={2.6} fill="#9aa1aa" weight={500}>{sub}</Txt>}
    </g>
  );
}

// ───────────────────────────── TO-92 ─────────────────────────────

export const to92BBox: Rect = { x: -12, y: -16, w: 24, h: 38 };

export function to92Pins(names: [PinSpecInput, PinSpecInput, PinSpecInput]): PinDef[] {
  return names.map((raw, i) => {
    const s = spec(raw);
    return { id: String(i + 1), name: s.name, x: (i - 1) * 10, y: 20, role: s.role ?? guessRole(s.name), description: s.description };
  });
}

export function To92Body({ label, sub, pinLetters }: { label: string; sub?: string; pinLetters?: string[] }) {
  return (
    <g>
      <LeadPath d="M-3 4 L-3 9 L-10 15 L-10 20" />
      <Lead x1={0} y1={4} x2={0} y2={20} />
      <LeadPath d="M3 4 L3 9 L10 15 L10 20" />
      <path d="M-9 4 L-9 -9 Q-9 -15 -3 -15 L3 -15 Q9 -15 9 -9 L9 4 Z" fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.4} />
      <path d="M-8 -9 Q-8 -14 -3 -14 L3 -14" fill="none" stroke="#fff" strokeOpacity={0.15} strokeWidth={0.8} />
      <Txt x={0} y={-7} size={label.length > 6 ? 2.6 : 3.2} fill="#cfd3d8">{label}</Txt>
      {sub && <Txt x={0} y={-2.5} size={2.2} fill="#8d939b" weight={500}>{sub}</Txt>}
      {pinLetters && pinLetters.map((l, i) => <Txt key={i} x={(i - 1) * 5.4} y={1.5} size={2} fill="#7d838b">{l}</Txt>)}
    </g>
  );
}

// ───────────────────────────── TO-220 ─────────────────────────────

export const to220BBox: Rect = { x: -21, y: -42, w: 42, h: 74 };

export function to220Pins(names: [PinSpecInput, PinSpecInput, PinSpecInput]): PinDef[] {
  return names.map((raw, i) => {
    const s = spec(raw);
    return { id: String(i + 1), name: s.name, x: (i - 1) * 10, y: 30, role: s.role ?? guessRole(s.name), description: s.description };
  });
}

export function To220Body({ label, sub }: { label: string; sub?: string }) {
  return (
    <g>
      {[-10, 0, 10].map((x) => (
        <g key={x}>
          <rect x={x - 2.4} y={11} width={4.8} height={7} fill="url(#g-metal-h)" stroke="#6f7782" strokeWidth={0.3} />
          <Lead x1={x} y1={17} x2={x} y2={30} w={1.6} />
        </g>
      ))}
      <path d="M-20 -16 L-20 -38 Q-20 -41 -17 -41 L17 -41 Q20 -41 20 -38 L20 -16 Z" fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.5} />
      <circle cx={0} cy={-29} r={6} fill="#0e1116" stroke="#8a929c" strokeWidth={0.8} />
      <rect x={-20} y={-17} width={40} height={30} rx={1} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.5} />
      <rect x={-19} y={-16} width={38} height={1.4} fill="#fff" opacity={0.08} />
      <Txt x={0} y={-6} size={label.length > 7 ? 4 : 5} fill="#d4d8dd">{label}</Txt>
      {sub && <Txt x={0} y={1} size={2.8} fill="#8d939b" weight={500}>{sub}</Txt>}
    </g>
  );
}

// ───────────────────────────── PCB modules ─────────────────────────────

export interface ModuleSpec {
  w: number; h: number;                    // board size (units)
  x?: number; y?: number;                  // board top-left (default centred above header row)
  pcb?: 'blue' | 'teal' | 'green' | 'black' | 'red' | 'purple';
  pins: PinSpecInput[];                    // header row, left→right
  pinY?: number;                           // y of header row (default h/2 below origin = bottom edge)
  pinX0?: number;                          // x of first pin
  holes?: boolean;
  title?: string;
}

/**
 * Generic module with one header row along its bottom edge.
 * Origin = first pin hole; pins at (pinX0 + 10·i, pinY).
 */
export function moduleLayout(m: ModuleSpec) {
  const n = m.pins.length;
  const pinX0 = m.pinX0 ?? -Math.floor((n - 1) / 2) * 10;
  const pinY = m.pinY ?? 0;
  const bx = m.x ?? pinX0 + ((n - 1) * 10) / 2 - m.w / 2;
  const by = m.y ?? pinY - m.h + 6;
  return { n, pinX0, pinY, bx, by };
}

export function modulePins(m: ModuleSpec): PinDef[] {
  const { pinX0, pinY } = moduleLayout(m);
  return m.pins.map((raw, i) => {
    const s = spec(raw);
    return { id: s.name.replace(/\s+/g, '_') + (m.pins.filter((p) => spec(p).name === s.name).length > 1 ? `_${i}` : ''), name: s.name, x: pinX0 + i * 10, y: pinY, role: s.role ?? guessRole(s.name), description: s.description, polarity: s.polarity };
  });
}

export function moduleBBox(m: ModuleSpec): Rect {
  const { bx, by, pinY } = moduleLayout(m);
  return { x: bx, y: by, w: m.w, h: Math.max(m.h, pinY + 6 - by) };
}

export function ModuleBoard({ m, children }: { m: ModuleSpec; children?: ReactNode }) {
  const { bx, by, pinX0, pinY } = moduleLayout(m);
  const pins = modulePins(m);
  const fill = `url(#g-pcb-${m.pcb ?? 'blue'})`;
  return (
    <g>
      <rect x={bx} y={by} width={m.w} height={m.h} rx={2.5} fill={fill} stroke="#0b1d33" strokeWidth={0.6} />
      <rect x={bx + 1} y={by + 1} width={m.w - 2} height={m.h - 2} rx={2} fill="none" stroke="#fff" strokeOpacity={0.08} strokeWidth={0.8} />
      {m.holes !== false && m.w > 60 && m.h > 40 && (
        <>
          <MountHole x={bx + 6} y={by + 6} r={3.2} />
          <MountHole x={bx + m.w - 6} y={by + 6} r={3.2} />
        </>
      )}
      {children}
      {pins.map((p, i) => (
        <g key={p.id}>
          <HeaderPin x={pinX0 + i * 10} y={pinY} />
          <Txt x={pinX0 + i * 10} y={pinY - 8.5} size={p.name.length > 4 ? 2.1 : 2.7} fill="#f3f5f7" rotate={p.name.length > 4 ? -90 : undefined}>{p.name}</Txt>
        </g>
      ))}
      {m.title && <Txt x={bx + m.w / 2} y={by + m.h - 14} size={3.4} fill="#e9eef5">{m.title}</Txt>}
    </g>
  );
}
