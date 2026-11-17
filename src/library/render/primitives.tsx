/**
 * Shared SVG primitives. Units: 1 = 0.254 mm, 10 = 0.1" (pin pitch).
 * Gradients/filters are defined once in <LabDefs/> and referenced by id.
 */
import type { ReactNode } from 'react';

export const LED_COLORS: Record<string, { body: string; light: string; glow: string; label: string; vf: number }> = {
  red: { body: '#c2161b', light: '#ff5a4f', glow: '#ff2a1a', label: 'Vermelho', vf: 2.0 },
  green: { body: '#13923a', light: '#5cf27f', glow: '#35ff6a', label: 'Verde', vf: 2.1 },
  blue: { body: '#1d4ed8', light: '#6aa8ff', glow: '#3d8bff', label: 'Azul', vf: 3.1 },
  yellow: { body: '#d9b100', light: '#fff06a', glow: '#ffe11a', label: 'Amarelo', vf: 2.1 },
  white: { body: '#d9dee5', light: '#ffffff', glow: '#f2f7ff', label: 'Branco', vf: 3.1 },
  orange: { body: '#e0640f', light: '#ffa04d', glow: '#ff7d1a', label: 'Laranja', vf: 2.0 },
};

export function LabDefs() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden>
      <defs>{labDefsContent()}</defs>
    </svg>
  );
}

