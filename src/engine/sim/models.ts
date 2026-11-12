/**
 * Electrical models: how each component type becomes solver elements.
 * Every model declares an honest status:
 *   implemented — DC behaviour modelled;
 *   partial     — modelled with stated simplifications (see note);
 *   none        — not simulated in DC: treated as an open circuit and reported to the user.
 */
import type { PropValue } from '@/domain/types';
import type { Element, ModeRule, Owner } from './types';

export interface ModelCtx {
  node(pinId: string): number;          // node of a component pin (allocated on demand)
  pinByName(name: string): string | undefined;
  internal(): number;                   // fresh internal node
  add(e: Element): number;              // returns element index
  own(...pins: (string | null)[]): Owner;
  props: Record<string, PropValue>;
}

export interface Model {
  status: 'implemented' | 'partial' | 'none';
  note?: string;
  build?: (c: ModelCtx) => void;
}

const num = (v: PropValue | undefined, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);
const VT = 0.025852;

/** Resistor between two pins. */
const R = (c: ModelCtx, a: string, b: string, r: number) => c.add({ k: 'R', a: c.node(a), b: c.node(b), r, own: c.own(a, b) });

/** Diode with series resistance (anode pin → cathode pin). */
function diode(c: ModelCtx, a: string, k: string, p: { is: number; n: number; rs: number; bv?: number; ibv?: number }) {
  const mid = c.internal();
  c.add({ k: 'D', a: c.node(a), c: mid, is: p.is, n: p.n, bv: p.bv, ibv: p.ibv, own: c.own(a, null) });
  c.add({ k: 'R', a: mid, b: c.node(k), r: p.rs, own: c.own(null, k) });
}

/** Saturation current giving forward voltage vf at current i. */
const isFor = (vf: number, i: number, n: number) => i / Math.exp(vf / (n * VT));

export const LED_VF: Record<string, number> = { red: 2.0, orange: 2.0, yellow: 2.1, green: 2.2, blue: 3.1, white: 3.1 };

function led(c: ModelCtx, a: string, k: string, color: string) {
  const vf = LED_VF[color] ?? 2.0;
  diode(c, a, k, { is: isFor(vf - 0.1, 0.02, 2), n: 2, rs: 5 });
}

/** Battery / cell: EMF + internal resistance. */
function cell(c: ModelCtx, v: number, rint: number) {
  const mid = c.internal();
  c.add({ k: 'V', p: mid, n: c.node('-'), v, own: c.own(null, '-') });
  c.add({ k: 'R', a: mid, b: c.node('+'), r: Math.max(rint, 1e-3), own: c.own(null, '+') });
}

/** Voltage output referenced to a pin, with discrete modes and output resistance. */
function vout(c: ModelCtx, out: string, ref: string, modes: { terms: [number, number][]; c: number }[], rule: ModeRule, rout = 1, from?: string) {
  const mid = rout > 1 ? c.internal() : c.node(out);
  const fromNode = from ? c.node(from) : undefined;
  c.add({ k: 'VCVS', p: mid, n: c.node(ref), from: fromNode, modes, mode: 0, rule, own: c.own(rout > 1 ? null : out, from ?? ref) });
  if (rout > 1) c.add({ k: 'R', a: mid, b: c.node(out), r: rout - 1, own: c.own(null, out) });
}

const powered = (c: ModelCtx, vcc: string, gnd: string, min: number): ModeRule => ({ kind: 'powered', vcc: c.node(vcc), gnd: c.node(gnd), min });

/** Op-amp channel. */
function opamp(c: ModelCtx, out: string, inp: string, inn: string, vpos: string, vneg: string, hiDrop: number, loRise: number) {
  const P = c.node(vpos), Nn = c.node(vneg), A = 1e5;
  vout(c, out, vneg, [
    { terms: [[c.node(inp), A], [c.node(inn), -A]], c: 0 },
    { terms: [[P, 1], [Nn, -1]], c: -hiDrop },
    { terms: [], c: loRise },
  ], { kind: 'opamp', out: c.node(out), hi: [P, -hiDrop], lo: [Nn, loRise] }, 10);
}

function gate(c: ModelCtx, fn: 'nand' | 'and' | 'or' | 'not', y: string, inputs: string[]) {
  const V = c.node('14'), G = c.node('7');
  vout(c, y, '7', [{ terms: [], c: 0 }, { terms: [[V, 1], [G, -1]], c: 0 }], { kind: 'logic', fn, inputs: inputs.map((p) => c.node(p)), vcc: V, gnd: G }, 40);
}

