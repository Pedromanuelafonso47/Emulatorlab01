import { registerComponent } from '../registry';
import { HeaderPin, Lead, LeadPath, SmdLed, Txt } from '../render/primitives';
import { num, sel, si, sim } from './common';
import type { PinDef } from '../types';

const two = (y: number, a = 'Terminal 1', b = 'Terminal 2', pol = false): PinDef[] => [
  { id: pol ? '+' : '1', name: a, x: -10, y, role: pol ? 'power' : 'passive', polarity: pol ? '+' : undefined },
  { id: pol ? '-' : '2', name: b, x: 10, y, role: pol ? 'ground' : 'passive', polarity: pol ? '-' : undefined },
];

/** Wire leads ending in a 2.54 mm connector housing. */
function CableConnector({ colors, y0, y1 }: { colors: string[]; y0: number; y1: number }) {
  const n = colors.length;
  const x0 = -Math.floor((n - 1) / 2) * 10;
  return (
    <g>
      {colors.map((c, i) => {
        const x = x0 + i * 10;
        const xs = (i - (n - 1) / 2) * 2.4;
        return <path key={i} d={`M${xs} ${y0} C${xs} ${(y0 + y1) / 2} ${x} ${(y0 + y1) / 2} ${x} ${y1 - 6}`} fill="none" stroke={c} strokeWidth={2.2} strokeLinecap="round" />;
      })}
      <rect x={x0 - 5} y={y1 - 7} width={(n - 1) * 10 + 10} height={9} rx={1} fill="#16181b" stroke="#000" strokeWidth={0.4} />
      {colors.map((_, i) => <rect key={i} x={x0 + i * 10 - 1.5} y={y1 - 1.5} width={3} height={3} fill="#050506" />)}
    </g>
  );
}

// ───────── DC motor ─────────
registerComponent({
  type: 'dc-motor', name: 'Motor DC', category: 'actuators', prefix: 'M',
  description: 'Motor de corrente contínua com escovas (tipo 130). O sentido inverte com a polaridade.',
  tags: ['motor', 'dc', 'escovas', 'rotação'],
  bbox: { x: -18, y: -62, w: 36, h: 68 },
  pins: two(0, 'Terminal +', 'Terminal −'),
  props: [num('vnom', 'Tensão nominal', 6, 'V'), num('rpm', 'Velocidade nominal', 9000, 'rpm', { si: false }), num('rwinding', 'Resistência do enrolamento', 3, 'Ω'), num('inoload', 'Corrente em vazio', 0.15, 'A')],
  valueLabel: (p) => `${p.vnom} V`,
  render: ({ state }) => (
    <g>
      <LeadPath d="M-6 -12 L-10 -6 L-10 0" /><LeadPath d="M6 -12 L10 -6 L10 0" />
      <rect x={-17} y={-50} width={34} height={40} rx={4} fill="url(#g-metal-h)" stroke="#5f6670" strokeWidth={0.5} />
      <rect x={-17} y={-16} width={34} height={6} rx={2} fill="#1a1c20" />
      <rect x={-9} y={-14.5} width={4} height={3} fill="url(#g-copper)" /><rect x={5} y={-14.5} width={4} height={3} fill="url(#g-copper)" />
      <rect x={-6} y={-55} width={12} height={6} rx={1.5} fill="url(#g-metal)" />
      <g transform={`rotate(${state?.angle ?? 0} 0 -60)`}><rect x={-1} y={-62} width={2} height={8} fill="url(#g-metal-h)" /></g>
      <Txt x={0} y={-32} size={3} fill="#4a525c">DC MOTOR</Txt>
    </g>
  ),
  datasheet: { summary: 'Precisa de mais corrente do que um pino de Arduino fornece: use transístor/MOSFET/ponte H e díodo de roda livre.' },
  sim: sim('dc-motor'),
});

