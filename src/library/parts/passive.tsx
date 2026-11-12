import { registerComponent } from '../registry';
import { Lead, LeadPath, Txt } from '../render/primitives';
import { BAND_COLORS, GOLD, SILVER, formatSI, resistorBands } from '@/domain/units';
import { num, sel, si, sim } from './common';
import type { PinDef } from '../types';

// ───────── Axial body (resistor / inductor) ─────────

const AXIAL_PATH =
  'M-13 -3 Q-13 -4.3 -11.2 -4.3 L-8.2 -4.3 Q-7 -4.3 -6.4 -3.4 L6.4 -3.4 Q7 -4.3 8.2 -4.3 L11.2 -4.3 Q13 -4.3 13 -3 L13 3 Q13 4.3 11.2 4.3 L8.2 4.3 Q7 4.3 6.4 3.4 L-6.4 3.4 Q-7 4.3 -8.2 4.3 L-11.2 4.3 Q-13 4.3 -13 3 Z';

function bandH(x: number) { return Math.abs(x) > 6.8 ? 8.4 : 6.8; }

function AxialBody({ fill, bands }: { fill: string; bands: { x: number; color: string; w?: number }[] }) {
  return (
    <g>
      <Lead x1={-20} y1={0} x2={-12} y2={0} />
      <Lead x1={12} y1={0} x2={20} y2={0} />
      <path d={AXIAL_PATH} fill={fill} stroke="#5a4526" strokeWidth={0.35} />
      {bands.map((b, i) => {
        const h = bandH(b.x);
        return <rect key={i} x={b.x - (b.w ?? 1.9) / 2} y={-h / 2} width={b.w ?? 1.9} height={h} fill={b.color} />;
      })}
      <path d={AXIAL_PATH} fill="url(#g-cyl-shade)" />
    </g>
  );
}

const twoPins = (a = 'Terminal 1', b = 'Terminal 2'): PinDef[] => [
  { id: '1', name: a, x: -20, y: 0, role: 'passive' },
  { id: '2', name: b, x: 20, y: 0, role: 'passive' },
];

// ───────── Resistor ─────────

registerComponent({
  type: 'resistor',
  name: 'Resistor',
  category: 'passive',
  prefix: 'R',
  description: 'Resistor de filme de carbono/metálico de ¼ W, com código de cores calculado a partir do valor.',
  tags: ['resistência', 'ohm', 'resistor', 'filme'],
  bbox: { x: -21, y: -5, w: 42, h: 10 },
  pins: twoPins(),
  props: [
    num('resistance', 'Resistência', 220, 'Ω', { min: 0.1, max: 100e6 }),
    sel('tolerance', 'Tolerância', '5', [['5', '±5 % (carbono)'], ['1', '±1 % (filme metálico)'], ['10', '±10 %']]),
    sel('power', 'Potência nominal', '0.25', [['0.125', '⅛ W'], ['0.25', '¼ W'], ['0.5', '½ W'], ['1', '1 W']]),
  ],
  valueLabel: (p) => si(p.resistance, 'Ω'),
  render: ({ props }) => {
    const r = Number(props.resistance), tol = Number(props.tolerance);
    if (tol <= 1) {
      // 5-band code: 3 significant digits
      let exp = Math.floor(Math.log10(r)) - 2;
      let sig = Math.round(r / 10 ** exp);
      if (sig >= 1000) { sig = Math.round(sig / 10); exp++; }
      const d = [Math.floor(sig / 100), Math.floor(sig / 10) % 10, sig % 10];
      const mult = exp === -1 ? GOLD : exp === -2 ? SILVER : BAND_COLORS[Math.max(0, Math.min(9, exp))];
      return <AxialBody fill="url(#g-res-blue)" bands={[
        { x: -9.6, color: BAND_COLORS[d[0]] }, { x: -4.6, color: BAND_COLORS[d[1]] }, { x: -1.4, color: BAND_COLORS[d[2]] },
        { x: 1.8, color: mult }, { x: 9.6, color: BAND_COLORS[1], w: 2.4 },
      ]} />;
    }
    const b = resistorBands(r, tol);
    return <AxialBody fill="url(#g-res-beige)" bands={[
      { x: -9.6, color: b[0] }, { x: -4.4, color: b[1] }, { x: -0.6, color: b[2] }, { x: 9.6, color: b[3], w: 2.4 },
    ]} />;
  },
  datasheet: {
    summary: 'Limita a corrente e divide tensões. V = R·I (Lei de Ohm). P = I²·R deve ficar abaixo da potência nominal.',
    specs: { 'Gama': '0,1 Ω – 100 MΩ', 'Passo dos terminais': '0,4″ (10,16 mm)', 'Coef. temperatura': '±200 ppm/°C (carbono), ±50 ppm/°C (metal)' },
    notes: ['Código de 4 bandas: 2 dígitos + multiplicador + tolerância.', 'Código de 5 bandas (±1 %): 3 dígitos + multiplicador + tolerância.'],
  },
  sim: sim('resistor'),
});

