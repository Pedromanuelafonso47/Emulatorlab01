import { useMemo, useState } from 'react';
import { Search, Star, X, ChevronDown, ChevronRight } from 'lucide-react';
import { allDefs, CATEGORIES } from '@/library';
import type { CategoryId, ComponentDef } from '@/library/types';
import { useEditor } from '@/store/editor';
import { canvasSize } from '@/editor/Canvas';
import { Thumb } from './Thumb';

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function LibraryPanel() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoryId | 'all' | 'fav'>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const favorites = useEditor((s) => s.favorites);
  const defs = useMemo(() => allDefs(), []);

  const filtered = useMemo(() => {
    const nq = norm(q.trim());
    return defs.filter((d) => {
      if (cat === 'fav' && !favorites.includes(d.type)) return false;
      if (cat !== 'all' && cat !== 'fav' && d.category !== cat) return false;
      if (!nq) return true;
      return norm([d.name, d.description, d.subcategory ?? '', ...(d.tags ?? [])].join(' ')).includes(nq);
    });
  }, [defs, q, cat, favorites]);

  const groups = useMemo(() => {
    const m = new Map<string, ComponentDef[]>();
    for (const d of filtered) {
      const c = CATEGORIES.find((x) => x.id === d.category)!;
      const key = cat === 'all' || cat === 'fav' ? c.name : d.subcategory ?? c.name;
      m.set(key, [...(m.get(key) ?? []), d]);
    }
    return [...m.entries()];
  }, [filtered, cat]);

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-lab-700 p-2.5">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-lab-400" />
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Pesquisar ${defs.length} componentes…`}
            className="w-full rounded-md border border-lab-600 bg-lab-900 py-1.5 pl-8 pr-7 text-[13px] text-lab-100 placeholder:text-lab-500 focus:border-accent focus:outline-none"
          />
          {q && <button onClick={() => setQ('')} className="absolute right-2 top-2 text-lab-400 hover:text-white"><X className="h-4 w-4" /></button>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>Todos</Chip>
          <Chip active={cat === 'fav'} onClick={() => setCat('fav')}><Star className="mr-0.5 inline h-3 w-3" />{favorites.length}</Chip>
          {CATEGORIES.map((c) => <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.short}</Chip>)}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-6 pt-1">
        {groups.length === 0 && <div className="p-4 text-center text-sm text-lab-400">{cat === 'fav' ? 'Ainda sem favoritos — clique na ★ de um componente.' : 'Nenhum componente encontrado.'}</div>}
        {groups.map(([name, items]) => (
          <div key={name} className="mt-2">
            <button onClick={() => setCollapsed((c) => ({ ...c, [name]: !c[name] }))} className="flex w-full items-center gap-1 px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-lab-400 hover:text-lab-200">
              {collapsed[name] ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}{name}
              <span className="ml-auto font-normal">{items.length}</span>
            </button>
            {!collapsed[name] && (
              <div className="grid grid-cols-2 gap-1.5">
                {items.map((d) => <Item key={d.type} def={d} fav={favorites.includes(d.type)} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`rounded px-2 py-0.5 text-[11.5px] transition ${active ? 'bg-accent text-white' : 'bg-lab-800 text-lab-300 hover:bg-lab-700 hover:text-white'}`}>{children}</button>
  );
}

function Item({ def, fav }: { def: ComponentDef; fav: boolean }) {
  const toggleFavorite = useEditor((s) => s.toggleFavorite);
  const disabled = !!def.comingSoon;
  const addAtCenter = () => {
    const st = useEditor.getState();
    if (def.tool) { st.setWireStyleTool(def.tool.style); return; }
    const v = st.view;
    st.addComponent(def.type, { x: (canvasSize.w / 2 - v.x) / v.zoom, y: (canvasSize.h / 2 - v.y) / v.zoom });
  };
  return (
    <div
      draggable={!disabled}
      onDragStart={(e) => { e.dataTransfer.setData('application/x-electrolab-part', def.type); e.dataTransfer.effectAllowed = 'copy'; }}
      onDoubleClick={addAtCenter}
      title={`${def.name}\n${def.description}${disabled ? `\n\nDisponível na ${def.comingSoon}.` : '\n\nArraste para o laboratório ou faça duplo clique.'}`}
      className={`group relative flex cursor-grab flex-col items-center rounded-md border border-lab-700 bg-lab-850 p-1.5 pt-2 transition hover:border-accent/70 hover:bg-lab-800 active:cursor-grabbing ${disabled ? 'opacity-45' : ''}`}
    >
      <div className="flex h-[58px] items-center justify-center rounded bg-[#e9edf2] px-1" style={{ width: '100%' }}>
        <Thumb def={def} size={54} />
      </div>
      <div className="mt-1 line-clamp-2 min-h-[28px] text-center text-[11px] leading-[14px] text-lab-200">{def.name}</div>
      {disabled && <span className="absolute left-1 top-1 rounded bg-amber-500/90 px-1 text-[9px] font-semibold text-black">{def.comingSoon}</span>}
      <button
        onClick={(e) => { e.stopPropagation(); toggleFavorite(def.type); }}
        className={`absolute right-1 top-1 rounded p-0.5 ${fav ? 'text-amber-400' : 'text-lab-500 opacity-0 group-hover:opacity-100'} hover:text-amber-300`}
        title={fav ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}
      >
        <Star className="h-3.5 w-3.5" fill={fav ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}
