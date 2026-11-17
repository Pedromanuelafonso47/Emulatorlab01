import { memo } from 'react';
import { registerComponent } from '../registry';
import { HeaderPin, HeaderSocket, Lead, Pad, Txt } from '../render/primitives';
import { DipBody, dipBBox, dipPins } from '../render/packages';
import { bool, sel } from './common';
import type { PinDef } from '../types';

/** Contact shadow under a part on the bench. */
const shadow = (x: number, y: number, w: number, h: number) => <rect x={x + 2} y={y + 3} width={w} height={h} rx={3} fill="#000" opacity={0.1} filter="url(#f-soft)" />;

// ═════════════════════ Breadboards ═════════════════════

export const BB_ROWS_TOP = ['a', 'b', 'c', 'd', 'e'];
export const BB_ROWS_BOT = ['f', 'g', 'h', 'i', 'j'];
const ROW_Y: Record<string, number> = { a: -50, b: -40, c: -30, d: -20, e: -10, f: 20, g: 30, h: 40, i: 50, j: 60 };
const RAILS = [
  { key: 'TN', y: -80, name: 'Barramento − (topo)', pol: '-' as const },
  { key: 'TP', y: -70, name: 'Barramento + (topo)', pol: '+' as const },
  { key: 'BP', y: 80, name: 'Barramento + (base)', pol: '+' as const },
  { key: 'BN', y: 90, name: 'Barramento − (base)', pol: '-' as const },
];

interface BBGeom { cols: number; x0: number; railCols: number[] }
function bbGeom(cols: number): BBGeom {
  const x0 = -Math.floor((cols - 1) / 2) * 10;
  const railCols: number[] = [];
  for (let c = 2; c <= cols - 2; c++) if ((c - 2) % 6 < 5) railCols.push(c);
  return { cols, x0, railCols };
}

function bbPins(cols: number): PinDef[] {
  const g = bbGeom(cols);
  const pins: PinDef[] = [];
  for (let c = 0; c < cols; c++) {
    for (const r of [...BB_ROWS_TOP, ...BB_ROWS_BOT]) pins.push({ id: `${r}${c + 1}`, name: `${r}${c + 1}`, x: g.x0 + c * 10, y: ROW_Y[r], role: 'passive' });
  }
  for (const rail of RAILS) for (const c of g.railCols) pins.push({ id: `${rail.key}${c + 1}`, name: rail.name, x: g.x0 + c * 10, y: rail.y, role: rail.pol === '+' ? 'power' : 'ground', polarity: rail.pol });
  return pins;
}

function bbInternal(cols: number, splitRails: boolean): string[][] {
  const g = bbGeom(cols);
  const groups: string[][] = [];
  for (let c = 1; c <= cols; c++) {
    groups.push(BB_ROWS_TOP.map((r) => `${r}${c}`));
    groups.push(BB_ROWS_BOT.map((r) => `${r}${c}`));
  }
  for (const rail of RAILS) {
    const ids = g.railCols.map((c) => `${rail.key}${c + 1}`);
    if (splitRails) { const h = Math.ceil(ids.length / 2); groups.push(ids.slice(0, h), ids.slice(h)); } else groups.push(ids);
  }
  return groups;
}

/** Contact hole: bevelled rim, dark recess and the spring-clip glint. */
const Hole = ({ x, y }: { x: number; y: number }) => (
  <g>
    <rect x={x - 2.2} y={y - 2.2} width={4.4} height={4.4} rx={0.7} fill="#dedad0" />
    <rect x={x - 1.6} y={y - 1.6} width={3.2} height={3.2} rx={0.4} fill="#1b1b19" />
    <rect x={x - 1.6} y={y - 1.6} width={3.2} height={0.8} rx={0.3} fill="#9aa0a6" opacity={0.7} />
  </g>
);

