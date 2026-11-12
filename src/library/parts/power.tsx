import type { ReactNode } from "react";
import { registerComponent } from '../registry';
import { Lead, Txt } from '../render/primitives';
import { num, sel, si, sim } from './common';
import type { PinDef } from '../types';

const PLUS = { role: 'power' as const, polarity: '+' as const };
const MINUS = { role: 'ground' as const, polarity: '-' as const };

/** Red/black binding post. */
function Post({ x, y, color }: { x: number; y: number; color: 'red' | 'black' }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5.2} fill={color === 'red' ? 'url(#g-red-plastic)' : 'url(#g-black)'} stroke="#000" strokeWidth={0.4} />
      <circle cx={x} cy={y} r={2.4} fill="url(#g-metal-r)" />
      <circle cx={x} cy={y} r={0.9} fill="#222" />
    </g>
  );
}

function SevenSegText({ x, y, text, size = 7, color = '#ff5a3a' }: { x: number; y: number; text: string; size?: number; color?: string }) {
  return <Txt x={x} y={y} size={size} fill={color} weight={700}>{text}</Txt>;
}

// ───────── Batteries ─────────

registerComponent({
  type: 'battery-aa',
  name: 'Pilha AA 1,5 V',
  category: 'power',
  subcategory: 'Pilhas e baterias',
  prefix: 'BT',
  description: 'Pilha alcalina AA (LR6). Polo + na extremidade com o botão.',
  tags: ['pilha', 'aa', 'bateria', '1.5v'],
  bbox: { x: -31, y: -9, w: 62, h: 18 },
  pins: [{ id: '-', name: 'Negativo (−)', x: -30, y: 0, ...MINUS }, { id: '+', name: 'Positivo (+)', x: 30, y: 0, ...PLUS }],
  props: [num('voltage', 'Tensão nominal', 1.5, 'V'), num('rint', 'Resistência interna', 0.15, 'Ω'), num('capacity', 'Capacidade', 2.5, 'Ah')],
  valueLabel: (p) => `${p.voltage} V`,
  render: () => (
    <g>
      <rect x={-27} y={-7.5} width={52} height={15} rx={1.5} fill="#1b1d21" />
      <rect x={-27} y={-7.5} width={20} height={15} fill="#c88a1c" />
      <rect x={-27} y={-7.5} width={52} height={15} rx={1.5} fill="url(#g-cyl-shade)" />
      <rect x={-30} y={-6} width={3.2} height={12} rx={0.6} fill="url(#g-metal)" />
      <rect x={25} y={-6.8} width={2} height={13.6} fill="url(#g-metal)" />
      <rect x={27} y={-3} width={3} height={6} rx={0.8} fill="url(#g-metal)" />
      <Txt x={6} y={-1.5} size={4.2} fill="#f2f2f2" weight={800}>1.5V</Txt>
      <Txt x={6} y={3.2} size={2.4} fill="#c9a43a" weight={600}>AA · LR6</Txt>
      <Txt x={21} y={0} size={4} fill="#f2f2f2" weight={800}>+</Txt>
      <Txt x={-23} y={0} size={4} fill="#2a1a00" weight={800}>−</Txt>
    </g>
  ),
  datasheet: { summary: 'Alcalina: 1,5 V nova, ~0,9 V descarregada. Associe em série para somar tensões.' },
  sim: sim('battery'),
});