// ───────── Potentiometer ─────────

registerComponent({
  type: 'potentiometer',
  name: 'Potenciómetro rotativo',
  category: 'passive',
  prefix: 'RV',
  description: 'Potenciómetro linear de 16 mm com cursor (wiper). Divide a tensão entre os extremos.',
  tags: ['potenciometro', 'resistência variável', 'trimmer', 'wiper'],
  bbox: { x: -16, y: -26, w: 32, h: 48 },
  pins: [
    { id: '1', name: 'Extremo A (1)', x: -10, y: 20, role: 'passive' },
    { id: '2', name: 'Cursor / wiper (2)', x: 0, y: 20, role: 'passive' },
    { id: '3', name: 'Extremo B (3)', x: 10, y: 20, role: 'passive' },
  ],
  props: [
    num('resistance', 'Resistência total', 10e3, 'Ω', { min: 100, max: 10e6 }),
    { key: 'position', label: 'Posição do cursor', type: 'number', default: 0.5, min: 0, max: 1, step: 0.01, hint: '0 = extremo A, 1 = extremo B' },
    sel('taper', 'Curva', 'linear', [['linear', 'Linear (B)'], ['log', 'Logarítmica (A)']]),
  ],
  valueLabel: (p) => si(p.resistance, 'Ω'),
  render: ({ props }) => {
    const ang = -135 + 270 * Math.max(0, Math.min(1, Number(props.position)));
    return (
      <g>
        {[-10, 0, 10].map((x) => <Lead key={x} x1={x} y1={8} x2={x} y2={20} w={1.8} />)}
        <rect x={-15} y={-25} width={30} height={34} rx={2} fill="#1d4f9a" stroke="#0d2a55" strokeWidth={0.5} />
        <rect x={-15} y={-25} width={30} height={34} rx={2} fill="url(#g-cyl-shade)" opacity={0.4} />
        <circle cx={0} cy={-8} r={12.5} fill="url(#g-metal-r)" stroke="#59616b" strokeWidth={0.5} />
        <circle cx={0} cy={-8} r={8.5} fill="url(#g-black)" stroke="#000" strokeWidth={0.4} />
        {Array.from({ length: 18 }, (_, i) => {
          const a = (i * 20 * Math.PI) / 180;
          return <line key={i} x1={Math.cos(a) * 7.6} y1={-8 + Math.sin(a) * 7.6} x2={Math.cos(a) * 8.5} y2={-8 + Math.sin(a) * 8.5} stroke="#555" strokeWidth={0.5} />;
        })}
        <g transform={`rotate(${ang} 0 -8)`}>
          <rect x={-0.8} y={-15.5} width={1.6} height={6} rx={0.6} fill="#f1f3f5" />
        </g>
        <Txt x={0} y={5} size={2.6} fill="#cfe1ff">{formatSI(Number(props.resistance), 'Ω')}</Txt>
      </g>
    );
  },
  datasheet: { summary: 'Resistência entre 1 e 3 é fixa; o cursor (2) desliza ao longo dela. Usado como divisor de tensão ajustável ou reóstato.', specs: { 'Potência': '0,2 W', 'Rotação': '270°' } },
  sim: sim('potentiometer'),
});

// ───────── Disc (ceramic cap / thermistors) ─────────

