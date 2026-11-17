import { registerComponent } from '../registry';
import { LED_COLORS, Lead, LeadPath, Txt } from '../render/primitives';
import { To220Body, To92Body, to220BBox, to220Pins, to92BBox, to92Pins } from '../render/packages';
import { num, sel, sim } from './common';
import type { PinDef } from '../types';

// ───────── Axial diodes ─────────

const diodePins: PinDef[] = [
  { id: 'A', name: 'Ânodo (A)', x: -20, y: 0, role: 'passive', polarity: '+' },
  { id: 'K', name: 'Cátodo (K)', x: 20, y: 0, role: 'passive', polarity: '-' },
];

/** Axial diode: moulded (or glass) body, cathode band with a glossy stripe, tinned leads. */
function AxialDiode({ body, band, glass, label }: { body: string; band: string; glass?: boolean; label: string }) {
  return (
    <g>
      <ellipse cx={0} cy={5.5} rx={13} ry={1.2} fill="#000" opacity={0.2} filter="url(#f-soft)" />
      <Lead x1={-20} y1={0} x2={-9} y2={0} w={1.1} /><Lead x1={9} y1={0} x2={20} y2={0} w={1.1} />
      <rect x={-10} y={-3.6} width={20} height={7.2} rx={glass ? 3.4 : 1.8} fill={body} stroke="#000" strokeWidth={0.3} filter={glass ? undefined : 'url(#f-texture)'} />
      {glass && <rect x={-6.5} y={-1.2} width={3.6} height={2.4} fill="#2d2f33" />}
      {glass && <rect x={-6.5} y={-1.2} width={3.6} height={2.4} fill="#fff" opacity={0.15} />}
      <rect x={5.2} y={-3.6} width={2.6} height={7.2} fill={band} />
      <rect x={5.2} y={-3.6} width={0.8} height={7.2} fill="#fff" opacity={0.3} />
      <rect x={-10} y={-3.6} width={20} height={7.2} rx={glass ? 3.4 : 1.8} fill="url(#g-cyl-h)" />
      {/* end caps for the leads */}
      {[-10.6, 8.6].map((x) => <rect key={x} x={x} y={-2.6} width={2} height={5.2} rx={0.5} fill="url(#g-metal-cap)" stroke="#50585f" strokeWidth={0.2} />)}
      {!glass && <Txt x={-1.5} y={0.3} size={2.1} fill="#e1e4e8">{label}</Txt>}
    </g>
  );
}

const DIODE_MODELS: [string, string][] = [['1N4007', '1N4007 (1 A, 1000 V)'], ['1N4001', '1N4001 (1 A, 50 V)'], ['1N4148', '1N4148 (sinal, 100 V)'], ['1N5408', '1N5408 (3 A)']];

registerComponent({
  type: 'diode',
  name: 'Díodo retificador',
  category: 'semis',
  prefix: 'D',
  description: 'Díodo de junção PN. Conduz do ânodo para o cátodo (faixa) com queda de ≈0,7 V.',
  tags: ['diodo', 'retificador', '1n4007', '1n4148'],
  bbox: { x: -21, y: -5, w: 42, h: 10 },
  pins: diodePins,
  props: [sel('model', 'Modelo', '1N4007', DIODE_MODELS)],
  valueLabel: (p) => String(p.model),
  render: ({ props }) => props.model === '1N4148'
    ? <AxialDiode body="url(#g-zener)" band="#111" glass label="" />
    : <AxialDiode body="url(#g-black)" band="#c7ccd1" label={String(props.model).slice(2)} />,
  datasheet: { summary: 'Shockley: I = Is·(e^(V/nVt) − 1). Bloqueia tensão inversa até à tensão de rutura.', specs: { 'Vf (1 A)': '≈ 1,0 V', 'Vf (10 mA)': '≈ 0,7 V' } },
  sim: sim('diode'),
});