registerComponent({
  type: 'battery-9v',
  name: 'Bateria 9 V',
  category: 'power',
  subcategory: 'Pilhas e baterias',
  prefix: 'BT',
  description: 'Bateria retangular de 9 V (6LR61) com terminais de mola.',
  tags: ['bateria', '9v', 'pp3'],
  bbox: { x: -15, y: -12, w: 34, h: 78 },
  pins: [{ id: '+', name: 'Positivo (+)', x: -10, y: -10, ...PLUS }, { id: '-', name: 'Negativo (−)', x: 10, y: -10, ...MINUS }],
  props: [num('voltage', 'Tensão nominal', 9, 'V'), num('rint', 'Resistência interna', 1.5, 'Ω')],
  valueLabel: (p) => `${p.voltage} V`,
  render: () => (
    <g>
      <rect x={-14} y={-3} width={32} height={68} rx={2.5} fill="#16181c" stroke="#000" strokeWidth={0.5} />
      <rect x={-14} y={30} width={32} height={35} rx={2.5} fill="#2d6fd1" />
      <rect x={-14} y={-3} width={32} height={68} rx={2.5} fill="url(#g-cyl-shade-h)" opacity={0.6} />
      <rect x={-13} y={-4} width={30} height={4} rx={1} fill="url(#g-metal)" />
      <circle cx={-10} cy={-6} r={3.6} fill="url(#g-metal-r)" stroke="#555" strokeWidth={0.4} />
      <circle cx={-10} cy={-6} r={1.6} fill="#888" />
      <path d="M6.5 -9.5 h7 l1.5 2 v3 l-1.5 2 h-7 l-1.5 -2 v-3 Z" fill="url(#g-metal-r)" stroke="#555" strokeWidth={0.4} />
      <Txt x={2} y={15} size={10} fill="#f4f4f4" weight={800}>9V</Txt>
      <Txt x={2} y={42} size={3} fill="#e9f0ff">ALKALINE</Txt>
      <Txt x={2} y={50} size={2.6} fill="#cfdcf5">6LR61</Txt>
      <Txt x={-10} y={4} size={4} fill="#ff6b5f" weight={800}>+</Txt>
      <Txt x={10} y={4} size={4} fill="#cfd3d8" weight={800}>−</Txt>
    </g>
  ),
  datasheet: { summary: 'Capacidade típica 500 mAh. Resistência interna elevada — não fornece correntes grandes.' },
  sim: sim('battery'),
});

registerComponent({
  type: 'battery-li-ion',
  name: 'Bateria de lítio 18650',
  category: 'power',
  subcategory: 'Pilhas e baterias',
  prefix: 'BT',
  description: 'Célula Li-ion 18650, 3,7 V nominal (4,2 V carregada).',
  tags: ['lítio', 'li-ion', '18650', 'bateria', '3.7v'],
  bbox: { x: -41, y: -11, w: 82, h: 22 },
  pins: [{ id: '-', name: 'Negativo (−)', x: -40, y: 0, ...MINUS }, { id: '+', name: 'Positivo (+)', x: 40, y: 0, ...PLUS }],
  props: [num('voltage', 'Tensão nominal', 3.7, 'V'), num('capacity', 'Capacidade', 2.6, 'Ah'), num('rint', 'Resistência interna', 0.05, 'Ω')],
  valueLabel: (p) => `${p.voltage} V`,
  render: () => (
    <g>
      <rect x={-37} y={-9.5} width={72} height={19} rx={2} fill="#1f8a4c" />
      <rect x={-37} y={-9.5} width={72} height={19} rx={2} fill="url(#g-cyl-shade)" />
      <rect x={-40} y={-7} width={3.4} height={14} rx={0.8} fill="url(#g-metal)" />
      <rect x={35} y={-8} width={2} height={16} fill="url(#g-metal)" />
      <rect x={37} y={-3.5} width={3} height={7} rx={0.8} fill="url(#g-metal)" />
      <Txt x={-2} y={-2} size={4.6} fill="#fff" weight={800}>Li-ion 3.7V</Txt>
      <Txt x={-2} y={3.6} size={2.6} fill="#d6f5e2">18650 · 2600mAh</Txt>
      <Txt x={30} y={0} size={4.4} fill="#fff" weight={800}>+</Txt>
    </g>
  ),
  datasheet: { summary: 'Nunca descarregar abaixo de ~3,0 V nem carregar acima de 4,2 V. Requer circuito de proteção (BMS).' },
  sim: sim('battery'),
});