const BreadboardArt = memo(function BreadboardArt({ cols, splitRails }: { cols: number; splitRails: boolean }) {
  const g = bbGeom(cols);
  const xL = g.x0 - 15, xR = g.x0 + (cols - 1) * 10 + 15, w = xR - xL;
  return (
    <g>
      {shadow(xL, -92, w, 194)}
      {/* ABS housing with a faint sheen and the grooved centre channel */}
      <rect x={xL} y={-92} width={w} height={194} rx={3} fill="url(#g-bb)" stroke="#b8b8b0" strokeWidth={0.8} filter="url(#f-texture)" />
      <rect x={xL} y={-92} width={w} height={194} rx={3} fill="url(#g-cyl-h)" opacity={0.06} />
      <rect x={xL} y={-62} width={w} height={2} fill="#000" opacity={0.06} />
      <rect x={xL} y={71} width={w} height={2} fill="#000" opacity={0.06} />
      <rect x={xL + 2} y={1} width={w - 4} height={8} rx={1} fill="#d4d4cc" />
      <rect x={xL + 2} y={4} width={w - 4} height={2} fill="#bdbdb4" />
      {RAILS.map((r) => {
        const ly = r.key === 'TN' ? -86 : r.key === 'TP' ? -64.5 : r.key === 'BP' ? 74.5 : 96;
        const color = r.pol === '+' ? '#c8322b' : '#24569f';
        const xa = g.x0 + g.railCols[0] * 10 - 6, xb = g.x0 + g.railCols[g.railCols.length - 1] * 10 + 6;
        const mid = (xa + xb) / 2;
        return (
          <g key={r.key}>
            {splitRails ? (<><line x1={xa} y1={ly} x2={mid - 4} y2={ly} stroke={color} strokeWidth={1} /><line x1={mid + 4} y1={ly} x2={xb} y2={ly} stroke={color} strokeWidth={1} /></>)
              : <line x1={xa} y1={ly} x2={xb} y2={ly} stroke={color} strokeWidth={1} />}
            <Txt x={xL + 6} y={r.y} size={5} fill={color} weight={800}>{r.pol === '+' ? '+' : '−'}</Txt>
            <Txt x={xR - 6} y={r.y} size={5} fill={color} weight={800}>{r.pol === '+' ? '+' : '−'}</Txt>
            {g.railCols.map((c) => <Hole key={c} x={g.x0 + c * 10} y={r.y} />)}
          </g>
        );
      })}
      {[...BB_ROWS_TOP, ...BB_ROWS_BOT].map((r) => (
        <g key={r}>
          <Txt x={xL + 6} y={ROW_Y[r]} size={3.6} fill="#7f7f77" weight={600}>{r}</Txt>
          <Txt x={xR - 6} y={ROW_Y[r]} size={3.6} fill="#7f7f77" weight={600}>{r}</Txt>
          {Array.from({ length: cols }, (_, c) => <Hole key={c} x={g.x0 + c * 10} y={ROW_Y[r]} />)}
        </g>
      ))}
      {Array.from({ length: cols }, (_, c) => (c === 0 || (c + 1) % 5 === 0) && (
        <g key={c}>
          <Txt x={g.x0 + c * 10} y={-57} size={3.2} fill="#7f7f77" weight={500}>{c + 1}</Txt>
          <Txt x={g.x0 + c * 10} y={67} size={3.2} fill="#7f7f77" weight={500}>{c + 1}</Txt>
        </g>
      ))}
    </g>
  );
});

for (const [type, name, cols, desc] of [
  ['breadboard-half', 'Breadboard pequena (400 pontos)', 30, 'Breadboard de 400 pontos: 30 colunas × 10 + 4 barramentos de alimentação.'],
  ['breadboard-full', 'Breadboard grande (830 pontos)', 63, 'Breadboard de 830 pontos: 63 colunas × 10 + 4 barramentos de alimentação.'],
] as const) {
  const g = bbGeom(cols);
  registerComponent({
    type, name, category: 'assembly', subcategory: 'Placas de montagem', prefix: 'BB', description: desc,
    tags: ['breadboard', 'protoboard', 'placa', 'montagem'],
    substrate: true,
    bbox: { x: g.x0 - 15, y: -92, w: (cols - 1) * 10 + 30, h: 194 },
    pins: bbPins(cols),
    props: [bool('splitRails', 'Barramentos divididos a meio', false, { hint: 'Algumas breadboards têm os barramentos interrompidos ao centro.' })],
    internalConnections: (p) => bbInternal(cols, Boolean(p.splitRails)),
    render: ({ props }) => <BreadboardArt cols={cols} splitRails={Boolean(props.splitRails)} />,
    datasheet: {
      summary: 'Cada coluna de 5 furos (a–e e f–j) está ligada internamente por uma mola metálica. Os barramentos +/− percorrem a placa no sentido do comprimento. O canal central separa as duas metades — os CIs DIP são colocados sobre ele.',
      specs: { 'Passo': '2,54 mm (0,1″)', 'Canal central': '7,62 mm (0,3″)', 'Corrente máx.': '≈1 A por contacto' },
      notes: ['Erro comum: colocar os dois terminais de um componente na mesma coluna → ficam em curto.'],
    },
    sim: { model: 'interconnect', status: 'implemented', note: 'Conectividade interna implementada (netlist).' },
  });
}

