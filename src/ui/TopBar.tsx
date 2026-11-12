import { useEffect, useRef, useState } from 'react';
import {
  Save, Undo2, Redo2, ZoomIn, ZoomOut, Maximize, Play, Square, Download, FolderOpen, FilePlus2, Grid3x3, Magnet, Tag,
  MousePointer2, Spline, Hand, PanelLeft, PanelRight, PanelBottom, ChevronDown,
} from 'lucide-react';
import { useEditor, WIRE_COLORS } from '@/store/editor';
import { canvasSize, canvasWorldGroup } from '@/editor/Canvas';
import { exportBOM, exportJSON, exportPNG, exportSVG } from '@/persistence/export';
import { saveProject, validateDocument } from '@/persistence/projects';

export function saveCurrent() {
  const st = useEditor.getState();
  try {
    saveProject(st.projectId, st.doc);
    st.markSaved();
    st.notify(`Projeto “${st.doc.name}” guardado`, 'ok');
  } catch (e) {
    st.notify(`Não foi possível guardar: ${(e as Error).message}`, 'error');
  }
}

export function TopBar({ onOpenProjects }: { onOpenProjects: () => void }) {
  const st = useEditor();
  const [exportOpen, setExportOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const zoom = (f: number) => st.zoomAt(f, { x: canvasSize.w / 2, y: canvasSize.h / 2 });
  const importFile = async (f: File) => {
    try {
      const doc = JSON.parse(await f.text());
      if (!validateDocument(doc)) throw new Error('formato inválido');
      st.loadDocument(doc);
      setTimeout(() => useEditor.getState().fitToContent(canvasSize.w, canvasSize.h), 0);
      st.notify(`Importado “${doc.name}”`, 'ok');
    } catch (e) { st.notify(`Falha ao importar: ${(e as Error).message}`, 'error'); }
  };

  return (
    <header className="flex h-12 shrink-0 items-center gap-1 border-b border-lab-700 bg-lab-900 px-2">
      <div className="mr-2 flex items-center gap-2 pl-1">
        <svg viewBox="0 0 32 32" className="h-7 w-7"><rect width="32" height="32" rx="7" fill="#1b2230" /><path d="M4 16h6l3-7 6 14 3-7h6" fill="none" stroke="#2f9bff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="hidden leading-tight sm:block">
          <div className="text-[13px] font-bold tracking-wide text-white">ElectroLab</div>
          <div className="text-[10px] text-lab-400">Fase 1 · Editor</div>
        </div>
      </div>
      <ProjectName />
      <Sep />
      <Btn title="Novo projeto" onClick={() => { if (!st.dirty || confirm('Descartar alterações não guardadas?')) st.newProject(); }}><FilePlus2 /></Btn>
      <Btn title="Projetos e exemplos" onClick={onOpenProjects}><FolderOpen /></Btn>
      <Btn title="Guardar (Ctrl+S)" onClick={saveCurrent}><Save />{st.dirty && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-amber-400" />}</Btn>
      <Sep />
      <Btn title="Desfazer (Ctrl+Z)" onClick={st.undo} disabled={!st.past.length}><Undo2 /></Btn>
      <Btn title="Refazer (Ctrl+Y)" onClick={st.redo} disabled={!st.future.length}><Redo2 /></Btn>
      <Sep />
      <div className="hidden items-center gap-0.5 rounded-md bg-lab-850 p-0.5 md:flex">
        <Tool active={st.tool === 'select'} title="Selecionar / mover (V)" onClick={() => st.setTool('select')}><MousePointer2 /></Tool>
        <Tool active={st.tool === 'wire'} title="Ligação / fio (W)" onClick={() => st.setTool('wire')}><Spline /></Tool>
        <Tool active={st.tool === 'pan'} title="Mover vista (H)" onClick={() => st.setTool('pan')}><Hand /></Tool>
      </div>
      <WireColorPicker />
      <Sep />
      <Btn title="Afastar" onClick={() => zoom(1 / 1.25)}><ZoomOut /></Btn>
      <button onClick={() => st.setView({ zoom: 2 })} className="hidden w-12 rounded px-1 py-1 text-center font-mono text-[12px] text-lab-200 hover:bg-lab-800 sm:block" title="Repor zoom (200 %)">{Math.round(st.view.zoom * 50)}%</button>
      <Btn title="Aproximar" onClick={() => zoom(1.25)}><ZoomIn /></Btn>
      <Btn title="Ajustar ao circuito (F)" onClick={() => st.fitToContent(canvasSize.w, canvasSize.h)}><Maximize /></Btn>
      <Sep />
      <Btn title="Grelha" active={st.showGrid} onClick={() => st.set({ showGrid: !st.showGrid })}><Grid3x3 /></Btn>
      <Btn title="Encaixar na grelha (0,1″)" active={st.snapToGrid} onClick={() => st.set({ snapToGrid: !st.snapToGrid })}><Magnet /></Btn>
      <Btn title="Mostrar etiquetas" active={st.showLabels} onClick={() => st.set({ showLabels: !st.showLabels })}><Tag /></Btn>

      <div className="flex-1" />

      <button
        onClick={() => st.notify('Motor de simulação ainda não implementado (Fase 2). A verificação topológica já está ativa no separador “Erros e avisos”.', 'warn')}
        className="flex items-center gap-1.5 rounded-md bg-emerald-600/90 px-3 py-1.5 text-[12.5px] font-semibold text-white shadow hover:bg-emerald-500" title="Executar simulação (disponível na Fase 2)"
      ><Play className="h-4 w-4" fill="currentColor" /><span className="hidden lg:inline">Simular</span></button>
      <button disabled className="flex items-center gap-1.5 rounded-md bg-lab-800 px-2.5 py-1.5 text-[12.5px] text-lab-500" title="Parar simulação"><Square className="h-3.5 w-3.5" fill="currentColor" /></button>

      <div className="relative">
        <button onClick={() => setExportOpen((o) => !o)} className="ml-1 flex items-center gap-1 rounded-md px-2.5 py-1.5 text-[12.5px] text-lab-200 hover:bg-lab-800"><Download className="h-4 w-4" /><span className="hidden lg:inline">Exportar</span><ChevronDown className="h-3 w-3" /></button>
        {exportOpen && <ExportMenu onClose={() => setExportOpen(false)} onImport={() => fileRef.current?.click()} />}
      </div>
      <input ref={fileRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
      <Sep />
      <Btn title="Biblioteca" active={st.leftOpen} onClick={() => st.set({ leftOpen: !st.leftOpen })}><PanelLeft /></Btn>
      <Btn title="Painel inferior" active={st.bottomOpen} onClick={() => st.set({ bottomOpen: !st.bottomOpen })}><PanelBottom /></Btn>
      <Btn title="Propriedades" active={st.rightOpen} onClick={() => st.set({ rightOpen: !st.rightOpen })}><PanelRight /></Btn>
    </header>
  );
}

function ExportMenu({ onClose, onImport }: { onClose: () => void; onImport: () => void }) {
  const doc = useEditor((s) => s.doc);
  useEffect(() => {
    const h = (e: PointerEvent) => { if (!(e.target as Element).closest('[data-export-menu]')) onClose(); };
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [onClose]);
  const item = (label: string, sub: string, fn: () => void) => (
    <button onClick={() => { fn(); onClose(); }} className="block w-full rounded px-3 py-1.5 text-left hover:bg-lab-700">
      <div className="text-[12.5px] text-lab-100">{label}</div><div className="text-[11px] text-lab-400">{sub}</div>
    </button>
  );
  return (
    <div data-export-menu className="absolute right-0 top-9 z-40 w-60 rounded-lg border border-lab-600 bg-lab-850 p-1 shadow-2xl">
      {item('Diagrama SVG', 'Vetorial, para documentação', () => canvasWorldGroup && exportSVG(doc, canvasWorldGroup))}
      {item('Imagem PNG', 'Alta resolução (4×)', () => canvasWorldGroup && exportPNG(doc, canvasWorldGroup))}
      {item('Lista de materiais (BOM)', 'CSV — abre no Excel', () => exportBOM(doc))}
      {item('Projeto (.json)', 'Para partilhar ou guardar', () => exportJSON(doc))}
      <div className="my-1 h-px bg-lab-700" />
      {item('Importar projeto…', 'Ficheiro .electrolab.json', onImport)}
    </div>
  );
}

function ProjectName() {
  const name = useEditor((s) => s.doc.name);
  const rename = useEditor((s) => s.rename);
  const [v, setV] = useState(name);
  useEffect(() => setV(name), [name]);
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v.trim() && v !== name && rename(v.trim())} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className="w-32 rounded-md border border-transparent bg-transparent px-2 py-1 text-[13px] font-medium text-lab-100 hover:border-lab-600 focus:border-accent focus:bg-lab-950 focus:outline-none lg:w-56" title="Nome do projeto" />
  );
}

function WireColorPicker() {
  const color = useEditor((s) => s.wireColor);
  const setC = useEditor((s) => s.setWireColorTool);
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="ml-1 flex items-center gap-1 rounded-md px-1.5 py-1.5 hover:bg-lab-800" title="Cor dos novos fios">
        <span className="h-4 w-4 rounded-full ring-1 ring-black/50" style={{ background: color }} /><ChevronDown className="h-3 w-3 text-lab-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-40 grid w-40 grid-cols-6 gap-1.5 rounded-lg border border-lab-600 bg-lab-850 p-2 shadow-2xl" onMouseLeave={() => setOpen(false)}>
          {WIRE_COLORS.map((c) => <button key={c} onClick={() => { setC(c); setOpen(false); }} className={`h-5 w-5 rounded-full ring-1 ${c === color ? 'ring-2 ring-accent' : 'ring-black/40'}`} style={{ background: c }} />)}
        </div>
      )}
    </div>
  );
}

const Sep = () => <div className="mx-1 hidden h-6 w-px bg-lab-700 sm:block" />;

function Btn({ title, onClick, children, disabled, active }: { title: string; onClick: () => void; children: React.ReactNode; disabled?: boolean; active?: boolean }) {
  return (
    <button title={title} onClick={onClick} disabled={disabled}
      className={`relative rounded-md p-1.5 [&>svg]:h-[18px] [&>svg]:w-[18px] ${disabled ? 'text-lab-600' : active ? 'bg-lab-800 text-accent' : 'text-lab-200 hover:bg-lab-800 hover:text-white'}`}>
      {children}
    </button>
  );
}
function Tool({ title, onClick, children, active }: { title: string; onClick: () => void; children: React.ReactNode; active: boolean }) {
  return <button title={title} onClick={onClick} className={`rounded p-1.5 [&>svg]:h-4 [&>svg]:w-4 ${active ? 'bg-accent text-white' : 'text-lab-300 hover:bg-lab-700'}`}>{children}</button>;
}

