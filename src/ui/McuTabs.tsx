import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Play, Send, Trash2, Cpu } from 'lucide-react';
import { useEditor } from '@/store/editor';
import { useSim } from '@/store/sim';
import { getDef } from '@/library/registry';
import type { ComponentInstance } from '@/domain/types';
import { parse, CompileError } from '@/mcu/lang/parser';
import { isExecutableBoard } from '@/mcu/programs';
import { SKETCH_EXAMPLES } from '@/mcu/examples';

/** The board shown in the Programa / Monitor tabs: the selected one, else the first board in the circuit. */
function useBoard(): ComponentInstance | undefined {
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selection.comps);
  const boards = Object.values(doc.components).filter((c) => getDef(c.type)?.category === 'mcu');
  return boards.find((c) => selected.includes(c.id)) ?? boards[0];
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full items-center justify-center p-6 text-center font-sans text-[13px] text-lab-400">{children}</div>;
}

// ───────────────────────── Programa ─────────────────────────

export function CodeTab() {
  const board = useBoard();
  if (!board) return <Empty>Coloque uma placa Arduino no laboratório para escrever o seu programa.</Empty>;
  return <SketchEditor key={board.id} board={board} />;
}

function SketchEditor({ board }: { board: ComponentInstance }) {
  const saved = typeof board.props.sketch === 'string' ? board.props.sketch : '';
  const [draft, setDraft] = useState(saved);
  const gutter = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const supported = isExecutableBoard(board.type);
  const dirty = draft !== saved;
  const label = board.label || getDef(board.type)?.name || board.type;

  const diag = useMemo<{ ok: true } | { ok: false; line: number; message: string }>(() => {
    if (!draft.trim()) return { ok: true };
    try { parse(draft); return { ok: true }; }
    catch (e) {
      if (e instanceof CompileError) return { ok: false, line: e.line, message: e.message };
      return { ok: false, line: 1, message: String((e as Error).message) };
    }
  }, [draft]);

  const apply = (code: string) => {
    const st = useEditor.getState();
    st.setProps(board.id, { sketch: code });
    st.log('ok', `Programa aplicado a ${label}`);
  };
  const loadExample = (code: string) => { setDraft(code); apply(code); };

  const onKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); if (dirty) apply(draft); return; }
    if (e.key === 'Tab') {
      e.preventDefault();
      const el = e.currentTarget;
      const { selectionStart: s, selectionEnd: t } = el;
      const next = draft.slice(0, s) + '  ' + draft.slice(t);
      setDraft(next);
      requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
    }
  };

  const lines = Math.max(1, draft.split('\n').length);
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-lab-700 bg-lab-900/60 px-3 py-2 font-sans text-[12px]">
        <Cpu className="h-3.5 w-3.5 text-accent" />
        <span className="font-semibold text-lab-100">{label}</span>
        <span className="text-lab-500">· {getDef(board.type)?.name}</span>
        <div className="flex-1" />
        {!supported
          ? <span className="text-amber-300">Esta placa ainda não executa código. Use o Arduino Uno ou o Nano.</span>
          : diag.ok
            ? <span className="flex items-center gap-1 text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5" />Sintaxe correta</span>
            : <span className="flex items-center gap-1 text-red-300"><AlertTriangle className="h-3.5 w-3.5" />Linha {diag.line}: {diag.message}</span>}
        <button
          onClick={() => apply(draft)}
          disabled={!dirty}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1 font-semibold text-white transition hover:brightness-110 disabled:bg-lab-700 disabled:text-lab-400"
          title="Aplicar ao circuito (Ctrl+S)"
        >
          <Play className="h-3.5 w-3.5" />{dirty ? 'Aplicar (Ctrl+S)' : 'Aplicado'}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-lab-700 px-3 py-1.5 font-sans text-[11.5px]">
        <span className="mr-1 text-lab-400">Exemplos:</span>
        {SKETCH_EXAMPLES.map((ex) => (
          <button key={ex.id} title={ex.hint} onClick={() => loadExample(ex.code)}
            className="rounded-full border border-lab-600 px-2.5 py-0.5 text-lab-200 hover:border-accent hover:text-white">{ex.title}</button>
        ))}
      </div>

      <div className="relative flex min-h-0 flex-1 bg-[#0b1220]">
        <div ref={gutter} className="select-none overflow-hidden border-r border-lab-800 px-2 py-2 text-right text-lab-500" aria-hidden>
          {Array.from({ length: lines }, (_, i) => (
            <div key={i} className={!diag.ok && diag.line === i + 1 ? 'text-red-400' : ''}>{i + 1}</div>
          ))}
        </div>
        <textarea
          ref={area}
          value={draft}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKey}
          onScroll={(e) => { if (gutter.current) gutter.current.scrollTop = e.currentTarget.scrollTop; }}
          placeholder={'void setup() {\n  \n}\n\nvoid loop() {\n  \n}'}
          className="min-h-0 flex-1 resize-none bg-transparent px-3 py-2 font-mono text-[12.5px] leading-[1.55] text-[#e6edf7] outline-none placeholder:text-lab-600"
          style={{ tabSize: 2 }}
        />
      </div>
      {!diag.ok && <div className="border-t border-red-900/60 bg-red-950/40 px-3 py-1 font-sans text-[11.5px] text-red-200">Linha {diag.line}: {diag.message}</div>}
    </div>
  );
}

