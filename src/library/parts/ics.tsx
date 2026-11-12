import { registerComponent } from '../registry';
import { DipBody, To220Body, dipBBox, dipPins, to220BBox, to220Pins, type PinSpecInput } from '../render/packages';
import { num, sim } from './common';
import type { CategoryId, ComponentDef } from '../types';

interface DipSpec {
  type: string; name: string; label: string; sub?: string; description: string; pins: PinSpecInput[];
  tags: string[]; subcategory: string; summary?: string; specs?: Record<string, string>; model: string; category?: CategoryId;
  props?: ComponentDef['props']; prefix?: string; color?: string;
}

export function registerDip(s: DipSpec) {
  const n = s.pins.length;
  registerComponent({
    type: s.type, name: s.name, category: s.category ?? 'ics', subcategory: s.subcategory, prefix: s.prefix ?? 'U',
    description: s.description, tags: s.tags,
    bbox: dipBBox(n), pins: dipPins(s.pins), props: s.props,
    valueLabel: () => s.label,
    render: () => <DipBody n={n} label={s.label} sub={s.sub} color={s.color} />,
    datasheet: { summary: s.summary, specs: { Encapsulamento: `DIP-${n}`, ...(s.specs ?? {}) }, notes: ['Pino 1 junto ao entalhe/ponto; numeração no sentido anti-horário visto de cima.'] },
    sim: sim(s.model),
  });
}

// ── Timers & op-amps ──
registerDip({
  type: 'ne555', name: 'NE555 Temporizador', label: 'NE555', sub: 'TIMER', subcategory: 'Temporizadores', model: 'ne555',
  description: 'Temporizador clássico: modos astável (oscilador) e monoestável (temporizador).',
  tags: ['555', 'timer', 'temporizador', 'oscilador', 'astável'],
  pins: [{ name: 'GND', role: 'ground' }, { name: 'TRIG', description: 'Disparo: < ⅓ Vcc inicia o ciclo' }, { name: 'OUT', role: 'output' }, { name: 'RESET', description: 'Ativo baixo — ligar a Vcc se não usado' },
    { name: 'CTRL', description: 'Tensão de controlo (⅔ Vcc); desacoplar com 10 nF' }, { name: 'THR', description: 'Limiar: > ⅔ Vcc termina o ciclo' }, { name: 'DIS', description: 'Descarga (coletor aberto)' }, { name: 'VCC', role: 'power' }],
  summary: 'Astável: f = 1,44 / ((R1 + 2·R2)·C). Monoestável: t = 1,1·R·C. Vcc 4,5–16 V.',
  specs: { Vcc: '4,5 – 16 V', 'I saída': '200 mA' },
});
registerDip({
  type: 'lm358', name: 'LM358 Amp-op duplo', label: 'LM358', sub: 'DUAL OP-AMP', subcategory: 'Amplificadores operacionais', model: 'opamp',
  description: 'Dois amplificadores operacionais, alimentação simples (3–32 V).',
  tags: ['lm358', 'amp op', 'opamp', 'comparador'],
  pins: [{ name: '1OUT', role: 'output' }, '1IN−', '1IN+', { name: 'GND', role: 'ground' }, '2IN+', '2IN−', { name: '2OUT', role: 'output' }, { name: 'VCC', role: 'power' }],
  summary: 'Entradas incluem GND no modo comum. Saída não chega a Vcc (≈Vcc − 1,5 V).',
});
registerDip({
  type: 'lm324', name: 'LM324 Amp-op quádruplo', label: 'LM324', sub: 'QUAD OP-AMP', subcategory: 'Amplificadores operacionais', model: 'opamp',
  description: 'Quatro amplificadores operacionais, alimentação simples.',
  tags: ['lm324', 'amp op', 'opamp'],
  pins: [{ name: '1OUT', role: 'output' }, '1IN−', '1IN+', { name: 'VCC', role: 'power' }, '2IN+', '2IN−', { name: '2OUT', role: 'output' }, { name: '3OUT', role: 'output' }, '3IN−', '3IN+', { name: 'GND', role: 'ground' }, '4IN+', '4IN−', { name: '4OUT', role: 'output' }],
});
registerDip({
  type: 'lm741', name: 'LM741 Amp-op', label: 'LM741', sub: 'OP-AMP', subcategory: 'Amplificadores operacionais', model: 'opamp',
  description: 'Amplificador operacional clássico, alimentação simétrica (±5 a ±18 V).',
  tags: ['741', 'ua741', 'amp op', 'opamp'],
  pins: ['OFFSET N1', 'IN−', 'IN+', { name: 'V−', role: 'power' }, 'OFFSET N2', { name: 'OUT', role: 'output' }, { name: 'V+', role: 'power' }, { name: 'NC', role: 'nc' }],
  summary: 'Ganho não-inversor: 1 + Rf/Rg. Inversor: −Rf/Rin.',
});