// ── Perfboard / stripboard ──
for (const [type, name, strips] of [['perfboard', 'Placa perfurada (PCB)', false], ['stripboard', 'Placa de tiras (stripboard)', true]] as const) {
  const C = 24, R = 16, x0 = -110, y0 = -70;
  const pins: PinDef[] = [];
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) pins.push({ id: `r${r + 1}c${c + 1}`, name: strips ? `Tira ${r + 1}, furo ${c + 1}` : `Furo ${String.fromCharCode(65 + r)}${c + 1}`, x: x0 + c * 10, y: y0 + r * 10, role: 'passive' });
  registerComponent({
    type, name, category: 'assembly', subcategory: 'Placas de montagem', prefix: 'PCB',
    description: strips ? 'Placa com tiras de cobre horizontais contínuas (Veroboard). Corte as tiras para separar ligações.' : 'Placa com ilhas de cobre independentes — as ligações são feitas com fios/solda.',
    tags: ['pcb', 'perfboard', 'stripboard', 'placa', 'solda'],
    substrate: true,
    bbox: { x: x0 - 8, y: y0 - 8, w: (C - 1) * 10 + 16, h: (R - 1) * 10 + 16 },
    pins,
    internalConnections: strips ? Array.from({ length: R }, (_, r) => Array.from({ length: C }, (_, c) => `r${r + 1}c${c + 1}`)) : [],
    render: () => (
      <g>
        {shadow(x0 - 8, y0 - 8, (C - 1) * 10 + 16, (R - 1) * 10 + 16)}
        {/* FR4 substrate with grain and a faint edge bevel */}
        <rect x={x0 - 8} y={y0 - 8} width={(C - 1) * 10 + 16} height={(R - 1) * 10 + 16} rx={2} fill="#c9a467" stroke="#8a6a35" strokeWidth={0.6} filter="url(#f-texture)" />
        <rect x={x0 - 8} y={y0 - 8} width={(C - 1) * 10 + 16} height={(R - 1) * 10 + 16} rx={2} fill="url(#g-cyl-h)" opacity={0.12} />
        {strips && Array.from({ length: R }, (_, r) => <rect key={r} x={x0 - 5} y={y0 + r * 10 - 3.6} width={(C - 1) * 10 + 10} height={7.2} rx={1} fill="url(#g-copper)" opacity={0.9} />)}
        {pins.map((p) => strips
          ? <circle key={p.id} cx={p.x} cy={p.y} r={1.1} fill="#2a1a08" />
          : <g key={p.id}><Pad x={p.x} y={p.y} r={3} /><circle cx={p.x} cy={p.y} r={1} fill="#2a1a08" /></g>)}
      </g>
    ),
    sim: { model: 'interconnect', status: 'implemented' },
  });
}

// ═════════════════════ Wire tools (jumpers) ═════════════════════
for (const [style, name, desc, c] of [
  ['wire', 'Fio de ligação', 'Fio rígido para ligações curtas. Clique num pino, adicione curvas clicando na área e termine noutro pino.', '#2f9bff'],
  ['jumper-mm', 'Jumper macho-macho', 'Cabo Dupont com pinos nas duas pontas — ideal para breadboard ↔ Arduino.', '#e04a3f'],
  ['jumper-mf', 'Jumper macho-fêmea', 'Cabo Dupont pino ↔ conector fêmea — para módulos com pinos macho.', '#33b56b'],
  ['jumper-ff', 'Jumper fêmea-fêmea', 'Cabo Dupont fêmea nas duas pontas — liga dois headers macho.', '#f0b429'],
] as const) {
  registerComponent({
    type: `tool-${style}`, name, category: 'assembly', subcategory: 'Fios e jumpers', prefix: 'W', description: desc,
    tags: ['fio', 'jumper', 'dupont', 'cabo', 'ligação'],
    tool: { kind: 'wire', style },
    bbox: { x: -30, y: -14, w: 60, h: 28 },
    pins: [],
    render: () => (
      <g>
        <path d="M-22 6 C-10 -14 10 14 22 -6" fill="none" stroke="#000" strokeOpacity={0.2} strokeWidth={3.8} strokeLinecap="round" transform="translate(0.6 1.2)" />
        <path d="M-22 6 C-10 -14 10 14 22 -6" fill="none" stroke={c} strokeWidth={3.2} strokeLinecap="round" />
        <path d="M-22 4.6 C-10 -15.4 10 12.6 22 -7.4" fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={0.8} strokeLinecap="round" />
        {style !== 'wire' && (<>
          <rect x={-28} y={3} width={8} height={6} rx={0.8} fill="url(#g-black-flat)" transform="rotate(-30 -24 6)" />
          <rect x={20} y={-9} width={8} height={6} rx={0.8} fill="url(#g-black-flat)" transform="rotate(-30 24 -6)" />
          {style !== 'jumper-ff' && <line x1={-29} y1={9} x2={-32} y2={11} stroke="url(#g-gold)" strokeWidth={1.4} />}
          {style === 'jumper-mm' && <line x1={29} y1={-9} x2={32} y2={-11} stroke="url(#g-gold)" strokeWidth={1.4} />}
        </>)}
      </g>
    ),
    sim: { model: 'wire', status: 'implemented' },
  });
}

