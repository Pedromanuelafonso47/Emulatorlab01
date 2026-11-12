/**
 * Electrical Rule Check — purely topological diagnostics (no solver needed).
 * Everything reported here follows from connectivity alone; quantitative checks
 * (actual currents, power) belong to the simulator (Phase 2+).
 */
import type { CircuitDocument } from '@/domain/types';
import { getDef, getInternal, getPins } from '@/library/registry';
import { isPinConnected, pinKey, type Netlist } from './netlist';

export type Severity = 'error' | 'warning' | 'info';
export interface Issue { id: string; severity: Severity; title: string; message: string; compIds: string[]; netIds?: string[] }

export function runERC(doc: CircuitDocument, nl: Netlist): Issue[] {
  const issues: Issue[] = [];
  const net = (c: string, p: string) => nl.pinNet.get(pinKey(c, p));

  // Nets of + and − terminals of every power source.
  const srcPos = new Map<string, string>(), srcNeg = new Map<string, string>(); // netId → source label
  for (const inst of Object.values(doc.components)) {
    const def = getDef(inst.type);
    if (!def || def.category !== 'power') continue;
    const pins = getPins(def, inst.props);
    const pos = pins.find((p) => p.polarity === '+'), neg = pins.find((p) => p.polarity === '-');
    if (!pos || !neg) continue;
    const np = net(inst.id, pos.id), nn = net(inst.id, neg.id);
    if (np && np === nn) {
      issues.push({
        id: `short-${inst.id}`, severity: 'error', title: `Curto-circuito em ${inst.label}`,
        message: `Os terminais + e − de ${inst.label} (${def.name}) estão ligados diretamente, sem nenhuma carga. Numa fonte real isto provoca uma corrente muito elevada, aquecimento e pode danificar a fonte ou a bateria. Remova a ligação direta entre + e −.`,
        compIds: [inst.id], netIds: [np],
      });
      continue;
    }
    if (np) srcPos.set(np, inst.label);
    if (nn) srcNeg.set(nn, inst.label);
  }

  for (const inst of Object.values(doc.components)) {
    const def = getDef(inst.type);
    if (!def || def.tool || def.substrate || def.comingSoon) continue;
    const pins = getPins(def, inst.props);
    if (!pins.length) continue;
    const connected = pins.filter((p) => isPinConnected(nl, inst.id, p.id));

    if (connected.length === 0) {
      issues.push({ id: `iso-${inst.id}`, severity: 'info', title: `${inst.label} não está ligado`, message: `${def.name} ainda não tem nenhuma ligação.`, compIds: [inst.id] });
      continue;
    }

    const tied = new Map<string, number>();
    getInternal(def, inst.props).forEach((g, gi) => g.forEach((p) => tied.set(p, gi)));
    const sameGroup = (a: string, b: string) => tied.has(a) && tied.get(a) === tied.get(b);

    if (pins.length === 2 && def.category !== 'power') {
      // Two-terminal part with both leads on the same node
      const [a, b] = pins;
      const na = net(inst.id, a.id);
      if (na && na === net(inst.id, b.id) && !sameGroup(a.id, b.id)) {
        const n = nl.netById.get(na)!;
        const viaBoard = n.wires.length === 0 && n.pins.some((p) => getDef(doc.components[p.compId]?.type ?? '')?.substrate);
        issues.push({
          id: `self-${inst.id}`, severity: 'warning', title: `${inst.label} está em curto`,
          message: viaBoard
            ? `Os dois terminais de ${inst.label} estão na mesma coluna da breadboard — ficam ligados entre si e o componente não tem qualquer efeito. Rode-o ou mova um terminal para outra coluna.`
            : `Os dois terminais de ${inst.label} estão ligados ao mesmo nó; não passa corrente por ele.`,
          compIds: [inst.id], netIds: [na],
        });
      }
    } else if (pins.length > 2 && def.category !== 'mcu') {
      // Accidental shorts through a breadboard strip (no wire, no other device involved)
      const byNet = new Map<string, string[]>();
      for (const p of connected) { const n = net(inst.id, p.id); if (n) byNet.set(n, [...(byNet.get(n) ?? []), p.id]); }
      for (const [nid, ids] of byNet) {
        if (ids.length < 2 || ids.every((x) => sameGroup(ids[0], x))) continue;
        const n = nl.netById.get(nid)!;
        if (n.wires.length === 0 && n.devicePins.every((p) => p.compId === inst.id)) {
          const names = ids.map((id) => pins.find((p) => p.id === id)?.name ?? id).join(', ');
          issues.push({
            id: `bbshort-${inst.id}-${nid}`, severity: 'warning', title: `Pinos de ${inst.label} em curto na breadboard`,
            message: `Os pinos ${names} estão na mesma coluna da breadboard. ${def.category === 'ics' ? 'Coloque o CI a atravessar o canal central, com uma fila de pinos de cada lado.' : 'Mude a orientação do componente.'}`,
            compIds: [inst.id], netIds: [nid],
          });
        }
      }
    }

    if (def.category === 'ics') {
      const missing = pins.filter((p) => (p.role === 'power' || p.role === 'ground') && !isPinConnected(nl, inst.id, p.id));
      if (missing.length) issues.push({
        id: `pwr-${inst.id}`, severity: 'warning', title: `${inst.label} sem alimentação completa`,
        message: `Os pinos de alimentação ${missing.map((p) => p.name).join(', ')} de ${def.name} não estão ligados. Um CI só funciona com VCC e GND ligados.`, compIds: [inst.id],
      });
    }

    // Polarised parts wired straight to a source
    const pPos = pins.find((p) => p.polarity === '+'), pNeg = pins.find((p) => p.polarity === '-');
    if (pPos && pNeg && def.category !== 'power') {
      const np = net(inst.id, pPos.id), nn = net(inst.id, pNeg.id);
      if (np && nn && np !== nn) {
        if (srcNeg.has(np) && srcPos.has(nn)) {
          const consequence = inst.type === 'led'
            ? 'O LED não acende assim (fica polarizado inversamente; acima de ~5 V pode danificar-se).'
            : inst.type === 'capacitor-electrolytic' ? 'Um condensador eletrolítico invertido pode aquecer, inchar e rebentar.' : 'Verifique a orientação.';
          issues.push({
            id: `rev-${inst.id}`, severity: 'warning', title: `Polaridade invertida em ${inst.label}`,
            message: `O terminal ${pPos.name} de ${inst.label} está ligado ao negativo de ${srcNeg.get(np)} e o terminal ${pNeg.name} ao positivo de ${srcPos.get(nn)}. ${consequence}`, compIds: [inst.id],
          });
        } else if (inst.type === 'led' && srcPos.has(np) && srcNeg.has(nn)) {
          issues.push({
            id: `ocur-${inst.id}`, severity: 'error', title: `Possível sobrecorrente em ${inst.label}!`,
            message: `${inst.label} está ligado diretamente aos terminais de ${srcPos.get(np)}, sem resistência limitadora. O LED ficará sujeito a uma corrente superior à recomendada (≈20 mA). Adicione uma resistência em série para proteger o componente: R = (Vfonte − Vf) / 0,015 A.`, compIds: [inst.id],
          });
        }
      }
    }
  }
  const order = { error: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}