// ───────── Servo SG90 ─────────
registerComponent({
  type: 'servo', name: 'Servomotor SG90', category: 'actuators', prefix: 'M',
  description: 'Micro servo 180°. Posição controlada por PWM de 50 Hz (impulso 1–2 ms).',
  tags: ['servo', 'sg90', 'pwm', 'posição'],
  bbox: { x: -40, y: -66, w: 80, h: 72 },
  pins: [{ id: 'GND', name: 'GND (castanho)', x: -10, y: 0, role: 'ground' }, { id: 'VCC', name: 'V+ (vermelho)', x: 0, y: 0, role: 'power' }, { id: 'SIG', name: 'Sinal PWM (laranja)', x: 10, y: 0, role: 'input' }],
  props: [num('angle', 'Ângulo', 90, '°', { si: false, min: 0, max: 180 })],
  valueLabel: (p) => `${p.angle}°`,
  render: ({ props, state }) => {
    const a = Number(state?.angle ?? props.angle) - 90;
    return (
      <g>
        <CableConnector colors={['#6b3f1d', '#d42a1e', '#f08a14']} y0={-24} y1={0} />
        <rect x={-38} y={-58} width={76} height={6} rx={1} fill="#2f6fd6" stroke="#173a75" strokeWidth={0.4} />
        <circle cx={-33} cy={-55} r={1.6} fill="#0e1116" /><circle cx={33} cy={-55} r={1.6} fill="#0e1116" />
        <rect x={-23} y={-62} width={46} height={38} rx={2} fill="url(#g-blue-plastic)" stroke="#173a75" strokeWidth={0.5} />
        <circle cx={-10} cy={-48} r={8} fill="#2a63c0" stroke="#173a75" strokeWidth={0.4} />
        <g transform={`rotate(${a} -10 -48)`}>
          <path d="M-13 -48 L-11.5 -72 Q-10 -75 -8.5 -72 L-7 -48 Z" fill="#f4f4f4" stroke="#999" strokeWidth={0.4} />
          <circle cx={-10} cy={-48} r={4.5} fill="#f4f4f4" stroke="#999" strokeWidth={0.4} />
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={-10} cy={-56 - i * 4} r={0.7} fill="#aaa" />)}
        </g>
        <Txt x={8} y={-38} size={3.6} fill="#e9f0ff">SG90</Txt>
      </g>
    );
  },
  datasheet: { summary: '1 ms → 0°, 1,5 ms → 90°, 2 ms → 180°. Alimentação 4,8–6 V; picos de ~600 mA.' },
  sim: sim('servo', 'Requer MCU/PWM (Fase 5).'),
});

// ───────── Stepper motors ─────────
registerComponent({
  type: 'stepper-28byj', name: 'Motor de passo 28BYJ-48', category: 'actuators', prefix: 'M',
  description: 'Motor de passo unipolar 5 V com redutor 1:64 (2048 passos/volta). Usar com ULN2003.',
  tags: ['passo', 'stepper', '28byj-48', 'unipolar'],
  bbox: { x: -32, y: -82, w: 64, h: 88 },
  pins: [['IN1', 'Bobina A (azul)', '#2357c4'], ['IN2', 'Bobina B (rosa)', '#f07fb0'], ['IN3', 'Bobina C (amarelo)', '#f2d21b'], ['IN4', 'Bobina D (laranja)', '#f07d14'], ['COM', 'Comum +5 V (vermelho)', '#d22a1e']]
    .map(([id, name], i) => ({ id, name, x: -20 + i * 10, y: 0, role: id === 'COM' ? 'power' as const : 'passive' as const })),
  render: () => (
    <g>
      <g transform="translate(0 0)">
        {['#2357c4', '#f07fb0', '#f2d21b', '#f07d14', '#d22a1e'].map((c, i) => <path key={i} d={`M${(i - 2) * 2.2} -26 C${(i - 2) * 2.2} -12 ${-20 + i * 10} -12 ${-20 + i * 10} -6`} fill="none" stroke={c} strokeWidth={2} />)}
        <rect x={-25} y={-7} width={50} height={9} rx={1} fill="#f4f4f4" stroke="#999" strokeWidth={0.4} />
      </g>
      <rect x={-31} y={-62} width={62} height={8} rx={2} fill="url(#g-metal)" />
      <circle cx={0} cy={-52} r={28} fill="url(#g-metal-r)" stroke="#5f6670" strokeWidth={0.6} />
      <rect x={-12} y={-30} width={24} height={8} rx={1} fill="#2f6fd6" />
      <circle cx={0} cy={-62} r={9} fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.5} />
      <rect x={-1.5} y={-68} width={3} height={12} rx={1} fill="#c7ccd1" stroke="#777" strokeWidth={0.3} />
      <Txt x={0} y={-42} size={3.2} fill="#4a525c">28BYJ-48</Txt><Txt x={0} y={-37} size={2.4} fill="#4a525c">5V DC</Txt>
    </g>
  ),
  datasheet: { summary: 'Sequência de meio-passo (8 fases) para máxima resolução. Binário ~34 mN·m.' },
  sim: sim('stepper', 'Requer MCU (Fase 5).'),
});