// ═════════════════════ Connectors ═════════════════════
for (const n of [2, 3] as const) {
  const xs = n === 2 ? [-10, 10] : [-20, 0, 20];
  registerComponent({
    type: `screw-terminal-${n}`, name: `Borne de parafuso ${n} vias`, category: 'assembly', subcategory: 'Conectores', prefix: 'J',
    description: `Borne de PCB de ${n} vias, passo 5,08 mm — para fios de alimentação e cargas.`, tags: ['borne', 'terminal', 'parafuso', 'conector'],
    bbox: { x: xs[0] - 10, y: -24, w: xs[xs.length - 1] - xs[0] + 20, h: 30 },
    pins: xs.map((x, i) => ({ id: String(i + 1), name: `Via ${i + 1}`, x, y: 0, role: 'passive' as const })),
    render: () => (
      <g>
        {shadow(xs[0] - 10, -24, xs[xs.length - 1] - xs[0] + 20, 28)}
        {/* green moulded terminal block with a sheen */}
        <rect x={xs[0] - 10} y={-24} width={xs[xs.length - 1] - xs[0] + 20} height={28} rx={1.5} fill="#1f8a45" stroke="#0c4a24" strokeWidth={0.5} filter="url(#f-texture)" />
        <rect x={xs[0] - 10} y={-24} width={xs[xs.length - 1] - xs[0] + 20} height={28} rx={1.5} fill="url(#g-cyl-h)" opacity={0.3} />
        {xs.map((x) => (
          <g key={x}>
            {/* wire entry and the screw head with its cross slot */}
            <rect x={x - 4.5} y={-4} width={9} height={6} rx={0.6} fill="#0b2a16" />
            <circle cx={x} cy={-14} r={6.4} fill="url(#g-metal-r)" stroke="#50585f" strokeWidth={0.4} />
            <line x1={x - 4} y1={-14} x2={x + 4} y2={-14} stroke="#3a4149" strokeWidth={1.1} />
            <circle cx={x - 1.8} cy={-15.8} r={0.9} fill="#fff" opacity={0.6} />
          </g>
        ))}
      </g>
    ),
    sim: { model: 'interconnect', status: 'implemented' },
  });
}

for (const [type, name, female] of [['header-male-4', 'Barra de pinos macho 1×4', false], ['header-female-4', 'Barra de pinos fêmea 1×4', true]] as const) {
  registerComponent({
    type, name, category: 'assembly', subcategory: 'Conectores', prefix: 'J',
    description: female ? 'Conector fêmea 2,54 mm — recebe pinos macho/jumpers.' : 'Barra de pinos macho 2,54 mm.',
    tags: ['header', 'pinos', 'conector', 'dupont'],
    bbox: { x: -15, y: -6, w: 50, h: 12 },
    pins: [0, 1, 2, 3].map((i) => ({ id: String(i + 1), name: `Pino ${i + 1}`, x: -10 + i * 10, y: 0, role: 'passive' as const })),
    render: () => (
      <g>
        {shadow(-15, -6, 50, 12)}
        {[0, 1, 2, 3].map((i) => (female ? <HeaderSocket key={i} x={-10 + i * 10} y={0} /> : <HeaderPin key={i} x={-10 + i * 10} y={0} />))}
      </g>
    ),
    sim: { model: 'interconnect', status: 'implemented' },
  });
}