// ── TTL logic ──
const gate14 = (g: string): PinSpecInput[] => ['1A', '1B', '1Y', '2A', '2B', '2Y', 'GND', '3Y', '3A', '3B', '4Y', '4A', '4B', 'VCC'].map((n) => ({ name: n, description: g, role: n === 'GND' ? 'ground' : n === 'VCC' ? 'power' : n.endsWith('Y') ? 'output' : 'input' }));
registerDip({ type: '7400', name: '74HC00 — 4× NAND', label: '74HC00', sub: 'NAND', subcategory: 'Lógica digital', model: 'logic-nand', description: 'Quatro portas NAND de 2 entradas.', tags: ['7400', 'nand', 'ttl', 'lógica'], pins: gate14('NAND: Y = ¬(A·B)'), summary: 'Y = ¬(A·B). Vcc 2–6 V (HC) / 5 V (LS).' });
registerDip({ type: '7408', name: '74HC08 — 4× AND', label: '74HC08', sub: 'AND', subcategory: 'Lógica digital', model: 'logic-and', description: 'Quatro portas AND de 2 entradas.', tags: ['7408', 'and', 'ttl', 'lógica'], pins: gate14('AND: Y = A·B'), summary: 'Y = A·B' });
registerDip({ type: '7432', name: '74HC32 — 4× OR', label: '74HC32', sub: 'OR', subcategory: 'Lógica digital', model: 'logic-or', description: 'Quatro portas OR de 2 entradas.', tags: ['7432', 'or', 'ttl', 'lógica'], pins: gate14('OR: Y = A+B'), summary: 'Y = A + B' });
registerDip({
  type: '7404', name: '74HC04 — 6× NOT', label: '74HC04', sub: 'HEX INV', subcategory: 'Lógica digital', model: 'logic-not', description: 'Seis inversores.', tags: ['7404', 'not', 'inversor', 'lógica'],
  pins: ['1A', { name: '1Y', role: 'output' }, '2A', { name: '2Y', role: 'output' }, '3A', { name: '3Y', role: 'output' }, { name: 'GND', role: 'ground' }, { name: '4Y', role: 'output' }, '4A', { name: '5Y', role: 'output' }, '5A', { name: '6Y', role: 'output' }, '6A', { name: 'VCC', role: 'power' }], summary: 'Y = ¬A',
});
registerDip({
  type: '7474', name: '74HC74 — 2× Flip-flop D', label: '74HC74', sub: 'DUAL D-FF', subcategory: 'Lógica digital', model: 'logic-dff', description: 'Dois flip-flops tipo D com preset e clear.', tags: ['7474', 'flip flop', 'd', 'lógica'],
  pins: ['1CLR̅', '1D', '1CLK', '1PRE̅', { name: '1Q', role: 'output' }, { name: '1Q̅', role: 'output' }, { name: 'GND', role: 'ground' }, { name: '2Q̅', role: 'output' }, { name: '2Q', role: 'output' }, '2PRE̅', '2CLK', '2D', '2CLR̅', { name: 'VCC', role: 'power' }],
  summary: 'Q copia D no flanco ascendente de CLK.',
});