registerComponent({
  type: 'stepper-nema17', name: 'Motor de passo NEMA 17', category: 'actuators', prefix: 'M',
  description: 'Motor de passo bipolar 1,8°/passo (200 passos/volta). Usar com driver A4988/DRV8825 ou L298N.',
  tags: ['passo', 'stepper', 'nema17', 'bipolar', 'cnc', '3d'],
  bbox: { x: -44, y: -100, w: 88, h: 106 },
  pins: [['A+', 'Bobina A+ (preto)'], ['A-', 'Bobina A− (verde)'], ['B+', 'Bobina B+ (vermelho)'], ['B-', 'Bobina B− (azul)']].map(([id, name], i) => ({ id, name, x: -10 + i * 10, y: 0, role: 'passive' as const })),
  render: () => (
    <g>
      {['#1b1b1b', '#2c9a3a', '#d22a1e', '#2357c4'].map((c, i) => <path key={i} d={`M${-3 + i * 2} -18 C${-3 + i * 2} -10 ${-10 + i * 10} -10 ${-10 + i * 10} -6`} fill="none" stroke={c} strokeWidth={2} />)}
      <rect x={-15} y={-7} width={40} height={9} rx={1} fill="#f4f4f4" stroke="#999" strokeWidth={0.4} />
      <rect x={-42} y={-96} width={84} height={80} rx={6} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.6} />
      <rect x={-38} y={-92} width={76} height={72} rx={5} fill="url(#g-metal)" opacity={0.85} />
      {[[-33, -87], [33, -87], [-33, -25], [33, -25]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3} fill="#2a2d33" />)}
      <circle cx={0} cy={-56} r={18} fill="url(#g-metal-r)" stroke="#5f6670" strokeWidth={0.6} />
      <circle cx={0} cy={-56} r={4} fill="url(#g-metal-h)" stroke="#555" strokeWidth={0.5} />
      <Txt x={0} y={-30} size={3.2} fill="#30363d">NEMA 17 · 1.8°</Txt>
    </g>
  ),
  sim: sim('stepper', 'Requer MCU (Fase 5).'),
});

// ───────── Relay module ─────────
registerComponent({
  type: 'relay-module', name: 'Módulo relé 5 V', category: 'actuators', prefix: 'K',
  description: 'Relé de 1 canal com transístor, díodo e LED. Comuta cargas até 10 A / 250 VAC.',
  tags: ['relé', 'relay', 'comutação', 'carga'],
  bbox: { x: -56, y: -46, w: 112, h: 52 },
  pins: [
    { id: 'VCC', name: 'VCC (+5 V)', x: -40, y: 0, role: 'power' }, { id: 'GND', name: 'GND', x: -30, y: 0, role: 'ground' }, { id: 'IN', name: 'IN (sinal)', x: -20, y: 0, role: 'input' },
    { id: 'NO', name: 'NA — normalmente aberto', x: 30, y: -40, role: 'passive' }, { id: 'COM', name: 'COM — comum', x: 40, y: -40, role: 'passive' }, { id: 'NC', name: 'NF — normalmente fechado', x: 50, y: -40, role: 'passive' },
  ],
  props: [sel('trigger', 'Ativação', 'high', [['high', 'Nível alto'], ['low', 'Nível baixo']])],
  render: ({ state }) => (
    <g>
      <rect x={-55} y={-45} width={110} height={50} rx={2.5} fill="url(#g-pcb-blue)" stroke="#0b1d33" strokeWidth={0.6} />
      <rect x={-18} y={-40} width={42} height={32} rx={1.5} fill="url(#g-blue-plastic)" stroke="#0d2a55" strokeWidth={0.5} />
      <Txt x={3} y={-30} size={3.4} fill="#fff">5V RELAY</Txt>
      <Txt x={3} y={-24} size={2.2} fill="#d6e4ff">10A 250VAC</Txt>
      <Txt x={3} y={-19} size={2.2} fill="#d6e4ff">10A 30VDC</Txt>
      <rect x={25} y={-46} width={30} height={14} rx={1} fill="#2f6fd6" stroke="#173a75" strokeWidth={0.5} />
      {[30, 40, 50].map((x) => <g key={x}><circle cx={x} cy={-40} r={3.6} fill="url(#g-metal-r)" /><line x1={x - 2} y1={-40} x2={x + 2} y2={-40} stroke="#555" strokeWidth={0.7} /></g>)}
      {['NA', 'C', 'NF'].map((t, i) => <Txt key={t} x={30 + i * 10} y={-28} size={2.4} fill="#fff">{t}</Txt>)}
      <SmdLed x={-44} y={-30} color="#ff3b30" on={Boolean(state?.energized)} /><SmdLed x={-44} y={-22} color="#ff3b30" on />
      {[-40, -30, -20].map((x) => <HeaderPin key={x} x={x} y={0} />)}
      {['VCC', 'GND', 'IN'].map((t, i) => <Txt key={t} x={-40 + i * 10} y={-8} size={2.4} fill="#fff">{t}</Txt>)}
    </g>
  ),
  datasheet: { summary: 'Isola o circuito de controlo (5 V) da carga. A bobina consome ~70 mA — o módulo inclui o transístor de comando e o díodo de roda livre.' },
  sim: sim('relay'),
});

