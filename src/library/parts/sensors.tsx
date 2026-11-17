import type { ReactNode } from 'react';
import { registerComponent } from '../registry';
import { Lead, LeadPath, Smd, SmdLed, Txt, HeaderPin } from '../render/primitives';
import { ModuleBoard, To92Body, moduleBBox, moduleLayout, modulePins, to92BBox, to92Pins, type ModuleSpec } from '../render/packages';
import { num, sim } from './common';
import type { ComponentDef } from '../types';

type L = ReturnType<typeof moduleLayout> & { w: number; h: number };

function sensorModule(base: Omit<ComponentDef, 'bbox' | 'pins' | 'render' | 'category' | 'prefix'> & { prefix?: string }, m: ModuleSpec, deco: (l: L) => ReactNode) {
  const lay = { ...moduleLayout(m), w: m.w, h: m.h };
  registerComponent({
    ...base,
    category: 'sensors',
    prefix: base.prefix ?? 'U',
    bbox: moduleBBox(m),
    pins: modulePins(m),
    render: () => <ModuleBoard m={m}>{deco(lay)}</ModuleBoard>,
  });
}

/** Contact shadow under a bare component. */
const shadow = (cx: number, cy: number, rx: number) => <ellipse cx={cx} cy={cy} rx={rx} ry={1.3} fill="#000" opacity={0.2} filter="url(#f-soft)" />;

/** Blue multi-turn trimmer: moulded case, shaded side, gold adjustment screw with its slot. */
function Trimmer({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 5} y={y - 5} width={10} height={10} rx={0.8} fill="#2a64c4" stroke="#0e2f66" strokeWidth={0.4} />
      <rect x={x - 5} y={y - 5} width={10} height={10} rx={0.8} fill="url(#g-cyl-h)" opacity={0.35} />
      <circle cx={x + 2} cy={y - 2} r={2} fill="url(#g-gold)" stroke="#6b4e0d" strokeWidth={0.3} />
      <rect x={x + 1} y={y - 2.4} width={2.4} height={0.8} fill="#4a3608" />
    </g>
  );
}

/** SOIC-8 comparator (LM393): dark moulded body, pin-1 dot and gull-wing leads. */
function Lm393({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x - 8} y={y - 4} width={16} height={8} rx={0.6} fill="#17191d" filter="url(#f-texture)" />
      <rect x={x - 8} y={y - 4} width={16} height={8} rx={0.6} fill="url(#g-cyl-h)" opacity={0.3} />
      <circle cx={x - 6} cy={y - 2.6} r={0.6} fill="#55595f" />
      {[-6, -2, 2, 6].map((d) => (
        <g key={d}>
          <rect x={x + d - 0.6} y={y - 5.6} width={1.2} height={1.8} fill="url(#g-metal-h)" />
          <rect x={x + d - 0.6} y={y + 3.8} width={1.2} height={1.8} fill="url(#g-metal-h)" />
        </g>
      ))}
      <Txt x={x} y={y + 0.8} size={2} fill="#c9ced6">LM393</Txt>
    </g>
  );
}

/** Zig-zag CdS track (same look as the LDR component). */
function LdrCell({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 7; i++) pts.push(`${cx - r * 0.7 + i * (r * 0.23)},${cy - r * 0.6}`, `${cx - r * 0.7 + i * (r * 0.23) + r * 0.12},${cy + r * 0.6}`);
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#cdbf9b" stroke="#7d6f55" strokeWidth={0.4} filter="url(#f-texture)" />
      <polyline points={pts.join(' ')} fill="none" stroke="#a7402a" strokeWidth={0.8} strokeLinejoin="round" />
      <circle cx={cx} cy={cy} r={r} fill="url(#g-glass)" opacity={0.5} />
    </g>
  );
}

