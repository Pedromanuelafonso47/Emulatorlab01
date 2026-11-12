import type { ReactNode } from 'react';
import { registerComponent } from '../registry';
import { Txt } from '../render/primitives';
import { sel } from './common';

/**
 * Laboratory instruments. They are real circuit components: their terminals are wired to the
 * circuit (probes / jumpers) and the simulator computes what a physical instrument would read.
 */

function Bench({ w, h, children, color = '#2a2f37' }: { w: number; h: number; children?: ReactNode; color?: string }) {
  return (
    <g>
      <rect x={-w / 2} y={-h} width={w} height={h} rx={4} fill={color} stroke="#0e1014" strokeWidth={0.8} />
      <rect x={-w / 2 + 2} y={-h + 2} width={w - 4} height={h - 4} rx={3} fill="#000" opacity={0.15} />
      {children}
    </g>
  );
}

function Jack({ x, y, color, label }: { x: number; y: number; color: string; label: string }) {
  return (
    <g>
      <circle cx={x} cy={y} r={5.4} fill="#111" stroke="#555" strokeWidth={0.6} />
      <circle cx={x} cy={y} r={3.8} fill={color} />
      <circle cx={x} cy={y} r={1.6} fill="#050505" />
      <Txt x={x} y={y - 9} size={2.6} fill="#e9e9e9">{label}</Txt>
    </g>
  );
}

function Lcd({ x, y, w, h, text, sub, color = '#1d2416', bg = '#b9c7a4' }: { x: number; y: number; w: number; h: number; text: string; sub?: string; color?: string; bg?: string }) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={1.2} fill={bg} stroke="#3a3f36" strokeWidth={0.5} />
      <Txt x={x + w / 2} y={y + h * (sub ? 0.42 : 0.5)} size={Math.min(h * 0.55, (w / Math.max(4, text.length)) * 1.55)} fill={color} weight={700}>{text}</Txt>
      {sub && <Txt x={x + w - 3} y={y + h - 3.2} size={2.6} fill={color} anchor="end" weight={600}>{sub}</Txt>}
    </g>
  );
}

const MODES: [string, string][] = [['dcv', 'V⎓  Tensão DC'], ['acv', 'V~  Tensão AC (RMS)'], ['dca', 'A⎓  Corrente DC'], ['ohm', 'Ω  Resistência'], ['cont', '•))) Continuidade'], ['diode', '→|  Teste de díodos']];
const DIAL_ANGLE: Record<string, number> = { dcv: -60, acv: -30, dca: 30, ohm: 60, cont: 90, diode: 120 };

registerComponent({
  type: 'multimeter', name: 'Multímetro digital', category: 'instruments', prefix: 'XMM',
  description: 'Mede tensão DC/AC, corrente DC, resistência, continuidade e díodos. Ligue a ponta preta a COM e a vermelha a VΩmA (ou 10A para correntes altas) com fios até aos pontos do circuito.',
  tags: ['multímetro', 'voltímetro', 'amperímetro', 'ohmímetro', 'medição'],
  bbox: { x: -36, y: -116, w: 72, h: 124 },
  pins: [
    { id: 'A10', name: '10A (corrente alta)', x: -20, y: 0, role: 'passive', description: 'Entrada de corrente até 10 A (shunt 10 mΩ)' },
    { id: 'COM', name: 'COM (ponta preta)', x: 0, y: 0, role: 'passive', polarity: '-' as const, description: 'Referência comum' },
    { id: 'VOHM', name: 'VΩmA (ponta vermelha)', x: 20, y: 0, role: 'passive', polarity: '+' as const, description: 'Tensão, resistência e corrente até 400 mA' },
  ],
  props: [sel('mode', 'Função', 'dcv', MODES)],
  valueLabel: (p) => MODES.find((m) => m[0] === p.mode)?.[1].split('  ')[0] ?? '',
  render: ({ props, state }) => {
    const mode = String(props.mode);
    const text = (state?.display as string) ?? '- - - -';
    const unit = (state?.unit as string) ?? '';
    return (
      <g>
        <rect x={-35} y={-115} width={70} height={122} rx={9} fill="#f0b429" stroke="#8a6410" strokeWidth={0.8} />
        <rect x={-31} y={-111} width={62} height={114} rx={6} fill="#25282d" />
        <Lcd x={-27} y={-106} w={54} h={24} text={text} sub={unit} />
        <Txt x={0} y={-76} size={3} fill="#cfd6e0" weight={700}>ELECTROLAB DMM</Txt>
        <circle cx={0} cy={-46} r={20} fill="#1b1d21" stroke="#444" strokeWidth={0.6} />
        {MODES.map(([m, l]) => {
          const a = ((DIAL_ANGLE[m] - 90) * Math.PI) / 180;
          return <Txt key={m} x={Math.cos(a) * 27} y={-46 + Math.sin(a) * 27} size={3} fill={m === mode ? '#f0b429' : '#9aa3ad'} weight={700}>{l.split('  ')[0]}</Txt>;
        })}
        <g transform={`rotate(${DIAL_ANGLE[mode] ?? 0} 0 -46)`}>
          <circle cx={0} cy={-46} r={14} fill="url(#g-black)" stroke="#000" strokeWidth={0.6} />
          <rect x={-2} y={-62} width={4} height={18} rx={2} fill="#e9e9e9" />
        </g>
        {state?.beep ? <Txt x={22} y={-20} size={6} fill="#f0b429" weight={800}>♪</Txt> : null}
        <Jack x={-20} y={0} color="#d63a32" label="10A" />
        <Jack x={0} y={0} color="#222" label="COM" />
        <Jack x={20} y={0} color="#d63a32" label="VΩmA" />
      </g>
    );
  },
  datasheet: {
    summary: 'Tensão: ligue em PARALELO (resistência de entrada 10 MΩ). Corrente: ligue em SÉRIE (shunt de 0,5 Ω em mA, 10 mΩ em 10A). Resistência/continuidade/díodos: o multímetro injeta uma corrente de teste (1 mA, 3 V em aberto) — meça com o circuito desligado.',
    specs: { 'Impedância (V)': '10 MΩ', 'Shunt mA': '0,5 Ω (fusível 400 mA)', 'Shunt 10A': '10 mΩ', 'Corrente de teste (Ω)': '1 mA' },
  },
  sim: { model: 'multimeter', status: 'implemented' },
});