registerComponent({
  type: 'coin-cell',
  name: 'Pilha botão CR2032',
  category: 'power',
  subcategory: 'Pilhas e baterias',
  prefix: 'BT',
  description: 'Pilha de lítio de botão 3 V em suporte com terminais.',
  tags: ['cr2032', 'botão', 'lítio', '3v'],
  bbox: { x: -13, y: -26, w: 26, h: 48 },
  pins: [{ id: '+', name: 'Positivo (+)', x: -10, y: 20, ...PLUS }, { id: '-', name: 'Negativo (−)', x: 10, y: 20, ...MINUS }],
  props: [num('voltage', 'Tensão nominal', 3, 'V'), num('rint', 'Resistência interna', 15, 'Ω')],
  valueLabel: (p) => `${p.voltage} V`,
  render: () => (
    <g>
      <Lead x1={-10} y1={6} x2={-10} y2={20} /><Lead x1={10} y1={6} x2={10} y2={20} />
      <rect x={-12.5} y={-25} width={25} height={31} rx={3} fill="#1a1c20" />
      <circle cx={0} cy={-11} r={11} fill="url(#g-metal-r)" stroke="#6b737d" strokeWidth={0.5} />
      <Txt x={0} y={-13} size={3.6} fill="#3a3f46" weight={800}>CR2032</Txt>
      <Txt x={0} y={-8} size={3.2} fill="#3a3f46">3V +</Txt>
    </g>
  ),
  sim: sim('battery'),
});

// ───────── Bench / lab sources ─────────

function BenchBox({ w, h, title, children }: { w: number; h: number; title: string; children?: ReactNode }) {
  return (
    <g>
      <rect x={-w / 2} y={-h} width={w} height={h} rx={3} fill="#2a2f37" stroke="#0e1014" strokeWidth={0.8} />
      <rect x={-w / 2 + 2} y={-h + 2} width={w - 4} height={h - 4} rx={2} fill="#3a414c" />
      <rect x={-w / 2 + 2} y={-h + 2} width={w - 4} height={5} rx={2} fill="#4a5361" />
      <Txt x={-w / 2 + 5} y={-h + 4.6} size={2.8} fill="#cfd6e0" anchor="start">{title}</Txt>
      {children}
    </g>
  );
}

const benchPins = (a: string, b: string, pa: '+' | '-' | undefined, pb: '+' | '-' | undefined): PinDef[] => [
  { id: pa === '+' ? '+' : '1', name: a, x: -10, y: 0, role: pa === '+' ? 'power' : 'passive', polarity: pa },
  { id: pb === '-' ? '-' : '2', name: b, x: 10, y: 0, role: pb === '-' ? 'ground' : 'passive', polarity: pb },
];