// ═════════════════════ Switches ═════════════════════
registerComponent({
  type: 'push-button', name: 'Botão de pressão (tátil)', category: 'assembly', subcategory: 'Interruptores', prefix: 'SW',
  description: 'Botão tátil 6×6 mm de 4 pinos. Os pinos do mesmo lado (verticais) estão sempre ligados; premir liga o lado esquerdo ao direito.',
  tags: ['botão', 'push button', 'tátil', 'pressão', 'interruptor'],
  bbox: { x: -16, y: -16, w: 32, h: 42 },
  pins: [
    { id: '1A', name: '1a (lado esquerdo)', x: -10, y: -10, role: 'passive' }, { id: '2A', name: '2a (lado direito)', x: 10, y: -10, role: 'passive' },
    { id: '1B', name: '1b (lado esquerdo)', x: -10, y: 20, role: 'passive' }, { id: '2B', name: '2b (lado direito)', x: 10, y: 20, role: 'passive' },
  ],
  props: [bool('pressed', 'Premido', false)],
  internalConnections: (p) => (p.pressed ? [['1A', '1B', '2A', '2B']] : [['1A', '1B'], ['2A', '2B']]),
  valueLabel: (p) => (p.pressed ? 'premido' : 'solto'),
  render: ({ props }) => (
    <g>
      {shadow(-13, -7, 26, 24)}
      {[-10, 10].map((x) => <g key={x}><Lead x1={x} y1={-10} x2={x} y2={-4} w={1.6} /><Lead x1={x} y1={14} x2={x} y2={20} w={1.6} /></g>)}
      {/* steel-cased tactile switch with the black plastic actuator cap */}
      <rect x={-13} y={-7} width={26} height={24} rx={1} fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.5} />
      <rect x={-13} y={-7} width={26} height={24} rx={1} fill="url(#g-cyl-h)" opacity={0.3} />
      <rect x={-11} y={-5} width={22} height={20} rx={1} fill="#1b1d21" />
      {[[-9, -3], [9, -3], [-9, 13], [9, 13]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={0.9} fill="#6b737d" />)}
      <circle cx={0} cy={5} r={props.pressed ? 6 : 6.8} fill={props.pressed ? '#2d3036' : 'url(#g-black)'} stroke="#000" strokeWidth={0.5} />
      <circle cx={-1.5} cy={3.5} r={2} fill="#fff" opacity={props.pressed ? 0.05 : 0.14} />
    </g>
  ),
  datasheet: { summary: 'Na breadboard, coloque-o sobre o canal central: cada lado fica numa metade.', notes: ['Use resistência pull-down/pull-up (10 kΩ) ou INPUT_PULLUP para evitar entradas flutuantes.'] },
  sim: { model: 'switch', status: 'partial', note: 'Conectividade implementada (muda o netlist); modelo elétrico na Fase 2.' },
});

registerComponent({
  type: 'slide-switch', name: 'Chave seletora deslizante (SPDT)', category: 'assembly', subcategory: 'Interruptores', prefix: 'SW',
  description: 'Interruptor deslizante de 3 pinos: o comum (centro) liga a A ou a B.',
  tags: ['chave', 'seletora', 'interruptor', 'spdt', 'deslizante'],
  bbox: { x: -20, y: -24, w: 40, h: 34 },
  pins: [{ id: 'A', name: 'Posição A', x: -10, y: 0, role: 'passive' }, { id: 'COM', name: 'Comum', x: 0, y: 0, role: 'passive' }, { id: 'B', name: 'Posição B', x: 10, y: 0, role: 'passive' }],
  props: [sel('position', 'Posição', 'A', [['A', 'A (esquerda)'], ['B', 'B (direita)']])],
  internalConnections: (p) => [[String(p.position) === 'B' ? 'B' : 'A', 'COM']],
  valueLabel: (p) => `pos. ${p.position}`,
  render: ({ props }) => (
    <g>
      {shadow(-19, -20, 38, 14)}
      {[-10, 0, 10].map((x) => <Lead key={x} x1={x} y1={-6} x2={x} y2={0} w={1.4} />)}
      {/* metal frame with the black plastic slider and its ridges */}
      <rect x={-19} y={-20} width={38} height={14} rx={1} fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.5} />
      <rect x={-13} y={-17} width={26} height={8} rx={1} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.3} />
      <rect x={props.position === 'B' ? 1 : -12} y={-22} width={11} height={12} rx={1.5} fill="url(#g-black)" stroke="#000" strokeWidth={0.4} />
      {[0, 1, 2].map((i) => <line key={i} x1={(props.position === 'B' ? 1 : -12) + 3 + i * 2} y1={-19} x2={(props.position === 'B' ? 1 : -12) + 3 + i * 2} y2={-13} stroke="#4a4f57" strokeWidth={0.4} />)}
      <Txt x={-15.5} y={-13} size={2.6} fill="#2d333b">A</Txt><Txt x={15.5} y={-13} size={2.6} fill="#2d333b">B</Txt>
    </g>
  ),
  sim: { model: 'switch', status: 'partial', note: 'Conectividade implementada (muda o netlist).' },
});