function DiscPart({ fill, label, sub, stroke = '#7a4410', textFill = '#3b1f05' }: { fill: string; label: string; sub?: string; stroke?: string; textFill?: string }) {
  return (
    <g>
      <LeadPath d="M-3 0 L-3 5 L-10 12 L-10 20" />
      <LeadPath d="M3 0 L3 5 L10 12 L10 20" />
      <path d="M-4.5 1.5 Q0 3.8 4.5 1.5 L3.5 -1 L-3.5 -1 Z" fill={fill} />
      <ellipse cx={0} cy={-7} rx={9} ry={8.5} fill={fill} stroke={stroke} strokeWidth={0.4} />
      <ellipse cx={-2.5} cy={-10} rx={3.5} ry={2.2} fill="#fff" opacity={0.25} />
      <Txt x={0} y={sub ? -8.5 : -7} size={3.4} fill={textFill}>{label}</Txt>
      {sub && <Txt x={0} y={-4.3} size={2.2} fill={textFill} weight={500}>{sub}</Txt>}
    </g>
  );
}

const radialPins = (a = 'Terminal 1', b = 'Terminal 2', pa?: '+' | '-', pb?: '+' | '-'): PinDef[] => [
  { id: '1', name: a, x: -10, y: 20, role: 'passive', polarity: pa },
  { id: '2', name: b, x: 10, y: 20, role: 'passive', polarity: pb },
];

function capCode(farads: number): string {
  const pf = farads * 1e12;
  if (pf < 100) return String(+pf.toPrecision(2));
  const exp = Math.floor(Math.log10(pf)) - 1;
  const sig = Math.round(pf / 10 ** exp);
  return `${sig}${exp}`;
}

registerComponent({
  type: 'capacitor-ceramic',
  name: 'Condensador cerâmico',
  category: 'passive',
  prefix: 'C',
  description: 'Condensador cerâmico de disco, não polarizado. Marcação com código de 3 dígitos (pF).',
  tags: ['condensador', 'capacitor', 'cerâmico', 'desacoplamento'],
  bbox: { x: -12, y: -17, w: 24, h: 39 },
  pins: radialPins(),
  props: [num('capacitance', 'Capacidade', 100e-9, 'F', { min: 1e-12, max: 10e-6 }), num('voltage', 'Tensão máxima', 50, 'V')],
  valueLabel: (p) => si(p.capacitance, 'F'),
  render: ({ props }) => <DiscPart fill="url(#g-ceramic)" label={capCode(Number(props.capacitance))} />,
  datasheet: { summary: 'Armazena carga: Q = C·V. Impedância Xc = 1/(2πfC). Ideal para desacoplamento e filtros de alta frequência.', specs: { 'Dielétrico': 'X7R / Y5V', 'Passo': '0,2″ (5,08 mm)' }, notes: ['Código "104" = 10 × 10⁴ pF = 100 nF.'] },
  sim: sim('capacitor'),
});

registerComponent({
  type: 'capacitor-electrolytic',
  name: 'Condensador eletrolítico',
  category: 'passive',
  prefix: 'C',
  description: 'Condensador eletrolítico de alumínio, POLARIZADO. A faixa clara marca o terminal negativo.',
  tags: ['condensador', 'eletrolitico', 'polarizado', 'filtro'],
  bbox: { x: -12, y: -33, w: 24, h: 55 },
  pins: radialPins('Positivo (+)', 'Negativo (−)', '+', '-'),
  props: [num('capacitance', 'Capacidade', 100e-6, 'F', { min: 0.1e-6, max: 0.1 }), num('voltage', 'Tensão máxima', 25, 'V')],
  valueLabel: (p) => `${si(p.capacitance, 'F')} ${p.voltage}V`,
  render: ({ props }) => (
    <g>
      <Lead x1={-4} y1={3} x2={-4} y2={8} /><LeadPath d="M-4 8 L-10 14 L-10 20" />
      <Lead x1={4} y1={3} x2={4} y2={8} /><LeadPath d="M4 8 L10 14 L10 20" />
      <path d="M-9.5 -27 Q-9.5 -31 -6 -31 L6 -31 Q9.5 -31 9.5 -27 L9.5 1 Q9.5 4 6 4 L-6 4 Q-9.5 4 -9.5 1 Z" fill="url(#g-ecap-blue)" stroke="#071630" strokeWidth={0.4} />
      <path d="M3.2 -31 L6 -31 Q9.5 -31 9.5 -27 L9.5 1 Q9.5 4 6 4 L3.2 4 Z" fill="url(#g-ecap-stripe)" />
      {[-24, -17, -10, -3].map((y) => <rect key={y} x={5.2} y={y} width={2.4} height={0.9} fill="#1a2b4a" />)}
      <path d="M-9.5 -26.5 L9.5 -26.5" stroke="#000" strokeOpacity={0.35} strokeWidth={0.6} />
      <Txt x={-2.5} y={-13} size={2.4} fill="#e8eefc" rotate={-90}>{`${formatSI(Number(props.capacitance), 'F', 3)} ${props.voltage}V`}</Txt>
      <Txt x={-10.5} y={9} size={3.6} fill="#e94b4b" weight={800}>+</Txt>
    </g>
  ),
  datasheet: { summary: 'Grande capacidade em pouco volume. Ligar com polaridade errada ou acima da tensão nominal pode destruí-lo.', specs: { 'Tolerância': '±20 %', 'Temperatura': '−40…+105 °C' }, notes: ['O terminal mais comprido é o positivo.', 'A faixa com sinais "−" indica o negativo.'] },
  sim: sim('capacitor-polarized'),
});