registerComponent({
  type: 'dc-supply',
  name: 'Fonte DC regulável',
  category: 'power',
  subcategory: 'Fontes de laboratório',
  prefix: 'PS',
  description: 'Fonte de alimentação de bancada com tensão ajustável e limite de corrente (CV/CC).',
  tags: ['fonte', 'bancada', 'dc', 'regulável', 'alimentação'],
  bbox: { x: -36, y: -56, w: 72, h: 62 },
  pins: benchPins('Saída + (vermelho)', 'Saída − (preto)', '+', '-'),
  props: [num('voltage', 'Tensão', 5, 'V', { min: 0, max: 30 }), num('ilimit', 'Limite de corrente', 1, 'A', { min: 0, max: 5 })],
  valueLabel: (p) => `${p.voltage} V / ${p.ilimit} A`,
  render: ({ props }) => (
    <BenchBox w={70} h={55} title="DC POWER SUPPLY 0–30V 5A">
      <rect x={-31} y={-44} width={34} height={14} rx={1} fill="#0b0f0c" />
      <SevenSegText x={-14} y={-37} text={`${Number(props.voltage).toFixed(2)}V`} size={6.5} color="#ff5a3a" />
      <rect x={-31} y={-28} width={34} height={11} rx={1} fill="#0b0f0c" />
      <SevenSegText x={-14} y={-22.5} text={`${Number(props.ilimit).toFixed(2)}A`} size={5.4} color="#3dff7a" />
      <circle cx={18} cy={-37} r={7} fill="url(#g-black)" stroke="#000" strokeWidth={0.4} /><line x1={18} y1={-37} x2={18} y2={-43} stroke="#ddd" strokeWidth={1} />
      <circle cx={18} cy={-20} r={5.5} fill="url(#g-black)" stroke="#000" strokeWidth={0.4} /><line x1={18} y1={-20} x2={22} y2={-23} stroke="#ddd" strokeWidth={1} />
      <Txt x={18} y={-28} size={2.2} fill="#aab3c0">VOLT</Txt><Txt x={18} y={-13} size={2.2} fill="#aab3c0">CURR</Txt>
      <Post x={-10} y={0} color="red" /><Post x={10} y={0} color="black" />
      <Txt x={-10} y={-7.5} size={3} fill="#ff8a80" weight={800}>+</Txt><Txt x={10} y={-7.5} size={3} fill="#e0e0e0" weight={800}>−</Txt>
    </BenchBox>
  ),
  datasheet: { summary: 'Modo CV: mantém a tensão definida. Se a carga pedir mais que o limite, passa a modo CC (corrente constante).' },
  sim: sim('vsource'),
});

registerComponent({
  type: 'variable-source',
  name: 'Fonte de tensão variável',
  category: 'power',
  subcategory: 'Fontes de laboratório',
  prefix: 'V',
  description: 'Fonte de tensão ideal ajustável (DC), útil para experiências e varrimentos.',
  tags: ['fonte', 'tensão', 'variável', 'ideal'],
  bbox: { x: -21, y: -42, w: 42, h: 48 },
  pins: benchPins('Positivo (+)', 'Negativo (−)', '+', '-'),
  props: [num('voltage', 'Tensão', 3.3, 'V', { min: -50, max: 50 })],
  valueLabel: (p) => si(p.voltage, 'V'),
  render: ({ props }) => (
    <BenchBox w={40} h={41} title="V-SOURCE">
      <rect x={-16} y={-32} width={32} height={11} rx={1} fill="#0b0f0c" />
      <SevenSegText x={0} y={-26.5} text={`${Number(props.voltage).toFixed(2)}V`} size={5.6} color="#ffb13a" />
      <circle cx={0} cy={-14} r={4.6} fill="url(#g-black)" /><line x1={0} y1={-14} x2={3} y2={-17.5} stroke="#ddd" strokeWidth={0.9} />
      <Post x={-10} y={0} color="red" /><Post x={10} y={0} color="black" />
    </BenchBox>
  ),
  sim: sim('vsource'),
});

registerComponent({
  type: 'current-source',
  name: 'Fonte de corrente',
  category: 'power',
  subcategory: 'Fontes de laboratório',
  prefix: 'I',
  description: 'Fonte de corrente constante ideal. A corrente sai pelo terminal +.',
  tags: ['fonte', 'corrente', 'ideal'],
  bbox: { x: -21, y: -42, w: 42, h: 48 },
  pins: benchPins('Saída (+)', 'Retorno (−)', '+', '-'),
  props: [num('current', 'Corrente', 0.01, 'A', { min: -10, max: 10 })],
  valueLabel: (p) => si(p.current, 'A'),
  render: ({ props }) => (
    <BenchBox w={40} h={41} title="I-SOURCE">
      <rect x={-16} y={-32} width={32} height={11} rx={1} fill="#0b0f0c" />
      <SevenSegText x={0} y={-26.5} text={si(props.current, 'A')} size={5} color="#3dd2ff" />
      <path d="M-4 -12 h8 M2 -15 l3 3 -3 3" stroke="#cfd6e0" strokeWidth={1} fill="none" />
      <Post x={-10} y={0} color="red" /><Post x={10} y={0} color="black" />
    </BenchBox>
  ),
  sim: sim('isource'),
});

