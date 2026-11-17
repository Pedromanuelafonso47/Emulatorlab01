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
      <rect x={x0 + 2} y={by0 + 3} width={x1 - x0} height={by1 - by0} rx={1.5} fill="#000" opacity={0.2} filter="url(#f-soft)" />
      {xs.map((x) => (
        <g key={x}>
          <rect x={x - 2.2} y={yTop - 2} width={4.4} height={by0 - yTop + 3} rx={0.6} fill="url(#g-metal-h)" stroke="#6f7782" strokeWidth={0.3} />
          <rect x={x - 2.2} y={by1 - 1} width={4.4} height={yBottom - by1 + 3} rx={0.6} fill="url(#g-metal-h)" stroke="#6f7782" strokeWidth={0.3} />
        </g>
      ))}
      {/* moulded epoxy body: grain, cylindrical rounding and a gloss band along the top */}
      <rect x={x0} y={by0} width={x1 - x0} height={by1 - by0} rx={1.2} fill={color} stroke="#000" strokeWidth={0.4} filter="url(#f-texture)" />
      <rect x={x0} y={by0} width={x1 - x0} height={by1 - by0} rx={1.2} fill="url(#g-cyl-h)" opacity={0.22} />
      <rect x={x0 + 0.6} y={by0 + 0.6} width={x1 - x0 - 1.2} height={1.2} fill="#fff" opacity={0.12} />
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
  const BODY = 'M-9 4 L-9 -9 Q-9 -15 -3 -15 L3 -15 Q9 -15 9 -9 L9 4 Z';
  return (
    <g>
      <ellipse cx={0} cy={21} rx={11} ry={1.3} fill="#000" opacity={0.22} filter="url(#f-soft)" />
      <LeadPath d="M-3 4 L-3 9 L-10 15 L-10 20" w={1.1} />
      <LeadPath d="M0 4 L0 20" w={1.1} />
      <LeadPath d="M3 4 L3 9 L10 15 L10 20" w={1.1} />
      {/* moulded epoxy body with grain, cylindrical rounding and a glossy top */}
      <path d={BODY} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.4} filter="url(#f-texture)" />
      <path d={BODY} fill="url(#g-cyl-h)" opacity={0.9} />
      <path d="M-7.5 -9 Q-7.5 -13.2 -3 -13.2 L1 -13.2" fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={0.7} strokeLinecap="round" />
      {/* printed marking: label with a dark shadow so it reads on the gloss */}
      <Txt x={0.3} y={-7.3} size={label.length > 6 ? 2.6 : 3.2} fill="#000" opacity={0.5}>{label}</Txt>
      <Txt x={0} y={-7.6} size={label.length > 6 ? 2.6 : 3.2} fill="#e4e7eb">{label}</Txt>
      {sub && <Txt x={0} y={-2.8} size={2.2} fill="#a3a9b1" weight={500}>{sub}</Txt>}
      {pinLetters && pinLetters.map((l, i) => <Txt key={i} x={(i - 1) * 5.4} y={1.5} size={2} fill="#9aa1aa">{l}</Txt>)}
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
      <ellipse cx={0} cy={31} rx={21} ry={1.6} fill="#000" opacity={0.2} filter="url(#f-soft)" />
      {[-10, 0, 10].map((x) => (
        <g key={x}>
          {/* tinned legs with a solder fillet where they leave the body */}
          <Lead x1={x} y1={17} x2={x} y2={30} w={1.7} />
          <rect x={x - 2.5} y={11} width={5} height={7} fill="url(#g-metal-h)" stroke="#6f7782" strokeWidth={0.3} />
          <rect x={x - 2.5} y={11} width={5} height={7} fill="url(#g-cyl-h)" opacity={0.4} />
        </g>
      ))}
      {/* metal heat-sink tab with a mounting hole and bevelled edge */}
      <path d="M-20 -16 L-20 -38 Q-20 -41 -17 -41 L17 -41 Q20 -41 20 -38 L20 -16 Z" fill="url(#g-metal-cap)" stroke="#5f6670" strokeWidth={0.5} />
      <path d="M-20 -16 L-20 -38 Q-20 -41 -17 -41 L17 -41 Q20 -41 20 -38 L20 -16 Z" fill="url(#g-cyl-h)" opacity={0.25} />
      <circle cx={0} cy={-29} r={6.3} fill="#8f98a3" />
      <circle cx={0} cy={-29} r={5.2} fill="#0a0c10" />
      <circle cx={0} cy={-29} r={5.2} fill="none" stroke="#fff" strokeOpacity={0.12} strokeWidth={0.5} />
      {/* moulded epoxy body with grain and rounding */}
      <rect x={-20} y={-17} width={40} height={30} rx={1.2} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.5} filter="url(#f-texture)" />
      <rect x={-20} y={-17} width={40} height={30} rx={1.2} fill="url(#g-cyl-h)" opacity={0.35} />
      <rect x={-19} y={-16} width={38} height={1.4} fill="#fff" opacity={0.14} />
      <Txt x={0.3} y={-5.7} size={label.length > 7 ? 4 : 5} fill="#000" opacity={0.5}>{label}</Txt>
      <Txt x={0} y={-6} size={label.length > 7 ? 4 : 5} fill="#e4e7eb">{label}</Txt>
      {sub && <Txt x={0} y={1} size={2.8} fill="#a3a9b1" weight={500}>{sub}</Txt>}
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
      {pins.map((p, i) => {
        // Labels above the board edge sit on the light canvas: use dark ink there so they stay legible.
        const outside = pinY - 8.5 < by + 2;
        return (
          <g key={p.id}>
            <HeaderPin x={pinX0 + i * 10} y={pinY} />
            <Txt x={pinX0 + i * 10} y={pinY - 8.5} size={p.name.length > 4 ? 2.1 : 2.7} fill={outside ? '#1d2631' : '#f3f5f7'} rotate={p.name.length > 4 ? -90 : undefined}>{p.name}</Txt>
          </g>
        );
      })}
      {m.title && <Txt x={bx + m.w / 2} y={by + m.h - 14} size={3.4} fill="#e9eef5">{m.title}</Txt>}
    </g>
  );
}
