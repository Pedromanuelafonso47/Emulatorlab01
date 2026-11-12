/**
 * Circuit analysis assistant — rule-based, deterministic. Every statement is derived from the
 * netlist (topology) and, when the simulation is running, from the computed values.
 * Nothing is guessed: if a value is unknown the text says so.
 */
import type { CircuitDocument, ComponentInstance } from '@/domain/types';
import { formatSI } from '@/domain/units';
import { getDef } from '@/library/registry';
import { CATEGORIES } from '@/library/categories';
import { pinKey, type Netlist } from './netlist';
import type { Issue } from './erc';
import type { Interpretation } from './sim/interpret';
import { modelStatus } from './sim/models';
import { LED_VF } from './sim/models';

export type AnalysisKind = 'overview' | 'explain' | 'issue' | 'suggest' | 'ok';
export interface AnalysisItem { kind: AnalysisKind; title: string; text: string; compIds: string[] }
export interface Analysis { items: AnalysisItem[]; simulated: boolean }

const V = (x: number) => formatSI(x, 'V');
const A = (x: number) => formatSI(x, 'A');
const W = (x: number) => formatSI(x, 'W');
const Ω = (x: number) => formatSI(x, 'Ω');

const E12 = [1.0, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
/** Smallest E12 value ≥ r. */
export function e12Above(r: number): number {
  if (!(r > 0)) return 0;
  const dec = 10 ** Math.floor(Math.log10(r));
  for (const m of [...E12, 10]) if (m * dec >= r * 0.999) return +(m * dec).toPrecision(3);
  return 10 * dec;
}
export function powerRating(p: number): string {
  for (const [w, l] of [[0.125, '⅛ W'], [0.25, '¼ W'], [0.5, '½ W'], [1, '1 W'], [2, '2 W'], [5, '5 W']] as [number, string][]) if (p * 2 <= w) return l;
  return `${Math.ceil(p * 2)} W`;
}

export function analyzeCircuit(doc: CircuitDocument, nl: Netlist, ercIssues: Issue[], interp: Interpretation | null): Analysis {
  const items: AnalysisItem[] = [];
  const comps = Object.values(doc.components).filter((c) => { const d = getDef(c.type); return d && !d.substrate && !d.tool; });
  const net = (c: string, p: string) => nl.pinNet.get(pinKey(c, p));
  const vOf = (c: string, p: string): number | null | undefined => { const n = net(c, p); return n ? interp?.netVoltage.get(n) : undefined; };
  const iIn = (c: string, p: string) => interp?.comps[c]?.pins[p]?.i ?? null;
  const devicesOnNet = (netId: string | undefined, exclude: string) => (netId ? nl.netById.get(netId)!.devicePins.filter((p) => p.compId !== exclude) : []);
  const name = (c: ComponentInstance) => `${c.label} (${getDef(c.type)!.name})`;

  if (!comps.length) return { items: [{ kind: 'overview', title: 'Circuito vazio', text: 'Ainda não há componentes para analisar.', compIds: [] }], simulated: false };

  // ── Overview ──
  const byCat = new Map<string, number>();
  comps.forEach((c) => { const cat = getDef(c.type)!.category; byCat.set(cat, (byCat.get(cat) ?? 0) + 1); });
  const catText = [...byCat].map(([k, n]) => `${n} ${CATEGORIES.find((x) => x.id === k)?.short.toLowerCase()}`).join(', ');
  const sources = comps.filter((c) => getDef(c.type)!.category === 'power' || (/arduino|esp|pico/.test(c.type) && c.props.usbPower !== false));
  items.push({
    kind: 'overview', title: 'Visão geral',
    text: `${comps.length} componentes (${catText}), ${Object.keys(doc.wires).length} fios e ${nl.meaningful.length} nós elétricos. ` +
      (sources.length ? `Alimentação: ${sources.map((s) => `${s.label}${getDef(s.type)!.valueLabel ? ' ' + getDef(s.type)!.valueLabel!(s.props) : ''}`).join(', ')}.` : 'Não há nenhuma fonte de alimentação — o circuito não tem energia.') +
      (interp ? '' : ' Inicie a simulação para que a análise inclua tensões e correntes calculadas.'),
    compIds: [],
  });

  // ── Source budget ──
  if (interp) {
    for (const s of sources) {
      const cv = interp.comps[s.id];
      if (!cv || cv.power === null) continue;
      const delivered = -cv.power;
      if (delivered > 1e-6) items.push({ kind: 'explain', title: `${s.label}: fornece ${W(delivered)}`, text: `A fonte ${name(s)} entrega ${W(delivered)} ao circuito. Esta energia é dissipada nos restantes componentes (conservação da energia: soma das potências = 0).`, compIds: [s.id] });
    }
  }

  // ── LEDs ──
  for (const led of comps.filter((c) => c.type === 'led')) {
    const color = String(led.props.color);
    const vf = LED_VF[color] ?? 2;
    const anodeNet = net(led.id, 'A');
    const series = devicesOnNet(anodeNet, led.id).map((p) => doc.components[p.compId]).filter((c) => c?.type === 'resistor');
    const I = iIn(led.id, 'A');
    let text = `LED ${color === 'red' ? 'vermelho' : color} com tensão direta típica de ≈${vf} V. `;
    if (series.length) text += `Tem ${series.map((r) => `${r.label} (${Ω(Number(r.props.resistance))})`).join(', ')} em série no ânodo, que limita a corrente. `;
    if (I !== null && interp) {
      const vA = vOf(led.id, 'A'), vK = vOf(led.id, 'K');
      text += `Simulação: ${A(Math.max(0, I))}${vA != null && vK != null ? ` com ${V(vA - vK)} aos terminais` : ''}. `;
      if (I < 2e-4) {
        const why = vA == null || vK == null ? 'um dos terminais não está ligado a um nó com tensão definida (circuito aberto)'
          : vA - vK < 0 ? `está polarizado inversamente (o cátodo está ${V(vK - vA)} acima do ânodo) — rode o LED`
            : `a tensão aplicada (${V(vA - vK)}) é inferior à tensão direta (${vf} V)`;
        items.push({ kind: 'issue', title: `${led.label} não acende`, text: text + `Porque não acende: ${why}.`, compIds: [led.id] });
        continue;
      }
      // Suggest resistor from the voltage on the far side of the series resistor
      const r = series[0];
      if (r) {
        const otherPin = net(r.id, '1') === anodeNet ? '2' : '1';
        const vs = vOf(r.id, otherPin);
        const vk = vOf(led.id, 'K');
        if (vs != null && vk != null) {
          const rIdeal = (vs - vk - vf) / 0.015;
          const rStd = e12Above(rIdeal);
          if (I > 0.02 || I < 0.004) items.push({ kind: 'suggest', title: `${led.label}: ajuste a resistência`, text: text + `Para ≈15 mA com ${V(vs - vk)} disponíveis: R = (${V(vs - vk)} − ${vf} V) / 15 mA ≈ ${Ω(rIdeal)} → valor normalizado E12: ${Ω(rStd)} (${powerRating((0.015 ** 2) * rStd)}).`, compIds: [led.id, r.id] });
          else items.push({ kind: 'ok', title: `${led.label} bem dimensionado`, text: text + 'A corrente está dentro da gama recomendada (4–20 mA).', compIds: [led.id] });
          continue;
        }
      }
    }
    items.push({ kind: series.length ? 'explain' : 'issue', title: `${led.label}: LED`, text: series.length ? text : text + 'Não há resistência em série ligada diretamente ao ânodo — confirme que existe uma resistência limitadora noutro ponto do ramo.', compIds: [led.id] });
  }

  // ── Resistors: dividers, series/parallel ──
  const resistors = comps.filter((c) => c.type === 'resistor' || c.type === 'potentiometer');
  const seenPar = new Set<string>();
  for (const r of comps.filter((c) => c.type === 'resistor')) {
    const a = net(r.id, '1'), b = net(r.id, '2');
    const par = comps.filter((o) => o.type === 'resistor' && o.id !== r.id && ((net(o.id, '1') === a && net(o.id, '2') === b) || (net(o.id, '1') === b && net(o.id, '2') === a)));
    if (par.length && !seenPar.has(r.id)) {
      const group = [r, ...par];
      group.forEach((g) => seenPar.add(g.id));
      const req = 1 / group.reduce((s, g) => s + 1 / Number(g.props.resistance), 0);
      items.push({ kind: 'explain', title: `Resistências em paralelo: ${group.map((g) => g.label).join(' ∥ ')}`, text: `Estão ligadas aos mesmos dois nós, logo têm a mesma tensão. Resistência equivalente: 1/Req = ${group.map((g) => `1/${Ω(Number(g.props.resistance))}`).join(' + ')} → Req = ${Ω(req)} (sempre menor que a menor delas).`, compIds: group.map((g) => g.id) });
    }
  }
  for (const r1 of comps.filter((c) => c.type === 'resistor')) {
    for (const pin of ['1', '2']) {
      const mid = net(r1.id, pin);
      if (!mid) continue;
      const others = devicesOnNet(mid, r1.id);
      const r2s = others.map((p) => ({ c: doc.components[p.compId], pin: p.pinId })).filter((x) => x.c?.type === 'resistor');
      if (others.length > 3 || r2s.length !== 1) continue;
      const r2 = r2s[0].c;
      if (r2.id < r1.id) continue; // report once
      const top = net(r1.id, pin === '1' ? '2' : '1'), bot = net(r2.id, r2s[0].pin === '1' ? '2' : '1');
      const R1 = Number(r1.props.resistance), R2 = Number(r2.props.resistance);
      const loads = others.filter((p) => p.compId !== r2.id);
      let text = `${r1.label} e ${r2.label} partilham o nó ${nl.netById.get(mid)!.name}. `;
      if (loads.length === 0) {
        text += `Como nenhum outro componente consome corrente desse nó, estão em SÉRIE: Req = ${Ω(R1)} + ${Ω(R2)} = ${Ω(R1 + R2)}. `;
        const vt = interp?.netVoltage.get(top!), vb = interp?.netVoltage.get(bot!), vm = interp?.netVoltage.get(mid);
        if (vt != null && vb != null && vm != null) text += `Funcionam como DIVISOR DE TENSÃO: Vout = Vin·R2/(R1+R2) = ${V(vt - vb)}·${Ω(R2)}/${Ω(R1 + R2)} = ${V((vt - vb) * R2 / (R1 + R2))} (simulado: ${V(vm - vb)}).`;
        items.push({ kind: 'explain', title: `Série / divisor: ${r1.label} + ${r2.label}`, text, compIds: [r1.id, r2.id] });
      } else if (interp) {
        const names = [...new Set(loads.map((p) => doc.components[p.compId]?.label))].join(', ');
        text += `O nó intermédio também alimenta ${names}; se for um divisor de tensão, essa carga altera a tensão de saída (efeito de carga). Para um divisor “firme”, a corrente da carga deve ser ≪ corrente do divisor.`;
        items.push({ kind: 'explain', title: `Divisor com carga: ${r1.label} / ${r2.label}`, text, compIds: [r1.id, r2.id] });
      }
    }
  }

  // ── Transistors ──
  for (const q of comps.filter((c) => c.type === 'bjt-npn' || c.type === 'bjt-pnp')) {
    const pnp = q.type === 'bjt-pnp';
    const baseRs = devicesOnNet(net(q.id, 'B'), q.id).map((p) => doc.components[p.compId]).filter((c) => c?.type === 'resistor');
    let text = `Transístor ${pnp ? 'PNP' : 'NPN'} ${q.props.model}. `;
    text += baseRs.length ? `Resistência de base: ${baseRs.map((r) => `${r.label} = ${Ω(Number(r.props.resistance))}`).join(', ')}. ` : 'Sem resistência de base ligada diretamente — a corrente de base pode ficar sem limite. ';
    const vb = vOf(q.id, 'B'), ve = vOf(q.id, 'E'), vc = vOf(q.id, 'C');
    if (interp && vb != null && ve != null && vc != null) {
      const s = pnp ? -1 : 1;
      const vbe = s * (vb - ve), vce = s * (vc - ve);
      const ib = Math.abs(iIn(q.id, 'B') ?? 0), ic = Math.abs(iIn(q.id, 'C') ?? 0);
      const beta = Number(q.props.hfe ?? 100);
      if (vbe < 0.5) text += `Vbe = ${V(vbe)} < 0,6 V → CORTE: o transístor está desligado (interruptor aberto), Ic ≈ 0.`;
      else if (vce < 0.3) text += `Vbe = ${V(vbe)}, Vce = ${V(vce)} → SATURAÇÃO: funciona como interruptor fechado. Ib = ${A(ib)}, Ic = ${A(ic)}; Ic/Ib = ${(ic / Math.max(ib, 1e-12)).toFixed(1)} < β = ${beta} (margem de saturação ${(beta * ib / Math.max(ic, 1e-12)).toFixed(1)}×).`;
      else text += `Vbe = ${V(vbe)}, Vce = ${V(vce)} → REGIÃO ATIVA (amplificador): Ic = β·Ib = ${A(ic)} (Ib = ${A(ib)}). Para usar como interruptor, aumente Ib (menor resistência de base) até saturar.`;
    }
    items.push({ kind: 'explain', title: `${q.label}: transístor`, text, compIds: [q.id] });
  }
  for (const m of comps.filter((c) => c.type === 'mosfet-n' || c.type === 'mosfet-p')) {
    const vg = vOf(m.id, 'G'), vs = vOf(m.id, 'S');
    let text = `MOSFET ${m.type === 'mosfet-n' ? 'canal N' : 'canal P'} ${m.props.model}: controlado pela tensão porta-fonte (Vgs), sem corrente de porta. `;
    if (interp) {
      if (vg === null) text += 'A porta está FLUTUANTE — ligue uma resistência de pull-down (10 kΩ) para garantir que desliga.';
      else if (vg != null && vs != null) {
        const vgs = (m.type === 'mosfet-n' ? 1 : -1) * (vg - vs);
        text += `Vgs = ${V(vgs)}. ${vgs < 1.5 ? 'Desligado.' : vgs < 4.5 && m.props.model !== 'IRLZ44N' ? 'Parcialmente ligado — este modelo precisa de ≈10 V na porta para conduzir plenamente; com 5 V (Arduino) prefira um MOSFET de nível lógico (IRLZ44N).' : 'Totalmente ligado (interruptor fechado).'}`;
      }
    }
    items.push({ kind: 'explain', title: `${m.label}: MOSFET`, text, compIds: [m.id] });
  }

  // ── Regulators ──
  for (const u of comps.filter((c) => ['lm7805', 'lm7812', 'lm317'].includes(c.type))) {
    const vin = vOf(u.id, 'IN'), vout = vOf(u.id, 'OUT'), ref = vOf(u.id, u.type === 'lm317' ? 'ADJ' : 'GND');
    let text = `Regulador linear: mantém a saída constante dissipando em calor a diferença (Vin − Vout)·I. `;
    if (interp && vin != null && vout != null && ref != null) {
      const p = interp.comps[u.id]?.power ?? 0;
      text += `Entrada ${V(vin - (u.type === 'lm317' ? 0 : ref))}, saída ${V(vout - (u.type === 'lm317' ? 0 : ref))}, margem ${V(vin - vout)} (mínimo ≈2 V), dissipa ${W(Math.abs(p))}. `;
      if (u.type === 'lm317') text += `Vout = 1,25·(1 + R2/R1) — ajuste a relação das resistências para mudar a saída.`;
    }
    items.push({ kind: 'explain', title: `${u.label}: regulador`, text, compIds: [u.id] });
  }

  // ── Op-amps ──
  for (const u of comps.filter((c) => ['lm358', 'lm741', 'lm324'].includes(c.type))) {
    const channels = u.type === 'lm741' ? [['6', '3', '2']] : u.type === 'lm358' ? [['1', '3', '2'], ['7', '5', '6']] : [['1', '3', '2'], ['7', '5', '6'], ['8', '10', '9'], ['14', '12', '13']];
    for (const [out, inp, inn] of channels) {
      const no = net(u.id, out), nn = net(u.id, inn), np = net(u.id, inp);
      const outConnected = devicesOnNet(no, u.id).length > 0, inUsed = devicesOnNet(np, u.id).length > 0;
      if (!outConnected && !inUsed) continue;
      let cfg: string;
      const fb = comps.filter((c) => c.type === 'resistor' && ((net(c.id, '1') === no && net(c.id, '2') === nn) || (net(c.id, '2') === no && net(c.id, '1') === nn)));
      if (no === nn) cfg = 'SEGUIDOR DE TENSÃO (buffer): a saída copia a entrada não-inversora com ganho 1 e baixa impedância de saída.';
      else if (fb.length) {
        const rf = Number(fb[0].props.resistance);
        const rg = comps.find((c) => c.type === 'resistor' && c.id !== fb[0].id && (net(c.id, '1') === nn || net(c.id, '2') === nn));
        cfg = rg ? `Com realimentação negativa por ${fb[0].label} (${Ω(rf)}) e ${rg.label} (${Ω(Number(rg.props.resistance))}): ganho não-inversor 1 + Rf/Rg = ${(1 + rf / Number(rg.props.resistance)).toFixed(2)} (ou −Rf/Rg = ${(-rf / Number(rg.props.resistance)).toFixed(2)} se o sinal entrar por ${rg.label}).` : `Com realimentação negativa por ${fb[0].label}.`;
      } else cfg = 'Sem realimentação: funciona como COMPARADOR — a saída vai para perto de um dos rails conforme V+ > V− ou V+ < V−.';
      const vo = interp ? vOf(u.id, out) : undefined;
      items.push({ kind: 'explain', title: `${u.label}: amp-op (saída ${out})`, text: cfg + (vo != null ? ` Saída simulada: ${V(vo)}.` : ''), compIds: [u.id] });
    }
  }

  // ── Buttons & pull resistors ──
  for (const b of comps.filter((c) => c.type === 'push-button')) {
    const left = net(b.id, '1A'), right = net(b.id, '2A');
    const l = devicesOnNet(left, b.id).map((p) => doc.components[p.compId]?.label), r = devicesOnNet(right, b.id).map((p) => doc.components[p.compId]?.label);
    items.push({ kind: 'explain', title: `${b.label}: botão`, text: `Premir o botão liga o nó do lado esquerdo (${[...new Set(l)].join(', ') || 'nada'}) ao do lado direito (${[...new Set(r)].join(', ') || 'nada'}). ${interp ? 'Durante a simulação pode premi-lo clicando nele.' : ''} Se for a entrada de um microcontrolador ou CI, garanta uma resistência pull-up/pull-down para que a entrada não fique flutuante quando solto.`, compIds: [b.id] });
  }

  // ── Not simulated ──
  const notSim = comps.filter((c) => modelStatus(c.type).status === 'none');
  if (notSim.length) items.push({ kind: 'issue', title: 'Componentes sem simulação nesta versão', text: `${notSim.map((c) => c.label).join(', ')}: ${[...new Set(notSim.map((c) => modelStatus(c.type).note))].join(' ')}`, compIds: notSim.map((c) => c.id) });

  // ── Issues (ERC + simulation) ──
  for (const i of [...(interp?.issues ?? []), ...ercIssues].filter((x) => x.severity !== 'info')) items.push({ kind: 'issue', title: i.title, text: i.message, compIds: i.compIds });

  if (!items.some((i) => i.kind === 'issue')) items.push({ kind: 'ok', title: 'Nenhum erro detetado', text: interp ? 'A topologia e os valores calculados não revelam problemas.' : 'A topologia não revela problemas. Inicie a simulação para verificar também os valores.', compIds: [] });
  void resistors;
  return { items, simulated: !!interp };
}