registerComponent({
  type: 'ac-source',
  name: 'Fonte AC',
  category: 'power',
  subcategory: 'Fontes de laboratório',
  prefix: 'V',
  description: 'Fonte de tensão alternada sinusoidal (ex.: secundário de transformador ou rede).',
  tags: ['ac', 'alternada', 'sinusoidal', 'rede', '50hz'],
  bbox: { x: -26, y: -46, w: 52, h: 52 },
  pins: benchPins('Fase / L', 'Neutro / N', undefined, undefined),
  props: [num('vrms', 'Tensão eficaz (RMS)', 12, 'V'), num('frequency', 'Frequência', 50, 'Hz'), num('phase', 'Fase', 0, '°', { si: false })],
  valueLabel: (p) => `${p.vrms} Vrms ${p.frequency} Hz`,
  render: ({ props }) => (
    <BenchBox w={50} h={45} title="AC SOURCE">
      <rect x={-21} y={-36} width={42} height={18} rx={1} fill="#06100a" />
      <path d="M-19 -27 C-15 -36 -11 -36 -7 -27 S1 -18 5 -27 S13 -36 17 -27" fill="none" stroke="#3dff7a" strokeWidth={0.9} />
      <Txt x={0} y={-13} size={3} fill="#cfd6e0">{`${props.vrms}V~ ${props.frequency}Hz`}</Txt>
      <Post x={-10} y={0} color="red" /><Post x={10} y={0} color="black" />
    </BenchBox>
  ),
  datasheet: { summary: 'Vpico = Vrms·√2. Ex.: 12 Vrms → 16,97 V de pico.' },
  sim: sim('vsource-sine', 'Requer simulação transitória (Fase 4).'),
});

registerComponent({
  type: 'signal-generator',
  name: 'Gerador de sinais',
  category: 'power',
  subcategory: 'Fontes de laboratório',
  prefix: 'FG',
  description: 'Gerador de funções: onda sinusoidal, quadrada, triangular e dente-de-serra.',
  tags: ['gerador', 'sinais', 'funções', 'onda', 'quadrada'],
  bbox: { x: -36, y: -50, w: 72, h: 56 },
  pins: benchPins('Saída (OUT)', 'Massa (COM)', undefined, '-'),
  props: [
    sel('wave', 'Forma de onda', 'sine', [['sine', 'Sinusoidal'], ['square', 'Quadrada'], ['triangle', 'Triangular'], ['saw', 'Dente-de-serra']]),
    num('frequency', 'Frequência', 1000, 'Hz'), num('amplitude', 'Amplitude (pico)', 1, 'V'), num('offset', 'Offset DC', 0, 'V'), { key: 'duty', label: 'Duty cycle', type: 'number', default: 50, unit: '%', min: 1, max: 99 },
  ],
  valueLabel: (p) => `${si(p.frequency, 'Hz')} ${si(p.amplitude, 'V')}`,
  render: ({ props }) => {
    const paths: Record<string, string> = {
      sine: 'M-30 -32 C-26 -42 -22 -42 -18 -32 S-10 -22 -6 -32 S2 -42 6 -32',
      square: 'M-30 -32 V-40 H-22 V-24 H-14 V-40 H-6 V-24 H2 V-32',
      triangle: 'M-30 -32 L-26 -40 L-18 -24 L-10 -40 L-2 -24 L2 -32',
      saw: 'M-30 -24 L-20 -40 V-24 L-10 -40 V-24 L0 -40 V-24',
    };
    return (
      <BenchBox w={70} h={49} title="FUNCTION GENERATOR">
        <rect x={-32} y={-43} width={40} height={22} rx={1} fill="#081018" />
        <path d={paths[String(props.wave)] ?? paths.sine} fill="none" stroke="#ffd23a" strokeWidth={0.9} />
        <Txt x={-12} y={-19} size={2.6} fill="#cfd6e0">{si(props.frequency, 'Hz')}</Txt>
        <circle cx={22} cy={-32} r={7} fill="url(#g-black)" /><line x1={22} y1={-32} x2={26} y2={-37} stroke="#ddd" strokeWidth={1} />
        {[0, 1, 2, 3].map((i) => <rect key={i} x={12 + (i % 2) * 10} y={-21 + Math.floor(i / 2) * 5} width={8} height={3.4} rx={0.6} fill="#55606e" />)}
        <Post x={-10} y={0} color="red" /><Post x={10} y={0} color="black" />
      </BenchBox>
    );
  },
  sim: sim('vsource-wave', 'Requer simulação transitória (Fase 4).'),
});