// ───────── Inductors ─────────

registerComponent({
  type: 'inductor',
  name: 'Indutor axial',
  category: 'passive',
  prefix: 'L',
  description: 'Indutor axial com núcleo de ferrite e código de cores (µH).',
  tags: ['indutor', 'bobina', 'henry', 'choke'],
  bbox: { x: -21, y: -5, w: 42, h: 10 },
  pins: twoPins(),
  props: [num('inductance', 'Indutância', 100e-6, 'H', { min: 1e-9, max: 10 }), num('rdc', 'Resistência DC', 0.5, 'Ω')],
  valueLabel: (p) => si(p.inductance, 'H'),
  render: ({ props }) => {
    const b = resistorBands(Number(props.inductance) * 1e6 , 10);
    return <AxialBody fill="#6fae6a" bands={[{ x: -9.6, color: SILVER, w: 1.4 }, { x: -5.2, color: b[0] }, { x: -1.6, color: b[1] }, { x: 2, color: b[2] }, { x: 9.6, color: b[3], w: 2.4 }]} />;
  },
  datasheet: { summary: 'Opõe-se a variações de corrente: V = L·dI/dt. Reactância XL = 2πfL.' },
  sim: sim('inductor'),
});

registerComponent({
  type: 'coil-toroid',
  name: 'Bobina toroidal',
  category: 'passive',
  prefix: 'L',
  description: 'Bobina enrolada em núcleo toroidal de ferrite — típica em fontes comutadas e filtros.',
  tags: ['bobina', 'toroide', 'indutor'],
  bbox: { x: -17, y: -32, w: 34, h: 54 },
  pins: radialPins(),
  props: [num('inductance', 'Indutância', 1e-3, 'H'), num('rdc', 'Resistência DC', 0.2, 'Ω')],
  valueLabel: (p) => si(p.inductance, 'H'),
  render: () => (
    <g>
      <LeadPath d="M-6 -4 L-10 8 L-10 20" />
      <LeadPath d="M6 -4 L10 8 L10 20" />
      <circle cx={0} cy={-14} r={15} fill="#2c2f35" stroke="#111" strokeWidth={0.5} />
      <circle cx={0} cy={-14} r={6} fill="#0f1114" />
      {Array.from({ length: 30 }, (_, i) => {
        const a = (i / 30) * Math.PI * 2;
        const c = Math.cos(a), s = Math.sin(a);
        return <line key={i} x1={c * 5.4} y1={-14 + s * 5.4} x2={c * 15.6} y2={-14 + s * 15.6} stroke="url(#g-copper)" strokeWidth={1.25} strokeLinecap="round" />;
      })}
      <circle cx={0} cy={-14} r={15.6} fill="none" stroke="#7a3a12" strokeWidth={0.4} />
    </g>
  ),
  sim: sim('inductor'),
});