// ───────── Buzzer / speaker ─────────
registerComponent({
  type: 'buzzer', name: 'Buzzer', category: 'actuators', prefix: 'BZ',
  description: 'Besouro piezoelétrico. Ativo: toca com DC. Passivo: precisa de sinal (tone()).',
  tags: ['buzzer', 'som', 'piezo', 'alarme'],
  bbox: { x: -16, y: -30, w: 32, h: 36 },
  pins: two(0, 'Positivo (+)', 'Negativo (−)', true),
  props: [sel('kind', 'Tipo', 'active', [['active', 'Ativo (oscilador interno)'], ['passive', 'Passivo']]), num('frequency', 'Frequência (ativo)', 2300, 'Hz')],
  valueLabel: (p) => (p.kind === 'active' ? 'ativo' : 'passivo'),
  render: () => (
    <g>
      <Lead x1={-10} y1={-4} x2={-10} y2={0} /><Lead x1={10} y1={-4} x2={10} y2={0} />
      <circle cx={0} cy={-15} r={14.5} fill="url(#g-black)" stroke="#000" strokeWidth={0.5} />
      <circle cx={0} cy={-15} r={11} fill="none" stroke="#3a3d42" strokeWidth={0.6} />
      <circle cx={0} cy={-15} r={2.6} fill="#050506" />
      <Txt x={-7} y={-22} size={4} fill="#d9d9d9" weight={800}>+</Txt>
    </g>
  ),
  sim: sim('buzzer'),
});

registerComponent({
  type: 'speaker', name: 'Altifalante 8 Ω', category: 'actuators', prefix: 'LS',
  description: 'Altifalante dinâmico de 8 Ω / 0,5 W (Ø 40 mm).',
  tags: ['altifalante', 'speaker', 'som', 'áudio'],
  bbox: { x: -42, y: -86, w: 84, h: 92 },
  pins: two(0, 'Terminal +', 'Terminal −'),
  props: [num('impedance', 'Impedância', 8, 'Ω'), num('power', 'Potência', 0.5, 'W')],
  valueLabel: (p) => `${p.impedance} Ω`,
  render: () => (
    <g>
      <LeadPath d="M-6 -12 L-10 -6 L-10 0" /><LeadPath d="M6 -12 L10 -6 L10 0" />
      <circle cx={0} cy={-46} r={40} fill="url(#g-metal-r)" stroke="#5f6670" strokeWidth={0.6} />
      <circle cx={0} cy={-46} r={34} fill="#1b1d21" />
      <circle cx={0} cy={-46} r={30} fill="url(#g-black)" />
      {[24, 18, 12].map((r) => <circle key={r} cx={0} cy={-46} r={r} fill="none" stroke="#3a3d42" strokeWidth={0.5} />)}
      <circle cx={0} cy={-46} r={8} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.5} />
      <Txt x={0} y={-11} size={2.6} fill="#ddd">8Ω 0.5W</Txt>
    </g>
  ),
  sim: sim('speaker', 'Requer simulação transitória (Fase 4).'),
});