registerComponent({
  type: 'zener',
  name: 'Díodo Zener',
  category: 'semis',
  prefix: 'D',
  description: 'Díodo para regulação de tensão: em inversa conduz a partir da tensão de Zener (Vz).',
  tags: ['zener', 'regulador', 'referência'],
  bbox: { x: -21, y: -5, w: 42, h: 10 },
  pins: diodePins,
  props: [num('vz', 'Tensão Zener', 5.1, 'V', { min: 2.4, max: 200 }), sel('power', 'Potência', '0.5', [['0.5', '0,5 W'], ['1', '1 W']])],
  valueLabel: (p) => `${p.vz}V`,
  render: () => <AxialDiode body="url(#g-zener)" band="#111" glass label="" />,
  datasheet: { summary: 'Em polarização inversa mantém ≈Vz nos terminais. Requer resistência série para limitar corrente.' },
  sim: sim('zener'),
});

registerComponent({
  type: 'schottky',
  name: 'Díodo Schottky',
  category: 'semis',
  prefix: 'D',
  description: 'Díodo de barreira metal-semicondutor: baixa queda (≈0,3 V) e comutação rápida.',
  tags: ['schottky', '1n5819', 'rápido'],
  bbox: { x: -21, y: -5, w: 42, h: 10 },
  pins: diodePins,
  props: [sel('model', 'Modelo', '1N5819', [['1N5817', '1N5817 (20 V)'], ['1N5819', '1N5819 (40 V)'], ['SB560', 'SB560 (5 A)']])],
  valueLabel: (p) => String(p.model),
  render: ({ props }) => <AxialDiode body="url(#g-black)" band="#8a9099" label={String(props.model).replace('1N', '')} />,
  sim: sim('diode'),
});

// ───────── LED ─────────

registerComponent({
  type: 'led',
  name: 'LED 5 mm',
  category: 'semis',
  prefix: 'D',
  description: 'Díodo emissor de luz. Terminal comprido = ânodo (+). Lado plano = cátodo (−). Precisa de resistência limitadora.',
  tags: ['led', 'luz', 'indicador', 'díodo'],
  bbox: { x: -7, y: -20, w: 24, h: 52 },
  pins: [
    { id: 'A', name: 'Ânodo (+)', x: 0, y: 30, role: 'passive', polarity: '+', description: 'Terminal mais comprido' },
    { id: 'K', name: 'Cátodo (−)', x: 10, y: 30, role: 'passive', polarity: '-', description: 'Lado plano da base' },
  ],
  props: [
    sel('color', 'Cor', 'red', Object.entries(LED_COLORS).map(([k, c]) => [k, c.label])),
    num('ifmax', 'Corrente máxima', 0.02, 'A'),
  ],
  valueLabel: (p) => LED_COLORS[String(p.color)]?.label ?? '',
  render: ({ props, state }) => {
    const c = String(props.color) in LED_COLORS ? String(props.color) : 'red';
    const b = Math.max(0, Math.min(1, state?.brightness ?? 0));
    return (
      <g>
        {/* lead frame: anode (long, bent) and cathode (short, with the reflector cup) */}
        <LeadPath d="M2 3 L2 10 L-1.5 15 L0 18 L0 30" w={0.9} />
        <LeadPath d="M8 3 L8 12 L10 16 L10 30" w={0.9} />
        {b > 0 && <circle cx={5} cy={-8} r={12 + 24 * b} fill={`url(#g-glow-${c})`} opacity={0.4 + 0.6 * b} />}
        {/* epoxy dome: colour, cylindrical rounding and a clear-resin highlight */}
        <path d="M-5 0.5 L-5 -12 A10 10 0 0 1 15 -12 L15 0.5 Z" fill={`url(#g-led-${c})`} stroke="#000" strokeOpacity={0.25} strokeWidth={0.4} />
        <path d="M-5 0.5 L-5 -12 A10 10 0 0 1 15 -12 L15 0.5 Z" fill="url(#g-cyl-h)" opacity={0.55} />
        {/* internal reflector cup and the LED die */}
        <path d="M-1.6 0.5 L-0.4 -4.6 L5.8 -4.6 L6.8 0.5 Z" fill="url(#g-metal-cap)" opacity={0.85} />
        <rect x={1.6} y={-2.6} width={2.6} height={2} fill="#22252a" />
        <rect x={1.6} y={-2.6} width={2.6} height={0.7} fill="#fff" opacity={0.35} />
        {/* flange (the flat base) */}
        <path d="M-6.5 0.6 L16.5 0.6 L16.5 2.6 Q16.5 3.4 15.5 3.4 L-5.5 3.4 Q-6.5 3.4 -6.5 2.6 Z" fill={`url(#g-led-${c})`} stroke="#000" strokeOpacity={0.3} strokeWidth={0.3} />
        {/* specular curve on the dome */}
        <path d="M-3.6 -10 A8 8 0 0 1 1.5 -17.4" fill="none" stroke="#fff" strokeOpacity={0.75} strokeWidth={1.2} strokeLinecap="round" />
        <path d="M-2.8 -4 A8 8 0 0 0 -4.2 -9" fill="none" stroke="#fff" strokeOpacity={0.25} strokeWidth={0.6} strokeLinecap="round" />
        {/* flat side marks the cathode */}
        <rect x={-5.4} y={-1.6} width={0.9} height={2.2} fill="#000" opacity={0.25} />
        {b > 0 && <path d="M-5 0.5 L-5 -12 A10 10 0 0 1 15 -12 L15 0.5 Z" fill={LED_COLORS[c].light} opacity={0.5 * b} />}
      </g>
    );
  },
  datasheet: {
    summary: 'Acende com corrente direta de ~5–20 mA. Resistência série: R = (Vfonte − Vf) / If.',
    specs: { 'Vf vermelho/amarelo': '≈ 2,0 V', 'Vf verde': '≈ 2,1 V', 'Vf azul/branco': '≈ 3,0–3,2 V', 'If máx.': '20 mA (contínua)', 'Vr máx.': '5 V' },
    notes: ['Ex.: 9 V, LED vermelho, 15 mA → R = (9 − 2)/0,015 ≈ 470 Ω.'],
  },
  sim: sim('led'),
});