// ───────── HC-SR04 ─────────
const sr04: ModuleSpec = { w: 180, h: 80, pcb: 'blue', pins: [{ name: 'VCC', role: 'power' }, { name: 'Trig', role: 'input', description: 'Impulso ≥10 µs inicia a medição' }, { name: 'Echo', role: 'output', description: 'Largura do impulso ∝ distância' }, { name: 'GND', role: 'ground' }] };
sensorModule({
  type: 'hc-sr04', name: 'Sensor ultrassónico HC-SR04', description: 'Mede distâncias de 2 cm a 4 m por eco ultrassónico (40 kHz).',
  tags: ['ultrassom', 'distância', 'hc-sr04', 'sonar'],
  props: [num('distance', 'Distância do obstáculo', 0.5, 'm', { min: 0.02, max: 4 })],
  valueLabel: (p) => `${Math.round(Number(p.distance) * 100)} cm`,
  datasheet: { summary: 'Distância (cm) = duração do Echo (µs) / 58. Alimentação 5 V, 15 mA.', specs: { 'Alcance': '2 cm – 400 cm', 'Ângulo': '15°', 'Resolução': '3 mm' } },
  sim: sim('hc-sr04', 'Modelo comportamental previsto para a Fase 5 (requer MCU).'),
}, sr04, ({ bx, by, w }) => (
  <g>
    {[bx + w / 2 - 45, bx + w / 2 + 45].map((cx, i) => (
      <g key={i}>
        {shadow(cx, by + 68, 30)}
        {/* aluminium can with the transducer membrane behind a mesh grille */}
        <circle cx={cx} cy={by + 36} r={30} fill="url(#g-metal-r)" stroke="#5a616b" strokeWidth={0.6} />
        <circle cx={cx} cy={by + 36} r={26} fill="#16181c" />
        <circle cx={cx} cy={by + 36} r={24} fill="url(#p-mesh)" opacity={0.85} />
        <circle cx={cx} cy={by + 36} r={24} fill="url(#g-transducer)" opacity={0.55} />
        <circle cx={cx - 6} cy={by + 28} r={7} fill="url(#g-epoxy-dome)" opacity={0.6} />
        <Txt x={cx} y={by + 72} size={4} fill="#fff">{i === 0 ? 'T' : 'R'}</Txt>
      </g>
    ))}
    {/* SMD crystal and the marking */}
    <rect x={bx + w / 2 - 9} y={by + 12} width={18} height={9} rx={1.5} fill="url(#g-metal-cap)" stroke="#888" strokeWidth={0.4} />
    <Txt x={bx + w / 2} y={by + 30} size={5} fill="#fff">HC-SR04</Txt>
  </g>
));

// ───────── LM35 ─────────
registerComponent({
  type: 'lm35', name: 'Sensor de temperatura LM35', category: 'sensors', prefix: 'U',
  description: 'Sensor de temperatura analógico de precisão: 10 mV/°C, saída linear.',
  tags: ['lm35', 'temperatura', 'analógico'],
  bbox: to92BBox,
  pins: to92Pins([{ name: '+Vs', role: 'power' }, { name: 'Vout', role: 'analog' }, { name: 'GND', role: 'ground' }]).map((p, i) => ({ ...p, id: ['VS', 'OUT', 'GND'][i] })),
  props: [num('temperature', 'Temperatura', 25, '°C', { si: false, min: -55, max: 150 })],
  valueLabel: (p) => `${p.temperature} °C`,
  render: () => <To92Body label="LM35" sub="DZ" pinLetters={['+', 'O', '−']} />,
  datasheet: { summary: 'Vout = 10 mV × T(°C). A 25 °C → 250 mV. Alimentação 4–30 V.', specs: { 'Precisão': '±0,5 °C a 25 °C', 'Gama': '−55 a 150 °C' } },
  sim: sim('lm35'),
});

