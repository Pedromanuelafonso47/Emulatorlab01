import { useEffect, useRef, useState } from 'react';
import { Canvas, canvasSize } from '@/editor/Canvas';
import { LibraryPanel } from '@/ui/LibraryPanel';
import { PropertiesPanel } from '@/ui/PropertiesPanel';
import { BottomPanel } from '@/ui/BottomPanel';
import { TopBar } from '@/ui/TopBar';
import { ProjectsDialog } from '@/ui/ProjectsDialog';
import { Toast } from '@/ui/Toast';
import { useShortcuts } from '@/ui/useShortcuts';
import { useEditor } from '@/store/editor';
import { LabDefs } from '@/library/render/primitives';
import { lastProjectId, loadProject, saveProject } from '@/persistence/projects';
import { EXAMPLES } from '@/persistence/examples';
import { PanelBottom } from 'lucide-react';

let booted = false;
function useBootstrap() {
  useEffect(() => {
    if (booted) return;
    booted = true;
    const st = useEditor.getState();
    const exParam = new URLSearchParams(location.search).get('example');
    const ex = exParam && EXAMPLES.find((e) => e.id === exParam);
    if (ex) { st.loadDocument(ex.build()); st.log('info', 'Exemplo aberto: ' + ex.name); setTimeout(() => useEditor.getState().fitToContent(canvasSize.w, canvasSize.h), 50); return; }
    const id = lastProjectId();
    const p = id ? loadProject(id) : null;
    if (p) { st.loadDocument(p.doc, p.id); st.log('info', `Projeto “${p.name}” restaurado`); }
    else { st.loadDocument(EXAMPLES[1].build()); st.log('info', 'Bem-vindo ao ElectroLab! Exemplo inicial carregado.'); }
    setTimeout(() => useEditor.getState().fitToContent(canvasSize.w, canvasSize.h), 50);
  }, []);
  // Autosave (debounced) of the current project
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    return useEditor.subscribe((s, prev) => {
      if (s.doc === prev.doc || !s.dirty) return;
      clearTimeout(t);
      t = setTimeout(() => { try { const c = useEditor.getState(); saveProject(c.projectId, c.doc); c.markSaved(); } catch { /* quota */ } }, 1500);
    });
  }, []);
}

export default function App() {
  useShortcuts();
  useBootstrap();
  const [projectsOpen, setProjectsOpen] = useState(false);
  const leftOpen = useEditor((s) => s.leftOpen);
  const rightOpen = useEditor((s) => s.rightOpen);
  const bottomOpen = useEditor((s) => s.bottomOpen);
  const set = useEditor((s) => s.set);
  const [bottomH, setBottomH] = useState(190);
  const drag = useRef<{ y: number; h: number } | null>(null);

  useEffect(() => {
    if (window.innerWidth < 1024) set({ rightOpen: false, bottomOpen: false });
    if (window.innerWidth < 700) set({ leftOpen: false });
  }, [set]);

  return (
    <div className="flex h-full flex-col bg-lab-950 text-lab-100">
      <LabDefs />
      <TopBar onOpenProjects={() => setProjectsOpen(true)} />
      <div className="relative flex min-h-0 flex-1">
        {leftOpen && (
          <aside className="absolute inset-y-0 left-0 z-20 w-[272px] shrink-0 border-r border-lab-700 bg-lab-900 shadow-2xl lg:static lg:shadow-none">
            <LibraryPanel />
          </aside>
        )}
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="relative min-h-0 flex-1"><Canvas /></div>
          {bottomOpen ? (
            <div className="relative shrink-0 border-t border-lab-700 bg-lab-900" style={{ height: bottomH }}>
              <div className="absolute -top-1 left-0 right-0 z-10 h-2 cursor-row-resize"
                onPointerDown={(e) => { drag.current = { y: e.clientY, h: bottomH }; (e.target as Element).setPointerCapture(e.pointerId); }}
                onPointerMove={(e) => drag.current && setBottomH(Math.max(90, Math.min(window.innerHeight * 0.6, drag.current.h - (e.clientY - drag.current.y))))}
                onPointerUp={() => (drag.current = null)} />
              <BottomPanel />
            </div>
          ) : (
            <button onClick={() => set({ bottomOpen: true })} className="absolute bottom-2 left-2 z-10 flex items-center gap-1.5 rounded-md bg-lab-900/90 px-2.5 py-1.5 text-[12px] text-lab-200 shadow ring-1 ring-lab-600 hover:text-white">
              <PanelBottom className="h-4 w-4" />Consola e avisos
            </button>
          )}
        </main>
        {rightOpen && (
          <aside className="absolute inset-y-0 right-0 z-20 w-[300px] shrink-0 overflow-y-auto border-l border-lab-700 bg-lab-900 shadow-2xl lg:static lg:shadow-none">
            <PropertiesPanel />
          </aside>
        )}
      </div>
      <Toast />
      {projectsOpen && <ProjectsDialog onClose={() => setProjectsOpen(false)} />}
    </div>
  );
}
