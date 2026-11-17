import { useEffect, useRef } from 'react';
import { AlertCircle, AlertTriangle, Info, CheckCircle2, Terminal, Network, Gauge, Activity, ChevronDown, Trash2, Code2, MessageSquare, GraduationCap } from 'lucide-react';
import { CodeTab, SerialTab } from './McuTabs';
import { LearnTab } from './LearnTab';
import { useEditor, type BottomTab } from '@/store/editor';
import { useAnalysis } from '@/store/derived';
import { getDef, getPins } from '@/library/registry';
import { compRect } from '@/store/editor';
import { canvasSize } from '@/editor/Canvas';
import { useSim } from '@/store/sim';
import { SimTab } from './SimTab';
import { AnalysisTab } from './AnalysisTab';
import { ScopeTab } from './ScopeTab';
import { Brain } from 'lucide-react';
import type { Issue } from '@/engine/erc';

function useAllIssues(): Issue[] {
  const { issues } = useAnalysis();
  const sim = useSim((s) => s.interp?.issues);
  return sim ? [...sim.filter((i) => i.severity !== 'info'), ...issues, ...sim.filter((i) => i.severity === 'info')] : issues;
}

export function BottomPanel() {
  const tab = useEditor((s) => s.bottomTab);
  const { nl } = useAnalysis();
  const issues = useAllIssues();
  const set = useEditor((s) => s.set);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const warns = issues.filter((i) => i.severity === 'warning').length;
  const tabs: { id: BottomTab; label: string; icon: React.ReactNode; badge?: React.ReactNode }[] = [
    { id: 'console', label: 'Consola', icon: <Terminal className="h-3.5 w-3.5" /> },
    { id: 'problems', label: 'Erros e avisos', icon: <AlertTriangle className="h-3.5 w-3.5" />, badge: (errors + warns) > 0 && <span className={`ml-1 rounded-full px-1.5 text-[10px] font-bold ${errors ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'}`}>{errors + warns}</span> },
    { id: 'netlist', label: 'Nós (netlist)', icon: <Network className="h-3.5 w-3.5" />, badge: <span className="ml-1 text-[10px] text-lab-400">{nl.meaningful.length}</span> },
    { id: 'measure', label: 'Medições', icon: <Gauge className="h-3.5 w-3.5" /> },
    { id: 'sim', label: 'Simulação', icon: <Activity className="h-3.5 w-3.5" /> },
    { id: 'scope', label: 'Osciloscópio', icon: <Activity className="h-3.5 w-3.5" /> },
    { id: 'analysis', label: 'Análise', icon: <Brain className="h-3.5 w-3.5" /> },
    { id: 'code', label: 'Programa', icon: <Code2 className="h-3.5 w-3.5" /> },
    { id: 'serial', label: 'Monitor série', icon: <MessageSquare className="h-3.5 w-3.5" /> },
    { id: 'learn', label: 'Aprender', icon: <GraduationCap className="h-3.5 w-3.5" /> },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center border-b border-lab-700 bg-lab-900 px-1">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => set({ bottomTab: t.id })} className={`flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[12px] ${tab === t.id ? 'border-accent text-white' : 'border-transparent text-lab-400 hover:text-lab-200'}`}>
            {t.icon}{t.label}{t.badge}
          </button>
        ))}
        <div className="flex-1" />
        {tab === 'console' && <button title="Limpar consola" onClick={() => set({ logs: [] })} className="rounded p-1 text-lab-400 hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button>}
        <button title="Fechar painel" onClick={() => set({ bottomOpen: false })} className="rounded p-1 text-lab-400 hover:text-white"><ChevronDown className="h-4 w-4" /></button>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-[12px]">
        {tab === 'console' && <ConsoleTab />}
        {tab === 'problems' && <ProblemsTab />}
        {tab === 'netlist' && <NetlistTab />}
        {tab === 'measure' && <MeasureTab />}
        {tab === 'sim' && <SimTab />}
        {tab === 'analysis' && <AnalysisTab />}
        {tab === 'scope' && <ScopeTab />}
        {tab === 'code' && <CodeTab />}
        {tab === 'serial' && <SerialTab />}
        {tab === 'learn' && <LearnTab />}
      </div>
    </div>
  );
}

