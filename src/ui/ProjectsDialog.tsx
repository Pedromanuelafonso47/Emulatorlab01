import { useState } from 'react';
import { X, Trash2, Copy, FolderOpen, Sparkles } from 'lucide-react';
import { useEditor } from '@/store/editor';
import { deleteProject, listProjects, saveProject } from '@/persistence/projects';
import { EXAMPLES } from '@/persistence/examples';
import { canvasSize } from '@/editor/Canvas';
import { uid } from '@/domain/types';
import { CloudSection } from './CloudSection';

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const [projects, setProjects] = useState(listProjects());
  const st = useEditor.getState();
  const open = (fn: () => void) => {
    if (st.dirty && !confirm('Existem alterações não guardadas. Continuar?')) return;
    fn();
    setTimeout(() => useEditor.getState().fitToContent(canvasSize.w, canvasSize.h), 0);
    onClose();
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onPointerDown={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-lab-600 bg-lab-900 shadow-2xl" onPointerDown={(e) => e.stopPropagation()}>
        <div className="flex items-center border-b border-lab-700 px-5 py-3">
          <div className="text-[15px] font-semibold text-white">Projetos</div>
          <div className="flex-1" />
          <button onClick={onClose} className="rounded p-1 text-lab-400 hover:bg-lab-800 hover:text-white"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid flex-1 gap-0 overflow-y-auto md:grid-cols-2">
          <div className="border-b border-lab-700 p-4 md:border-b-0 md:border-r">
            <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-lab-400"><Sparkles className="h-3.5 w-3.5" />Exemplos</div>
            <div className="space-y-2">
              {EXAMPLES.map((ex) => (
                <button key={ex.id} onClick={() => open(() => { st.loadDocument(ex.build()); st.log('info', `Exemplo aberto: ${ex.name}`); })}
                  className="block w-full rounded-lg border border-lab-700 bg-lab-850 p-3 text-left hover:border-accent/70 hover:bg-lab-800">
                  <div className="text-[13px] font-semibold text-lab-100">{ex.name}</div>
                  <div className="mt-0.5 text-[12px] leading-snug text-lab-400">{ex.description}</div>
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-lab-400">Os meus projetos (guardados neste navegador)</div>
            {projects.length === 0 && <div className="rounded-lg border border-dashed border-lab-600 p-4 text-[12.5px] text-lab-400">Ainda não guardou nenhum projeto. Use <b>Guardar</b> (Ctrl+S). Com a conta na nuvem (abaixo) pode também guardar e partilhar projetos.</div>}
            <div className="mb-4"><CloudSection onOpened={onClose} /></div>
            <div className="space-y-1.5">
              {projects.map((p) => (
                <div key={p.id} className="group flex items-center gap-2 rounded-lg border border-lab-700 bg-lab-850 px-3 py-2 hover:border-lab-500">
                  <button className="min-w-0 flex-1 text-left" onClick={() => open(() => st.loadDocument(p.doc, p.id))}>
                    <div className="truncate text-[13px] font-medium text-lab-100">{p.name}</div>
                    <div className="text-[11px] text-lab-500">{new Date(p.updatedAt).toLocaleString('pt-PT')} · {Object.keys(p.doc.components).length} componentes</div>
                  </button>
                  <button title="Abrir" onClick={() => open(() => st.loadDocument(p.doc, p.id))} className="rounded p-1 text-lab-400 hover:bg-lab-700 hover:text-white"><FolderOpen className="h-4 w-4" /></button>
                  <button title="Duplicar" onClick={() => { saveProject(uid('prj'), { ...p.doc, name: `${p.name} (cópia)` }); setProjects(listProjects()); }} className="rounded p-1 text-lab-400 hover:bg-lab-700 hover:text-white"><Copy className="h-4 w-4" /></button>
                  <button title="Apagar" onClick={() => { if (confirm(`Apagar “${p.name}”?`)) { deleteProject(p.id); setProjects(listProjects()); } }} className="rounded p-1 text-lab-400 hover:bg-red-500/20 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
