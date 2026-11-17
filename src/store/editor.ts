import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import {
  emptyDocument, uid, type CircuitDocument, type ComponentInstance, type Endpoint, type Point, type PropValue,
  type Rotation, type Wire, type WireStyle,
} from '@/domain/types';
import { rectsIntersect, snap, transformRect, unionRects, type Rect } from '@/domain/geometry';
import { defaultProps, getBBox, getDef } from '@/library/registry';

export type Tool = 'select' | 'wire' | 'pan';
export type BottomTab = 'console' | 'problems' | 'netlist' | 'measure' | 'sim' | 'analysis' | 'scope' | 'code' | 'serial' | 'learn';

export interface LogEntry { id: number; t: number; level: 'info' | 'warn' | 'error' | 'ok'; msg: string }
export interface Selection { comps: string[]; wires: string[]; junctions: string[] }
export interface Drawing { from: Endpoint; points: Point[]; style: WireStyle; color: string }

export const WIRE_COLORS = ['#e53935', '#212121', '#1e88e5', '#43a047', '#fdd835', '#fb8c00', '#8e24aa', '#ffffff', '#6d4c41', '#00acc1', '#9e9e9e', '#ec407a'];

interface EditorState {
  doc: CircuitDocument;
  projectId: string;
  past: CircuitDocument[];
  future: CircuitDocument[];
  gestureStart: CircuitDocument | null;
  dirty: boolean;

  selection: Selection;
  view: { x: number; y: number; zoom: number };
  tool: Tool;
  wireStyle: WireStyle;
  wireColor: string;
  drawing: Drawing | null;
  snapToGrid: boolean;
  showGrid: boolean;
  showLabels: boolean;
  hoveredNet: string | null;
  highlightComps: string[];

  leftOpen: boolean;
  rightOpen: boolean;
  bottomOpen: boolean;
  bottomTab: BottomTab;
  favorites: string[];
  logs: LogEntry[];
  toast: { msg: string; level: LogEntry['level']; t: number } | null;

  // document mutations
  update: (fn: (d: Draft<CircuitDocument>) => void, history?: boolean) => void;
  beginGesture: () => void;
  endGesture: (label?: string) => void;
  undo: () => void;
  redo: () => void;

  addComponent: (type: string, at: Point) => string | null;
  moveSelectionLive: (dx: number, dy: number, base: CircuitDocument) => void;
  rotateSelection: (dir?: 1 | -1) => void;
  flipSelection: () => void;
  deleteSelection: () => void;
  setProps: (id: string, patch: Record<string, PropValue>) => void;
  setLabel: (id: string, label: string) => void;
  addWire: (from: Endpoint, to: Endpoint, points: Point[], opts?: { style?: WireStyle; color?: string }) => string | null;
  splitWire: (wireId: string, at: Point, segment: number) => string | null;
  setWireColor: (ids: string[], color: string) => void;
  setWireStyle: (ids: string[], style: WireStyle) => void;
  moveWirePoint: (wireId: string, index: number, p: Point) => void;
  removeWirePoint: (wireId: string, index: number) => void;
  moveJunction: (id: string, p: Point) => void;

  select: (sel: Partial<Selection>, additive?: boolean) => void;
  toggleComp: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;
  selectInRect: (r: Rect, additive: boolean) => void;

  copy: () => void;
  paste: (at?: Point) => void;
  duplicate: () => void;

  setView: (v: Partial<EditorState['view']>) => void;
  zoomAt: (factor: number, screen: Point) => void;
  fitToContent: (vw: number, vh: number) => void;

  setTool: (t: Tool) => void;
  setWireStyleTool: (s: WireStyle) => void;
  setWireColorTool: (c: string) => void;
  setDrawing: (d: Drawing | null) => void;
  set: (p: Partial<EditorState>) => void;
  toggleFavorite: (type: string) => void;

