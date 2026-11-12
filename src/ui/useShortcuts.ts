import { useEffect } from 'react';
import { useEditor } from '@/store/editor';
import { canvasSize } from '@/editor/Canvas';
import { saveCurrent } from './TopBar';

export function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, select, [contenteditable]')) return;
      const st = useEditor.getState();
      const mod = e.ctrlKey || e.metaKey;
      const k = e.key.toLowerCase();
      if (mod && k === 'z' && !e.shiftKey) { e.preventDefault(); st.undo(); return; }
      if (mod && (k === 'y' || (k === 'z' && e.shiftKey))) { e.preventDefault(); st.redo(); return; }
      if (mod && k === 'c') { st.copy(); return; }
      if (mod && k === 'v') { e.preventDefault(); st.paste(); return; }
      if (mod && k === 'd') { e.preventDefault(); st.duplicate(); return; }
      if (mod && k === 'a') { e.preventDefault(); st.selectAll(); return; }
      if (mod && k === 's') { e.preventDefault(); saveCurrent(); return; }
      if (mod) return;
      switch (k) {
        case 'delete': case 'backspace':
          if (st.drawing) {
            e.preventDefault();
            if (st.drawing.points.length) st.setDrawing({ ...st.drawing, points: st.drawing.points.slice(0, -1) });
            else st.setDrawing(null);
          } else st.deleteSelection();
          break;
        case 'escape':
          if (st.drawing) st.setDrawing(null);
          else if (st.tool !== 'select') st.setTool('select');
          else st.clearSelection();
          break;
        case 'r': st.rotateSelection(e.shiftKey ? -1 : 1); break;
        case 'm': st.flipSelection(); break;
        case 'f': st.fitToContent(canvasSize.w, canvasSize.h); break;
        case 'w': st.setTool('wire'); break;
        case 'v': st.setTool('select'); break;
        case 'h': st.setTool('pan'); break;
        case '+': case '=': st.zoomAt(1.25, { x: canvasSize.w / 2, y: canvasSize.h / 2 }); break;
        case '-': st.zoomAt(0.8, { x: canvasSize.w / 2, y: canvasSize.h / 2 }); break;
        case 'arrowup': case 'arrowdown': case 'arrowleft': case 'arrowright': {
          if (!st.selection.comps.length) return;
          e.preventDefault();
          const step = e.shiftKey ? 50 : 10;
          const dx = k === 'arrowleft' ? -step : k === 'arrowright' ? step : 0;
          const dy = k === 'arrowup' ? -step : k === 'arrowdown' ? step : 0;
          st.beginGesture(); st.moveSelectionLive(dx, dy, st.doc); st.endGesture();
          break;
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
