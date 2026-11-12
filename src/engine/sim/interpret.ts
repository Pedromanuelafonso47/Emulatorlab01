/**
 * Turns raw solver output into what the UI shows: per-pin voltage/current, power, component visual
 * states (LED brightness, relay state…) and quantitative warnings with real numbers.
 */
import type { CircuitDocument } from '@/domain/types';
import { formatSI } from '@/domain/units';
import { getDef, getPins } from '@/library/registry';
import type { VisualState } from '@/library/types';
import { pinKey, type Netlist } from '@/engine/netlist';
import type { Issue } from '@/engine/erc';
import type { Compiled } from './compile';
import type { SimResult } from './types';

export interface PinValue { v: number | null; i: number | null }
export interface CompValues { pins: Record<string, PinValue>; power: number | null; simulated: boolean }

export interface Interpretation {
  netVoltage: Map<string, number | null>;   // null = floating / not part of the solved circuit
  comps: Record<string, CompValues>;
  states: Record<string, VisualState>;
  issues: Issue[];
  blown: string[];
  summary: { nodes: number; iterations: number; ground: string | null };
}

const V = (x: number) => formatSI(x, 'V');
const A = (x: number) => formatSI(x, 'A');
const W = (x: number) => formatSI(x, 'W');
/** 4-digit auto-ranging display like a real DMM. */
export function meterFmt(x: number, base: string): { display: string; unit: string } {
  const a = Math.abs(x);
  const ranges: [number, string][] = [[1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ']];
  let [f, p] = ranges[ranges.length - 1];
  for (const r of ranges) if (a >= r[0] * 0.99995) { [f, p] = r; break; }
  if (a < 1e-9) { f = base === 'Ω' ? 1 : 1e-3; p = base === 'Ω' ? '' : 'm'; }
  const n = x / f;
  const digits = Math.abs(n) >= 100 ? 1 : Math.abs(n) >= 10 ? 2 : 3;
  return { display: n.toFixed(digits), unit: p + base };
}

const num = (v: unknown, d: number) => (typeof v === 'number' && isFinite(v) ? v : d);

export interface InterpretExtras { acRms?: (compId: string, vNow: number | null) => number }

export function interpret(doc: CircuitDocument, nl: Netlist, cp: Compiled, res: SimResult, extras: InterpretExtras = {}): Interpretation {
  const acRms = extras.acRms ?? (() => 0);
  const issues: Issue[] = [];
  const netVoltage = new Map<string, number | null>();
  cp.netNode.forEach((node, net) => netVoltage.set(net, res.floating[node] ? null : res.voltages[node]));

  const comps: Record<string, CompValues> = {};
  const states: Record<string, VisualState> = {};
  const unsupported = new Set(cp.unsupported.map((u) => u.compId));
  const blown: string[] = [];

  const push = (id: string, severity: Issue['severity'], title: string, message: string, compIds: string[]) => issues.push({ id: `sim-${id}`, severity, title, message, compIds });

  if (!res.ok && res.error) push('fail', 'error', 'A simulação não convergiu', res.error, []);
  res.warnings.forEach((w, i) => push(`w${i}`, 'warning', 'Aviso do simulador', w, []));

  for (const inst of Object.values(doc.components)) {
    const def = getDef(inst.type);
    if (!def || def.tool) continue;
    const pinsDef = getPins(def, inst.props);
    if (def.substrate) continue;
    const pc = res.pinCurrents[inst.id] ?? {};
    const pins: Record<string, PinValue> = {};
    let power = 0, powerKnown = true;
    for (const p of pinsDef) {
      const net = nl.pinNet.get(pinKey(inst.id, p.id));
      const v = net !== undefined && netVoltage.has(net) ? netVoltage.get(net)! : null;
      const i = pc[p.id] ?? (unsupported.has(inst.id) ? null : 0);
      pins[p.id] = { v, i };
      if (i && v === null) powerKnown = false;
      if (i && v !== null) power += v * i;
    }
    comps[inst.id] = { pins, power: unsupported.has(inst.id) || !powerKnown ? null : power, simulated: !unsupported.has(inst.id) };
    if (unsupported.has(inst.id)) continue;

    const iin = (pin: string) => pc[pin] ?? 0;
    const vd = (a: string, b: string) => { const va = pins[a]?.v, vb = pins[b]?.v; return va == null || vb == null ? null : va - vb; };
    const L = inst.label;

    switch (inst.type) {
      case 'led': {
        const I = iin('A'), imax = num(inst.props.ifmax, 0.02);
        states[inst.id] = { brightness: I > 2e-4 ? Math.max(0.12, Math.min(1, I / 0.015)) : 0 };
        if (I > imax * 5) push(`led-${inst.id}`, 'error', `${L}: sobrecorrente destrutiva!`, `Possível sobrecorrente! Passam ${A(I)} pelo LED (máximo ${A(imax)}). Um LED real queimaria quase instantaneamente. Adicione uma resistência limitadora para proteger o componente: R ≥ (Vfonte − Vf)/${A(imax * 0.75)}.`, [inst.id]);
        else if (I > imax * 1.05) push(`led-${inst.id}`, 'warning', `${L}: corrente acima do recomendado`, `Possível sobrecorrente! O LED está sujeito a ${A(I)}, acima dos ${A(imax)} recomendados. Aumente a resistência limitadora.`, [inst.id]);
        const vr = vd('K', 'A');
        if (vr !== null && vr > 5) push(`ledrev-${inst.id}`, 'warning', `${L}: tensão inversa elevada`, `O LED está polarizado inversamente com ${V(vr)} (máximo típico 5 V).`, [inst.id]);
        break;
      }
      case 'seven-segment': {
        const segs = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp'];
        const anode = inst.props.common === 'anode';
        states[inst.id] = { segments: segs.map((s) => (anode ? -iin(s) : iin(s)) > 3e-4) };
        const over = segs.filter((s) => Math.abs(iin(s)) > 0.03);
        if (over.length) push(`seg-${inst.id}`, 'warning', `${L}: segmentos com corrente excessiva`, `Segmentos ${over.join(', ')} com mais de 30 mA. Use uma resistência por segmento (220–330 Ω).`, [inst.id]);
        break;
      }
      case 'resistor': case 'potentiometer': {
        const pmax = inst.type === 'resistor' ? Number(inst.props.power ?? 0.25) : 0.2;
        const P = Math.abs(power);
        if (P > pmax * 2) push(`pw-${inst.id}`, 'error', `${L}: vai sobreaquecer`, `Dissipa ${W(P)}, muito acima da potência nominal (${W(pmax)}). Um resistor real queimaria. Use maior resistência ou maior potência nominal.`, [inst.id]);
        else if (P > pmax) push(`pw-${inst.id}`, 'warning', `${L}: potência acima da nominal`, `Dissipa ${W(P)} (nominal ${W(pmax)}). Escolha um resistor de maior potência.`, [inst.id]);
        break;
      }
      case 'capacitor-electrolytic': {
        const v = vd('1', '2');
        if (v !== null && v < -0.5) push(`cap-${inst.id}`, 'error', `${L}: polaridade invertida`, `O condensador eletrolítico tem ${V(v)} aos terminais (negativo no +). Pode aquecer, inchar e rebentar. Rode-o.`, [inst.id]);
        if (v !== null && Math.abs(v) > num(inst.props.voltage, 25)) push(`capv-${inst.id}`, 'error', `${L}: sobretensão`, `${V(Math.abs(v))} aplicados a um condensador de ${inst.props.voltage} V.`, [inst.id]);
        break;
      }
      case 'capacitor-ceramic': {
        const v = vd('1', '2');
        if (v !== null && Math.abs(v) > num(inst.props.voltage, 50)) push(`capv-${inst.id}`, 'error', `${L}: sobretensão`, `${V(Math.abs(v))} aplicados a um condensador de ${inst.props.voltage} V.`, [inst.id]);
        break;
      }
      case 'zener': {
        const pmax = Number(inst.props.power ?? 0.5);
        if (Math.abs(power) > pmax) push(`z-${inst.id}`, 'warning', `${L}: dissipação excessiva`, `O Zener dissipa ${W(Math.abs(power))} (máx. ${W(pmax)}). Aumente a resistência série.`, [inst.id]);
        break;
      }
      case 'diode': case 'schottky': {
        const I = iin('A'), max = inst.props.model === '1N4148' ? 0.3 : inst.props.model === '1N5408' ? 3 : 1;
        if (I > max * 1.1) push(`d-${inst.id}`, 'warning', `${L}: corrente acima do máximo`, `${A(I)} em direta (máximo ${A(max)}).`, [inst.id]);
        break;
      }
      case 'bjt-npn': case 'bjt-pnp': {
        if (Math.abs(power) > 0.625) push(`q-${inst.id}`, 'warning', `${L}: transístor a sobreaquecer`, `Dissipa ${W(Math.abs(power))} (TO-92 ≈ 0,625 W). Verifique a resistência de base e a carga.`, [inst.id]);
        const ib = Math.abs(iin('B'));
        if (ib > 0.05) push(`qb-${inst.id}`, 'error', `${L}: corrente de base excessiva`, `${A(ib)} na base — falta uma resistência de base (tipicamente 1–10 kΩ).`, [inst.id]);
        break;
      }
      case 'mosfet-n': case 'mosfet-p': {
        if (Math.abs(power) > 2) push(`m-${inst.id}`, 'warning', `${L}: requer dissipador`, `Dissipa ${W(Math.abs(power))} — sem dissipador um TO-220 suporta ≈2 W.`, [inst.id]);
        break;
      }
      case 'lm7805': case 'lm7812': case 'lm317': {
        const st = res.elementStates[cp.elementOwner.indexOf(inst.id)];
        if (st?.mode === 1) push(`reg-${inst.id}`, 'warning', `${L}: tensão de entrada insuficiente`, `O regulador está em dropout — precisa de pelo menos ${inst.type === 'lm317' ? '1,5' : '2'} V acima da tensão de saída na entrada.`, [inst.id]);
        if (Math.abs(power) > 1.5) push(`regp-${inst.id}`, 'warning', `${L}: requer dissipador`, `Dissipa ${W(Math.abs(power))} (Vin − Vout)·I. Sem dissipador, ~1,5 W é o limite prático.`, [inst.id]);
        break;
      }
      case 'battery-aa': case 'battery-9v': case 'battery-li-ion': case 'coin-cell': {
        const I = -iin('+');
        const max = inst.type === 'battery-9v' ? 0.5 : inst.type === 'coin-cell' ? 0.02 : inst.type === 'battery-li-ion' ? 5 : 2;
        if (I > max) push(`bat-${inst.id}`, 'error', `${L}: corrente excessiva`, `A bateria fornece ${A(I)} (limite prático ${A(max)}) — há provavelmente um curto-circuito ou uma carga demasiado baixa. A bateria aquece e descarrega rapidamente.`, [inst.id]);
        if (I < -0.001) push(`batr-${inst.id}`, 'warning', `${L}: a ser carregada`, `Entra corrente (${A(-I)}) pelo terminal positivo — outra fonte de maior tensão está a forçar corrente para dentro desta bateria. Pilhas não recarregáveis podem verter ou aquecer.`, [inst.id]);
        break;
      }
      case 'dc-supply': {
        const st = res.elementStates[cp.elementOwner.indexOf(inst.id)];
        if (st?.cc) push(`ps-${inst.id}`, 'info', `${L}: limitação de corrente ativa (CC)`, `A carga pede mais do que ${A(num(inst.props.ilimit, 1))}; a fonte baixou a tensão para ${V(vd('+', '-') ?? 0)} para não exceder o limite.`, [inst.id]);
        break;
      }
      case 'fuse': {
        const idx = cp.elementOwner.indexOf(inst.id);
        if (res.elementStates[idx]?.on === false) {
          blown.push(inst.id);
          states[inst.id] = { blown: true };
          push(`fuse-${inst.id}`, 'error', `${L}: fusível queimado`, `A corrente excedeu ${A(num(inst.props.rating, 0.5))}; o fusível abriu o circuito. Corrija a causa e reinicie a simulação para o substituir.`, [inst.id]);
        }
        break;
      }
      case 'relay-module': {
        const idx = cp.elementOwner.findIndex((o, i) => o === inst.id && res.elementStates[i]?.on !== undefined); // coil switch
        states[inst.id] = { energized: res.elementStates[idx]?.on === true };
        break;
      }
      case 'lamp': {
        const pn = num(inst.props.pnom, 0.5);
        states[inst.id] = { brightness: Math.max(0, Math.min(1, Math.abs(power) / pn)) };
        if (Math.abs(power) > pn * 1.3) push(`lamp-${inst.id}`, 'warning', `${L}: sobretensão`, `A lâmpada dissipa ${W(Math.abs(power))} (nominal ${W(pn)}); a vida útil cai drasticamente.`, [inst.id]);
        break;
      }
      case 'dc-motor': case 'fan': {
        const v = vd(inst.type === 'fan' ? '+' : '1', inst.type === 'fan' ? '-' : '2') ?? 0;
        const vn = num(inst.props.vnom, inst.type === 'fan' ? 12 : 6);
        const running = inst.type === 'fan' ? v > vn * 0.4 : Math.abs(v) > vn * 0.2;
        states[inst.id] = { speed: running ? Math.sign(v) * Math.min(1.6, Math.abs(v) / vn) : 0 };
        if (Math.abs(v) > vn * 1.5) push(`mot-${inst.id}`, 'warning', `${L}: sobretensão`, `${V(Math.abs(v))} aplicados (nominal ${V(vn)}).`, [inst.id]);
        break;
      }
      case 'multimeter': {
        const mode = String(inst.props.mode ?? 'dcv');
        const v = vd('VOHM', 'COM');
        let display = 'OL', unit = '';
        let beep = false;
        if (mode === 'dcv') { if (v !== null) ({ display, unit } = meterFmt(v, 'V')); else display = '- - - -'; }
        else if (mode === 'acv') { ({ display, unit } = meterFmt(acRms(inst.id, v), 'V')); }
        else if (mode === 'dca') {
          const ima = iin('VOHM'), ia = iin('A10');
          ({ display, unit } = meterFmt(ima + ia, 'A'));
          if (Math.abs(ima) > 0.4) { display = 'FUSE'; unit = ''; push(`dmmfuse-${inst.id}`, 'error', `${L}: fusível do multímetro queimado`, `Passaram ${A(Math.abs(ima))} pela entrada mA (máx. 400 mA). Para correntes altas use a entrada 10A. Se o multímetro estava em paralelo com uma fonte, criou um curto-circuito — o amperímetro liga-se SEMPRE em série.`, [inst.id]); }
          else if (Math.abs(ia) > 10) push(`dmm10-${inst.id}`, 'error', `${L}: corrente acima de 10 A`, `${A(Math.abs(ia))} na entrada 10A.`, [inst.id]);
        } else {
          const iExt = 1e-3 - (v ?? 0) / 3000;            // test current that actually enters the circuit
          if (v === null || iExt < 1e-7 || v > 2.9) display = 'OL';
          else if (mode === 'diode') ({ display, unit } = { display: v.toFixed(3), unit: 'V' });
          else { const r = v / iExt; ({ display, unit } = meterFmt(r, 'Ω')); beep = mode === 'cont' && r < 50; }
          if (mode !== 'diode' && cp.hasSourceOtherThan(inst.id)) push(`dmmpow-${inst.id}`, 'warning', `${L}: circuito alimentado`, 'Mediu resistência num circuito com fonte ligada: a leitura não é fiável e um multímetro real pode danificar-se. Desligue a alimentação antes de medir Ω/continuidade.', [inst.id]);
        }
        states[inst.id] = { display, unit, beep };
        break;
      }
      case 'voltmeter': { const v = vd('+', '-'); states[inst.id] = v === null ? { display: '- - - -', unit: 'V' } : meterFmt(v, 'V'); break; }
      case 'ammeter': {
        const i = iin('+');
        states[inst.id] = meterFmt(i, 'A');
        if (Math.abs(i) > 5) push(`amm-${inst.id}`, 'error', `${L}: amperímetro em paralelo?`, `Passam ${A(Math.abs(i))} pelo amperímetro — quase certamente está ligado em paralelo com uma fonte, o que é um curto-circuito. O amperímetro liga-se em série.`, [inst.id]);
        break;
      }
      case 'wattmeter': {
        const v = vd('V+', 'V-'), i = iin('I+');
        states[inst.id] = v === null ? { display: '- - - -', unit: 'W' } : meterFmt(v * i, 'W');
        break;
      }
      case 'solenoid': states[inst.id] = { energized: Math.abs(iin('1')) > 0.6 * num(inst.props.vnom, 12) / num(inst.props.rcoil, 30) }; break;
      case 'buzzer': states[inst.id] = { sounding: iin('+') > 0.005 }; break;
      case 'arduino-uno': case 'arduino-nano': case 'arduino-mega': {
        const p5 = Object.entries(pc).filter(([pin]) => pin.startsWith('5V')).reduce((s, [, i]) => s - i, 0);
        if (p5 > 0.5) push(`usb-${inst.id}`, 'error', `${L}: consumo excessivo no pino 5 V`, `Os componentes pedem ${A(p5)} ao pino 5 V; a porta USB fornece no máximo ≈500 mA (o fusível da placa dispara). Use uma fonte externa.`, [inst.id]);
        break;
      }
    }
  }

  // Floating nets that join several devices
  for (const n of nl.meaningful) {
    const node = cp.netNode.get(n.id);
    if (node === undefined || !res.floating[node]) continue;
    const labels = [...new Set(n.devicePins.map((p) => doc.components[p.compId]?.label))].join(', ');
    issues.push({ id: `sim-float-${n.id}`, severity: 'warning', title: `Nó ${n.name} flutuante`, message: `O nó ${n.name} (${labels}) não tem nenhum caminho DC até à referência (massa) — a sua tensão absoluta é indeterminada. Pode ser intencional num circuito galvanicamente isolado (ex.: primário de um transformador). Caso contrário, entradas flutuantes (portas de MOSFET, entradas lógicas) comportam-se de forma imprevisível: use uma resistência de pull-up/pull-down.`, compIds: [...new Set(n.devicePins.map((p) => p.compId))] });
  }
  for (const u of cp.unsupported) {
    const c = doc.components[u.compId];
    issues.push({ id: `sim-uns-${u.compId}`, severity: 'info', title: `${c?.label}: não simulado`, message: u.note, compIds: [u.compId] });
  }
  if (!cp.hasSource) issues.unshift({ id: 'sim-nosrc', severity: 'warning', title: 'Sem fonte de alimentação', message: 'O circuito não tem nenhuma fonte de tensão/corrente ativa (bateria, fonte, ou placa alimentada por USB). Não há energia para simular.', compIds: [] });

  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  return { netVoltage, comps, states, issues, blown, summary: { nodes: cp.circuit.nodeCount, iterations: res.iterations, ground: cp.groundNet } };
}