function bjt(c: ModelCtx, pnp: boolean) {
  c.add({ k: 'BJT', c: c.node('C'), b: c.node('B'), e: c.node('E'), pnp, is: 1e-14, bf: num(c.props.hfe, pnp ? 120 : 150), br: 2, own: c.own('C', 'B', 'E') });
}

const MOS_PARAMS: Record<string, { vth: number; kp: number }> = {
  IRF540N: { vth: 3.2, kp: 0.9 }, IRLZ44N: { vth: 1.6, kp: 5 }, IRFZ44N: { vth: 3.0, kp: 1.2 }, IRF9540N: { vth: 3.2, kp: 0.6 }, IRF4905: { vth: 3.0, kp: 1.5 },
};
function mos(c: ModelCtx, p: boolean) {
  const m = MOS_PARAMS[String(c.props.model)] ?? { vth: 3, kp: 1 };
  c.add({ k: 'MOS', d: c.node('D'), g: c.node('G'), s: c.node('S'), p, vth: m.vth, kp: m.kp, lambda: 0.01, own: c.own('D', 'G', 'S') });
}

/** Regulator output: VCVS (p=out, n=ref) drawing its current from the input. */
function regulator(c: ModelCtx, inPin: string, outPin: string, refPin: string, v: number, dropout: number) {
  const IN = c.node(inPin), REF = c.node(refPin);
  c.add({
    k: 'VCVS', p: c.node(outPin), n: REF, from: IN, mode: 0,
    modes: [{ terms: [], c: v }, { terms: [[IN, 1], [REF, -1]], c: -dropout }],
    rule: { kind: 'regulator', vin: IN, dropout }, own: c.own(outPin, inPin),
  });
}

/** Board powered from USB: 5 V and 3.3 V rails available on the headers. */
function usbBoard(rails: [string, number, number][]) {
  return (c: ModelCtx) => {
    if (c.props.usbPower === false) return;
    const gnd = c.pinByName('GND')!;
    for (const [name, v, rint] of rails) {
      const pin = c.pinByName(name);
      if (!pin) continue;
      const mid = c.internal();
      c.add({ k: 'V', p: mid, n: c.node(gnd), v, own: c.own(null, gnd) });
      c.add({ k: 'R', a: mid, b: c.node(pin), r: rint, own: c.own(null, pin) });
    }
  };
}

const MCU_NOTE = 'Alimentação por USB modelada (pinos 5 V / 3,3 V como fontes). Os pinos de E/S ficam em alta impedância até haver execução de código (Fase 5).';
const TIME_NOTE = 'Componente com comportamento temporal/sequencial — requer simulação transitória (Fase 4). Tratado como circuito aberto.';
const AC_NOTE = 'Fonte/elemento de corrente alternada — requer simulação transitória (Fase 4). Tratado como circuito aberto.';