registerComponent({
  type: 'transformer',
  name: 'Transformador',
  category: 'passive',
  prefix: 'T',
  description: 'Transformador com núcleo laminado EI. Relação de espiras define a tensão do secundário.',
  tags: ['transformador', 'trafo', 'ac', 'isolamento'],
  bbox: { x: -32, y: -32, w: 64, h: 64 },
  pins: [
    { id: 'P1', name: 'Primário 1', x: -30, y: -10, role: 'passive' },
    { id: 'P2', name: 'Primário 2', x: -30, y: 10, role: 'passive' },
    { id: 'S1', name: 'Secundário 1', x: 30, y: -10, role: 'passive' },
    { id: 'S2', name: 'Secundário 2', x: 30, y: 10, role: 'passive' },
  ],
  props: [num('vp', 'Tensão primário (RMS)', 230, 'V'), num('vs', 'Tensão secundário (RMS)', 12, 'V'), num('va', 'Potência', 6, 'VA')],
  valueLabel: (p) => `${p.vp}V:${p.vs}V`,
  render: ({ props }) => (
    <g>
      <rect x={-24} y={-28} width={48} height={56} rx={1} fill="url(#g-metal)" stroke="#555c66" strokeWidth={0.6} />
      {Array.from({ length: 11 }, (_, i) => <line key={i} x1={-24} y1={-26 + i * 5} x2={24} y2={-26 + i * 5} stroke="#7d858f" strokeWidth={0.3} />)}
      <rect x={-16} y={-22} width={32} height={44} rx={2} fill="#1d2b4a" stroke="#0b1428" strokeWidth={0.5} />
      <rect x={-16} y={-22} width={32} height={44} rx={2} fill="url(#g-cyl-shade-h)" />
      <rect x={-16} y={-4} width={32} height={8} fill="#e8c95a" opacity={0.9} />
      <Txt x={0} y={-13} size={3.2} fill="#cfd8ea">{`${props.vp}V`}</Txt>
      <Txt x={0} y={0} size={2.6} fill="#3a2d05">{`${props.va}VA`}</Txt>
      <Txt x={0} y={13} size={3.2} fill="#cfd8ea">{`${props.vs}V`}</Txt>
      {[-10, 10].map((y) => <g key={y}><Lead x1={-30} y1={y} x2={-24} y2={y} w={1.8} /><Lead x1={24} y1={y} x2={30} y2={y} w={1.8} /></g>)}
    </g>
  ),
  datasheet: { summary: 'Vs/Vp = Ns/Np. Funciona apenas com corrente alternada. Isola galvanicamente o secundário.' },
  sim: sim('transformer', 'Requer simulação transitória (Fase 4).'),
});

// ───────── Thermistors / LDR ─────────

registerComponent({
  type: 'ntc',
  name: 'Termístor NTC',
  category: 'passive',
  prefix: 'TH',
  description: 'Resistência que DIMINUI com a temperatura (coeficiente negativo). Modelo β.',
  tags: ['termistor', 'ntc', 'temperatura', 'sensor'],
  bbox: { x: -12, y: -17, w: 24, h: 39 },
  pins: radialPins(),
  props: [num('r25', 'R a 25 °C', 10e3, 'Ω'), num('beta', 'Coeficiente β', 3950, 'K', { si: false }), num('temperature', 'Temperatura ambiente', 25, '°C', { si: false })],
  valueLabel: (p) => `NTC ${si(p.r25, 'Ω')}`,
  render: () => <DiscPart fill="#1e2a22" stroke="#000" label="103" sub="NTC" textFill="#c9d6cc" />,
  datasheet: { summary: 'R(T) = R25·exp(β·(1/T − 1/298,15)). Usado em medição e compensação de temperatura.' },
  sim: sim('thermistor'),
});

registerComponent({
  type: 'ptc',
  name: 'Termístor PTC',
  category: 'passive',
  prefix: 'TH',
  description: 'Resistência que AUMENTA com a temperatura. Usado como fusível rearmável e proteção.',
  tags: ['termistor', 'ptc', 'polyfuse', 'temperatura'],
  bbox: { x: -12, y: -17, w: 24, h: 39 },
  pins: radialPins(),
  props: [num('r25', 'R a 25 °C', 100, 'Ω'), num('temperature', 'Temperatura ambiente', 25, '°C', { si: false })],
  valueLabel: (p) => `PTC ${si(p.r25, 'Ω')}`,
  render: () => <DiscPart fill="#e8c21f" stroke="#7d6510" label="PTC" textFill="#4a3a00" />,
  sim: sim('thermistor'),
});

