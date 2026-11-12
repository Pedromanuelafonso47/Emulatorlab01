import { useEffect } from 'react';
import type { Point } from '@/domain/types';
import { useEditor, WIRE_COLORS } from '@/store/editor';
import { canvasSize } from './Canvas';

export interface MenuState { x: number; y: number; world: Point; target: 'component' | 'wire' | 'canvas' }

export function ContextMenu({ menu, onClose }: { menu: MenuState; onClose: () => void }) {
  const st = useEditor();
  useEffect(() => {
    const h = () => onClose();
    window.addEventListener('pointerdown', h);
    return () => window.removeEventListener('pointerdown', h);
  }, [onClose]);

  const item = (label: string, kbd: string, fn: () => void, danger = false) => (
    <button
      key={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => { fn(); onClose(); }}
      className={`flex w-full items-center justify-between gap-6 rounded px-2.5 py-1.5 text-left text-[12.5px] hover:bg-lab-700 ${danger ? 'text-red-300' : 'text-lab-100'}`}
    >
      <span>{label}</span><kbd className="font-mono text-[10.5px] text-lab-400">{kbd}</kbd>
    </button>
  );

  return (
    <div
      className="absolute z-30 min-w-[200px] rounded-lg border border-lab-600 bg-lab-850/95 p-1 shadow-2xl backdrop-blur"
      style={{ left: Math.min(menu.x, canvasSize.w - 210), top: Math.min(menu.y, canvasSize.h - 260) }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {menu.target === 'component' && <>
        {item('Rodar 90°', 'R', () => st.rotateSelection(1))}
        {item('Rodar −90°', 'Shift+R', () => st.rotateSelection(-1))}
        {item('Espelhar', 'F', () => st.flipSelection())}
        {item('Duplicar', 'Ctrl+D', () => st.duplicate())}
        {item('Copiar', 'Ctrl+C', () => st.copy())}
        <div className="my-1 h-px bg-lab-700" />
        {item('Apagar', 'Del', () => st.deleteSelection(), true)}
      </>}
      {menu.target === 'wire' && <>
        <div className="flex flex-wrap gap-1 px-2 py-1.5">
          {WIRE_COLORS.map((c) => (
            <button key={c} onClick={() => { st.setWireColor(st.selection.wires, c); onClose(); }} className="h-5 w-5 rounded-full ring-1 ring-black/40" style={{ background: c }} title={c} />
          ))}
        </div>
        <div className="my-1 h-px bg-lab-700" />
        {item('Apagar fio', 'Del', () => st.deleteSelection(), true)}
      </>}
      {menu.target === 'canvas' && <>
        {item('Colar aqui', 'Ctrl+V', () => st.paste(menu.world))}
        {item('Selecionar tudo', 'Ctrl+A', () => st.selectAll())}
        {item('Ajustar vista ao circuito', 'F', () => st.fitToContent(canvasSize.w, canvasSize.h))}
      </>}
    </div>
  );
}