// ── CMOS counters ──
registerDip({
  type: 'cd4017', name: 'CD4017 Contador década', label: 'CD4017', sub: 'DECADE CNT', subcategory: 'Lógica digital', model: 'cd4017', description: 'Contador Johnson de 10 saídas descodificadas (efeito "sequencial").', tags: ['4017', 'contador', 'década', 'sequencial'],
  pins: [{ name: 'Q5', role: 'output' }, { name: 'Q1', role: 'output' }, { name: 'Q0', role: 'output' }, { name: 'Q2', role: 'output' }, { name: 'Q6', role: 'output' }, { name: 'Q7', role: 'output' }, { name: 'Q3', role: 'output' }, { name: 'VSS', role: 'ground' }, { name: 'Q8', role: 'output' }, { name: 'Q4', role: 'output' }, { name: 'Q9', role: 'output' }, { name: 'CO', role: 'output' }, 'CE̅', 'CLK', 'MR', { name: 'VDD', role: 'power' }],
  summary: 'Cada flanco ascendente de CLK avança a saída ativa (Q0→Q9). MR = reset.', specs: { VDD: '3 – 15 V' },
});
registerDip({
  type: 'cd4060', name: 'CD4060 Contador + oscilador', label: 'CD4060', sub: '14-STAGE', subcategory: 'Lógica digital', model: 'cd4060', description: 'Contador binário de 14 estágios com oscilador interno.', tags: ['4060', 'contador', 'oscilador', 'divisor'],
  pins: [{ name: 'Q12', role: 'output' }, { name: 'Q13', role: 'output' }, { name: 'Q14', role: 'output' }, { name: 'Q6', role: 'output' }, { name: 'Q5', role: 'output' }, { name: 'Q7', role: 'output' }, { name: 'Q4', role: 'output' }, { name: 'VSS', role: 'ground' }, { name: 'φO', role: 'output' }, { name: 'φO̅', role: 'output' }, 'φI', 'MR', { name: 'Q9', role: 'output' }, { name: 'Q8', role: 'output' }, { name: 'Q10', role: 'output' }, { name: 'VDD', role: 'power' }],
  summary: 'Oscilador RC: f ≈ 1/(2,3·Rt·Ct). Qn = f / 2ⁿ.',
});

// ── Data converters ──
registerDip({
  type: 'adc0804', name: 'ADC0804 Conversor A/D 8 bits', label: 'ADC0804', sub: '8-BIT ADC', subcategory: 'Conversores', model: 'adc', description: 'Conversor analógico-digital de aproximações sucessivas, 8 bits.', tags: ['adc', 'adc0804', 'conversor'],
  pins: ['CS̅', 'RD̅', 'WR̅', 'CLK IN', { name: 'INTR̅', role: 'output' }, { name: 'VIN+', role: 'analog' }, { name: 'VIN−', role: 'analog' }, { name: 'AGND', role: 'ground' }, 'VREF/2', { name: 'DGND', role: 'ground' }, ...[7, 6, 5, 4, 3, 2, 1, 0].map((b) => ({ name: `DB${b}`, role: 'output' as const })), 'CLK R', { name: 'VCC', role: 'power' }],
  summary: 'Resultado = 255·(Vin/Vref). Tempo de conversão ≈ 100 µs.',
});
registerDip({
  type: 'dac0808', name: 'DAC0808 Conversor D/A 8 bits', label: 'DAC0808', sub: '8-BIT DAC', subcategory: 'Conversores', model: 'dac', description: 'Conversor digital-analógico de 8 bits com saída em corrente.', tags: ['dac', 'dac0808', 'conversor'],
  pins: [{ name: 'NC', role: 'nc' }, { name: 'GND', role: 'ground' }, { name: 'VEE', role: 'power' }, { name: 'IOUT', role: 'output' }, ...[1, 2, 3, 4, 5, 6, 7, 8].map((b) => `A${b}`), { name: 'VCC', role: 'power' }, 'VREF+', 'VREF−', 'COMP'],
});