registerComponent({
  type: 'toggle-switch', name: 'Interruptor de alavanca (SPST)', category: 'assembly', subcategory: 'Interruptores', prefix: 'SW',
  description: 'Interruptor liga/desliga de alavanca. Fechado = os dois terminais ligados.',
  tags: ['interruptor', 'alavanca', 'toggle', 'spst', 'liga'],
  bbox: { x: -16, y: -40, w: 32, h: 46 },
  pins: [{ id: '1', name: 'Terminal 1', x: -10, y: 0, role: 'passive' }, { id: '2', name: 'Terminal 2', x: 10, y: 0, role: 'passive' }],
  props: [bool('closed', 'Ligado (fechado)', false)],
  internalConnections: (p) => (p.closed ? [['1', '2']] : []),
  valueLabel: (p) => (p.closed ? 'ON' : 'OFF'),
  render: ({ props }) => (
    <g>
      {shadow(-15, -20, 30, 15)}
      <Lead x1={-10} y1={-6} x2={-10} y2={0} w={1.6} /><Lead x1={10} y1={-6} x2={10} y2={0} w={1.6} />
      {/* black bakelite base with the chrome bushing and lever */}
      <rect x={-15} y={-20} width={30} height={15} rx={1.5} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.5} filter="url(#f-texture)" />
      <rect x={-15} y={-20} width={30} height={15} rx={1.5} fill="url(#g-cyl-h)" opacity={0.3} />
      <circle cx={0} cy={-20} r={6} fill="url(#g-metal-r)" stroke="#555" strokeWidth={0.4} />
      <g transform={`rotate(${props.closed ? 25 : -25} 0 -20)`}>
        <rect x={-2} y={-38} width={4} height={18} rx={2} fill="url(#g-metal-h)" stroke="#6f7782" strokeWidth={0.3} />
        <rect x={-0.8} y={-37} width={1} height={15} rx={0.5} fill="#fff" opacity={0.4} />
      </g>
      <Txt x={-9} y={-12} size={2.6} fill="#d4d8de">OFF</Txt><Txt x={9} y={-12} size={2.6} fill="#d4d8de">ON</Txt>
    </g>
  ),
  sim: { model: 'switch', status: 'partial', note: 'Conectividade implementada (muda o netlist).' },
});

registerComponent({
  type: 'dip-switch-4', name: 'DIP switch 4 posições', category: 'assembly', subcategory: 'Interruptores', prefix: 'SW',
  description: 'Quatro interruptores SPST em encapsulamento DIP-8. Interruptor n liga o pino n ao pino 9−n.',
  tags: ['dip switch', 'interruptor', 'configuração'],
  bbox: dipBBox(8),
  pins: dipPins(['1', '2', '3', '4', '4\'', '3\'', '2\'', '1\'']),
  props: [bool('s1', 'Chave 1', false), bool('s2', 'Chave 2', false), bool('s3', 'Chave 3', false), bool('s4', 'Chave 4', false)],
  internalConnections: (p) => [1, 2, 3, 4].filter((i) => p[`s${i}`]).map((i) => [String(i), String(9 - i)]),
  render: ({ props }) => (
    <g>
      <DipBody n={8} label="" color="url(#g-red-plastic)" />
      {[1, 2, 3, 4].map((i) => {
        const x = dipPins(['1', '2', '3', '4', '5', '6', '7', '8'])[i - 1].x;
        return (
          <g key={i}>
            {/* slot and actuator: white rocker on the on-side, dark on the off-side */}
            <rect x={x - 2.6} y={-1.5} width={5.2} height={13} rx={0.6} fill="#1a1c20" />
            <rect x={x - 2.2} y={props[`s${i}`] ? -1 : 5} width={4.4} height={6} rx={0.6} fill={props[`s${i}`] ? 'url(#g-white-plastic)' : '#2b2e33'} />
          </g>
        );
      })}
      <Txt x={-11} y={-2} size={2.2} fill="#fff">ON</Txt>
    </g>
  ),
  sim: { model: 'switch', status: 'partial', note: 'Conectividade implementada (muda o netlist).' },
});
