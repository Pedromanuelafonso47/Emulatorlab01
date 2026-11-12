import { useMemo } from 'react';
import { Lightbulb, AlertTriangle, Info, CheckCircle2, Sparkles } from 'lucide-react';
import { useEditor, compRect } from '@/store/editor';
import { useAnalysis } from '@/store/derived';
import { useSim } from '@/store/sim';
import { analyzeCircuit, type AnalysisKind } from '@/engine/analysis';
import { canvasSize } from '@/editor/Canvas';

const ICON: Record<AnalysisKind, React.ReactNode> = {
  overview: <Sparkles className="h-4 w-4 text-accent" />, explain: <Info className="h-4 w-4 text-sky-400" />,
  issue: <AlertTriangle className="h-4 w-4 text-amber-400" />, suggest: <Lightbulb className="h-4 w-4 text-yellow-300" />, ok: <CheckCircle2 className="h-4 w-4 text-emerald-400" />,
};

export function AnalysisTab() {
  const doc = useEditor((s) => s.doc);
  const set = useEditor((s) => s.set);
  const { nl, issues } = useAnalysis();
  const interp = useSim((s) => s.interp);
  const a = useMemo(() => analyzeCircuit(doc, nl, issues, interp), [doc, nl, issues, interp]);
  const focus = (ids: string[]) => {
    if (!ids.length) return;
    const st = useEditor.getState();
    st.select({ comps: ids });
    const r = compRect(st.doc.components[ids[0]]);
    if (r) st.setView({ x: canvasSize.w / 2 - (r.x + r.w / 2) * st.view.zoom, y: canvasSize.h / 2 - (r.y + r.h / 2) * st.view.zoom });
  };
  return (
    <div className="font-sans">
      <div className="border-b border-lab-800 px-3 py-1.5 text-[11.5px] text-lab-400">
        Análise automática baseada no netlist{a.simulated ? ' e nos valores calculados pela simulação' : ' (inicie a simulação para incluir tensões e correntes)'}. Regras determinísticas — nada é inventado.
      </div>
      <div className="divide-y divide-lab-800">
        {a.items.map((it, i) => (
          <button key={i} onClick={() => focus(it.compIds)} onMouseEnter={() => set({ highlightComps: it.compIds })} onMouseLeave={() => set({ highlightComps: [] })}
            className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-lab-800">
            <span className="mt-0.5 shrink-0">{ICON[it.kind]}</span>
            <div><div className="text-[12.5px] font-semibold text-lab-100">{it.title}</div><div className="text-[12px] leading-snug text-lab-300">{it.text}</div></div>
          </button>
        ))}
      </div>
    </div>
  );
}
