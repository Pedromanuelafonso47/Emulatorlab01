import { Fragment, useEffect, useState } from 'react';
import { RotateCw, RotateCcw, FlipHorizontal2, Copy, Trash2, Cpu, Info, Zap, AlertTriangle } from 'lucide-react';
import { useEditor, WIRE_COLORS } from '@/store/editor';
import { useAnalysis } from '@/store/derived';
import { getDef, getPins } from '@/library/registry';
import { CATEGORIES } from '@/library/categories';
import type { PropDef } from '@/library/types';
import { formatSI, parseSI } from '@/domain/units';
import type { ComponentInstance, Endpoint, WireStyle } from '@/domain/types';
import { pinKey, isPinConnected } from '@/engine/netlist';
import { Thumb } from './Thumb';

export function PropertiesPanel() {
  const selection = useEditor((s) => s.selection);
  const doc = useEditor((s) => s.doc);
  if (selection.comps.length === 1 && selection.wires.length === 0) {
    const c = doc.components[selection.comps[0]];
    if (c) return <ComponentProps inst={c} />;
  }
  if (selection.wires.length && !selection.comps.length) return <WireProps ids={selection.wires} />;
  if (selection.comps.length > 1) return <MultiProps />;
  return <ProjectInfo />;
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="border-b border-lab-700 px-3 py-3">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-lab-400">{icon}{title}</div>
      {children}
    </div>
  );
}