export const MODELS: Record<string, Model> = {
  // ── passive ──
  resistor: { status: 'implemented', build: (c) => R(c, '1', '2', num(c.props.resistance, 1000)) },
  potentiometer: {
    status: 'implemented',
    build: (c) => {
      const pos = Math.max(0, Math.min(1, num(c.props.position, 0.5)));
      const f = c.props.taper === 'log' ? (10 ** (2 * pos) - 1) / 99 : pos;
      const rt = num(c.props.resistance, 10e3);
      R(c, '1', '2', Math.max(0.5, rt * f));
      R(c, '2', '3', Math.max(0.5, rt * (1 - f)));
    },
  },
  'capacitor-ceramic': { status: 'partial', note: 'Em regime DC estacionário um condensador é um circuito aberto (fuga de 100 MΩ). Carga/descarga ao longo do tempo: Fase 4.', build: (c) => R(c, '1', '2', 1e8) },
  'capacitor-electrolytic': { status: 'partial', note: 'Em regime DC estacionário um condensador é um circuito aberto (fuga de 10 MΩ). Carga/descarga ao longo do tempo: Fase 4.', build: (c) => R(c, '1', '2', 1e7) },
  inductor: { status: 'partial', note: 'Em regime DC estacionário um indutor comporta-se como a sua resistência de enrolamento.', build: (c) => R(c, '1', '2', Math.max(0.01, num(c.props.rdc, 0.5))) },
  'coil-toroid': { status: 'partial', note: 'Em regime DC estacionário: resistência do enrolamento.', build: (c) => R(c, '1', '2', Math.max(0.01, num(c.props.rdc, 0.2))) },
  transformer: { status: 'none', note: 'Um transformador só funciona com corrente alternada (Fase 4). Em DC não transfere energia.' },
  ntc: {
    status: 'implemented', note: 'Modelo β: R(T) = R25·e^(β(1/T − 1/298,15)).',
    build: (c) => { const T = num(c.props.temperature, 25) + 273.15; R(c, '1', '2', num(c.props.r25, 10e3) * Math.exp(num(c.props.beta, 3950) * (1 / T - 1 / 298.15))); },
  },
  ptc: { status: 'partial', note: 'Aproximação exponencial suave (≈3 %/°C); não modela o salto abrupto acima da temperatura de comutação.', build: (c) => R(c, '1', '2', num(c.props.r25, 100) * Math.exp(0.03 * (num(c.props.temperature, 25) - 25))) },
  ldr: {
    status: 'implemented', note: 'R = R10·(lux/10)^−0,7, limitada a R no escuro.',
    build: (c) => { const lux = Math.max(0, num(c.props.lux, 300)); const r = lux <= 0 ? num(c.props.rdark, 1e6) : Math.min(num(c.props.rdark, 1e6), num(c.props.r10lux, 20e3) * (lux / 10) ** -0.7); R(c, '1', '2', r); },
  },
  fuse: {
    status: 'implemented', note: 'Abre (e fica aberto até parar a simulação) quando a corrente excede ~1,35× o valor nominal.',
    build: (c) => c.add({ k: 'SW', a: c.node('1'), b: c.node('2'), on: c.props.blown !== true, ron: 0.05, roff: 1e9, rule: { kind: 'fuse', rating: num(c.props.rating, 0.5) }, own: c.own('1', '2') }),
  },

  // ── semiconductors ──
  diode: {
    status: 'implemented',
    build: (c) => {
      const m = String(c.props.model);
      const p = m === '1N4148' ? { is: 2.5e-9, n: 1.75, rs: 0.6 } : m === '1N5408' ? { is: 1e-8, n: 1.8, rs: 0.01 } : { is: 7e-9, n: 1.8, rs: 0.04 };
      diode(c, 'A', 'K', { ...p, bv: m === '1N4148' ? 100 : m === '1N4001' ? 50 : 1000, ibv: 1e-6 });
    },
  },
  zener: { status: 'implemented', build: (c) => diode(c, 'A', 'K', { is: 1e-12, n: 1.2, rs: 2, bv: num(c.props.vz, 5.1), ibv: 5e-3 }) },
  schottky: { status: 'implemented', build: (c) => diode(c, 'A', 'K', { is: 1.5e-6, n: 1.3, rs: 0.05, bv: 40, ibv: 1e-6 }) },
  led: { status: 'implemented', note: 'Díodo com Vf da cor (a 20 mA) e resistência série de 5 Ω. Brilho proporcional à corrente.', build: (c) => led(c, 'A', 'K', String(c.props.color)) },
  'bjt-npn': { status: 'implemented', note: 'Modelo de Ebers–Moll (sem efeito Early nem capacidades).', build: (c) => bjt(c, false) },
  'bjt-pnp': { status: 'implemented', note: 'Modelo de Ebers–Moll (sem efeito Early nem capacidades).', build: (c) => bjt(c, true) },
  'mosfet-n': { status: 'implemented', note: 'Modelo quadrático (nível 1); díodo de corpo não incluído.', build: (c) => mos(c, false) },
  'mosfet-p': { status: 'implemented', note: 'Modelo quadrático (nível 1); díodo de corpo não incluído.', build: (c) => mos(c, true) },
  'jfet-n': {
    status: 'partial', note: 'Lei quadrática com Idss = 3 mA, Vp = −1,5 V; díodo de porta não incluído.',
    build: (c) => c.add({ k: 'MOS', d: c.node('D'), g: c.node('G'), s: c.node('S'), p: false, vth: -1.5, kp: (2 * 0.003) / 2.25, lambda: 0.02, own: c.own('D', 'G', 'S') }),
  },
  triac: { status: 'none', note: 'Tiristores dependem de disparo e passagem por zero — Fase 4.' },
  scr: { status: 'none', note: 'Tiristores dependem de disparo e memória de estado — Fase 4.' },
  'bridge-rectifier': {
    status: 'implemented',
    build: (c) => {
      const p = { is: 7e-9, n: 1.8, rs: 0.05 };
      diode(c, 'AC1', '+', p); diode(c, 'AC2', '+', p); diode(c, '-', 'AC1', p); diode(c, '-', 'AC2', p);
    },
  },

  // ── ICs ──
  lm358: { status: 'implemented', note: 'Macro-modelo: ganho 10⁵, saída satura a ≈VCC−1,5 V e ≈GND; entradas ideais.', build: (c) => { opamp(c, '1', '3', '2', '8', '4', 1.5, 0.02); opamp(c, '7', '5', '6', '8', '4', 1.5, 0.02); R(c, '8', '4', 7000); } },
  lm324: { status: 'implemented', note: 'Macro-modelo por canal (ganho 10⁵, saturação a VCC−1,5 V).', build: (c) => { opamp(c, '1', '3', '2', '4', '11', 1.5, 0.02); opamp(c, '7', '5', '6', '4', '11', 1.5, 0.02); opamp(c, '8', '10', '9', '4', '11', 1.5, 0.02); opamp(c, '14', '12', '13', '4', '11', 1.5, 0.02); R(c, '4', '11', 5000); } },
  lm741: { status: 'implemented', note: 'Macro-modelo: ganho 10⁵, saída a ≈2 V de cada alimentação; pinos de offset ignorados.', build: (c) => { opamp(c, '6', '3', '2', '7', '4', 2, 2); R(c, '7', '4', 9000); } },
  '7400': { status: 'implemented', note: 'Lógica estática: limiar VCC/2, saída com 40 Ω. Entradas em alta impedância.', build: (c) => { gate(c, 'nand', '3', ['1', '2']); gate(c, 'nand', '6', ['4', '5']); gate(c, 'nand', '8', ['9', '10']); gate(c, 'nand', '11', ['12', '13']); R(c, '14', '7', 1e5); } },
  '7408': { status: 'implemented', note: 'Lógica estática: limiar VCC/2, saída com 40 Ω.', build: (c) => { gate(c, 'and', '3', ['1', '2']); gate(c, 'and', '6', ['4', '5']); gate(c, 'and', '8', ['9', '10']); gate(c, 'and', '11', ['12', '13']); R(c, '14', '7', 1e5); } },
  '7432': { status: 'implemented', note: 'Lógica estática: limiar VCC/2, saída com 40 Ω.', build: (c) => { gate(c, 'or', '3', ['1', '2']); gate(c, 'or', '6', ['4', '5']); gate(c, 'or', '8', ['9', '10']); gate(c, 'or', '11', ['12', '13']); R(c, '14', '7', 1e5); } },
  '7404': { status: 'implemented', note: 'Lógica estática: limiar VCC/2, saída com 40 Ω.', build: (c) => { for (const [a, y] of [['1', '2'], ['3', '4'], ['5', '6'], ['9', '8'], ['11', '10'], ['13', '12']]) gate(c, 'not', y, [a]); R(c, '14', '7', 1e5); } },
  '7474': { status: 'none', note: TIME_NOTE },
  cd4017: { status: 'none', note: TIME_NOTE },
  cd4060: { status: 'none', note: TIME_NOTE },
  ne555: { status: 'none', note: 'O 555 é um circuito temporizado (oscilador/monoestável) — requer simulação transitória (Fase 4). Tratado como circuito aberto.' },
  adc0804: { status: 'none', note: 'Conversor com relógio e protocolo digital — Fase 5.' },
  dac0808: { status: 'none', note: 'Previsto com a lógica digital avançada (Fase 4).' },
  l293d: { status: 'none', note: 'Previsto com o controlo de motores (Fase 4/5).' },
  uln2003: {
    status: 'partial', note: 'Cada canal: interruptor OUT→GND (≈2 Ω) quando IN > 1,5 V; díodo de roda livre OUT→COM; entrada ≈2,7 kΩ.',
    build: (c) => {
      for (let i = 1; i <= 7; i++) {
        const inp = String(i), out = String(17 - i);
        R(c, inp, '8', 2700);
        c.add({ k: 'SW', a: c.node(out), b: c.node('8'), on: false, ron: 2, roff: 1e9, rule: { kind: 'threshold', ctrl: c.node(inp), ref: c.node('8'), vth: 1.5 }, own: c.own(out, '8') });
        diode(c, out, '9', { is: 7e-9, n: 1.8, rs: 0.1 });
      }
    },
  },
  lm7805: { status: 'implemented', note: 'Saída 5 V; abaixo de Vin ≈ 7 V entra em dropout (Vout = Vin − 2 V). Corrente de entrada = saída + 5 mA.', build: (c) => { regulator(c, 'IN', 'OUT', 'GND', 5, 2); R(c, 'IN', 'GND', 1400); } },
  lm7812: { status: 'implemented', note: 'Saída 12 V; dropout de 2 V.', build: (c) => { regulator(c, 'IN', 'OUT', 'GND', 12, 2); R(c, 'IN', 'GND', 2800); } },
  lm317: { status: 'implemented', note: 'Mantém 1,25 V entre OUT e ADJ (Vout = 1,25·(1 + R2/R1)); dropout de 1,5 V; Iadj desprezada.', build: (c) => regulator(c, 'IN', 'OUT', 'ADJ', 1.25, 1.5) },

  // ── power ──
  'battery-aa': { status: 'implemented', build: (c) => cell(c, num(c.props.voltage, 1.5), num(c.props.rint, 0.15)) },
  'battery-9v': { status: 'implemented', build: (c) => cell(c, num(c.props.voltage, 9), num(c.props.rint, 1.5)) },
  'battery-li-ion': { status: 'implemented', build: (c) => cell(c, num(c.props.voltage, 3.7), num(c.props.rint, 0.05)) },
  'coin-cell': { status: 'implemented', build: (c) => cell(c, num(c.props.voltage, 3), num(c.props.rint, 15)) },
  'dc-supply': {
    status: 'implemented', note: 'Modos CV (tensão constante) e CC (corrente limitada).',
    build: (c) => c.add({ k: 'SUPPLY', p: c.node('+'), n: c.node('-'), v: num(c.props.voltage, 5), ilim: Math.max(1e-6, num(c.props.ilimit, 1)), cc: false, own: c.own('+', '-') }),
  },
  'variable-source': { status: 'implemented', note: 'Fonte de tensão ideal.', build: (c) => c.add({ k: 'V', p: c.node('+'), n: c.node('-'), v: num(c.props.voltage, 3.3), own: c.own('+', '-') }) },
  'current-source': { status: 'implemented', note: 'Fonte de corrente ideal.', build: (c) => c.add({ k: 'I', p: c.node('+'), n: c.node('-'), i: num(c.props.current, 0.01), own: c.own('+', '-') }) },
  'ac-source': { status: 'none', note: AC_NOTE },
  'signal-generator': { status: 'none', note: AC_NOTE },
  'solar-panel': {
    status: 'implemented', note: 'Fonte de corrente proporcional à irradiância em paralelo com um díodo (Voc a 1000 W/m²).',
    build: (c) => {
      const isc = num(c.props.isc, 0.2) * Math.max(0, num(c.props.irradiance, 1000)) / 1000, is = 1e-9;
      const n = num(c.props.voc, 6) / (VT * Math.log(num(c.props.isc, 0.2) / is + 1));
      c.add({ k: 'I', p: c.node('+'), n: c.node('-'), i: isc, own: c.own('+', '-') });
      c.add({ k: 'D', a: c.node('+'), c: c.node('-'), is, n, own: c.own('+', '-') });
    },
  },

  // ── sensors ──
  lm35: {
    status: 'implemented', note: 'Vout = 10 mV/°C quando alimentado (≥ 4 V).',
    build: (c) => { vout(c, 'OUT', 'GND', [{ terms: [], c: 0.01 * num(c.props.temperature, 25) }, { terms: [], c: 0 }], powered(c, 'VS', 'GND', 4), 2); R(c, 'VS', 'GND', 80e3); },
  },
  dht11: { status: 'partial', note: 'Apenas o consumo (≈1 mA). O protocolo digital requer MCU (Fase 5).', build: (c) => R(c, 'VCC', 'GND', 5000) },
  dht22: { status: 'partial', note: 'Apenas o consumo (≈1 mA). O protocolo digital requer MCU (Fase 5).', build: (c) => R(c, 'VCC', 'GND', 5000) },
  'hc-sr04': { status: 'partial', note: 'Apenas o consumo (15 mA). A medição por impulsos requer MCU (Fase 5).', build: (c) => R(c, 'VCC', 'GND', 333) },
  pir: {
    status: 'implemented', note: 'Saída 3,3 V quando há movimento (propriedade), 0 V caso contrário; requer VCC ≥ 4,5 V.',
    build: (c) => { vout(c, 'OUT', 'GND', [{ terms: [], c: c.props.motion ? 3.3 : 0 }, { terms: [], c: 0 }], powered(c, 'VCC', 'GND', 4.5), 100); R(c, 'VCC', 'GND', 70e3); },
  },
  'ir-proximity': {
    status: 'implemented', note: 'Saída ativa baixa: 0 V com obstáculo, VCC sem obstáculo. Consumo ≈ 20 mA.',
    build: (c) => { const V = c.node('VCC'), G = c.node('GND'); vout(c, 'OUT', 'GND', [{ terms: c.props.detected ? [] : [[V, 1], [G, -1]], c: 0 }, { terms: [], c: 0 }], powered(c, 'VCC', 'GND', 3), 100); R(c, 'VCC', 'GND', 220); },
  },
  'soil-moisture': {
    status: 'partial', note: 'Curva típica: ≈0,56·VCC seco → ≈0,24·VCC em água. Calibração real varia com o solo.',
    build: (c) => { const V = c.node('VCC'), G = c.node('GND'); const k = 0.56 - 0.32 * num(c.props.moisture, 40) / 100; vout(c, 'AOUT', 'GND', [{ terms: [[V, k], [G, -k]], c: 0 }, { terms: [], c: 0 }], powered(c, 'VCC', 'GND', 3), 1000); R(c, 'VCC', 'GND', 1000); },
  },
  mq2: {
    status: 'partial', note: 'AO cresce com √(ppm); DO ativo baixo acima de metade da escala; aquecedor ≈150 mA. Curva real depende do gás e da calibração.',
    build: (c) => {
      const V = c.node('VCC'), G = c.node('GND');
      const k = Math.min(0.95, 0.1 + 0.85 * Math.sqrt(Math.max(0, num(c.props.ppm, 200)) / 10000));
      vout(c, 'AO', 'GND', [{ terms: [[V, k], [G, -k]], c: 0 }, { terms: [], c: 0 }], powered(c, 'VCC', 'GND', 4), 1000);
      vout(c, 'DO', 'GND', [{ terms: k > 0.5 ? [] : [[V, 1], [G, -1]], c: 0 }, { terms: [], c: 0 }], powered(c, 'VCC', 'GND', 4), 100);
      R(c, 'VCC', 'GND', 33);
    },
  },
  'light-sensor': {
    status: 'implemented', note: 'AO = VCC·R_LDR/(R_LDR + 10 kΩ) (mais luz → menor tensão); DO alto no escuro.',
    build: (c) => {
      const V = c.node('VCC'), G = c.node('GND');
      const lux = Math.max(0.01, num(c.props.lux, 300));
      const rl = Math.min(1e6, 20e3 * (lux / 10) ** -0.7), k = rl / (rl + 10e3);
      vout(c, 'AO', 'GND', [{ terms: [[V, k], [G, -k]], c: 0 }, { terms: [], c: 0 }], powered(c, 'VCC', 'GND', 3), 1000);
      vout(c, 'DO', 'GND', [{ terms: k > 0.5 ? [[V, 1], [G, -1]] : [], c: 0 }, { terms: [], c: 0 }], powered(c, 'VCC', 'GND', 3), 100);
      R(c, 'VCC', 'GND', 1600);
    },
  },
  'rain-sensor': { status: 'partial', note: 'Resistência entre pistas: 10 MΩ seco → 1 kΩ totalmente molhado (escala logarítmica).', build: (c) => R(c, '1', '2', 10 ** (7 - 4 * num(c.props.wetness, 0) / 100)) },
  acs712: {
    status: 'implemented', note: 'Vout = VCC/2 + sensibilidade·I (185 mV/A @5 A, 100 mV/A @20 A, 66 mV/A @30 A). Shunt de 1,2 mΩ entre IP+ e IP−.',
    build: (c) => {
      const range = num(c.props.range, 5);
      const gain = range <= 5 ? 0.185 : range <= 20 ? 0.1 : 0.066;
      const mid = c.internal();
      const ctrl = c.add({ k: 'V', p: c.node('T1'), n: mid, v: 0, own: c.own('T1', null) });
      c.add({ k: 'R', a: mid, b: c.node('T2'), r: 0.0012, own: c.own(null, 'T2') });
      const V = c.node('VCC'), G = c.node('GND');
      c.add({ k: 'CCVS', p: c.node('OUT'), n: G, ctrl, gain, terms: [[V, 0.5], [G, -0.5]], c: 0, own: c.own('OUT', 'GND') });
      R(c, 'VCC', 'GND', 500);
    },
  },
  'voltage-sensor': {
    status: 'implemented', note: 'Divisor real de 30 kΩ / 7,5 kΩ: S = Vin/5.',
    build: (c) => { R(c, 'T1', 'S', 30e3); R(c, 'S', 'T2', 7500); R(c, 'T2', 'MINUS', 0.01); },
  },
  'rotary-encoder': { status: 'none', note: 'Sinais de quadratura — requerem MCU (Fase 5).' },

  // ── actuators ──
  'dc-motor': {
    status: 'partial', note: 'Modelo em vazio: carga resistiva Vnom/I_vazio. A força contra-eletromotriz dinâmica chega na Fase 4.',
    build: (c) => R(c, '1', '2', num(c.props.vnom, 6) / Math.max(1e-3, num(c.props.inoload, 0.15))),
  },
  servo: { status: 'partial', note: 'Apenas o consumo em repouso (≈10 mA). O controlo PWM requer MCU (Fase 5).', build: (c) => R(c, 'VCC', 'GND', 500) },
  'stepper-28byj': { status: 'partial', note: 'Enrolamentos como resistências de 50 Ω (COM → IN1..IN4). A rotação passo-a-passo requer MCU.', build: (c) => { for (const p of ['IN1', 'IN2', 'IN3', 'IN4']) R(c, 'COM', p, 50); } },
  'stepper-nema17': { status: 'partial', note: 'Enrolamentos como resistências de 2 Ω.', build: (c) => { R(c, 'A+', 'A-', 2); R(c, 'B+', 'B-', 2); } },
  'relay-module': {
    status: 'implemented', note: 'Bobina ≈70 Ω (5 V); contactos NA/NF comutam conforme IN (limiar 2 V).',
    build: (c) => {
      const vcc = c.node('VCC'), gnd = c.node('GND'), ctrl = c.node('IN');
      const activeHigh = c.props.trigger !== 'low';
      const rule = (no: boolean) => ({ kind: 'relay' as const, vcc, gnd, ctrl, activeHigh, normallyOpen: no });
      R(c, 'IN', activeHigh ? 'GND' : 'VCC', 10e3);
      c.add({ k: 'SW', a: vcc, b: gnd, on: false, ron: 70, roff: 1e6, rule: rule(true), own: c.own('VCC', 'GND') });
      c.add({ k: 'SW', a: c.node('COM'), b: c.node('NO'), on: false, ron: 0.02, roff: 1e10, rule: rule(true), own: c.own('COM', 'NO') });
      c.add({ k: 'SW', a: c.node('COM'), b: c.node('NC'), on: true, ron: 0.02, roff: 1e10, rule: rule(false), own: c.own('COM', 'NC') });
    },
  },
  buzzer: {
    status: 'partial', note: 'Ativo: díodo + 160 Ω (≈30 mA a 5 V, só toca com a polaridade certa). Passivo: bobina de 16 Ω (precisa de sinal alternado).',
    build: (c) => (c.props.kind === 'passive' ? R(c, '+', '-', 16) : diode(c, '+', '-', { is: 1e-12, n: 1.5, rs: 160 })),
  },
  speaker: { status: 'partial', note: 'Em DC: resistência da bobina (≈0,85·Z). Som requer sinal AC (Fase 4).', build: (c) => R(c, '1', '2', 0.85 * num(c.props.impedance, 8)) },
  fan: { status: 'partial', note: 'Carga Vnom/Inom com díodo (ventoinhas sem escovas não funcionam com polaridade invertida).', build: (c) => diode(c, '+', '-', { is: 1e-9, n: 1.5, rs: num(c.props.vnom, 12) / Math.max(1e-3, num(c.props.inom, 0.1)) }) },
  solenoid: { status: 'implemented', note: 'Em DC: resistência da bobina. Atua acima de 60 % da corrente nominal.', build: (c) => R(c, '1', '2', Math.max(0.1, num(c.props.rcoil, 30))) },
  lamp: { status: 'partial', note: 'Resistência a quente constante (V²/P). A resistência a frio (~10× menor) não é modelada.', build: (c) => R(c, '1', '2', num(c.props.vnom, 6) ** 2 / Math.max(1e-3, num(c.props.pnom, 0.5))) },
  'seven-segment': {
    status: 'implemented', note: '8 LEDs (a–g, dp) com comum ligado internamente.',
    build: (c) => {
      const color = c.props.color === 'green' ? 'green' : c.props.color === 'blue' ? 'blue' : 'red';
      for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp']) c.props.common === 'anode' ? led(c, 'COM1', s, color) : led(c, s, 'COM1', color);
    },
  },

  // ── instruments ──
  multimeter: {
    status: 'implemented', note: 'V: 10 MΩ em paralelo. A: shunt 0,5 Ω (VΩmA) / 10 mΩ (10A). Ω/continuidade/díodo: fonte de teste de 1 mA (3 V em aberto).',
    build: (c) => {
      const mode = String(c.props.mode ?? 'dcv');
      if (mode === 'dcv' || mode === 'acv') R(c, 'VOHM', 'COM', 10e6);
      else if (mode === 'dca') { R(c, 'VOHM', 'COM', 0.5); R(c, 'A10', 'COM', 0.01); }
      else {
        c.add({ k: 'I', p: c.node('VOHM'), n: c.node('COM'), i: 1e-3, own: c.own('VOHM', 'COM') });
        R(c, 'VOHM', 'COM', 3000);
      }
    },
  },
  voltmeter: { status: 'implemented', note: 'Resistência interna 10 MΩ.', build: (c) => R(c, '+', '-', 10e6) },
  ammeter: { status: 'implemented', note: 'Shunt de 10 mΩ.', build: (c) => R(c, '+', '-', 0.01) },
  wattmeter: { status: 'implemented', note: 'Shunt 10 mΩ (I+→I−) e 10 MΩ (V+–V−).', build: (c) => { R(c, 'I+', 'I-', 0.01); R(c, 'V+', 'V-', 10e6); } },

  // ── MCU boards (power rails only) ──
  'arduino-uno': { status: 'partial', note: MCU_NOTE, build: usbBoard([['5V', 5, 0.3], ['3.3V', 3.3, 1]]) },
  'arduino-mega': { status: 'partial', note: MCU_NOTE, build: usbBoard([['5V', 5, 0.3], ['3.3V', 3.3, 1]]) },
  'arduino-nano': { status: 'partial', note: MCU_NOTE, build: usbBoard([['5V', 5, 0.3], ['3V3', 3.3, 1]]) },
  'esp32-devkit': { status: 'partial', note: MCU_NOTE, build: usbBoard([['VIN', 4.7, 0.5], ['3V3', 3.3, 0.5]]) },
  'esp8266-nodemcu': { status: 'partial', note: MCU_NOTE, build: usbBoard([['VIN', 4.7, 0.5], ['3V3', 3.3, 0.5]]) },
  'rpi-pico': { status: 'partial', note: MCU_NOTE, build: usbBoard([['VBUS', 5, 0.3], ['3V3', 3.3, 0.5]]) },
  atmega328p: { status: 'none', note: 'Execução de código: Fase 5.' },
  pic16f877a: { status: 'none', note: 'Sem emulador PIC disponível nesta fase.' },
  pic16f628a: { status: 'none', note: 'Sem emulador PIC disponível nesta fase.' },
};

/** Components that only provide connectivity (handled by the netlist). */
export const INTERCONNECT = new Set([
  'breadboard-half', 'breadboard-full', 'perfboard', 'stripboard', 'screw-terminal-2', 'screw-terminal-3', 'header-male-4', 'header-female-4',
  'push-button', 'slide-switch', 'toggle-switch', 'dip-switch-4',
]);

export function modelStatus(type: string): Model {
  if (INTERCONNECT.has(type)) return { status: 'implemented', note: 'Conectividade (ligações internas e estado do interruptor) aplicada ao netlist.' };
  return MODELS[type] ?? { status: 'none', note: 'Sem modelo elétrico nesta fase.' };
}