  log: (level: LogEntry['level'], msg: string) => void;
  notify: (msg: string, level?: LogEntry['level']) => void;

  loadDocument: (doc: CircuitDocument, projectId?: string) => void;
  newProject: () => void;
  rename: (name: string) => void;
  markSaved: () => void;
}

const HISTORY_LIMIT = 150;
let logId = 0;
let clipboard: { comps: ComponentInstance[]; wires: Wire[]; junctions: { id: string; x: number; y: number }[] } | null = null;

function nextLabel(doc: CircuitDocument, prefix: string): string {
  let max = 0;
  const re = new RegExp(`^${prefix}(\\d+)$`);
  for (const c of Object.values(doc.components)) { const m = c.label.match(re); if (m) max = Math.max(max, +m[1]); }
  return `${prefix}${max + 1}`;
}

export function compRect(c: ComponentInstance): Rect | null {
  const def = getDef(c.type);
  if (!def) return null;
  return transformRect(getBBox(def, c.props), c, c.rotation, c.flip);
}

/** Wires whose both ends are attached to the given component set. */
function internalWires(doc: CircuitDocument, comps: Set<string>, junctions: Set<string>) {
  const inSet = (e: Endpoint) => (e.kind === 'pin' ? comps.has(e.compId) : junctions.has(e.junctionId));
  return Object.values(doc.wires).filter((w) => inSet(w.from) && inSet(w.to));
}

const loadFavs = (): string[] => {
  try { return JSON.parse(localStorage.getItem('electrolab.favorites') ?? '[]'); } catch { return []; }
};