// ───────── Fan ─────────
registerComponent({
  type: 'fan', name: 'Ventoinha 40 mm', category: 'actuators', prefix: 'M',
  description: 'Ventoinha DC de 40 mm (5 V ou 12 V) com motor sem escovas.',
  tags: ['ventoinha', 'fan', 'arrefecimento'],
  bbox: { x: -42, y: -88, w: 84, h: 94 },
  pins: two(0, 'Vermelho (+)', 'Preto (−)', true),
  props: [num('vnom', 'Tensão nominal', 12, 'V'), num('inom', 'Corrente nominal', 0.1, 'A')],
  valueLabel: (p) => `${p.vnom} V`,
  render: ({ state }) => (
    <g>
      <path d="M-2 -10 C-2 -4 -10 -6 -10 0" fill="none" stroke="#d22a1e" strokeWidth={2} /><path d="M2 -10 C2 -4 10 -6 10 0" fill="none" stroke="#1b1b1b" strokeWidth={2} />
      <rect x={-40} y={-88} width={80} height={80} rx={5} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.6} />
      <circle cx={0} cy={-48} r={36} fill="#0d0e10" />
      {[[-34, -82], [34, -82], [-34, -14], [34, -14]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r={2.6} fill="#555" />)}
      <g transform={`rotate(${state?.angle ?? 0} 0 -48)`}>
        {Array.from({ length: 7 }, (_, i) => <path key={i} transform={`rotate(${i * (360 / 7)} 0 -48)`} d="M0 -48 C6 -58 16 -70 6 -82 C2 -72 -4 -62 0 -48 Z" fill="#2a2d33" stroke="#111" strokeWidth={0.4} />)}
        <circle cx={0} cy={-48} r={12} fill="url(#g-black)" stroke="#000" strokeWidth={0.4} />
      </g>
    </g>
  ),
  sim: sim('dc-motor'),
});

registerComponent({
  type: 'solenoid', name: 'Solenoide', category: 'actuators', prefix: 'SOL',
  description: 'Atuador linear eletromagnético (push-pull 12 V). Exige díodo de roda livre.',
  tags: ['solenoide', 'eletroíman', 'fechadura', 'linear'],
  bbox: { x: -46, y: -42, w: 92, h: 48 },
  pins: two(0, 'Terminal 1', 'Terminal 2'),
  props: [num('vnom', 'Tensão nominal', 12, 'V'), num('rcoil', 'Resistência da bobina', 30, 'Ω')],
  valueLabel: (p) => `${p.vnom} V`,
  render: ({ state }) => (
    <g>
      <path d="M-4 -12 C-4 -6 -10 -6 -10 0" fill="none" stroke="#d22a1e" strokeWidth={2} /><path d="M4 -12 C4 -6 10 -6 10 0" fill="none" stroke="#1b1b1b" strokeWidth={2} />
      <rect x={-30} y={-40} width={50} height={28} rx={1} fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.5} />
      <rect x={-24} y={-36} width={38} height={20} fill="url(#g-copper)" />
      {Array.from({ length: 12 }, (_, i) => <line key={i} x1={-24 + i * 3.2} y1={-36} x2={-24 + i * 3.2} y2={-16} stroke="#7a3a12" strokeWidth={0.4} />)}
      <rect x={state?.energized ? 14 : 20} y={-30} width={26} height={8} rx={1} fill="url(#g-metal)" stroke="#5f6670" strokeWidth={0.4} />
    </g>
  ),
  sim: sim('inductor'),
});

// ───────── Lamp ─────────
registerComponent({
  type: 'lamp', name: 'Lâmpada incandescente', category: 'actuators', prefix: 'LP',
  description: 'Lâmpada de filamento (ex.: 6 V / 0,5 W). A resistência a frio é ~10× menor do que a quente.',
  tags: ['lâmpada', 'filamento', 'luz'],
  bbox: { x: -22, y: -68, w: 44, h: 74 },
  pins: two(0, 'Terminal 1', 'Terminal 2'),
  props: [num('vnom', 'Tensão nominal', 6, 'V'), num('pnom', 'Potência nominal', 0.5, 'W')],
  valueLabel: (p) => `${p.vnom}V ${si(p.pnom, 'W')}`,
  render: ({ state }) => {
    const b = Math.max(0, Math.min(1, state?.brightness ?? 0));
    return (
      <g>
        <Lead x1={-10} y1={-8} x2={-10} y2={0} /><Lead x1={10} y1={-8} x2={10} y2={0} />
        <rect x={-14} y={-24} width={28} height={16} rx={2} fill="url(#g-metal-h)" stroke="#5f6670" strokeWidth={0.5} />
        {[-21, -17, -13].map((y) => <line key={y} x1={-14} y1={y} x2={14} y2={y + 2} stroke="#7d858f" strokeWidth={0.6} />)}
        {b > 0 && <circle cx={0} cy={-46} r={20 + 24 * b} fill="url(#g-glow-yellow)" opacity={0.3 + 0.7 * b} />}
        <path d="M-12 -24 C-12 -32 -20 -38 -20 -48 A20 20 0 0 1 20 -48 C20 -38 12 -32 12 -24 Z" fill="url(#g-glass)" stroke="#9fb7c7" strokeWidth={0.6} />
        {b > 0 && <path d="M-12 -24 C-12 -32 -20 -38 -20 -48 A20 20 0 0 1 20 -48 C20 -38 12 -32 12 -24 Z" fill="#fff3b0" opacity={0.6 * b} />}
        <path d="M-4 -24 L-4 -44 M4 -24 L4 -44" stroke="#8a9099" strokeWidth={0.6} />
        <path d="M-4 -44 l1 -2 l1 2 l1 -2 l1 2 l1 -2 l1 2 l1 -2 l1 2" fill="none" stroke={b > 0 ? '#fff6c8' : '#5a5f66'} strokeWidth={0.8} />
      </g>
    );
  },
  sim: sim('lamp'),
});