registerComponent({
  type: 'ldr',
  name: 'LDR (fotoresistência)',
  category: 'passive',
  prefix: 'LDR',
  description: 'Resistência dependente da luz (CdS). Escuro: ~1 MΩ; luz intensa: ~100 Ω.',
  tags: ['ldr', 'luz', 'fotoresistor', 'sensor'],
  bbox: { x: -12, y: -18, w: 24, h: 40 },
  pins: radialPins(),
  props: [{ key: 'lux', label: 'Iluminação', type: 'number', default: 300, unit: 'lux', min: 0, max: 100000, si: false }, num('rdark', 'R no escuro', 1e6, 'Ω'), num('r10lux', 'R a 10 lux', 20e3, 'Ω')],
  valueLabel: (p) => `${p.lux} lux`,
  render: () => (
    <g>
      <LeadPath d="M-3 0 L-3 5 L-10 12 L-10 20" />
      <LeadPath d="M3 0 L3 5 L10 12 L10 20" />
      <circle cx={0} cy={-7} r={10} fill="#f2eee4" stroke="#9b8f7a" strokeWidth={0.5} />
      <path d="M-7 -12 H6 V-10 H-6 V-8 H6 V-6 H-6 V-4 H6 V-2 H-7" fill="none" stroke="#b5452a" strokeWidth={1.2} />
      <rect x={-8.5} y={-14.5} width={2} height={15} fill="#cfc6b2" /><rect x={6.5} y={-14.5} width={2} height={15} fill="#cfc6b2" />
      <circle cx={0} cy={-7} r={10} fill="url(#g-glass)" opacity={0.6} />
    </g>
  ),
  datasheet: { summary: 'R ≈ R10·(lux/10)^(−γ), γ ≈ 0,7. Resposta lenta (dezenas de ms).' },
  sim: sim('ldr'),
});

registerComponent({
  type: 'fuse',
  name: 'Fusível de vidro',
  category: 'passive',
  prefix: 'F',
  description: 'Fusível de cartucho de vidro. Abre o circuito quando a corrente excede o valor nominal.',
  tags: ['fusivel', 'proteção', 'sobrecorrente'],
  bbox: { x: -21, y: -5, w: 42, h: 10 },
  pins: twoPins(),
  props: [num('rating', 'Corrente nominal', 0.5, 'A'), sel('speed', 'Tipo', 'fast', [['fast', 'Rápido (F)'], ['slow', 'Lento (T)']])],
  valueLabel: (p) => `${p.speed === 'slow' ? 'T' : 'F'}${si(p.rating, 'A')}`,
  render: ({ props, state }) => (
    <g>
      <Lead x1={-20} y1={0} x2={-14} y2={0} /><Lead x1={14} y1={0} x2={20} y2={0} />
      <rect x={-9} y={-3.6} width={18} height={7.2} fill="url(#g-glass)" stroke="#8aa0b0" strokeWidth={0.3} />
      {state?.blown
        ? <><path d="M-9 0 Q-6 -1 -3 0 M3 0 Q6 1 9 0" fill="none" stroke="#b8bec6" strokeWidth={0.5} /><rect x={-6} y={-3.2} width={12} height={6.4} fill="#3a2a1a" opacity={0.55} /></>
        : <path d="M-9 0 Q-4 -1.5 0 0 T9 0" fill="none" stroke="#b8bec6" strokeWidth={0.5} />}
      <rect x={-15} y={-4.2} width={6.5} height={8.4} rx={0.8} fill="url(#g-metal)" stroke="#6f7782" strokeWidth={0.3} />
      <rect x={8.5} y={-4.2} width={6.5} height={8.4} rx={0.8} fill="url(#g-metal)" stroke="#6f7782" strokeWidth={0.3} />
      <Txt x={-11.7} y={0} size={2} fill="#333">{`${props.speed === 'slow' ? 'T' : 'F'}${formatSI(Number(props.rating), 'A', 2).replace(' ', '')}`}</Txt>
    </g>
  ),
  sim: sim('fuse'),
});
