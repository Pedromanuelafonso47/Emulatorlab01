import type { ReactNode } from "react";
import { registerComponent } from '../registry';
import { Txt } from '../render/primitives';

/** Instruments are listed now (so the catalogue is complete) but cannot be placed until their phase. */
function Bench({ w, h, children, color = '#2a2f37' }: { w: number; h: number; children?: ReactNode; color?: string }) {
  return (
    <g>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} rx={4} fill={color} stroke="#0e1014" strokeWidth={0.8} />
      <rect x={-w / 2 + 2} y={-h / 2 + 2} width={w - 4} height={h - 4} rx={3} fill="#000" opacity={0.15} />
      {children}
    </g>
  );
}

const coming = (type: string, name: string, description: string, phase: string, tags: string[], render: () => ReactNode) =>
  registerComponent({
    type, name, category: 'instruments', prefix: 'XM', description, tags,
    comingSoon: phase,
    bbox: { x: -40, y: -30, w: 80, h: 60 },
    pins: [],
    render,
    sim: { model: 'instrument', status: 'none', note: `Disponível na ${phase}.` },
  });

coming('multimeter', 'Multímetro digital', 'Tensão DC/AC, corrente DC, resistência, continuidade e teste de díodos, com pontas de prova.', 'Fase 3', ['multímetro', 'voltímetro', 'amperímetro', 'ohmímetro'], () => (
  <g>
    <rect x={-22} y={-30} width={44} height={60} rx={6} fill="#f0b429" stroke="#8a6410" strokeWidth={0.8} />
    <rect x={-18} y={-26} width={36} height={52} rx={4} fill="#25282d" />
    <rect x={-15} y={-23} width={30} height={13} rx={1} fill="#b9c7a4" />
    <Txt x={0} y={-16.5} size={7} fill="#1d2416" weight={700}>12.34</Txt>
    <circle cx={0} cy={5} r={10} fill="url(#g-black)" stroke="#555" strokeWidth={0.6} />
    <line x1={0} y1={5} x2={0} y2={-4} stroke="#ddd" strokeWidth={1.4} />
    {[-10, 0, 10].map((x, i) => <circle key={x} cx={x} cy={21} r={2.6} fill={i === 2 ? '#d63a32' : '#111'} stroke="#555" strokeWidth={0.4} />)}
  </g>
));
coming('oscilloscope', 'Osciloscópio (2 canais)', 'CH1/CH2, escalas V/div e s/div, trigger, medição de frequência e amplitude.', 'Fase 4', ['osciloscópio', 'scope', 'ondas'], () => (
  <Bench w={80} h={56}>
    <rect x={-36} y={-24} width={46} height={36} rx={1} fill="#06100a" stroke="#333" strokeWidth={0.5} />
    {[-24, -12, 0].map((x) => <line key={x} x1={x} y1={-24} x2={x} y2={12} stroke="#1f3a26" strokeWidth={0.3} />)}
    <path d="M-36 -6 C-30 -20 -24 -20 -18 -6 S-6 8 0 -6 S6 -20 10 -10" fill="none" stroke="#ffd23a" strokeWidth={0.9} />
    <path d="M-36 4 H-24 V-2 H-12 V4 H0 V-2 H10" fill="none" stroke="#3dd2ff" strokeWidth={0.9} />
    {[0, 1, 2, 3].map((i) => <circle key={i} cx={20 + (i % 2) * 10} cy={-16 + Math.floor(i / 2) * 12} r={3.6} fill="url(#g-black)" />)}
    <Txt x={-13} y={18} size={3} fill="#cfd6e0">CH1  CH2</Txt>
  </Bench>
));
coming('logic-analyzer', 'Analisador lógico', 'Captura de 8 canais digitais com descodificação de protocolos (UART, I²C, SPI).', 'Fase 5', ['analisador', 'lógico', 'digital', 'uart'], () => (
  <Bench w={70} h={44} color="#1e2229">
    {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M-30 ${-16 + i * 6} h${6 + i} v-3 h${8} v3 h${10 - i} v-3 h12 v3 h20`} fill="none" stroke="#3dff7a" strokeWidth={0.7} />)}
  </Bench>
));
coming('frequency-counter', 'Frequencímetro', 'Mede frequência e período de sinais periódicos.', 'Fase 4', ['frequência', 'frequencímetro', 'hz'], () => (
  <Bench w={70} h={36}><rect x={-30} y={-10} width={60} height={16} rx={1} fill="#081018" /><Txt x={0} y={-2} size={8} fill="#3dd2ff" weight={700}>1.000 kHz</Txt></Bench>
));
for (const [type, name, unit, color] of [['ammeter', 'Amperímetro', 'A', '#3dd2ff'], ['voltmeter', 'Voltímetro', 'V', '#ff5a3a'], ['wattmeter', 'Wattímetro', 'W', '#ffd23a']] as const) {
  coming(type, name, `Instrumento de painel para medir ${name.toLowerCase().replace('ímetro', '')}${unit === 'W' ? ' (potência)' : ''} num ramo do circuito.`, 'Fase 3', [name.toLowerCase(), unit], () => (
    <Bench w={60} h={44}><rect x={-24} y={-16} width={48} height={20} rx={1} fill="#081018" /><Txt x={0} y={-6} size={9} fill={color} weight={700}>{`0.00${unit}`}</Txt><Txt x={0} y={12} size={3.4} fill="#cfd6e0">{name.toUpperCase()}</Txt></Bench>
  ));
}
