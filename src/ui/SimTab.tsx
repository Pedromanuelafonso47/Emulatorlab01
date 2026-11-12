import { Play } from 'lucide-react';
import { useSim } from '@/store/sim';
import { useEditor } from '@/store/editor';
import { useAnalysis } from '@/store/derived';
import { getDef } from '@/library/registry';
import { formatSI } from '@/domain/units';

/** Simulation results: node voltages and per-component current/power — only computed values. */
export function SimTab() {
  const running = useSim((s) => s.running);
  const interp = useSim((s) => s.interp);
  const ms = useSim((s) => s.solveMs);
  const start = useSim((s) => s.start);
  const doc = useEditor((s) => s.doc);
  const set = useEditor((s) => s.set);
  const { nl } = useAnalysis();

  if (!running) {
    return (
      <div className="flex items-start gap-4 px-4 py-3 font-sans">
        <button onClick={start} className="flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-500"><Play className="h-4 w-4" fill="currentColor" />Simular</button>
        <div className="max-w-3xl text-[12.5px] leading-relaxed text-lab-400">
          Simulação DC (ponto de funcionamento) por análise nodal modificada com Newton-Raphson, num Web Worker. Enquanto estiver ativa, o circuito é recalculado a cada alteração; pode premir botões e interruptores diretamente no laboratório.
          Componentes temporizados (555, contadores, AC, condensadores a carregar) ficam para a Fase 4 e são assinalados como “não simulados”.
        </div>
      </div>
    );
  }
  if (!interp) return <div className="px-3 py-2 text-lab-400">A calcular…</div>;

  const nets = nl.meaningful.map((n) => ({ n, v: interp.netVoltage.get(n.id) })).filter((x) => x.v !== undefined);
  const rows = Object.entries(interp.comps)
    .map(([id, cv]) => ({ id, cv, c: doc.components[id] }))
    .filter((r) => r.c && r.cv.simulated && !getDef(r.c.type)?.substrate)
    .map((r) => {
      const pins = Object.values(r.cv.pins);
      const imax = Math.max(0, ...pins.map((p) => Math.abs(p.i ?? 0)));
      return { ...r, imax };
    });

  return (
    <div className="grid h-full grid-cols-1 gap-0 md:grid-cols-[minmax(240px,1fr)_2fr]">
      <div className="overflow-y-auto border-r border-lab-800">
        <div className="sticky top-0 flex items-center justify-between bg-lab-900 px-3 py-1 text-[11px] uppercase text-lab-500">
          <span>Tensão dos nós (ref.: {interp.summary.ground ? nl.netById.get(interp.summary.ground)?.name ?? 'GND' : '—'})</span>
          <span className="normal-case">{interp.summary.iterations} it. · {ms.toFixed(1)} ms</span>
        </div>
        <table className="w-full">
          <tbody>
            {nets.map(({ n, v }) => (
              <tr key={n.id} className="border-t border-lab-800 hover:bg-lab-800" onMouseEnter={() => set({ hoveredNet: n.id })} onMouseLeave={() => set({ hoveredNet: null })}>
                <td className="px-3 py-0.5 text-emerald-300">{n.name}</td>
                <td className="px-3 py-0.5 text-right text-amber-300">{v === null ? <span className="text-red-300">flutuante</span> : formatSI(v!, 'V', 4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="overflow-y-auto">
        <table className="w-full">
          <thead className="sticky top-0 bg-lab-900 text-left text-[11px] uppercase text-lab-500">
            <tr><th className="px-3 py-1 font-medium">Componente</th><th className="px-3 py-1 font-medium">Valor</th><th className="px-3 py-1 text-right font-medium">Tensão</th><th className="px-3 py-1 text-right font-medium">Corrente</th><th className="px-3 py-1 text-right font-medium">Potência</th></tr>
          </thead>
          <tbody>
            {rows.map(({ id, c, cv, imax }) => {
              const def = getDef(c.type)!;
              const pins = Object.values(cv.pins);
              const vAcross = pins.length === 2 && pins[0].v != null && pins[1].v != null ? Math.abs(pins[0].v - pins[1].v) : null;
              return (
                <tr key={id} className="cursor-pointer border-t border-lab-800 hover:bg-lab-800" onClick={() => useEditor.getState().select({ comps: [id] })}>
                  <td className="px-3 py-0.5 text-lab-100">{c.label} <span className="text-lab-500">{def.name}</span></td>
                  <td className="px-3 py-0.5 text-lab-400">{def.valueLabel?.(c.props) ?? ''}</td>
                  <td className="px-3 py-0.5 text-right text-amber-300">{vAcross === null ? '' : formatSI(vAcross, 'V', 3)}</td>
                  <td className="px-3 py-0.5 text-right text-sky-300">{formatSI(imax < 1e-12 ? 0 : imax, 'A', 3)}</td>
                  <td className="px-3 py-0.5 text-right text-rose-300">{cv.power === null ? '—' : `${formatSI(Math.abs(cv.power), 'W', 3)}${cv.power < -1e-9 ? ' ↑' : ''}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="px-3 py-1.5 font-sans text-[11px] text-lab-500">↑ = potência fornecida (fontes). Corrente = maior corrente num terminal do componente.</div>
      </div>
    </div>
  );
}