// ───────── DHT11 / DHT22 (bare sensors) ─────────
for (const [type, name, plastic, ink, w, h, info] of [
  ['dht11', 'Sensor DHT11', 'url(#g-blue-plastic)', '#f2f6fb', 50, 62, 'Temperatura 0–50 °C (±2 °C), humidade 20–90 % (±5 %). 1 leitura/s.'],
  ['dht22', 'Sensor DHT22 (AM2302)', 'url(#g-white-plastic)', '#2a3038', 56, 78, 'Temperatura −40–80 °C (±0,5 °C), humidade 0–100 % (±2 %). 1 leitura/2 s.'],
] as const) {
  registerComponent({
    type, name, category: 'sensors', prefix: 'U',
    description: 'Sensor digital de temperatura e humidade (protocolo de 1 fio proprietário).',
    tags: ['dht', 'temperatura', 'humidade', type],
    bbox: { x: -w / 2 + 5, y: -h - 2, w, h: h + 24 },
    pins: [{ id: 'VCC', name: 'VCC', x: -10, y: 20, role: 'power' }, { id: 'DATA', name: 'DATA', x: 0, y: 20, role: 'io', description: 'Pull-up de 10 kΩ para VCC' }, { id: 'NC', name: 'NC', x: 10, y: 20, role: 'nc' }, { id: 'GND', name: 'GND', x: 20, y: 20, role: 'ground' }],
    props: [num('temperature', 'Temperatura', 24, '°C', { si: false }), num('humidity', 'Humidade relativa', 55, '%', { si: false, min: 0, max: 100 })],
    valueLabel: (p) => `${p.temperature}°C ${p.humidity}%`,
    render: () => (
      <g>
        {shadow(5, 21, w / 2)}
        {/* tinned legs */}
        {[-10, 0, 10, 20].map((x) => <Lead key={x} x1={x} y1={-h} x2={x} y2={20} w={1.2} />)}
        {/* moulded case with grain, rounding and a gloss band */}
        <rect x={-w / 2 + 5} y={-h} width={w} height={h} rx={3} fill={plastic} stroke="#0003" strokeWidth={0.6} filter={type === 'dht11' ? 'url(#f-texture)' : undefined} />
        <rect x={-w / 2 + 5} y={-h} width={w} height={h} rx={3} fill="url(#g-cyl-h)" opacity={0.3} />
        <rect x={-w / 2 + 5} y={-h + 1} width={w - 2} height={1.2} rx={0.6} fill="#fff" opacity={0.25} />
        {/* recessed vent grille */}
        <rect x={-w / 2 + 10} y={-h + 5} width={w - 10} height={h * 0.62} rx={1} fill="#0c0f13" />
        <g color="#7d8790"><rect x={-w / 2 + 10} y={-h + 5} width={w - 10} height={h * 0.62} rx={1} fill="url(#p-dht)" /></g>
        <Txt x={5} y={-h * 0.22} size={4.2} fill={ink}>{type.toUpperCase()}</Txt>
      </g>
    ),
    datasheet: { summary: info },
    sim: sim('dht', 'Protocolo digital — requer MCU (Fase 5).'),
  });
}

// ───────── PIR ─────────
const pir: ModuleSpec = { w: 128, h: 96, pcb: 'green', pins: [{ name: 'VCC', role: 'power' }, { name: 'OUT', role: 'output' }, { name: 'GND', role: 'ground' }] };
sensorModule({
  type: 'pir', name: 'Sensor PIR HC-SR501', description: 'Detetor de movimento por infravermelho passivo, saída digital (3,3 V).',
  tags: ['pir', 'movimento', 'presença', 'hc-sr501'],
  props: [{ key: 'motion', label: 'Movimento detetado', type: 'boolean', default: false }],
  valueLabel: (p) => (p.motion ? 'movimento' : 'parado'),
  datasheet: { summary: 'Alcance até 7 m, ângulo 110°. Potenciómetros ajustam sensibilidade e tempo de retenção (5 s – 5 min).' },
  sim: sim('pir'),
}, pir, ({ bx, by, w, h }) => {
  const cx = bx + w / 2, cy = by + h / 2 - 8;
  return (
    <g>
      {/* Fresnel lens: translucent dome with concentric facets and a specular arc */}
      {shadow(cx, cy + 46, 40)}
      <circle cx={cx} cy={cy} r={44} fill="url(#g-dome-white)" stroke="#9aa1aa" strokeWidth={0.6} opacity={0.95} />
      {Array.from({ length: 5 }, (_, i) => <circle key={i} cx={cx} cy={cy} r={9 + i * 8} fill="none" stroke="#aab2bb" strokeWidth={0.5} opacity={0.75} />)}
      <path d={`M${cx - 44} ${cy} H${cx + 44} M${cx} ${cy - 44} V${cy + 44}`} stroke="#c3c8ce" strokeWidth={0.4} />
      <path d={`M${cx - 30} ${cy - 22} A34 34 0 0 1 ${cx - 6} ${cy - 34}`} fill="none" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" opacity={0.85} />
      {/* two multi-turn trimmers on the board */}
      <Trimmer x={bx + 14} y={by + h - 12} /><Trimmer x={bx + w - 14} y={by + h - 12} />
    </g>
  );
});