// ───────────────────────── Monitor série ─────────────────────────

export function SerialTab() {
  const board = useBoard();
  if (!board) return <Empty>Coloque uma placa Arduino no laboratório para ver a saída série.</Empty>;
  return <SerialMonitor board={board} />;
}

function SerialMonitor({ board }: { board: ComponentInstance }) {
  const running = useSim((s) => s.running);
  const text = useSim((s) => s.serial[board.id] ?? '');
  const snap = useSim((s) => s.mcu.find((m) => m.compId === board.id));
  const sendSerial = useSim((s) => s.sendSerial);
  const clearSerial = useSim((s) => s.clearSerial);
  const [line, setLine] = useState('');
  const out = useRef<HTMLPreElement>(null);

  useEffect(() => { if (out.current) out.current.scrollTop = out.current.scrollHeight; }, [text]);

  const send = () => {
    if (!line) return;
    sendSerial(board.id, line + '\n');
    setLine('');
  };
  const pins = snap ? Object.entries(snap.pins) : [];

  return (
    <div className="flex h-full flex-col font-sans">
      <div className="flex flex-wrap items-center gap-2 border-b border-lab-700 px-3 py-1.5 text-[12px]">
        <span className="font-semibold text-lab-100">{board.label}</span>
        {!running && <span className="flex items-center gap-1 text-lab-400"><Play className="h-3 w-3" />Inicie a simulação para ver a saída</span>}
        {running && snap?.error && <span className="text-red-300">{snap.error}</span>}
        {running && !snap?.error && snap?.running && <span className="text-emerald-300">● a executar</span>}
        {running && !snap?.running && !snap?.error && <span className="text-lab-400">sem programa</span>}
        <div className="flex-1" />
        <button title="Limpar" onClick={() => clearSerial(board.id)} className="rounded p-1 text-lab-400 hover:text-white"><Trash2 className="h-3.5 w-3.5" /></button>
      </div>

      {pins.length > 0 && (
        <div className="flex flex-wrap gap-1 border-b border-lab-800 px-3 py-1.5 font-mono text-[10.5px]">
          {pins.map(([name, p]) => (
            <span key={name} className={`rounded px-1.5 py-0.5 ${p.value ? 'bg-emerald-500/20 text-emerald-200' : 'bg-lab-800 text-lab-400'}`}>
              {name} {p.mode === 'pwm' ? `PWM ${Math.round((p.value / 255) * 100)}%` : p.mode === 'pullup' ? 'PULLUP' : p.mode.toUpperCase()} {p.mode === 'pwm' ? '' : p.value ? 'H' : 'L'}
            </span>
          ))}
        </div>
      )}

      <pre ref={out} className="min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap px-3 py-2 font-mono text-[12.5px] text-[#c8ffd4]">
        {text || <span className="text-lab-600">(sem saída)</span>}
      </pre>

      <div className="flex items-center gap-2 border-t border-lab-700 px-3 py-2">
        <input
          value={line}
          onChange={(e) => setLine(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder="Enviar para a placa (Enter)"
          className="min-w-0 flex-1 rounded-md border border-lab-600 bg-lab-900 px-2 py-1.5 font-mono text-[12.5px] text-lab-100 focus:border-accent focus:outline-none"
        />
        <button onClick={send} disabled={!running || !line} className="flex items-center gap-1 rounded-md bg-accent px-3 py-1.5 text-[12px] font-semibold text-white disabled:bg-lab-700 disabled:text-lab-400">
          <Send className="h-3.5 w-3.5" />Enviar
        </button>
      </div>
    </div>
  );
}