// ───────── 7-segment display ─────────
const SEG_PATHS: Record<string, string> = {
  a: 'M-9 -27 L9 -27 L6.5 -24.5 L-6.5 -24.5 Z', b: 'M10 -26 L10 -9 L7.5 -10.5 L7.5 -23.5 Z', c: 'M10 -5 L10 12 L7.5 9.5 L7.5 -3.5 Z',
  d: 'M-9 13 L9 13 L6.5 10.5 L-6.5 10.5 Z', e: 'M-10 -5 L-10 12 L-7.5 9.5 L-7.5 -3.5 Z', f: 'M-10 -26 L-10 -9 L-7.5 -10.5 L-7.5 -23.5 Z',
  g: 'M-8.5 -7 L-6.5 -8.5 L6.5 -8.5 L8.5 -7 L6.5 -5.5 L-6.5 -5.5 Z',
};
registerComponent({
  type: 'seven-segment', name: 'Display de 7 segmentos', category: 'actuators', prefix: 'DS',
  description: 'Display LED de 7 segmentos + ponto decimal (0,56″). Cátodo ou ânodo comum.',
  tags: ['display', '7 segmentos', 'led', 'número'],
  bbox: { x: -27, y: -46, w: 54, h: 92 },
  pins: (() => {
    const top: [string, string][] = [['g', 'g'], ['f', 'f'], ['COM1', 'Comum'], ['a', 'a'], ['b', 'b']];
    const bot: [string, string][] = [['e', 'e'], ['d', 'd'], ['COM2', 'Comum'], ['c', 'c'], ['dp', 'DP (ponto)']];
    return [
      ...bot.map(([id, name], i) => ({ id, name: `${i + 1} · ${name}`, x: -20 + i * 10, y: 40, role: id.startsWith('COM') ? 'passive' as const : 'input' as const })),
      ...top.map(([id, name], i) => ({ id, name: `${10 - i} · ${name}`, x: -20 + i * 10, y: -40, role: id.startsWith('COM') ? 'passive' as const : 'input' as const })),
    ];
  })(),
  props: [sel('common', 'Tipo', 'cathode', [['cathode', 'Cátodo comum'], ['anode', 'Ânodo comum']]), sel('color', 'Cor', 'red', [['red', 'Vermelho'], ['green', 'Verde'], ['blue', 'Azul']])],
  valueLabel: (p) => (p.common === 'anode' ? 'ânodo comum' : 'cátodo comum'),
  render: ({ props, state }) => {
    const on = state?.segments ?? [];
    const col = props.color === 'green' ? '#3dff6a' : props.color === 'blue' ? '#3d8bff' : '#ff2a1a';
    return (
      <g>
        {[-20, -10, 0, 10, 20].map((x) => <g key={x}><HeaderPin x={x} y={-40} /><HeaderPin x={x} y={40} /></g>)}
        <rect x={-25} y={-38} width={50} height={76} rx={1.5} fill="#e9e9e6" stroke="#999" strokeWidth={0.4} />
        <rect x={-23} y={-36} width={46} height={72} fill="#141517" />
        <g transform="translate(1 3) skewX(-8)">
          {Object.entries(SEG_PATHS).map(([k, d], i) => (
            <path key={k} d={d} fill={on[i] ? col : '#2a2c30'} />
          ))}
          <circle cx={14} cy={12} r={1.8} fill={on[7] ? col : '#2a2c30'} />
        </g>
      </g>
    );
  },
  datasheet: { summary: 'Cada segmento é um LED: requer resistência série (≈220–330 Ω) por segmento.', notes: ['Pinos 3 e 8 são o comum (internamente ligados).'] },
  internalConnections: [['COM1', 'COM2']],
  sim: sim('seven-segment'),
});

void SmdLed;
