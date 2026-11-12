import { useSim } from '@/store/sim';
import { getDef, getPins } from '@/library/registry';
import { formatSI } from '@/domain/units';
import type { ComponentInstance } from '@/domain/types';

/** Live electrical values of one component (only values actually computed by the solver). */
export function SimValues({ inst }: { inst: ComponentInstance }) {
  const running = useSim((s) => s.running);
  const cv = useSim((s) => s.interp?.comps[inst.id]);
  if (!running) return <div className="mt-2 rounded border border-dashed border-lab-600 px-2 py-1.5 text-[11.5px] text-lab-400">Inicie a simulação (▶ Simular) para ver tensões, correntes e potência calculadas.</div>;
  if (!cv) return <div className="mt-2 text-[12px] text-lab-400">A calcular…</div>;
  if (!cv.simulated) return <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 px-2 py-1.5 text-[12px] text-amber-100">Este componente não entra na simulação DC desta fase — é tratado como circuito aberto. Nenhum valor é inventado.</div>;
  const def = getDef(inst.type)!;
  const pins = getPins(def, inst.props);
  const two = pins.length === 2;
  const [a, b] = pins;
  const va = cv.pins[a?.id]?.v, vb = cv.pins[b?.id]?.v;
  const fmtV = (v: number | null | undefined) => (v === undefined ? '—' : v === null ? 'flutuante' : formatSI(v, 'V', 4));
  return (
    <div className="mt-2.5 space-y-2">
      {two && (
        <div className="grid grid-cols-3 gap-1.5">
          <Big label="Tensão" value={va == null || vb == null ? '—' : formatSI(Math.abs(va - vb), 'V', 4)} color="text-amber-300" />
          <Big label="Corrente" value={formatSI(Math.abs(cv.pins[a.id]?.i ?? 0) < 1e-12 ? 0 : Math.abs(cv.pins[a.id]?.i ?? 0), 'A', 3)} color="text-sky-300" />
          <Big label={cv.power !== null && cv.power < 0 ? 'Fornece' : 'Potência'} value={cv.power === null ? '—' : formatSI(Math.abs(cv.power), 'W', 3)} color="text-rose-300" />
        </div>
      )}
      {!two && cv.power !== null && <div className="text-[12px] text-lab-300">Potência total: <span className="font-mono text-rose-300">{formatSI(Math.abs(cv.power), 'W', 3)}</span> {cv.power < 0 ? '(fornecida)' : '(dissipada)'}</div>}
      <table className="w-full text-[11.5px]">
        <thead><tr className="text-left text-[10.5px] uppercase text-lab-500"><th className="py-0.5 font-medium">Pino</th><th className="py-0.5 text-right font-medium">V (massa)</th><th className="py-0.5 text-right font-medium">I (entra)</th></tr></thead>
        <tbody>
          {pins.slice(0, 40).filter((p) => two || (cv.pins[p.id]?.i ?? 0) !== 0 || cv.pins[p.id]?.v !== null).map((p) => (
            <tr key={p.id} className="border-t border-lab-800">
              <td className="py-0.5 text-lab-200">{p.name.replace(/^\d+ · /, '')}</td>
              <td className="py-0.5 text-right font-mono text-amber-300">{fmtV(cv.pins[p.id]?.v)}</td>
              <td className="py-0.5 text-right font-mono text-sky-300">{cv.pins[p.id]?.i == null ? '—' : formatSI(Math.abs(cv.pins[p.id]!.i!) < 1e-12 ? 0 : cv.pins[p.id]!.i!, 'A', 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Big({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-md bg-lab-800 px-2 py-1.5">
      <div className={`font-mono text-[13px] font-semibold ${color}`}>{value}</div>
      <div className="text-[10.5px] text-lab-400">{label}</div>
    </div>
  );
}