// ───────── Soil moisture (capacitive) ─────────
const soil: ModuleSpec = { w: 60, h: 170, x: -40, y: -6, pcb: 'green', pins: [{ name: 'GND', role: 'ground' }, { name: 'VCC', role: 'power' }, { name: 'AOUT', role: 'analog' }], pinX0: -20 };
sensorModule({
  type: 'soil-moisture', name: 'Sensor de humidade do solo', description: 'Sensor capacitivo v1.2 — saída analógica inversamente proporcional à humidade.',
  tags: ['solo', 'humidade', 'rega', 'capacitivo'],
  props: [num('moisture', 'Humidade do solo', 40, '%', { si: false, min: 0, max: 100 })],
  valueLabel: (p) => `${p.moisture}%`,
  datasheet: { summary: 'Seco (ar): ~2,8 V; dentro de água: ~1,2 V (a 5 V). Calibrar no solo real.' },
  sim: sim('analog-sensor'),
}, soil, ({ bx, by, w, h }) => (
  <g>
    {/* SOIC-8 timer (TLC555) with gull-wing pins */}
    <rect x={bx + 14} y={by + 16} width={w - 28} height={18} rx={1} fill="#16181c" stroke="#333" strokeWidth={0.3} filter="url(#f-texture)" />
    {[0, 1, 2, 3].map((i) => <g key={i}><rect x={bx + 11} y={by + 19 + i * 4} width={3} height={1.2} fill="url(#g-metal-h)" /><rect x={bx + w - 14} y={by + 19 + i * 4} width={3} height={1.2} fill="url(#g-metal-h)" /></g>)}
    <circle cx={bx + 17} cy={by + 19} r={0.8} fill="#55595f" />
    <Txt x={bx + w / 2} y={by + 26} size={2.4} fill="#c9ced6">TLC555</Txt>
    {/* silkscreen title */}
    <Txt x={bx + w / 2} y={by + 46} size={2.5} fill="#f2f6fb">Capacitive Soil v1.2</Txt>
    {/* two gold probe tines, bevelled at the tips */}
    {[bx + 14, bx + 38].map((x) => <rect key={x} x={x} y={by + 56} width={8} height={h - 62} rx={3} fill="url(#g-gold)" stroke="#6b4e0d" strokeWidth={0.3} />)}
    <rect x={bx + 22} y={by + 56} width={16} height={h - 62} rx={1} fill="url(#g-pcb-green)" />
  </g>
));

// ───────── MQ-2 gas ─────────
const mq2: ModuleSpec = { w: 90, h: 120, pcb: 'blue', pins: [{ name: 'VCC', role: 'power' }, { name: 'GND', role: 'ground' }, { name: 'DO', role: 'output' }, { name: 'AO', role: 'analog' }] };
sensorModule({
  type: 'mq2', name: 'Sensor de gás MQ-2', description: 'Detecta GPL, propano, metano, fumo e hidrogénio. Saídas analógica (AO) e digital com limiar (DO).',
  tags: ['gás', 'mq2', 'fumo', 'incêndio', 'glp'],
  props: [num('ppm', 'Concentração de gás', 200, 'ppm', { si: false, min: 0, max: 10000 })],
  valueLabel: (p) => `${p.ppm} ppm`,
  datasheet: { summary: 'Aquecedor interno consome ~150 mA — exige pré-aquecimento (24–48 h para calibração). DO ativo baixo.' },
  sim: sim('analog-sensor'),
}, mq2, ({ bx, by, w }) => (
  <g>
    {/* metal sensing cap: wire-mesh grille on a shaded cylinder */}
    {shadow(bx + w / 2, by + 80, 34)}
    <circle cx={bx + w / 2} cy={by + 42} r={34} fill="url(#g-metal-r)" stroke="#6b737d" strokeWidth={0.8} />
    <circle cx={bx + w / 2} cy={by + 42} r={30} fill="url(#p-mesh)" opacity={0.9} />
    <circle cx={bx + w / 2} cy={by + 42} r={30} fill="url(#g-epoxy-dome)" opacity={0.25} />
    <circle cx={bx + w / 2} cy={by + 42} r={34} fill="none" stroke="#fff" strokeOpacity={0.3} strokeWidth={0.6} />
    <Trimmer x={bx + 16} y={by + 88} /><Lm393 x={bx + w / 2 + 14} y={by + 88} />
    <SmdLed x={bx + 12} y={by + 100} color="#ff3b30" on /><SmdLed x={bx + 22} y={by + 100} color="#ff3b30" />
  </g>
));