// ───────── BJT / JFET (TO-92) ─────────

const BJT_MODELS: Record<string, { type: 'NPN' | 'PNP'; order: 'EBC' | 'CBE' }> = {
  '2N2222A': { type: 'NPN', order: 'EBC' }, '2N3904': { type: 'NPN', order: 'EBC' }, 'BC547': { type: 'NPN', order: 'CBE' }, 'BC337': { type: 'NPN', order: 'CBE' },
  '2N3906': { type: 'PNP', order: 'EBC' }, 'BC557': { type: 'PNP', order: 'CBE' }, 'BC327': { type: 'PNP', order: 'CBE' },
};
const PIN_NAMES = { E: 'Emissor (E)', B: 'Base (B)', C: 'Coletor (C)' } as const;

function bjtPins(model: string): PinDef[] {
  const order = (BJT_MODELS[model]?.order ?? 'EBC').split('') as ('E' | 'B' | 'C')[];
  return to92Pins([order[0], order[1], order[2]].map((l) => ({ name: PIN_NAMES[l], role: 'passive' })) as never).map((p, i) => ({ ...p, id: order[i] }));
}

for (const kind of ['NPN', 'PNP'] as const) {
  const models = Object.entries(BJT_MODELS).filter(([, m]) => m.type === kind).map(([k]) => [k, k] as [string, string]);
  registerComponent({
    type: `bjt-${kind.toLowerCase()}`,
    name: `Transístor ${kind}`,
    category: 'semis',
    subcategory: 'Transístores',
    prefix: 'Q',
    description: `Transístor bipolar ${kind} em encapsulamento TO-92. A ordem dos pinos depende do modelo — verifique sempre!`,
    tags: ['transistor', 'bjt', kind.toLowerCase(), ...models.map((m) => m[0].toLowerCase())],
    bbox: to92BBox,
    pins: (p) => bjtPins(String(p.model)),
    props: [sel('model', 'Modelo', models[0][0], models), num('hfe', 'Ganho hFE (β)', kind === 'NPN' ? 150 : 120, '', { si: false })],
    valueLabel: (p) => String(p.model),
    render: ({ props }) => <To92Body label={String(props.model)} sub={kind} pinLetters={(BJT_MODELS[String(props.model)]?.order ?? 'EBC').split('')} />,
    datasheet: { summary: kind === 'NPN' ? 'Corrente de base pequena (B→E) controla corrente maior de coletor: Ic = β·Ib. Conduz quando Vbe ≈ 0,7 V.' : 'Conduz quando a base está ≈0,7 V ABAIXO do emissor. Ic = β·Ib.', specs: { 'Ic máx.': '600 mA (2N2222A) / 100 mA (BC5x7)', 'Vce máx.': '40 V / 45 V' } },
    sim: sim('bjt'),
  });
}