registerComponent({
  type: 'solar-panel',
  name: 'Painel solar',
  category: 'power',
  subcategory: 'Energia renovável',
  prefix: 'PV',
  description: 'Pequeno painel fotovoltaico monocristalino (ex.: 6 V / 1 W).',
  tags: ['solar', 'fotovoltaico', 'painel', 'energia'],
  bbox: { x: -46, y: -66, w: 92, h: 72 },
  pins: benchPins('Positivo (+)', 'Negativo (−)', '+', '-'),
  props: [num('voc', 'Tensão em vazio (Voc)', 6, 'V'), num('isc', 'Corrente curto-circuito (Isc)', 0.2, 'A'), { key: 'irradiance', label: 'Irradiância', type: 'number', default: 1000, unit: 'W/m²', min: 0, max: 1200 }],
  valueLabel: (p) => `${p.voc}V ${si(p.isc, 'A')}`,
  render: () => (
    <g>
      <rect x={-45} y={-65} width={90} height={58} rx={1.5} fill="#c6ccd3" stroke="#7d858f" strokeWidth={0.6} />
      <rect x={-42} y={-62} width={84} height={52} fill="url(#g-solar)" />
      {Array.from({ length: 6 }, (_, i) => <line key={`v${i}`} x1={-42 + (i + 1) * 12} y1={-62} x2={-42 + (i + 1) * 12} y2={-10} stroke="#c9d3e6" strokeWidth={0.5} />)}
      {Array.from({ length: 3 }, (_, i) => <line key={`h${i}`} x1={-42} y1={-62 + (i + 1) * 13} x2={42} y2={-62 + (i + 1) * 13} stroke="#c9d3e6" strokeWidth={0.5} />)}
      {Array.from({ length: 7 }, (_, c) => Array.from({ length: 4 }, (_, r) => <line key={`b${c}${r}`} x1={-42 + c * 12 + 2} y1={-62 + r * 13 + 6.5} x2={-42 + c * 12 + 10} y2={-62 + r * 13 + 6.5} stroke="#6f86b5" strokeWidth={0.25} />))}
      <path d="M-42 -62 L-10 -62 L-42 -30 Z" fill="#fff" opacity={0.07} />
      <Lead x1={-10} y1={-7} x2={-10} y2={0} w={1.8} /><Lead x1={10} y1={-7} x2={10} y2={0} w={1.8} />
      <rect x={-16} y={-9} width={32} height={4} rx={1} fill="#222" />
      <Txt x={-10} y={-7} size={2.6} fill="#ff6b5f" weight={800}>+</Txt><Txt x={10} y={-7} size={2.6} fill="#ddd" weight={800}>−</Txt>
    </g>
  ),
  datasheet: { summary: 'Comporta-se como fonte de corrente dependente da luz em paralelo com um díodo. Potência máxima no "joelho" da curva I-V.' },
  sim: sim('solar'),
});