// ── Motor drivers ──
registerDip({
  type: 'l293d', name: 'L293D Driver de motores', label: 'L293D', sub: 'H-BRIDGE', subcategory: 'Drivers de motores', model: 'hbridge', description: 'Ponte H dupla (600 mA/canal) com díodos de proteção — controla 2 motores DC ou 1 motor de passo.', tags: ['l293d', 'ponte h', 'motor', 'driver'],
  pins: ['EN1,2', '1A', { name: '1Y', role: 'output' }, { name: 'GND', role: 'ground' }, { name: 'GND', role: 'ground' }, { name: '2Y', role: 'output' }, '2A', { name: 'VCC2 (motor)', role: 'power' }, 'EN3,4', '3A', { name: '3Y', role: 'output' }, { name: 'GND', role: 'ground' }, { name: 'GND', role: 'ground' }, { name: '4Y', role: 'output' }, '4A', { name: 'VCC1 (lógica)', role: 'power' }],
  summary: 'VCC1 = 5 V lógica; VCC2 = tensão dos motores (4,5–36 V).',
});
registerDip({
  type: 'uln2003', name: 'ULN2003 Array Darlington', label: 'ULN2003A', sub: 'DARLINGTON', subcategory: 'Drivers de motores', model: 'darlington', description: '7 transístores Darlington com díodos — relés, motores de passo unipolares, LEDs.', tags: ['uln2003', 'darlington', 'driver', 'passo'],
  pins: [...[1, 2, 3, 4, 5, 6, 7].map((i) => `IN${i}`), { name: 'GND', role: 'ground' }, 'COM', ...[7, 6, 5, 4, 3, 2, 1].map((i) => ({ name: `OUT${i}`, role: 'output' as const }))],
});

// ── Linear regulators (TO-220) ──
const regulator = (type: string, label: string, name: string, pins: [string, string, string], ids: [string, string, string], description: string, summary: string, vout?: number) => registerComponent({
  type, name, category: 'ics', subcategory: 'Reguladores de tensão', prefix: 'U', description,
  tags: ['regulador', label.toLowerCase(), 'fonte', 'tensão'],
  bbox: to220BBox,
  pins: to220Pins(pins.map((n, i) => ({ name: n, role: ids[i] === 'GND' ? 'ground' : ids[i] === 'IN' ? 'power' : ids[i] === 'OUT' ? 'output' : 'input' })) as never).map((p, i) => ({ ...p, id: ids[i] })),
  props: vout === undefined ? [num('vout', 'Tensão de saída (calc.)', 5, 'V', { hint: 'Vout = 1,25·(1 + R2/R1)' })] : undefined,
  valueLabel: () => (vout !== undefined ? `${vout} V` : label),
  render: () => <To220Body label={label} sub={vout !== undefined ? `+${vout}V` : 'ADJ'} />,
  datasheet: { summary, specs: { 'Dropout': '≈ 2 V', 'I máx.': '1,5 A (com dissipador)' }, notes: ['Condensadores recomendados: 0,33 µF na entrada, 0,1 µF na saída.'] },
  sim: sim('regulator'),
});
regulator('lm7805', 'L7805', 'Regulador 7805 (+5 V)', ['Entrada (IN)', 'Massa (GND)', 'Saída (OUT)'], ['IN', 'GND', 'OUT'], 'Regulador linear fixo de +5 V.', 'Vin ≥ 7 V. P dissipada = (Vin − 5)·I.', 5);
regulator('lm7812', 'L7812', 'Regulador 7812 (+12 V)', ['Entrada (IN)', 'Massa (GND)', 'Saída (OUT)'], ['IN', 'GND', 'OUT'], 'Regulador linear fixo de +12 V.', 'Vin ≥ 14,5 V.', 12);
regulator('lm317', 'LM317', 'Regulador LM317 (ajustável)', ['Ajuste (ADJ)', 'Saída (OUT)', 'Entrada (IN)'], ['ADJ', 'OUT', 'IN'], 'Regulador linear ajustável 1,25–37 V.', 'Vout = 1,25 V·(1 + R2/R1) + Iadj·R2. Tipicamente R1 = 240 Ω.');
