import { useEditor } from '@/store/editor';
import { useSim } from '@/store/sim';
import { getDef } from '@/library/registry';
import { formatSI } from '@/domain/units';
import type { Measurements, ScopeView } from '@/engine/sim/scope';

export function ScopeTab() {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selection.comps);
  const interp = useSim((s) => s.interp);
  const running = useSim((s) => s.running);
  const scopes = Object.values(doc.components).filter((c) => c.type === 'oscilloscope');
  const scope = scopes.find((s) => selected.includes(s.id)) ?? scopes[0];
  if (!scope) return <div className="px-4 py-3 font-sans text-[12.5px] text-lab-400">Não há nenhum osciloscópio no circuito. Arraste “Osciloscópio (2 canais)” da categoria Instrumentos, ligue CH1/CH2 aos pontos a observar e GND à massa, e inicie a simulação.</div>;
  const view = interp?.states[scope.id]?.view as ScopeView | undefined;
  const def = getDef('oscilloscope')!;
  const set = (k: string, v: string | number) => useEditor.getState().setProps(scope.id, { [k]: v });
  const opt = (k: string) => def.props!.find((p) => p.key === k)!;
  const W = 500, H = 400;
  const X = (d: number) => (d / 10) * W, Y = (d: number) => H / 2 - (d / 4) * (H / 2);
  const pl = (pts: [number, number][]) => pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ');
  const Sel = ({ k }: { k: string }) => (
    <label className="flex items-center justify-between gap-2 text-[11.5px] text-lab-300">{opt(k).label}
      <select value={String(scope.props[k])} onChange={(e) => set(k, e.target.value)} className="rounded border border-lab-600 bg-lab-900 px-1 py-0.5 text-lab-100">
        {opt(k).options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
  return (
    <div className="flex h-full gap-3 overflow-auto p-2 font-sans">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full min-h-[160px] shrink-0 rounded-md bg-[#06100a]" style={{ aspectRatio: '5 / 4' }}>
        {Array.from({ length: 11 }, (_, i) => <line key={`v${i}`} x1={X(i)} y1={0} x2={X(i)} y2={H} stroke="#1c3524" strokeWidth={i === 5 ? 1.4 : 0.7} />)}
        {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1={0} y1={Y(i - 4)} x2={W} y2={Y(i - 4)} stroke="#1c3524" strokeWidth={i === 4 ? 1.4 : 0.7} />)}
        {view?.ch1.length ? <polyline points={pl(view.ch1)} fill="none" stroke="#ffd23a" strokeWidth={1.6} /> : null}
        {view?.ch2.length ? <polyline points={pl(view.ch2)} fill="none" stroke="#3dd2ff" strokeWidth={1.6} /> : null}
        <line x1={0} x2={10} y1={Y(Number(scope.props.trigLevel) / Number(scope.props[scope.props.trigSource === 'ch2' ? 'vdiv2' : 'vdiv1']) + Number(scope.props[scope.props.trigSource === 'ch2' ? 'off2' : 'off1'] ?? 0))} y2={Y(Number(scope.props.trigLevel) / Number(scope.props[scope.props.trigSource === 'ch2' ? 'vdiv2' : 'vdiv1']) + Number(scope.props[scope.props.trigSource === 'ch2' ? 'off2' : 'off1'] ?? 0))} stroke="#ff7a3a" strokeWidth={6} />
        <text x={8} y={16} fill="#9fb0c8" fontSize={12} fontFamily="monospace">{scope.label} · {running ? (view ? (view.triggered ? 'TRIG’D' : 'AUTO') : '…') : 'parado'}</text>
        {!running && <text x={W / 2} y={H / 2} fill="#4a5a73" fontSize={16} textAnchor="middle" fontFamily="sans-serif">Inicie a simulação para ver as formas de onda</text>}
      </svg>
      <div className="grid min-w-[220px] flex-1 grid-cols-1 content-start gap-1.5 lg:grid-cols-2">
        <div className="space-y-1.5 rounded-md border border-lab-700 p-2">
          <div className="text-[11px] font-semibold uppercase text-lab-400">Horizontal / trigger</div>
          <Sel k="tdiv" /><Sel k="trigSource" /><Sel k="trigEdge" />
          <label className="flex items-center justify-between gap-2 text-[11.5px] text-lab-300">Nível (V)
            <input type="number" step={0.1} value={Number(scope.props.trigLevel)} onChange={(e) => set('trigLevel', +e.target.value)} className="w-20 rounded border border-lab-600 bg-lab-900 px-1 py-0.5 text-right text-lab-100" />
          </label>
        </div>
        <div className="space-y-1.5 rounded-md border border-lab-700 p-2">
          <div className="text-[11px] font-semibold uppercase text-lab-400">Vertical</div>
          <Sel k="vdiv1" /><Sel k="coupling1" /><Sel k="vdiv2" /><Sel k="coupling2" />
        </div>
        <Meas title="CH1" color="text-yellow-300" m={view?.m1 ?? null} />
        <Meas title="CH2" color="text-sky-300" m={view?.m2 ?? null} />
      </div>
    </div>
  );
}

function Meas({ title, color, m }: { title: string; color: string; m: Measurements | null }) {
  const row = (k: string, v: string) => <div className="flex justify-between"><span className="text-lab-400">{k}</span><span className="font-mono text-lab-100">{v}</span></div>;
  return (
    <div className="rounded-md border border-lab-700 p-2 text-[11.5px]">
      <div className={`mb-1 font-semibold ${color}`}>{title} — medições</div>
      {m ? (<>
        {row('Frequência', m.freq ? formatSI(m.freq, 'Hz', 4) : '—')}
        {row('Período', m.period ? formatSI(m.period, 's', 4) : '—')}
        {row('Vpp', formatSI(m.vpp, 'V', 4))}
        {row('Vmáx / Vmín', `${formatSI(m.vmax, 'V', 3)} / ${formatSI(m.vmin, 'V', 3)}`)}
        {row('Vmédia', formatSI(m.vavg, 'V', 4))}
        {row('Vrms', formatSI(m.vrms, 'V', 4))}
      </>) : <div className="text-lab-500">sem sinal</div>}
    </div>
  );
}