// ───────── LDR light module ─────────
const lightMod: ModuleSpec = { w: 120, h: 56, pcb: 'blue', pins: [{ name: 'VCC', role: 'power' }, { name: 'GND', role: 'ground' }, { name: 'DO', role: 'output' }, { name: 'AO', role: 'analog' }] };
sensorModule({
  type: 'light-sensor', name: 'Módulo sensor de luz (LDR)', description: 'LDR + comparador LM393. AO = tensão proporcional à luz; DO = limiar ajustável.',
  tags: ['luz', 'ldr', 'fotocélula', 'iluminação'],
  props: [{ key: 'lux', label: 'Iluminação', type: 'number', default: 300, unit: 'lux', min: 0, max: 100000 }],
  valueLabel: (p) => `${p.lux} lux`,
  sim: sim('analog-sensor'),
}, lightMod, ({ bx, by, w }) => (
  <g>
    <LdrCell cx={bx + 14} cy={by + 22} r={8} />
    <Trimmer x={bx + 36} y={by + 20} /><Lm393 x={bx + 62} y={by + 20} />
    <SmdLed x={bx + 84} y={by + 14} color="#ff3b30" on /><SmdLed x={bx + 84} y={by + 26} color="#33dd55" />
    <Smd x={bx + 100} y={by + 18} /><Smd x={bx + 100} y={by + 26} />
    <Txt x={bx + w / 2} y={by + 38} size={3} fill="#e9eef5">LIGHT SENSOR</Txt>
  </g>
));

// ───────── Rain plate ─────────
registerComponent({
  type: 'rain-sensor', name: 'Sensor de chuva (placa)', category: 'sensors', prefix: 'U',
  description: 'Placa com pistas entrelaçadas: a água entre pistas baixa a resistência. Usar com módulo comparador ou divisor.',
  tags: ['chuva', 'água', 'rain', 'humidade'],
  bbox: { x: -51, y: -86, w: 102, h: 92 },
  pins: [{ id: '1', name: 'Pista A', x: -10, y: 0, role: 'passive' }, { id: '2', name: 'Pista B', x: 10, y: 0, role: 'passive' }],
  props: [num('wetness', 'Molhado', 0, '%', { si: false, min: 0, max: 100 })],
  valueLabel: (p) => `${p.wetness}% molhado`,
  render: () => (
    <g>
      {shadow(0, 2, 46)}
      <rect x={-50} y={-85} width={100} height={80} rx={2} fill="url(#g-pcb-red)" stroke="#5a0f0b" strokeWidth={0.6} />
      <rect x={-50} y={-85} width={100} height={80} rx={2} fill="url(#g-cyl-h)" opacity={0.25} />
      {/* interdigitated gold tracks */}
      {Array.from({ length: 9 }, (_, i) => (
        <rect key={i} x={i % 2 ? -40 : -44} y={-78 + i * 7.5} width={84} height={3} fill="url(#g-gold)" opacity={0.95} />
      ))}
      <rect x={-46} y={-80} width={3} height={70} fill="url(#g-gold)" /><rect x={43} y={-80} width={3} height={70} fill="url(#g-gold)" />
      <HeaderPin x={-10} y={0} /><HeaderPin x={10} y={0} />
    </g>
  ),
  sim: sim('variable-resistor'),
});

