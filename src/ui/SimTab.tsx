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
  const simTime = useSim((s) => s.simTime);
  const speed = useSim((s) => s.speed);
  const dynamic = useSim((s) => s.dynamic);
  const dt = useSim((s) => s.dt);
  const speedSetting = useSim((s) => s.speedSetting);
  const setSpeed = useSim((s) => s.setSpeed);
  const start = useSim((s) => s.start);
  const doc = useEditor((s) => s.doc);
  const set = useEditor((s) => s.set);
  const { nl } = useAnalysis();

  if (!running) {
    return (
      <div className="flex items-start gap-4 px-4 py-3 font-sans">
        <button onClick={start} className="flex shrink-0 items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-[12.5px] font-semibold text-white hover:bg-emerald-500"><Play className="h-4 w-4" fill="currentColor" />Simular</button>
        <div className="max-w-3xl text-[12.5px] leading-relaxed text-lab-400">
          Análise nodal modificada com Newton-Raphson num Web Worker. Circuitos só com elementos estáticos são resolvidos em DC; com condensadores, indutores, fontes AC, 555, lógica sequencial ou microcontroladores corre uma simulação transitória em tempo real (Backward-Euler). Pode premir botões e interruptores no laboratório durante a simulação.
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
    <div className="flex h-full flex-col">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-lab-800 px-3 py-1 font-sans text-[11.5px] text-lab-400">
      {dynamic ? (<>
        <span>Tempo simulado: <b className="font-mono text-lab-100">{formatSI(simTime, 's', 4)}</b></span>
        <span>Passo: <b className="font-mono text-lab-100">{formatSI(dt, 's', 2)}</b></span>
        <span>Velocidade real: <b className={'font-mono ' + (speed < 0.95 * (speedSetting === 'auto' ? 1 : speedSetting) ? 'text-amber-300' : 'text-lab-100')}>{speed >= 0.995 ? '1×' : speed.toPrecision(2) + '×'}</b> do tempo real</span>
        <label className="flex items-center gap-1">Ritmo:
          <select value={String(speedSetting)} onChange={(e) => setSpeed(e.target.value === 'auto' ? 'auto' : (+e.target.value as 1))} className="rounded border border-lab-600 bg-lab-900 px-1 py-0.5 text-lab-100">
            <option value="auto">Automático</option><option value="1">Tempo real (1×)</option><option value="0.1">Câmara lenta 0,1×</option><option value="0.01">0,01×</option><option value="0.001">0,001×</option>
          </select>
        </label>
      </>) : <span>Circuito sem elementos dinâmicos — resolvido como ponto de funcionamento DC (exato, sem passo temporal).</span>}
    </div>
    <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 md:grid-cols-[minmax(240px,1fr)_2fr]">
      <div className="overflow-y-auto border-r border-lab-800">
        <div className="sticky top-0 flex items-center justify-between bg-lab-900 px-3 py-1 text-[11px] uppercase text-lab-500">
          <span>Tensão dos nós (ref.: {interp.summary.ground ? nl.netById.get(interp.summary.ground)?.name ?? 'GND' : '—'})</span>
          <span className="normal-case">{dynamic ? 'transitório' : 'DC'}</span>
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
        <div className="px-3 py-1.5 font-sans text-[11px] text-lab-500">↑ = potência fornecida (fontes). Corrente = maior corrente num terminal do componente. Valores instantâneos no último passo.</div>
      </div>
    </div>
    </div>
  );
}
