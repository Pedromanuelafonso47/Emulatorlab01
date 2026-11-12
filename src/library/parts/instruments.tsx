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

// ───────── Oscilloscope ─────────
const TDIV: [string, string][] = ['1e-6', '2e-6', '5e-6', '1e-5', '2e-5', '5e-5', '1e-4', '2e-4', '5e-4', '1e-3', '2e-3', '5e-3', '1e-2', '2e-2', '5e-2', '0.1', '0.2', '0.5', '1'].map((v) => [v, fmtT(+v) + '/div']);
const VDIV: [string, string][] = ['0.01', '0.02', '0.05', '0.1', '0.2', '0.5', '1', '2', '5', '10', '20', '50'].map((v) => [v, (+v < 1 ? `${+v * 1000} mV` : `${v} V`) + '/div']);
function fmtT(s: number) { return s >= 1 ? `${s} s` : s >= 1e-3 ? `${+(s * 1e3).toPrecision(3)} ms` : `${+(s * 1e6).toPrecision(3)} µs`; }

registerComponent({
  type: 'oscilloscope', name: 'Osciloscópio (2 canais)', category: 'instruments', prefix: 'XSC',
  description: 'Visualiza a tensão ao longo do tempo em CH1 e CH2 (referidas a GND). Ajuste V/div, tempo/div e trigger. Abra o separador “Osciloscópio” para o ecrã grande e as medições.',
  tags: ['osciloscópio', 'scope', 'ondas', 'sinal', 'frequência'],
  bbox: { x: -62, y: -86, w: 124, h: 92 },
  pins: [
    { id: 'CH1', name: 'CH1 (amarelo)', x: -30, y: 0, role: 'input' },
    { id: 'CH2', name: 'CH2 (azul)', x: -10, y: 0, role: 'input' },
    { id: 'GND', name: 'GND (massa das pontas)', x: 30, y: 0, role: 'ground' },
  ],
  props: [
    sel('tdiv', 'Base de tempo', '1e-3', TDIV), sel('vdiv1', 'CH1 escala', '1', VDIV), sel('vdiv2', 'CH2 escala', '1', VDIV),
    sel('coupling1', 'CH1 acoplamento', 'dc', [['dc', 'DC'], ['ac', 'AC']]), sel('coupling2', 'CH2 acoplamento', 'dc', [['dc', 'DC'], ['ac', 'AC']]),
    { key: 'off1', label: 'CH1 posição (div)', type: 'number', default: 0, min: -4, max: 4, step: 0.5 },
    { key: 'off2', label: 'CH2 posição (div)', type: 'number', default: 0, min: -4, max: 4, step: 0.5 },
    sel('trigSource', 'Trigger: fonte', 'ch1', [['ch1', 'CH1'], ['ch2', 'CH2']]), sel('trigEdge', 'Trigger: flanco', 'rise', [['rise', 'Ascendente'], ['fall', 'Descendente']]),
    { key: 'trigLevel', label: 'Trigger: nível', type: 'number', default: 0.5, unit: 'V', si: true },
  ],
  valueLabel: (p) => `${fmtT(Number(p.tdiv))}/div`,
  render: ({ props, state }) => {
    const view = state?.view as { ch1: [number, number][]; ch2: [number, number][]; triggered: boolean } | undefined;
    const X = (d: number) => -52 + d * 7.2, Y = (d: number) => -49 - d * 6.6;
    const pl = (pts: [number, number][]) => pts.map(([x, y]) => `${X(x).toFixed(2)},${Y(y).toFixed(2)}`).join(' ');
    return (
      <Bench w={122} h={85}>
        <rect x={-55} y={-80} width={78} height={60} rx={1.5} fill="#06100a" stroke="#333" strokeWidth={0.6} />
        {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={X(i)} y1={Y(4)} x2={X(i)} y2={Y(-4)} stroke="#1c3524" strokeWidth={i === 5 ? 0.45 : 0.25} />)}
        {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={X(0)} y1={Y(i - 4)} x2={X(10)} y2={Y(i - 4)} stroke="#1c3524" strokeWidth={i === 4 ? 0.45 : 0.25} />)}
        {view?.ch1.length ? <polyline points={pl(view.ch1)} fill="none" stroke="#ffd23a" strokeWidth={0.7} /> : null}
        {view?.ch2.length ? <polyline points={pl(view.ch2)} fill="none" stroke="#3dd2ff" strokeWidth={0.7} /> : null}
        <Txt x={-53} y={-77} size={2.4} fill="#ffd23a" anchor="start">{`CH1 ${VDIV.find((v) => v[0] === String(props.vdiv1))?.[1] ?? ''}`}</Txt>
        <Txt x={-20} y={-77} size={2.4} fill="#3dd2ff" anchor="start">{`CH2 ${VDIV.find((v) => v[0] === String(props.vdiv2))?.[1] ?? ''}`}</Txt>
        <Txt x={21} y={-22.5} size={2.4} fill="#cfd6e0" anchor="end">{`${fmtT(Number(props.tdiv))}/div ${view ? (view.triggered ? 'T’d' : 'Auto') : ''}`}</Txt>
        {[0, 1, 2, 3, 4, 5].map((i) => <circle key={i} cx={34 + (i % 2) * 14} cy={-70 + Math.floor(i / 2) * 15} r={4.6} fill="url(#g-black)" stroke="#111" strokeWidth={0.4} />)}
        <Txt x={41} y={-26} size={2.6} fill="#cfd6e0">SCOPE</Txt>
        <Jack x={-30} y={0} color="#ffd23a" label="CH1" /><Jack x={-10} y={0} color="#3dd2ff" label="CH2" /><Jack x={30} y={0} color="#222" label="GND" />
      </Bench>
    );
  },
  datasheet: { summary: 'Ligue CH1/CH2 aos pontos a observar e GND à massa do circuito. Medições automáticas (frequência, período, Vpp, Vmáx, Vmín, Vmédia, Vrms) no separador Osciloscópio.' },
  sim: { model: 'oscilloscope', status: 'implemented' },
});

registerComponent({
  type: 'frequency-counter', name: 'Frequencímetro', category: 'instruments', prefix: 'XFC',
  description: 'Mede a frequência de um sinal periódico entre IN e GND.',
  tags: ['frequência', 'frequencímetro', 'hz', 'período'],
  bbox: { x: -36, y: -44, w: 72, h: 50 },
  pins: [{ id: 'IN', name: 'Entrada', x: -10, y: 0, role: 'input' }, { id: 'GND', name: 'GND', x: 10, y: 0, role: 'ground' }],
  render: ({ state }) => (
    <Bench w={70} h={43}>
      <Lcd x={-30} y={-38} w={60} h={18} text={(state?.display as string) ?? '- - - -'} sub={(state?.unit as string) ?? 'Hz'} color="#3dd2ff" bg="#081018" />
      <Txt x={0} y={-14} size={3.2} fill="#cfd6e0">FREQUENCÍMETRO</Txt>
      <Jack x={-10} y={0} color="#d63a32" label="IN" /><Jack x={10} y={0} color="#222" label="GND" />
    </Bench>
  ),
  sim: { model: 'frequency-counter', status: 'implemented' },
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