// ───────── Current / voltage terminal modules ─────────
function terminalModule(type: string, name: string, description: string, tags: string[], pcb: ModuleSpec['pcb'], header: { id: string; name: string; role: 'power' | 'ground' | 'analog' | 'output' }[], term: [string, string], chip: string, summary: string, props: ComponentDef['props']) {
  registerComponent({
    type, name, category: 'sensors', prefix: 'U', description, tags,
    bbox: { x: -30, y: -64, w: 60, h: 70 },
    pins: [
      ...header.map((h, i) => ({ ...h, x: -10 + i * 10, y: 0 })),
      { id: 'T1', name: term[0], x: -10, y: -50, role: 'passive' as const },
      { id: 'T2', name: term[1], x: 10, y: -50, role: 'passive' as const },
    ],
    props,
    render: () => (
      <g>
        {shadow(0, 6, 28)}
        <rect x={-29} y={-63} width={58} height={69} rx={2.5} fill={`url(#g-pcb-${pcb})`} stroke="#0006" strokeWidth={0.6} />
        <rect x={-29} y={-63} width={58} height={69} rx={2.5} fill="url(#g-cyl-h)" opacity={0.2} />
        {/* screw terminal blocks: moulded green plastic with a screw head each */}
        {[-10, 10].map((x) => (
          <g key={x}>
            <rect x={x - 7} y={-56} width={14} height={13} rx={1} fill="#1f8a45" stroke="#0c4a24" strokeWidth={0.4} filter="url(#f-texture)" />
            <rect x={x - 7} y={-56} width={14} height={13} rx={1} fill="url(#g-cyl-h)" opacity={0.35} />
            <circle cx={x} cy={-50} r={4} fill="url(#g-metal-r)" stroke="#50585f" strokeWidth={0.3} />
            <line x1={x - 2.6} y1={-50} x2={x + 2.6} y2={-50} stroke="#3a4149" strokeWidth={0.8} />
          </g>
        ))}
        {/* SOIC-8 chip with the part number */}
        <rect x={-8} y={-32} width={16} height={10} rx={0.6} fill="#16181c" filter="url(#f-texture)" />
        <Txt x={0} y={-26} size={2} fill="#c9ced6">{chip}</Txt>
        <Smd x={-18} y={-27} /><Smd x={18} y={-27} /><SmdLed x={-18} y={-16} color="#ff3b30" on />
        {header.map((h, i) => <g key={h.id}><HeaderPin x={-10 + i * 10} y={0} /><Txt x={-10 + i * 10} y={-8} size={2.4} fill="#1d2631">{h.name}</Txt></g>)}
      </g>
    ),
    datasheet: { summary },
    sim: sim('analog-sensor'),
  });
}
terminalModule('acs712', 'Sensor de corrente ACS712', 'Sensor de corrente por efeito Hall (isolado). Saída 2,5 V em 0 A, ±185 mV/A (versão 5 A).', ['corrente', 'acs712', 'hall', 'amperímetro'], 'red',
  [{ id: 'VCC', name: 'VCC', role: 'power' }, { id: 'OUT', name: 'OUT', role: 'analog' }, { id: 'GND', name: 'GND', role: 'ground' }], ['IP+', 'IP−'], 'ACS712', 'Vout = 2,5 V + 0,185 V/A × I. A corrente a medir passa pelos bornes IP+ → IP−.', [num('range', 'Gama', 5, 'A')]);
terminalModule('voltage-sensor', 'Sensor de tensão (0–25 V)', 'Divisor resistivo 30 kΩ/7,5 kΩ (÷5) para medir até 25 V com um ADC de 5 V.', ['tensão', 'voltímetro', 'divisor'], 'blue',
  [{ id: 'S', name: 'S', role: 'analog' }, { id: 'PLUS', name: '+', role: 'power' }, { id: 'MINUS', name: '−', role: 'ground' }], ['VCC (entrada)', 'GND (entrada)'], '30k/7k5', 'S = Vin / 5. O pino "+" não é usado em muitos módulos.', []);