export const useEditor = create<EditorState>()((set, get) => ({
  doc: emptyDocument(),
  projectId: uid('prj'),
  past: [],
  future: [],
  gestureStart: null,
  dirty: false,

  selection: { comps: [], wires: [], junctions: [] },
  view: { x: 0, y: 0, zoom: 2 },
  tool: 'select',
  wireStyle: 'wire',
  wireColor: WIRE_COLORS[0],
  drawing: null,
  snapToGrid: true,
  showGrid: true,
  showLabels: true,
  hoveredNet: null,
  highlightComps: [],

  leftOpen: true,
  rightOpen: true,
  bottomOpen: true,
  bottomTab: 'console',
  favorites: loadFavs(),
  logs: [],
  toast: null,

  update: (fn, history = true) => {
    const { doc, past, gestureStart } = get();
    const next = produce(doc, fn);
    if (next === doc) return;
    if (history && !gestureStart) set({ doc: next, past: [...past, doc].slice(-HISTORY_LIMIT), future: [], dirty: true });
    else set({ doc: next, dirty: true });
  },
  beginGesture: () => set({ gestureStart: get().doc }),
  endGesture: () => {
    const { gestureStart, doc, past } = get();
    if (gestureStart && gestureStart !== doc) set({ past: [...past, gestureStart].slice(-HISTORY_LIMIT), future: [] });
    set({ gestureStart: null });
  },
  undo: () => {
    const { past, doc, future } = get();
    if (!past.length) return;
    const prev = past[past.length - 1];
    set({ doc: prev, past: past.slice(0, -1), future: [doc, ...future], dirty: true, drawing: null });
    get().select({ comps: get().selection.comps.filter((id) => prev.components[id]), wires: get().selection.wires.filter((id) => prev.wires[id]), junctions: [] });
  },
  redo: () => {
    const { past, doc, future } = get();
    if (!future.length) return;
    const nxt = future[0];
    set({ doc: nxt, past: [...past, doc], future: future.slice(1), dirty: true, drawing: null });
  },

  addComponent: (type, at) => {
    const def = getDef(type);
    if (!def) return null;
    if (def.comingSoon) { get().notify(`${def.name}: disponível na ${def.comingSoon}.`, 'warn'); return null; }
    if (def.tool) { get().setWireStyleTool(def.tool.style); return null; }
    const id = uid('c');
    const pos = get().snapToGrid ? { x: snap(at.x), y: snap(at.y) } : at;
    get().update((d) => {
      d.components[id] = { id, type, label: nextLabel(d as CircuitDocument, def.prefix), x: pos.x, y: pos.y, rotation: 0, props: defaultProps(def) };
    });
    set({ selection: { comps: [id], wires: [], junctions: [] } });
    get().log('info', `Adicionado ${def.name} (${get().doc.components[id].label})`);
    return id;
  },

  moveSelectionLive: (dx, dy, base) => {
    const { selection } = get();
    const comps = new Set(selection.comps), juncs = new Set(selection.junctions);
    const moving = internalWires(base, comps, juncs);
    set({
      doc: produce(base, (d) => {
        for (const id of comps) { const c = d.components[id]; if (c) { c.x += dx; c.y += dy; } }
        for (const id of juncs) { const j = d.junctions[id]; if (j) { j.x += dx; j.y += dy; } }
        for (const w of moving) for (const p of d.wires[w.id].points) { p.x += dx; p.y += dy; }
      }),
      dirty: true,
    });
  },

  rotateSelection: (dir = 1) => {
    const { selection } = get();
    if (!selection.comps.length) return;
    get().update((d) => {
      for (const id of selection.comps) {
        const c = d.components[id];
        if (c) c.rotation = (((c.rotation + dir) % 4) + 4) % 4 as Rotation;
      }
    });
  },
  flipSelection: () => {
    const { selection } = get();
    get().update((d) => { for (const id of selection.comps) { const c = d.components[id]; if (c) c.flip = !c.flip; } });
  },

  deleteSelection: () => {
    const { selection, doc } = get();
    const comps = new Set(selection.comps), wires = new Set(selection.wires), juncs = new Set(selection.junctions);
    if (!comps.size && !wires.size && !juncs.size) return;
    const touches = (e: Endpoint) => (e.kind === 'pin' ? comps.has(e.compId) : juncs.has(e.junctionId));
    get().update((d) => {
      for (const id of comps) delete d.components[id];
      for (const w of Object.values(doc.wires)) if (wires.has(w.id) || touches(w.from) || touches(w.to)) delete d.wires[w.id];
      for (const id of juncs) delete d.junctions[id];
      // Remove orphan junctions
      const used = new Set<string>();
      for (const w of Object.values(d.wires)) { if (w.from.kind === 'junction') used.add(w.from.junctionId); if (w.to.kind === 'junction') used.add(w.to.junctionId); }
      for (const id of Object.keys(d.junctions)) if (!used.has(id)) delete d.junctions[id];
    });
    get().log('info', `Removidos ${comps.size} componente(s) e ${wires.size} fio(s)`);
    set({ selection: { comps: [], wires: [], junctions: [] } });
  },

  setProps: (id, patch) => get().update((d) => { const c = d.components[id]; if (c) Object.assign(c.props, patch); }),
  setLabel: (id, label) => get().update((d) => { const c = d.components[id]; if (c) c.label = label; }),

  addWire: (from, to, points, opts) => {
    const same = from.kind === to.kind && JSON.stringify(from) === JSON.stringify(to);
    if (same) return null;
    const id = uid('w');
    const { wireColor, wireStyle } = get();
    get().update((d) => { d.wires[id] = { id, from, to, points, color: opts?.color ?? wireColor, style: opts?.style ?? wireStyle }; });
    return id;
  },

  splitWire: (wireId, at, segment) => {
    const w = get().doc.wires[wireId];
    if (!w) return null;
    const jid = uid('j');
    const p = get().snapToGrid ? { x: snap(at.x), y: snap(at.y) } : at;
    get().update((d) => {
      d.junctions[jid] = { id: jid, x: p.x, y: p.y };
      const before = w.points.slice(0, segment), after = w.points.slice(segment);
      d.wires[wireId] = { ...w, to: { kind: 'junction', junctionId: jid }, points: before };
      const nid = uid('w');
      d.wires[nid] = { ...w, id: nid, from: { kind: 'junction', junctionId: jid }, points: after };
    });
    return jid;
  },

  setWireColor: (ids, color) => { get().update((d) => { for (const id of ids) if (d.wires[id]) d.wires[id].color = color; }); set({ wireColor: color }); },
  setWireStyle: (ids, style) => get().update((d) => { for (const id of ids) if (d.wires[id]) d.wires[id].style = style; }),
  moveWirePoint: (wireId, index, p) => get().update((d) => { const w = d.wires[wireId]; if (w?.points[index]) w.points[index] = p; }),
  removeWirePoint: (wireId, index) => get().update((d) => { const w = d.wires[wireId]; if (w) w.points.splice(index, 1); }),
  moveJunction: (id, p) => get().update((d) => { const j = d.junctions[id]; if (j) { j.x = p.x; j.y = p.y; } }),

  select: (sel, additive = false) => {
    const cur = get().selection;
    if (additive) {
      const merge = (a: string[], b?: string[]) => [...new Set([...a, ...(b ?? [])])];
      set({ selection: { comps: merge(cur.comps, sel.comps), wires: merge(cur.wires, sel.wires), junctions: merge(cur.junctions, sel.junctions) } });
    } else set({ selection: { comps: sel.comps ?? [], wires: sel.wires ?? [], junctions: sel.junctions ?? [] } });
  },
  toggleComp: (id) => {
    const s = get().selection;
    set({ selection: { ...s, comps: s.comps.includes(id) ? s.comps.filter((c) => c !== id) : [...s.comps, id] } });
  },
  clearSelection: () => set({ selection: { comps: [], wires: [], junctions: [] } }),
  selectAll: () => {
    const d = get().doc;
    set({ selection: { comps: Object.keys(d.components), wires: Object.keys(d.wires), junctions: Object.keys(d.junctions) } });
  },
  selectInRect: (r, additive) => {
    const d = get().doc;
    const comps = Object.values(d.components).filter((c) => { const b = compRect(c); return b && rectsIntersect(r, b) && !(getDef(c.type)?.substrate && !(b.x >= r.x && b.y >= r.y && b.x + b.w <= r.x + r.w && b.y + b.h <= r.y + r.h)); }).map((c) => c.id);
    const juncs = Object.values(d.junctions).filter((j) => j.x >= r.x && j.x <= r.x + r.w && j.y >= r.y && j.y <= r.y + r.h).map((j) => j.id);
    const cs = new Set(comps), js = new Set(juncs);
    const wires = internalWires(d, cs, js).map((w) => w.id);
    get().select({ comps, wires, junctions: juncs }, additive);
  },

  copy: () => {
    const { selection, doc } = get();
    if (!selection.comps.length) return;
    const cs = new Set(selection.comps), js = new Set(selection.junctions);
    clipboard = {
      comps: selection.comps.map((id) => doc.components[id]).filter(Boolean),
      wires: internalWires(doc, cs, js),
      junctions: selection.junctions.map((id) => doc.junctions[id]).filter(Boolean),
    };
    get().notify(`Copiados ${clipboard.comps.length} componente(s)`, 'info');
  },
  paste: (at) => {
    if (!clipboard || !clipboard.comps.length) return;
    const cb = clipboard;
    const r = unionRects(cb.comps.map(compRect).filter(Boolean) as Rect[])!;
    const dx = at ? snap(at.x - (r.x + r.w / 2)) : 40, dy = at ? snap(at.y - (r.y + r.h / 2)) : 40;
    const idMap = new Map<string, string>();
    const newComps: string[] = [], newWires: string[] = [], newJ: string[] = [];
    get().update((d) => {
      for (const c of cb.comps) {
        const id = uid('c'); idMap.set(c.id, id); newComps.push(id);
        const def = getDef(c.type)!;
        d.components[id] = { ...structuredClone(c), id, x: c.x + dx, y: c.y + dy, label: nextLabel(d as CircuitDocument, def.prefix) };
      }
      for (const j of cb.junctions) { const id = uid('j'); idMap.set(j.id, id); newJ.push(id); d.junctions[id] = { id, x: j.x + dx, y: j.y + dy }; }
      const mapEp = (e: Endpoint): Endpoint => (e.kind === 'pin' ? { ...e, compId: idMap.get(e.compId)! } : { kind: 'junction', junctionId: idMap.get(e.junctionId)! });
      for (const w of cb.wires) {
        const id = uid('w'); newWires.push(id);
        d.wires[id] = { ...structuredClone(w), id, from: mapEp(w.from), to: mapEp(w.to), points: w.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
      }
    });
    set({ selection: { comps: newComps, wires: newWires, junctions: newJ } });
    clipboard = { comps: newComps.map((id) => get().doc.components[id]), wires: newWires.map((id) => get().doc.wires[id]), junctions: newJ.map((id) => get().doc.junctions[id]) };
  },
  duplicate: () => { get().copy(); get().paste(); },

  setView: (v) => set({ view: { ...get().view, ...v } }),
  zoomAt: (factor, s) => {
    const { view } = get();
    const zoom = Math.max(0.15, Math.min(14, view.zoom * factor));
    const k = zoom / view.zoom;
    set({ view: { zoom, x: s.x - (s.x - view.x) * k, y: s.y - (s.y - view.y) * k } });
  },
  fitToContent: (vw, vh) => {
    const rects = Object.values(get().doc.components).map(compRect).filter(Boolean) as Rect[];
    const r = unionRects(rects);
    if (!r) { set({ view: { x: vw / 2, y: vh / 2, zoom: 2 } }); return; }
    const pad = 40;
    const zoom = Math.max(0.2, Math.min(6, Math.min((vw - pad * 2) / Math.max(r.w, 1), (vh - pad * 2) / Math.max(r.h, 1))));
    set({ view: { zoom, x: vw / 2 - (r.x + r.w / 2) * zoom, y: vh / 2 - (r.y + r.h / 2) * zoom } });
  },

  setTool: (t) => set({ tool: t, drawing: t === 'wire' ? get().drawing : null }),
  setWireStyleTool: (s) => { set({ wireStyle: s, tool: 'wire' }); get().notify('Modo de ligação: clique num pino para começar o fio.', 'info'); },
  setWireColorTool: (c) => set({ wireColor: c }),
  setDrawing: (d) => set({ drawing: d }),
  set: (p) => set(p),
  toggleFavorite: (type) => {
    const f = get().favorites;
    const next = f.includes(type) ? f.filter((x) => x !== type) : [...f, type];
    set({ favorites: next });
    try { localStorage.setItem('electrolab.favorites', JSON.stringify(next)); } catch { /* ignore */ }
  },

  log: (level, msg) => set({ logs: [...get().logs, { id: ++logId, t: Date.now(), level, msg }].slice(-400) }),
  notify: (msg, level = 'info') => { set({ toast: { msg, level, t: Date.now() } }); get().log(level, msg); },

  loadDocument: (doc, projectId) => set({
    doc, projectId: projectId ?? uid('prj'), past: [], future: [], dirty: false, drawing: null,
    selection: { comps: [], wires: [], junctions: [] },
  }),
  newProject: () => { get().loadDocument(emptyDocument()); get().log('info', 'Novo projeto criado'); },
  rename: (name) => get().update((d) => { d.name = name; }),
  markSaved: () => set({ dirty: false }),
}));

/** Selector helper for the currently selected single component. */
export const selectedComponent = (s: EditorState) => (s.selection.comps.length === 1 ? s.doc.components[s.selection.comps[0]] : undefined);