function ComponentProps({ inst }: { inst: ComponentInstance }) {
  const def = getDef(inst.type)!;
  const st = useEditor.getState();
  const { nl, issues } = useAnalysis();
  const pins = getPins(def, inst.props);
  const myIssues = issues.filter((i) => i.compIds.includes(inst.id));
  const cat = CATEGORIES.find((c) => c.id === def.category);
  const statusLabel = { implemented: 'Implementado', partial: 'Parcial', none: 'Ainda não simulado' }[def.sim.status];
  const statusColor = { implemented: 'bg-emerald-500/20 text-emerald-300', partial: 'bg-amber-500/20 text-amber-300', none: 'bg-lab-700 text-lab-300' }[def.sim.status];

  return (
    <div className="pb-8">
      <div className="flex gap-3 border-b border-lab-700 p-3">
        <div className="flex h-16 w-16 items-center justify-center rounded-md bg-[#e9edf2]"><Thumb def={def} size={58} /></div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-wider text-lab-400">{cat?.name}{def.subcategory ? ` · ${def.subcategory}` : ''}</div>
          <div className="truncate font-semibold text-white">{def.name}</div>
          <LabelInput inst={inst} />
        </div>
      </div>

      <div className="flex gap-1 border-b border-lab-700 px-3 py-2">
        <IconBtn title="Rodar −90° (Shift+R)" onClick={() => st.rotateSelection(-1)}><RotateCcw className="h-4 w-4" /></IconBtn>
        <IconBtn title="Rodar 90° (R)" onClick={() => st.rotateSelection(1)}><RotateCw className="h-4 w-4" /></IconBtn>
        <IconBtn title="Espelhar (M)" onClick={() => st.flipSelection()}><FlipHorizontal2 className="h-4 w-4" /></IconBtn>
        <IconBtn title="Duplicar (Ctrl+D)" onClick={() => st.duplicate()}><Copy className="h-4 w-4" /></IconBtn>
        <div className="flex-1" />
        <IconBtn title="Apagar (Del)" onClick={() => st.deleteSelection()} danger><Trash2 className="h-4 w-4" /></IconBtn>
      </div>

      {myIssues.length > 0 && (
        <Section title="Avisos" icon={<AlertTriangle className="h-3.5 w-3.5" />}>
          {myIssues.map((i) => (
            <div key={i.id} className={`mb-1.5 rounded-md border px-2.5 py-2 text-[12px] leading-snug ${i.severity === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : i.severity === 'warning' ? 'border-amber-500/40 bg-amber-500/10 text-amber-100' : 'border-lab-600 bg-lab-800 text-lab-200'}`}>
              <div className="font-semibold">{i.title}</div><div className="mt-0.5 opacity-90">{i.message}</div>
            </div>
          ))}
        </Section>
      )}

      {def.props && def.props.length > 0 && (
        <Section title="Propriedades">
          <div className="space-y-2.5">
            {def.props.map((p) => <PropEditor key={p.key} def={p} value={inst.props[p.key] ?? p.default} onChange={(v) => st.setProps(inst.id, { [p.key]: v })} />)}
          </div>
        </Section>
      )}

      <Section title="Simulação" icon={<Zap className="h-3.5 w-3.5" />}>
        <div className="flex items-center gap-2 text-[12px]">
          <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${statusColor}`}>{statusLabel}</span>
          <span className="font-mono text-lab-400">{def.sim.model}</span>
        </div>
        {def.sim.note && <div className="mt-1.5 text-[12px] text-lab-400">{def.sim.note}</div>}
        <div className="mt-2 rounded border border-dashed border-lab-600 px-2 py-1.5 text-[11.5px] text-lab-400">
          Tensões e correntes: o motor de simulação DC chega na Fase 2. Nenhum valor elétrico é mostrado antes de ser calculado.
        </div>
      </Section>

      <Section title={`Pinos (${pins.length})`} icon={<Cpu className="h-3.5 w-3.5" />}>
        <div className="max-h-64 overflow-y-auto rounded border border-lab-700">
          <table className="w-full text-[11.5px]">
            <tbody>
              {pins.slice(0, 120).map((p) => {
                const netId = nl.pinNet.get(pinKey(inst.id, p.id));
                const net = netId ? nl.netById.get(netId) : undefined;
                const conn = isPinConnected(nl, inst.id, p.id);
                return (
                  <tr key={p.id} className="border-b border-lab-800 last:border-0 hover:bg-lab-800"
                    onMouseEnter={() => conn && netId && useEditor.setState({ hoveredNet: netId })} onMouseLeave={() => useEditor.setState({ hoveredNet: null })}>
                    <td className="px-2 py-1 text-lab-100">{p.name}{p.polarity && <span className={p.polarity === '+' ? 'ml-1 text-red-400' : 'ml-1 text-sky-400'}>{p.polarity === '+' ? '(+)' : '(−)'}</span>}</td>
                    <td className="px-2 py-1 text-right font-mono">{conn ? <span className="text-emerald-300">{net?.name}</span> : <span className="text-lab-500">livre</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pins.length > 120 && <div className="px-2 py-1 text-[11px] text-lab-500">… e mais {pins.length - 120} pinos</div>}
        </div>
      </Section>

      <Section title="Informação técnica" icon={<Info className="h-3.5 w-3.5" />}>
        <p className="text-[12.5px] leading-relaxed text-lab-200">{def.description}</p>
        {def.datasheet?.summary && <p className="mt-2 rounded-md bg-lab-800 px-2.5 py-2 text-[12px] leading-relaxed text-lab-200">{def.datasheet.summary}</p>}
        {def.datasheet?.specs && (
          <table className="mt-2 w-full text-[11.5px]">
            <tbody>
              {Object.entries(def.datasheet.specs).map(([k, v]) => (
                <tr key={k} className="border-b border-lab-800"><td className="py-1 pr-2 text-lab-400">{k}</td><td className="py-1 text-right text-lab-100">{v}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        {def.datasheet?.notes?.map((n) => <p key={n} className="mt-1.5 text-[11.5px] text-lab-300">• {n}</p>)}
      </Section>
    </div>
  );
}

function LabelInput({ inst }: { inst: ComponentInstance }) {
  const [v, setV] = useState(inst.label);
  useEffect(() => setV(inst.label), [inst.label, inst.id]);
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== inst.label && useEditor.getState().setLabel(inst.id, v.trim())}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="mt-1 w-28 rounded border border-lab-600 bg-lab-900 px-1.5 py-0.5 font-mono text-[12px] text-accent focus:border-accent focus:outline-none" title="Designador de referência" />
  );
}

function PropEditor({ def, value, onChange }: { def: PropDef; value: unknown; onChange: (v: string | number | boolean) => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState(false);
  const fmt = (v: unknown) => (def.si && def.unit ? formatSI(Number(v), def.unit, 4) : String(v));
  useEffect(() => { setText(fmt(value)); setErr(false); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const label = <label className="mb-1 block text-[12px] text-lab-300">{def.label}{def.unit && !def.si ? ` (${def.unit})` : ''}</label>;
  if (def.type === 'select') return (
    <div>{label}
      <select value={String(value)} onChange={(e) => onChange(e.target.value)} className="w-full rounded-md border border-lab-600 bg-lab-900 px-2 py-1.5 text-[13px] text-lab-100 focus:border-accent focus:outline-none">
        {def.options!.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
  if (def.type === 'boolean') return (
    <label className="flex cursor-pointer items-center justify-between text-[12.5px] text-lab-200">
      {def.label}
      <button onClick={() => onChange(!value)} className={`relative h-5 w-9 rounded-full transition ${value ? 'bg-accent' : 'bg-lab-600'}`}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition ${value ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
    </label>
  );
  const isRange = def.type === 'number' && def.min !== undefined && def.max !== undefined && !def.si;
  const commit = () => {
    if (def.type === 'text') { onChange(text); return; }
    const n = parseSI(text);
    if (!isFinite(n) || (def.min !== undefined && n < def.min) || (def.max !== undefined && n > def.max)) { setErr(true); return; }
    setErr(false); onChange(n);
  };
  return (
    <div>{label}
      <div className="flex items-center gap-2">
        {isRange && <input type="range" min={def.min} max={def.max} step={def.step ?? (def.max! - def.min!) / 100} value={Number(value)} onChange={(e) => onChange(+e.target.value)} className="flex-1 accent-[#2f9bff]" />}
        <input value={text} onChange={(e) => setText(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && commit()}
          className={`${isRange ? 'w-20' : 'w-full'} rounded-md border bg-lab-900 px-2 py-1.5 font-mono text-[13px] text-lab-100 focus:outline-none ${err ? 'border-red-500' : 'border-lab-600 focus:border-accent'}`} />
      </div>
      {err && <div className="mt-0.5 text-[11px] text-red-400">Valor inválido{def.min !== undefined ? ` (${fmt(def.min)} – ${fmt(def.max)})` : ''}. Ex.: 4.7k, 100n, 2M2</div>}
      {def.hint && !err && <div className="mt-0.5 text-[11px] text-lab-500">{def.hint}</div>}
    </div>
  );
}

function IconBtn({ title, onClick, children, danger }: { title: string; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return <button title={title} onClick={onClick} className={`rounded-md p-1.5 ${danger ? 'text-red-300 hover:bg-red-500/20' : 'text-lab-200 hover:bg-lab-700'}`}>{children}</button>;
}

const STYLE_NAMES: [WireStyle, string][] = [['wire', 'Fio'], ['jumper-mm', 'Jumper M-M'], ['jumper-mf', 'Jumper M-F'], ['jumper-ff', 'Jumper F-F']];

function WireProps({ ids }: { ids: string[] }) {
  const doc = useEditor((s) => s.doc);
  const st = useEditor.getState();
  const { nl } = useAnalysis();
  const w = doc.wires[ids[0]];
  if (!w) return null;
  const desc = (e: Endpoint) => {
    if (e.kind === 'junction') return 'junção';
    const c = doc.components[e.compId];
    const def = c && getDef(c.type);
    const pin = def && getPins(def, c.props).find((p) => p.id === e.pinId);
    return `${c?.label ?? '?'} · ${pin?.name ?? e.pinId}`;
  };
  const net = nl.wireNet.get(w.id);
  return (
    <div>
      <Section title={ids.length > 1 ? `${ids.length} fios selecionados` : 'Fio / ligação'}>
        {ids.length === 1 && (
          <div className="space-y-1 text-[12.5px] text-lab-200">
            <div><span className="text-lab-400">De:</span> {desc(w.from)}</div>
            <div><span className="text-lab-400">Para:</span> {desc(w.to)}</div>
            <div><span className="text-lab-400">Nó elétrico:</span> <span className="font-mono text-emerald-300">{net ? nl.netById.get(net)?.name : '—'}</span></div>
            <div><span className="text-lab-400">Pontos de dobra:</span> {w.points.length} <span className="text-lab-500">(arraste o fio para criar; duplo clique num ponto para remover)</span></div>
          </div>
        )}
      </Section>
      <Section title="Cor">
        <div className="grid grid-cols-6 gap-1.5">
          {WIRE_COLORS.map((c) => (
            <button key={c} onClick={() => st.setWireColor(ids, c)} className={`h-7 rounded-md ring-1 ${w.color === c ? 'ring-2 ring-accent' : 'ring-black/40'}`} style={{ background: c }} title={c} />
          ))}
        </div>
      </Section>
      <Section title="Tipo">
        <div className="grid grid-cols-2 gap-1.5">
          {STYLE_NAMES.map(([s, n]) => (
            <button key={s} onClick={() => st.setWireStyle(ids, s)} className={`rounded-md border px-2 py-1.5 text-[12px] ${w.style === s ? 'border-accent bg-accent/15 text-white' : 'border-lab-600 text-lab-300 hover:bg-lab-800'}`}>{n}</button>
          ))}
        </div>
      </Section>
      <div className="p-3"><button onClick={() => st.deleteSelection()} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-[12.5px] text-red-300 hover:bg-red-500/15"><Trash2 className="h-4 w-4" />Apagar</button></div>
    </div>
  );
}

function MultiProps() {
  const sel = useEditor((s) => s.selection);
  const st = useEditor.getState();
  return (
    <Section title="Seleção múltipla">
      <div className="text-[12.5px] text-lab-200">{sel.comps.length} componentes, {sel.wires.length} fios</div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button onClick={() => st.rotateSelection(1)} className="rounded-md bg-lab-800 px-2.5 py-1.5 text-[12px] text-lab-100 hover:bg-lab-700">Rodar</button>
        <button onClick={() => st.duplicate()} className="rounded-md bg-lab-800 px-2.5 py-1.5 text-[12px] text-lab-100 hover:bg-lab-700">Duplicar</button>
        <button onClick={() => st.deleteSelection()} className="rounded-md bg-red-500/15 px-2.5 py-1.5 text-[12px] text-red-200 hover:bg-red-500/25">Apagar</button>
      </div>
    </Section>
  );
}

function ProjectInfo() {
  const doc = useEditor((s) => s.doc);
  const { nl, issues } = useAnalysis();
  const nComp = Object.values(doc.components).filter((c) => !getDef(c.type)?.substrate).length;
  return (
    <div>
      <Section title="Projeto">
        <div className="text-[15px] font-semibold text-white">{doc.name}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="Componentes" value={nComp} />
          <Stat label="Fios" value={Object.keys(doc.wires).length} />
          <Stat label="Nós elétricos" value={nl.meaningful.length} />
          <Stat label="Problemas" value={issues.filter((i) => i.severity !== 'info').length} warn={issues.some((i) => i.severity === 'error')} />
        </div>
      </Section>
      <Section title="Atalhos">
        <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-[12px] text-lab-300">
          {[['Clique num pino', 'iniciar/terminar fio'], ['Duplo clique fio', 'ramificação'], ['R / Shift+R', 'rodar'], ['M', 'espelhar'], ['Del', 'apagar'], ['Ctrl+C / V / D', 'copiar, colar, duplicar'], ['Ctrl+Z / Y', 'desfazer / refazer'], ['Ctrl+A', 'selecionar tudo'], ['F', 'ajustar vista'], ['W', 'modo ligação'], ['Esc', 'cancelar'], ['Roda', 'zoom'], ['Botão meio/direito', 'mover vista'], ['Ctrl+S', 'guardar']].map(([k, v]) => (
            <Fragment key={k}><kbd className="font-mono text-[11px] text-lab-100">{k}</kbd><span>{v}</span></Fragment>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: number; warn?: boolean }) {
  return (
    <div className="rounded-md bg-lab-800 px-2.5 py-2">
      <div className={`text-lg font-semibold ${warn ? 'text-red-300' : 'text-white'}`}>{value}</div>
      <div className="text-[11px] text-lab-400">{label}</div>
    </div>
  );
}