/** Raw <defs> content (also embedded when exporting SVG). */
export function labDefsContent(): ReactNode {
  return (
    <>
      <linearGradient id="g-metal" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f4f6f8" /><stop offset="0.45" stopColor="#b9c0c8" /><stop offset="1" stopColor="#7d858f" />
      </linearGradient>
      <linearGradient id="g-metal-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#7d858f" /><stop offset="0.5" stopColor="#eef1f4" /><stop offset="1" stopColor="#7d858f" />
      </linearGradient>
      <radialGradient id="g-metal-r" cx="0.4" cy="0.35" r="0.7">
        <stop offset="0" stopColor="#ffffff" /><stop offset="0.5" stopColor="#c3c9d0" /><stop offset="1" stopColor="#6f7782" />
      </radialGradient>
      <linearGradient id="g-gold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff1b0" /><stop offset="0.5" stopColor="#d6a93a" /><stop offset="1" stopColor="#8f6a15" />
      </linearGradient>
      <linearGradient id="g-copper" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffc28a" /><stop offset="0.5" stopColor="#c46a2b" /><stop offset="1" stopColor="#7a3a12" />
      </linearGradient>
      <linearGradient id="g-res-beige" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f6e2bd" /><stop offset="0.35" stopColor="#e2c38f" /><stop offset="1" stopColor="#a5814a" />
      </linearGradient>
      <linearGradient id="g-res-blue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#a9d2f2" /><stop offset="0.35" stopColor="#5b9fd6" /><stop offset="1" stopColor="#2b5f8e" />
      </linearGradient>
      <linearGradient id="g-black" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4a4f57" /><stop offset="0.3" stopColor="#24272c" /><stop offset="1" stopColor="#0d0e10" />
      </linearGradient>
      <linearGradient id="g-black-flat" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#33363c" /><stop offset="1" stopColor="#141518" />
      </linearGradient>
      <linearGradient id="g-black-cyl-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#0d0e10" /><stop offset="0.3" stopColor="#3c4048" /><stop offset="0.55" stopColor="#24272c" /><stop offset="1" stopColor="#0a0b0c" />
      </linearGradient>
      <linearGradient id="g-ecap-blue" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#0f2d63" /><stop offset="0.35" stopColor="#3e6fc9" /><stop offset="0.6" stopColor="#1f4796" /><stop offset="1" stopColor="#0b1f45" />
      </linearGradient>
      <linearGradient id="g-ecap-stripe" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#9aa6b8" /><stop offset="0.5" stopColor="#dfe5ee" /><stop offset="1" stopColor="#8c97a8" />
      </linearGradient>
      <radialGradient id="g-ceramic" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#ffd27a" /><stop offset="0.6" stopColor="#e8962e" /><stop offset="1" stopColor="#9c5a12" />
      </radialGradient>
      <radialGradient id="g-ceramic-blue" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#8fc4ff" /><stop offset="0.6" stopColor="#2f73c9" /><stop offset="1" stopColor="#173f75" />
      </radialGradient>
      <linearGradient id="g-glass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.85" /><stop offset="0.4" stopColor="#dbe9f2" stopOpacity="0.35" /><stop offset="1" stopColor="#9fb7c7" stopOpacity="0.55" />
      </linearGradient>
      <linearGradient id="g-zener" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffd59a" stopOpacity="0.95" /><stop offset="0.45" stopColor="#e4831f" stopOpacity="0.85" /><stop offset="1" stopColor="#8c4508" stopOpacity="0.95" />
      </linearGradient>
      <linearGradient id="g-pcb-blue" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2a6cc4" /><stop offset="1" stopColor="#164a8f" />
      </linearGradient>
      <linearGradient id="g-pcb-teal" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#1d8a96" /><stop offset="1" stopColor="#0d5f6b" />
      </linearGradient>
      <linearGradient id="g-pcb-green" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2f8a3e" /><stop offset="1" stopColor="#185c25" />
      </linearGradient>
      <linearGradient id="g-pcb-black" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#2b2f36" /><stop offset="1" stopColor="#121418" />
      </linearGradient>
      <linearGradient id="g-pcb-red" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#c8302a" /><stop offset="1" stopColor="#7d1612" />
      </linearGradient>
      <linearGradient id="g-pcb-purple" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#5b3aa0" /><stop offset="1" stopColor="#36206a" />
      </linearGradient>
      <linearGradient id="g-bb" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fbfbf9" /><stop offset="1" stopColor="#e6e6e0" />
      </linearGradient>
      <linearGradient id="g-white-plastic" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#d3d7dc" />
      </linearGradient>
      <linearGradient id="g-blue-plastic" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#4f8fe0" /><stop offset="1" stopColor="#1e4f9a" />
      </linearGradient>
      <linearGradient id="g-red-plastic" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f0574d" /><stop offset="1" stopColor="#a11c14" />
      </linearGradient>
      <radialGradient id="g-dome-white" cx="0.4" cy="0.3" r="0.8">
        <stop offset="0" stopColor="#ffffff" /><stop offset="0.7" stopColor="#e4e7ea" /><stop offset="1" stopColor="#a9b0b8" />
      </radialGradient>
      <radialGradient id="g-transducer" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stopColor="#1a1c20" /><stop offset="0.55" stopColor="#2b2e33" /><stop offset="0.62" stopColor="#d8dde3" /><stop offset="0.85" stopColor="#9aa2ad" /><stop offset="1" stopColor="#5f6670" />
      </radialGradient>
      <linearGradient id="g-solar" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#25407a" /><stop offset="0.5" stopColor="#14284f" /><stop offset="1" stopColor="#0b1a36" />
      </linearGradient>
      {Object.entries(LED_COLORS).map(([k, c]) => (
        <radialGradient key={k} id={`g-led-${k}`} cx="0.38" cy="0.3" r="0.85">
          <stop offset="0" stopColor={c.light} stopOpacity="0.95" />
          <stop offset="0.55" stopColor={c.body} stopOpacity="0.9" />
          <stop offset="1" stopColor={c.body} stopOpacity="1" />
        </radialGradient>
      ))}
      {Object.entries(LED_COLORS).map(([k, c]) => (
        <radialGradient key={`glow-${k}`} id={`g-glow-${k}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor={c.glow} stopOpacity="0.85" />
          <stop offset="0.4" stopColor={c.glow} stopOpacity="0.35" />
          <stop offset="1" stopColor={c.glow} stopOpacity="0" />
        </radialGradient>
      ))}
      <linearGradient id="g-cyl-shade" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff" stopOpacity="0.55" /><stop offset="0.3" stopColor="#fff" stopOpacity="0.08" /><stop offset="0.65" stopColor="#000" stopOpacity="0.05" /><stop offset="1" stopColor="#000" stopOpacity="0.45" />
      </linearGradient>
      <linearGradient id="g-cyl-shade-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity="0.45" /><stop offset="0.3" stopColor="#fff" stopOpacity="0.35" /><stop offset="0.55" stopColor="#fff" stopOpacity="0.05" /><stop offset="1" stopColor="#000" stopOpacity="0.5" />
      </linearGradient>
      <filter id="f-shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0.8" dy="1.4" stdDeviation="1.1" floodColor="#000" floodOpacity="0.35" />
      </filter>
      {/* Cylindrical shading: dark rim, specular band, soft falloff (overlay on any cylinder). */}
      <linearGradient id="g-cyl-h" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#000" stopOpacity="0.6" /><stop offset="0.14" stopColor="#000" stopOpacity="0.28" />
        <stop offset="0.3" stopColor="#fff" stopOpacity="0.42" /><stop offset="0.44" stopColor="#fff" stopOpacity="0.06" />
        <stop offset="0.72" stopColor="#000" stopOpacity="0.1" /><stop offset="0.9" stopColor="#000" stopOpacity="0.36" />
        <stop offset="1" stopColor="#000" stopOpacity="0.62" />
      </linearGradient>
      {/* Crimped aluminium / metal end cap. */}
      <linearGradient id="g-metal-cap" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#4d545d" /><stop offset="0.25" stopColor="#e9edf1" /><stop offset="0.45" stopColor="#a4acb6" />
        <stop offset="0.7" stopColor="#dfe4e9" /><stop offset="1" stopColor="#4a5159" />
      </linearGradient>
      {/* Epoxy-coated disc: glossy dome. */}
      <radialGradient id="g-epoxy-dome" cx="0.36" cy="0.3" r="0.75">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" /><stop offset="0.22" stopColor="#ffffff" stopOpacity="0.08" />
        <stop offset="0.8" stopColor="#000" stopOpacity="0.18" /><stop offset="1" stopColor="#000" stopOpacity="0.5" />
      </radialGradient>
      {/* Ferrite core (toroid / EI): dark glossy ring. */}
      <radialGradient id="g-ferrite" cx="0.4" cy="0.35" r="0.75">
        <stop offset="0" stopColor="#5a6070" /><stop offset="0.6" stopColor="#23262e" /><stop offset="1" stopColor="#0b0c10" />
      </radialGradient>
      {/* Lacquered enamelled copper winding. */}
      <linearGradient id="g-wire-cu" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stopColor="#6e2f0e" /><stop offset="0.35" stopColor="#f6b071" /><stop offset="0.55" stopColor="#c8692c" /><stop offset="1" stopColor="#5a2509" />
      </linearGradient>
      {/* Glass tube (fuses, LDR cover). */}
      <linearGradient id="g-glass-tube" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" stopOpacity="0.9" /><stop offset="0.25" stopColor="#e7f2f8" stopOpacity="0.35" />
        <stop offset="0.6" stopColor="#c9dde9" stopOpacity="0.25" /><stop offset="1" stopColor="#8fa9ba" stopOpacity="0.6" />
      </linearGradient>
      {/* Printed-ink / moulded-plastic surface grain (speckles only where the shape is). */}
      <filter id="f-texture" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="1.1" numOctaves="2" seed="4" result="n" />
        <feColorMatrix in="n" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 -1.1 0.8" result="dots" />
        <feComposite in="dots" in2="SourceAlpha" operator="in" result="clipped" />
        <feMerge><feMergeNode in="SourceGraphic" /><feMergeNode in="clipped" /></feMerge>
      </filter>
      <filter id="f-soft" x="-10%" y="-10%" width="120%" height="120%">
        <feGaussianBlur stdDeviation="0.25" />
      </filter>
      <pattern id="p-grille" width="2.2" height="2.2" patternUnits="userSpaceOnUse">
        <rect width="2.2" height="2.2" fill="#2a2d33" /><circle cx="1.1" cy="1.1" r="0.7" fill="#0a0b0d" />
      </pattern>
      <pattern id="p-mesh" width="1.6" height="1.6" patternUnits="userSpaceOnUse">
        <rect width="1.6" height="1.6" fill="#b5bcc4" /><path d="M0 0L1.6 1.6M1.6 0L0 1.6" stroke="#6b737d" strokeWidth="0.35" />
      </pattern>
      <pattern id="p-dht" width="3" height="3" patternUnits="userSpaceOnUse">
        <rect width="3" height="3" fill="currentColor" /><rect x="0.6" y="0.6" width="1.8" height="1.8" rx="0.3" fill="#000" fillOpacity="0.55" />
      </pattern>
    </>
  );
}

/** A component lead (leg) between two points. */
export function Lead({ x1, y1, x2, y2, w = 1.4, gold }: { x1: number; y1: number; x2: number; y2: number; w?: number; gold?: boolean }) {
  return (
    <g strokeLinecap="round">
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={gold ? '#8f6a15' : '#6f7782'} strokeWidth={w + 0.5} />
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={gold ? '#e8c45a' : '#d5dae0'} strokeWidth={w} />
    </g>
  );
}

/** Polyline lead (bent leg). */
export function LeadPath({ d, w = 1.4 }: { d: string; w?: number }) {
  return (
    <g fill="none" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} stroke="#6f7782" strokeWidth={w + 0.5} />
      <path d={d} stroke="#d5dae0" strokeWidth={w} />
    </g>
  );
}

/** Male header pin seen from above (gold square on black base). */
export function HeaderPin({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 5} y={y - 5} width={10} height={10} fill="#16181b" stroke="#000" strokeWidth={0.3} />
      <rect x={x - 1.3} y={y - 1.3} width={2.6} height={2.6} fill="url(#g-gold)" />
    </g>
  );
}

/** Female header socket seen from above. */
export function HeaderSocket({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 5} y={y - 5} width={10} height={10} fill="#1d1f23" stroke="#000" strokeWidth={0.3} />
      <rect x={x - 1.6} y={y - 1.6} width={3.2} height={3.2} fill="#050506" />
    </g>
  );
}

/** Plated through-hole pad. */
export function Pad({ x, y, r = 2.6 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r} fill="url(#g-gold)" />
      <circle cx={x} cy={y} r={r * 0.45} fill="#1a1a1a" />
    </g>
  );
}

export function Txt({ x, y, size = 4, fill = '#fff', anchor = 'middle', weight = 600, children, rotate, family = 'mono', opacity }: {
  x: number; y: number; size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number;
  children: ReactNode; rotate?: number; family?: 'mono' | 'sans'; opacity?: number;
}) {
  return (
    <text
      x={x} y={y} fontSize={size} fill={fill} textAnchor={anchor} fontWeight={weight} opacity={opacity}
      fontFamily={family === 'mono' ? 'JetBrains Mono, Consolas, monospace' : 'Inter, Segoe UI, sans-serif'}
      dominantBaseline="central" transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
      style={{ userSelect: 'none', pointerEvents: 'none' }}
    >
      {children}
    </text>
  );
}

/** Mounting hole on a PCB. */
export function MountHole({ x, y, r = 5 }: { x: number; y: number; r?: number }) {
  return (
    <g>
      <circle cx={x} cy={y} r={r + 1.4} fill="#d9c27a" opacity={0.8} />
      <circle cx={x} cy={y} r={r} fill="#0e1116" />
    </g>
  );
}

/** Small SMD part decoration. */
export function Smd({ x, y, w = 4, h = 2, color = '#2a2a2a' }: { x: number; y: number; w?: number; h?: number; color?: string }) {
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} fill={color} />
      <rect x={x - w / 2} y={y - h / 2} width={w * 0.22} height={h} fill="#c9ccd0" />
      <rect x={x + w / 2 - w * 0.22} y={y - h / 2} width={w * 0.22} height={h} fill="#c9ccd0" />
    </g>
  );
}

/** Tiny SMD LED on a module (lit or not). */
export function SmdLed({ x, y, color = '#ff3b30', on = false }: { x: number; y: number; color?: string; on?: boolean }) {
  return (
    <g>
      {on && <circle cx={x} cy={y} r={5} fill={color} opacity={0.35} />}
      <rect x={x - 1.8} y={y - 1.1} width={3.6} height={2.2} rx={0.3} fill={on ? color : '#e8e2d0'} stroke="#888" strokeWidth={0.2} />
    </g>
  );
}