registerComponent({
  type: 'jfet-n',
  name: 'JFET canal N',
  category: 'semis',
  subcategory: 'Transístores',
  prefix: 'Q',
  description: 'Transístor de efeito de campo de junção (canal N), controlado por tensão na porta.',
  tags: ['jfet', 'fet', '2n5457', 'j201'],
  bbox: to92BBox,
  pins: to92Pins([{ name: 'Dreno (D)', role: 'passive' }, { name: 'Fonte (S)', role: 'passive' }, { name: 'Porta (G)', role: 'input' }]).map((p, i) => ({ ...p, id: 'DSG'[i] })),
  props: [sel('model', 'Modelo', '2N5457', [['2N5457', '2N5457'], ['J201', 'J201']])],
  valueLabel: (p) => String(p.model),
  render: ({ props }) => <To92Body label={String(props.model)} sub="JFET-N" pinLetters={['D', 'S', 'G']} />,
  sim: sim('jfet'),
});

// ───────── TO-220 power devices ─────────

const to220Part = (type: string, name: string, prefix: string, description: string, pins: [string, string, string], ids: [string, string, string], models: [string, string][], model: string, extra: { tags: string[]; summary?: string }) => registerComponent({
  type, name, category: 'semis', prefix, description, tags: extra.tags,
  subcategory: prefix === 'Q' ? 'Transístores' : 'Tiristores',
  bbox: to220BBox,
  pins: to220Pins(pins.map((n) => ({ name: n, role: 'passive' })) as never).map((p, i) => ({ ...p, id: ids[i] })),
  props: [sel('model', 'Modelo', models[0][0], models)],
  valueLabel: (p) => String(p.model),
  render: ({ props }) => <To220Body label={String(props.model)} sub={model} />,
  datasheet: extra.summary ? { summary: extra.summary } : undefined,
  sim: sim(type),
});

to220Part('mosfet-n', 'MOSFET canal N', 'Q', 'MOSFET de potência canal N (enriquecimento). Conduz quando Vgs > Vth.', ['Porta (G)', 'Dreno (D)', 'Fonte (S)'], ['G', 'D', 'S'],
  [['IRF540N', 'IRF540N (100 V, 33 A)'], ['IRLZ44N', 'IRLZ44N (nível lógico)'], ['IRFZ44N', 'IRFZ44N (55 V, 49 A)']], 'N-MOSFET',
  { tags: ['mosfet', 'irf540', 'irlz44n', 'potência'], summary: 'Controlado por tensão: corrente de porta praticamente nula. Para Arduino (5 V) prefira modelos de nível lógico (IRLZ44N).' });
to220Part('mosfet-p', 'MOSFET canal P', 'Q', 'MOSFET de potência canal P. Conduz quando Vgs < −Vth.', ['Porta (G)', 'Dreno (D)', 'Fonte (S)'], ['G', 'D', 'S'],
  [['IRF9540N', 'IRF9540N (−100 V)'], ['IRF4905', 'IRF4905 (−55 V, 74 A)']], 'P-MOSFET', { tags: ['mosfet', 'p', 'irf9540'] });