// ───────── Rotary encoder ─────────
const enc: ModuleSpec = { w: 100, h: 76, pcb: 'black', pins: [{ name: 'CLK', role: 'output' }, { name: 'DT', role: 'output' }, { name: 'SW', role: 'output' }, { name: '+', role: 'power' }, { name: 'GND', role: 'ground' }] };
sensorModule({
  type: 'rotary-encoder', name: 'Encoder rotativo KY-040', description: 'Encoder incremental de 20 passos/volta com botão de pressão integrado.',
  tags: ['encoder', 'rotativo', 'ky-040', 'quadratura'],
  datasheet: { summary: 'CLK e DT em quadratura: o sentido é dado pela fase de DT no flanco de CLK.' },
  sim: sim('encoder', 'Comportamento digital — requer MCU (Fase 5).'),
}, enc, ({ bx, by, w }) => {
  const cx = bx + w / 2, cy = by + 29;
  return (
    <g>
      {/* metal bushing and nut */}
      <rect x={cx - 26} y={by + 6} width={52} height={46} rx={2} fill="url(#g-metal)" stroke="#555" strokeWidth={0.5} />
      <rect x={cx - 26} y={by + 6} width={52} height={46} rx={2} fill="url(#g-cyl-h)" opacity={0.25} />
      {/* knurled black knob with a bevelled top */}
      {shadow(cx, cy + 20, 18)}
      <circle cx={cx} cy={cy} r={18} fill="url(#g-black)" stroke="#000" strokeWidth={0.5} />
      {Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return <line key={i} x1={cx + Math.cos(a) * 15} y1={cy + Math.sin(a) * 15} x2={cx + Math.cos(a) * 18} y2={cy + Math.sin(a) * 18} stroke="#4a4f57" strokeWidth={0.8} />; })}
      <circle cx={cx} cy={cy} r={12} fill="url(#g-epoxy-dome)" opacity={0.5} />
      <path d={`M${cx - 7} ${cy - 5} A9 9 0 0 1 ${cx + 6} ${cy - 8}`} fill="none" stroke="#fff" strokeOpacity={0.4} strokeWidth={1.2} strokeLinecap="round" />
    </g>
  );
});

// ───────── IR proximity ─────────
const ir: ModuleSpec = { w: 60, h: 120, pcb: 'blue', pins: [{ name: 'OUT', role: 'output' }, { name: 'GND', role: 'ground' }, { name: 'VCC', role: 'power' }] };
sensorModule({
  type: 'ir-proximity', name: 'Sensor de proximidade IR', description: 'Emissor + recetor infravermelho (FC-51). Saída digital baixa quando deteta obstáculo (2–30 cm).',
  tags: ['infravermelho', 'ir', 'proximidade', 'obstáculo', 'fc-51'],
  props: [{ key: 'detected', label: 'Obstáculo detetado', type: 'boolean', default: false }],
  datasheet: { summary: 'Distância de deteção ajustável no potenciómetro. Saída ativa baixa.' },
  sim: sim('digital-sensor'),
}, ir, ({ bx, by, w }) => (
  <g>
    <LeadPath d={`M${bx + w / 2 - 8} ${by + 22} V${by + 6}`} /><LeadPath d={`M${bx + w / 2 + 8} ${by + 22} V${by + 6}`} />
    {/* IR emitter (clear dome) and photodiode (black, flat) */}
    <rect x={bx + w / 2 - 14} y={by - 14} width={12} height={18} rx={6} fill="url(#g-dome-white)" stroke="#9aa" strokeWidth={0.4} opacity={0.95} />
    <rect x={bx + w / 2 - 12} y={by - 12} width={3} height={8} rx={1.5} fill="#fff" opacity={0.4} />
    <rect x={bx + w / 2 + 2} y={by - 14} width={12} height={18} rx={6} fill="url(#g-black-flat)" stroke="#000" strokeWidth={0.4} />
    <rect x={bx + w / 2 + 4} y={by - 12} width={3} height={8} rx={1.5} fill="#fff" opacity={0.12} />
    <Trimmer x={bx + w / 2} y={by + 40} /><Lm393 x={bx + w / 2} y={by + 62} />
    <SmdLed x={bx + 14} y={by + 80} color="#ff3b30" on /><SmdLed x={bx + w - 14} y={by + 80} color="#33dd55" />
  </g>
));