function ConsoleTab() {
  const logs = useEditor((s) => s.logs);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }); }, [logs.length]);
  const icon = { info: <Info className="h-3.5 w-3.5 text-sky-400" />, warn: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />, error: <AlertCircle className="h-3.5 w-3.5 text-red-400" />, ok: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" /> };
  return (
    <div className="px-3 py-1.5">
      {logs.length === 0 && <div className="py-2 text-lab-500">Sem mensagens.</div>}
      {logs.map((l) => (
        <div key={l.id} className="flex items-center gap-2 py-0.5 text-lab-200">
          <span className="text-lab-500">{new Date(l.t).toLocaleTimeString('pt-PT')}</span>{icon[l.level]}<span>{l.msg}</span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

function focusComps(ids: string[]) {
  const st = useEditor.getState();
  st.select({ comps: ids });
  const c = st.doc.components[ids[0]];
  const r = c && compRect(c);
  if (r) {
    const z = st.view.zoom;
    st.setView({ x: canvasSize.w / 2 - (r.x + r.w / 2) * z, y: canvasSize.h / 2 - (r.y + r.h / 2) * z });
  }
}

function ProblemsTab() {
  const issues = useAllIssues();
  const set = useEditor((s) => s.set);
  if (!issues.length) return <div className="flex items-center gap-2 px-3 py-3 font-sans text-[12.5px] text-emerald-300"><CheckCircle2 className="h-4 w-4" />Sem problemas topológicos detetados.</div>;
  return (
    <div className="divide-y divide-lab-800 font-sans">
      {issues.map((i) => (
        <button key={i.id} onClick={() => focusComps(i.compIds)} onMouseEnter={() => set({ highlightComps: i.compIds })} onMouseLeave={() => set({ highlightComps: [] })}
          className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-lab-800">
          {i.severity === 'error' ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" /> : i.severity === 'warning' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />}
          <div><div className="text-[12.5px] font-semibold text-lab-100">{i.title}</div><div className="text-[12px] leading-snug text-lab-300">{i.message}</div></div>
        </button>
      ))}
    </div>
  );
}

function NetlistTab() {
  const { nl } = useAnalysis();
  const doc = useEditor((s) => s.doc);
  const set = useEditor((s) => s.set);
  if (!nl.meaningful.length) return <div className="px-3 py-3 font-sans text-[12.5px] text-lab-400">Ainda não há ligações entre componentes.</div>;
  return (
    <table className="w-full">
      <thead className="sticky top-0 bg-lab-900 text-left text-[11px] uppercase text-lab-500">
        <tr><th className="px-3 py-1 font-medium">Nó</th><th className="px-3 py-1 font-medium">Pinos ligados</th><th className="px-3 py-1 text-right font-medium">Fios</th></tr>
      </thead>
      <tbody>
        {nl.meaningful.map((n) => (
          <tr key={n.id} className="border-t border-lab-800 hover:bg-lab-800" onMouseEnter={() => set({ hoveredNet: n.id })} onMouseLeave={() => set({ hoveredNet: null })}>
            <td className="whitespace-nowrap px-3 py-1 text-emerald-300">{n.name}</td>
            <td className="px-3 py-1 text-lab-200">
              {n.devicePins.map((p) => {
                const c = doc.components[p.compId];
                const def = c && getDef(c.type);
                const pin = def && getPins(def, c.props).find((x) => x.id === p.pinId);
                return <span key={`${p.compId}${p.pinId}`} className="mr-2 inline-block">{c?.label}.<span className="text-lab-400">{pin?.name.replace(/^\d+ · /, '') ?? p.pinId}</span></span>;
              })}
            </td>
            <td className="px-3 py-1 text-right text-lab-400">{n.wires.length}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function MeasureTab() {
  const doc = useEditor((s) => s.doc);
  const interp = useSim((s) => s.interp);
  const running = useSim((s) => s.running);
  const meters = Object.values(doc.components).filter((c) => getDef(c.type)?.category === 'instruments' && !getDef(c.type)?.comingSoon);
  if (!meters.length) return <Placeholder title="Sem instrumentos no circuito" text="Arraste um multímetro, voltímetro, amperímetro ou wattímetro da categoria Instrumentos e ligue os seus terminais ao circuito com fios. O voltímetro liga-se em paralelo; o amperímetro em série." />;
  return (
    <div className="flex flex-wrap gap-2 p-3 font-sans">
      {meters.map((m) => { const st = interp?.states[m.id]; return (
        <button key={m.id} onClick={() => useEditor.getState().select({ comps: [m.id] })} className="min-w-[160px] rounded-lg border border-lab-700 bg-lab-850 px-3 py-2 text-left hover:border-accent">
          <div className="text-[11px] text-lab-400">{m.label} · {getDef(m.type)!.name}</div>
          <div className="font-mono text-[20px] font-bold text-amber-300">{running ? (st?.display as string) ?? '…' : '—'} <span className="text-[13px] text-lab-300">{running ? (st?.unit as string) ?? '' : ''}</span></div>
          {!running && <div className="text-[11px] text-lab-500">inicie a simulação</div>}
        </button>
      ); })}
    </div>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <div className="px-4 py-3 font-sans">
      <div className="text-[13px] font-semibold text-lab-100">{title}</div>
      <div className="mt-1 max-w-3xl text-[12.5px] leading-relaxed text-lab-400">{text}</div>
    </div>
  );
}