to220Part('triac', 'TRIAC', 'Q', 'Tiristor bidirecional para controlo de cargas AC.', ['MT1', 'MT2', 'Gate (G)'], ['MT1', 'MT2', 'G'],
  [['BT136', 'BT136 (4 A, 600 V)'], ['BTA16', 'BTA16 (16 A)']], 'TRIAC', { tags: ['triac', 'bt136', 'ac', 'dimmer'], summary: 'Disparado por impulso na gate; mantém-se a conduzir até a corrente passar por zero.' });
to220Part('scr', 'SCR (tiristor)', 'Q', 'Retificador controlado de silício. Conduz de A para K depois de disparado pela gate.', ['Cátodo (K)', 'Ânodo (A)', 'Gate (G)'], ['K', 'A', 'G'],
  [['2N6504', '2N6504 (25 A, 50 V)'], ['TYN612', 'TYN612 (12 A)']], 'SCR', { tags: ['scr', 'tiristor'] });

// ───────── Bridge rectifier ─────────

registerComponent({
  type: 'bridge-rectifier',
  name: 'Ponte retificadora',
  category: 'semis',
  prefix: 'BR',
  description: 'Quatro díodos em ponte (encapsulamento KBP). Converte AC em DC pulsante de onda completa.',
  tags: ['ponte', 'retificador', 'kbp', 'dc'],
  bbox: { x: -16, y: -26, w: 42, h: 48 },
  pins: [
    { id: '+', name: 'Saída + (DC)', x: -10, y: 20, role: 'power', polarity: '+' },
    { id: 'AC1', name: 'Entrada ~ (AC)', x: 0, y: 20, role: 'passive' },
    { id: 'AC2', name: 'Entrada ~ (AC)', x: 10, y: 20, role: 'passive' },
    { id: '-', name: 'Saída − (DC)', x: 20, y: 20, role: 'ground', polarity: '-' },
  ],
  props: [sel('model', 'Modelo', 'KBP206', [['KBP206', 'KBP206 (2 A, 600 V)'], ['KBP307', 'KBP307 (3 A)']])],
  valueLabel: (p) => String(p.model),
  render: ({ props }) => (
    <g>
      <ellipse cx={3} cy={21} rx={24} ry={1.5} fill="#000" opacity={0.2} filter="url(#f-soft)" />
      {[-10, 0, 10, 20].map((x) => (
        <g key={x}>
          <Lead x1={x} y1={6} x2={x} y2={20} w={1.5} />
          <rect x={x - 1.6} y={3} width={3.2} height={4} fill="url(#g-metal-h)" stroke="#6f7782" strokeWidth={0.2} />
        </g>
      ))}
      {/* moulded body: grain, rounding, chamfered corner marking the + lead */}
      <path d="M-15 -25 L-11 -25 L25 -25 L25 7 L-15 7 Z" fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.5} filter="url(#f-texture)" />
      <path d="M-15 -25 L-15 7 L25 7 L25 -25 Z" fill="url(#g-cyl-h)" opacity={0.3} />
      <path d="M-15 -21 L-11 -25" stroke="#8a9199" strokeWidth={0.9} />
      <path d="M-14.6 -21 L-11 -24.6" stroke="#ffffff" strokeOpacity={0.25} strokeWidth={0.4} />
      <Txt x={5} y={-14} size={4} fill="#e4e7eb">{String(props.model)}</Txt>
      {['+', '~', '~', '−'].map((s, i) => <Txt key={i} x={-10 + i * 10} y={1} size={4} fill="#c9cdd2">{s}</Txt>)}
    </g>
  ),
  datasheet: { summary: 'Vdc pico ≈ Vac pico − 2·Vf (≈1,4 V). Requer condensador de filtro para DC estável.' },
  sim: sim('bridge'),
});