const panel = (type: string, name: string, desc: string, unit: string, color: string, tags: string[], summary: string) => registerComponent({
  type, name, category: 'instruments', prefix: 'XM', description: desc, tags,
  bbox: { x: -31, y: -44, w: 62, h: 50 },
  pins: [{ id: '+', name: 'Terminal +', x: -10, y: 0, role: 'passive', polarity: '+' }, { id: '-', name: 'Terminal −', x: 10, y: 0, role: 'passive', polarity: '-' }],
  render: ({ state }) => (
    <Bench w={60} h={43}>
      <Lcd x={-25} y={-38} w={50} h={18} text={(state?.display as string) ?? '- - - -'} sub={(state?.unit as string) ?? unit} color={color} bg="#081018" />
      <Txt x={0} y={-14} size={3.2} fill="#cfd6e0">{name.toUpperCase()}</Txt>
      <Jack x={-10} y={0} color="#d63a32" label="+" />
      <Jack x={10} y={0} color="#222" label="−" />
    </Bench>
  ),
  datasheet: { summary },
  sim: { model: type, status: 'implemented' },
});
panel('voltmeter', 'Voltímetro', 'Voltímetro DC de painel (10 MΩ). Ligue em paralelo com o elemento a medir.', 'V', '#ff5a3a', ['voltímetro', 'tensão'], 'Ligação em paralelo. Resistência interna 10 MΩ — quase não perturba o circuito.');
panel('ammeter', 'Amperímetro', 'Amperímetro DC de painel (shunt 10 mΩ). Ligue em SÉRIE no ramo a medir.', 'A', '#3dd2ff', ['amperímetro', 'corrente'], 'Ligação em série. Ligado em paralelo com uma fonte provoca um curto-circuito!');

registerComponent({
  type: 'wattmeter', name: 'Wattímetro', category: 'instruments', prefix: 'XM',
  description: 'Mede a potência P = V·I: a corrente passa em série por I+ → I−, a tensão é medida em paralelo entre V+ e V−.',
  tags: ['wattímetro', 'potência', 'energia'],
  bbox: { x: -36, y: -44, w: 72, h: 50 },
  pins: [
    { id: 'I+', name: 'Corrente entrada (I+)', x: -20, y: 0, role: 'passive' }, { id: 'I-', name: 'Corrente saída (I−)', x: -10, y: 0, role: 'passive' },
    { id: 'V+', name: 'Tensão + (V+)', x: 10, y: 0, role: 'passive' }, { id: 'V-', name: 'Tensão − (V−)', x: 20, y: 0, role: 'passive' },
  ],
  render: ({ state }) => (
    <Bench w={70} h={43}>
      <Lcd x={-30} y={-38} w={60} h={18} text={(state?.display as string) ?? '- - - -'} sub={(state?.unit as string) ?? 'W'} color="#ffd23a" bg="#081018" />
      <Txt x={0} y={-14} size={3.2} fill="#cfd6e0">WATTÍMETRO</Txt>
      <Jack x={-20} y={0} color="#d63a32" label="I+" /><Jack x={-10} y={0} color="#222" label="I−" />
      <Jack x={10} y={0} color="#d63a32" label="V+" /><Jack x={20} y={0} color="#222" label="V−" />
    </Bench>
  ),
  datasheet: { summary: 'Corrente em série (shunt 10 mΩ) e tensão em paralelo (10 MΩ). Para medir a potência de uma carga: I+ ← fonte, I− → carga, V+/V− aos terminais da carga.' },
  sim: { model: 'wattmeter', status: 'implemented' },
});

const coming = (type: string, name: string, description: string, phase: string, tags: string[], render: () => ReactNode) =>
  registerComponent({
    type, name, category: 'instruments', prefix: 'XM', description, tags,
    comingSoon: phase,
    bbox: { x: -40, y: -30, w: 80, h: 60 },
    pins: [],
    render,
    sim: { model: 'instrument', status: 'none', note: `Disponível na ${phase}.` },
  });

coming('logic-analyzer-placeholder', 'Analisador lógico', 'Captura de canais digitais (ver Fase 5).', 'Fase 5', ['analisador', 'lógico'], () => (
  <g><rect x={-35} y={-22} width={70} height={44} rx={4} fill="#1e2229" />
    {Array.from({ length: 6 }, (_, i) => <path key={i} d={`M-30 ${-16 + i * 6} h${6 + i} v-3 h8 v3 h${10 - i} v-3 h12 v3 h20`} fill="none" stroke="#3dff7a" strokeWidth={0.7} />)}</g>
));
