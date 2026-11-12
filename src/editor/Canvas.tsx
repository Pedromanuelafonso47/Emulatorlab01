import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useEditor, compRect } from '@/store/editor';
import { useAnalysis } from '@/store/derived';
import { GRID, type CircuitDocument, type Endpoint, type Point } from '@/domain/types';
import { normRect, snap, type Rect } from '@/domain/geometry';
import { getDef } from '@/library/registry';
import { pinKey } from '@/engine/netlist';
import { collectPins, hitPin, hitWire, toPolyline, wirePath, type PinHit } from './geometry';
import { ComponentView, LabelView, WireView } from './Views';
import { ContextMenu, type MenuState } from './ContextMenu';

type Gesture =
  | { kind: 'pan'; sx: number; sy: number; vx: number; vy: number; button: number; moved: boolean; target: Element; cx: number; cy: number }
  | { kind: 'move'; start: Point; base: CircuitDocument; moved: boolean }
  | { kind: 'marquee'; start: Point; additive: boolean }
  | { kind: 'pendingPin'; pin: PinHit; sx: number; sy: number; additive: boolean }
  | { kind: 'wirePoint'; wireId: string; index: number; moved: boolean }
  | { kind: 'junction'; id: string }
  | { kind: 'pinch'; d0: number; z0: number; mid: Point; vx: number; vy: number };

const DRAG_THRESHOLD = 4;
export let canvasWorldGroup: SVGGElement | null = null;
export let canvasSize = { w: 1200, h: 800 };

export function Canvas() {
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const worldRef = useRef<SVGGElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const spaceDown = useRef(false);

  const doc = useEditor((s) => s.doc);
  const view = useEditor((s) => s.view);
  const selection = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const drawing = useEditor((s) => s.drawing);
  const showGrid = useEditor((s) => s.showGrid);
  const showLabels = useEditor((s) => s.showLabels);
  const hoveredNet = useEditor((s) => s.hoveredNet);
  const highlightComps = useEditor((s) => s.highlightComps);
  const { nl } = useAnalysis();

  const [cursor, setCursor] = useState<Point>({ x: 0, y: 0 });
  const [hover, setHover] = useState<PinHit | null>(null);
  const [hoverWire, setHoverWire] = useState<string | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [, setSize] = useState({ w: 1200, h: 800 });

  const pins = useMemo(() => collectPins(doc), [doc]);

  useEffect(() => { canvasWorldGroup = worldRef.current; });
  useEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height }); canvasSize = { w: r.width, h: r.height }; });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Centre the origin on first mount
  useEffect(() => {
    const r = wrapRef.current!.getBoundingClientRect();
    const st = useEditor.getState();
    if (Object.keys(st.doc.components).length) st.fitToContent(r.width, r.height);
    else st.setView({ x: r.width / 2, y: r.height / 2 });
  }, []);

  const toWorld = useCallback((clientX: number, clientY: number): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    const v = useEditor.getState().view;
    return { x: (clientX - r.left - v.x) / v.zoom, y: (clientY - r.top - v.y) / v.zoom };
  }, []);
  const toScreen = useCallback((clientX: number, clientY: number): Point => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: clientX - r.left, y: clientY - r.top };
  }, []);

  // Wheel zoom (non-passive)
  useEffect(() => {
    const el = svgRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const st = useEditor.getState();
      if (e.ctrlKey || Math.abs(e.deltaY) >= Math.abs(e.deltaX)) {
        const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018));
        st.zoomAt(factor, toScreen(e.clientX, e.clientY));
      } else st.setView({ x: st.view.x - e.deltaX, y: st.view.y - e.deltaY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [toScreen]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.code === 'Space' && !(e.target as HTMLElement).closest('input,textarea,select')) spaceDown.current = true; };
    const up = (e: KeyboardEvent) => { if (e.code === 'Space') spaceDown.current = false; };
    window.addEventListener('keydown', down); window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const snapP = (p: Point): Point => (useEditor.getState().snapToGrid ? { x: snap(p.x), y: snap(p.y) } : p);
  const pinRadius = () => Math.max(3.5, 7 / useEditor.getState().view.zoom);

  /** Finish the wire being drawn at an endpoint. */
  const finishWire = (to: Endpoint) => {
    const st = useEditor.getState();
    const d = st.drawing!;
    const id = st.addWire(d.from, to, d.points, { style: d.style, color: d.color });
    st.setDrawing(null);
    if (id) st.log('ok', 'Ligação criada');
  };

  const startWireFrom = (from: Endpoint) => {
    const st = useEditor.getState();
    st.setDrawing({ from, points: [], style: st.wireStyle, color: st.wireColor });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    setMenu(null);
    svgRef.current?.setPointerCapture(e.pointerId);
    const screen = toScreen(e.clientX, e.clientY);
    pointers.current.set(e.pointerId, screen);
    const st = useEditor.getState();

    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: st.view.zoom, mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, vx: st.view.x, vy: st.view.y };
      return;
    }
    if (e.button === 1 || e.button === 2 || spaceDown.current || st.tool === 'pan') {
      if (e.button === 2 && st.drawing) { st.setDrawing(null); return; }
      gesture.current = { kind: 'pan', sx: screen.x, sy: screen.y, vx: st.view.x, vy: st.view.y, button: e.button, moved: false, target: e.target as Element, cx: e.clientX, cy: e.clientY };
      return;
    }
    if (e.button !== 0) return;
    const w = toWorld(e.clientX, e.clientY);
    const pin = hitPin(pins, w, pinRadius());
    const target = e.target as Element;

    // ── while drawing a wire ──
    if (st.drawing) {
      if (pin) { finishWire({ kind: 'pin', compId: pin.compId, pinId: pin.pinId }); return; }
      const jEl = target.closest('[data-junction]');
      if (jEl) { finishWire({ kind: 'junction', junctionId: jEl.getAttribute('data-junction')! }); return; }
      const wh = hitWire(st.doc, w, Math.max(2.5, 5 / st.view.zoom));
      if (wh) {
        const jid = st.splitWire(wh.wireId, wh.point, wh.segment);
        if (jid) finishWire({ kind: 'junction', junctionId: jid });
        return;
      }
      let p = snapP(w);
      if (e.shiftKey) p = orthoFrom(lastDrawPoint(), p);
      st.setDrawing({ ...st.drawing, points: [...st.drawing.points, p] });
      return;
    }

    // ── junction drag ──
    const jEl = target.closest('[data-junction]');
    if (jEl && !pin) {
      const id = jEl.getAttribute('data-junction')!;
      if (st.tool === 'wire') { startWireFrom({ kind: 'junction', junctionId: id }); return; }
      st.select({ junctions: [id] }, e.shiftKey);
      st.beginGesture();
      gesture.current = { kind: 'junction', id };
      return;
    }
    // ── wire waypoint handle ──
    const hEl = target.closest('[data-handle]');
    if (hEl) {
      const [wireId, idx] = hEl.getAttribute('data-handle')!.split('|');
      st.beginGesture();
      gesture.current = { kind: 'wirePoint', wireId, index: +idx, moved: false };
      return;
    }
    // ── pins ──
    if (pin) {
      if (st.tool === 'wire') { startWireFrom({ kind: 'pin', compId: pin.compId, pinId: pin.pinId }); return; }
      gesture.current = { kind: 'pendingPin', pin, sx: screen.x, sy: screen.y, additive: e.shiftKey };
      return;
    }
    // ── wires ──
    const wEl = target.closest('[data-wire]');
    if (wEl) {
      const id = wEl.getAttribute('data-wire')!;
      if (st.selection.wires.includes(id) && !e.shiftKey && st.selection.wires.length === 1) {
        // drag on a selected wire inserts a bend point
        const wh = hitWire(st.doc, w, Math.max(3, 6 / st.view.zoom));
        if (wh && wh.wireId === id) {
          st.beginGesture();
          const p = snapP(wh.point);
          st.update((d) => { d.wires[id].points.splice(wh.segment, 0, p); });
          gesture.current = { kind: 'wirePoint', wireId: id, index: wh.segment, moved: false };
          return;
        }
      }
      st.select({ wires: [id] }, e.shiftKey);
      return;
    }
    // ── components ──
    const cEl = target.closest('[data-comp]');
    if (cEl) {
      const id = cEl.getAttribute('data-comp')!;
      if (e.shiftKey || e.ctrlKey || e.metaKey) st.toggleComp(id);
      else if (!st.selection.comps.includes(id)) st.select({ comps: [id] });
      st.beginGesture();
      gesture.current = { kind: 'move', start: w, base: useEditor.getState().doc, moved: false };
      return;
    }
    // ── empty space ──
    if (!e.shiftKey) st.clearSelection();
    gesture.current = { kind: 'marquee', start: w, additive: e.shiftKey };
  };

  const lastDrawPoint = (): Point => {
    const st = useEditor.getState();
    const d = st.drawing!;
    if (d.points.length) return d.points[d.points.length - 1];
    const ep = d.from;
    if (ep.kind === 'junction') return st.doc.junctions[ep.junctionId];
    const p = pins.find((x) => x.compId === ep.compId && x.pinId === ep.pinId);
    return p ?? { x: 0, y: 0 };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const screen = toScreen(e.clientX, e.clientY);
    if (pointers.current.has(e.pointerId)) pointers.current.set(e.pointerId, screen);
    const w = toWorld(e.clientX, e.clientY);
    const st = useEditor.getState();
    const g = gesture.current;

    if (g?.kind === 'pinch' && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const zoom = Math.max(0.15, Math.min(14, g.z0 * (d / g.d0)));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const k = zoom / g.z0;
      st.setView({ zoom, x: mid.x - (g.mid.x - g.vx) * k, y: mid.y - (g.mid.y - g.vy) * k });
      return;
    }
    if (g?.kind === 'pan') {
      if (Math.hypot(screen.x - g.sx, screen.y - g.sy) > 2) g.moved = true;
      st.setView({ x: g.vx + screen.x - g.sx, y: g.vy + screen.y - g.sy });
      return;
    }
    if (g?.kind === 'pendingPin') {
      if (Math.hypot(screen.x - g.sx, screen.y - g.sy) > DRAG_THRESHOLD) {
        // convert into a component drag
        const id = g.pin.compId;
        if (!st.selection.comps.includes(id)) st.select({ comps: [id] }, g.additive);
        st.beginGesture();
        gesture.current = { kind: 'move', start: toWorld(e.clientX - (screen.x - g.sx), e.clientY - (screen.y - g.sy)), base: useEditor.getState().doc, moved: true };
      }
      return;
    }
    if (g?.kind === 'move') {
      let dx = w.x - g.start.x, dy = w.y - g.start.y;
      if (st.snapToGrid) { dx = snap(dx, GRID); dy = snap(dy, GRID); }
      if (dx || dy || g.moved) { g.moved = true; st.moveSelectionLive(dx, dy, g.base); }
      return;
    }
    if (g?.kind === 'marquee') { setMarquee(normRect(g.start, w)); return; }
    if (g?.kind === 'wirePoint') { g.moved = true; st.moveWirePoint(g.wireId, g.index, snapP(w)); return; }
    if (g?.kind === 'junction') { st.moveJunction(g.id, snapP(w)); return; }

    // hover feedback
    setCursor(w);
    const pin = hitPin(pins, w, pinRadius());
    setHover((h) => (h?.compId === pin?.compId && h?.pinId === pin?.pinId ? h : pin));
    const wEl = (e.target as Element).closest?.('[data-wire]');
    setHoverWire(wEl ? wEl.getAttribute('data-wire') : null);
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    const st = useEditor.getState();
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === 'pan' && g.button === 2 && !g.moved) openMenu(g.target, g.cx, g.cy);
    if (g.kind === 'pendingPin') {
      startWireFrom({ kind: 'pin', compId: g.pin.compId, pinId: g.pin.pinId });
    }
    if (g.kind === 'move') {
      st.endGesture();
      if (g.moved) {
        const n = st.selection.comps.length;
        st.log('info', `Movido${n > 1 ? 's' : ''} ${n} componente${n > 1 ? 's' : ''}`);
      }
    }
    if (g.kind === 'wirePoint' || g.kind === 'junction') st.endGesture();
    if (g.kind === 'marquee') {
      const r = marquee;
      setMarquee(null);
      if (r && (r.w > 2 || r.h > 2)) st.selectInRect(r, g.additive);
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const st = useEditor.getState();
    const target = e.target as Element;
    const hEl = target.closest('[data-handle]');
    if (hEl) {
      const [wireId, idx] = hEl.getAttribute('data-handle')!.split('|');
      st.removeWirePoint(wireId, +idx);
      return;
    }
    if (st.drawing) return;
    const w = toWorld(e.clientX, e.clientY);
    const wh = hitWire(st.doc, w, Math.max(3, 6 / st.view.zoom));
    if (wh) {
      // Branch: create junction and start a new wire from it
      const color = st.doc.wires[wh.wireId].color;
      const jid = st.splitWire(wh.wireId, wh.point, wh.segment);
      if (jid) st.setDrawing({ from: { kind: 'junction', junctionId: jid }, points: [], style: st.wireStyle, color });
    }
  };

  const openMenu = (target: Element, clientX: number, clientY: number) => {
    const st = useEditor.getState();
    const cEl = target.closest('[data-comp]');
    const wEl = target.closest('[data-wire]');
    if (cEl) {
      const id = cEl.getAttribute('data-comp')!;
      if (!st.selection.comps.includes(id)) st.select({ comps: [id] });
    } else if (wEl) st.select({ wires: [wEl.getAttribute('data-wire')!] });
    const s = toScreen(clientX, clientY);
    setMenu({ x: s.x, y: s.y, world: toWorld(clientX, clientY), target: cEl ? 'component' : wEl ? 'wire' : 'canvas' });
  };

  // Drop from library
  const onDrop = (e: React.DragEvent) => {
    const type = e.dataTransfer.getData('application/x-electrolab-part');
    if (!type) return;
    e.preventDefault();
    const st = useEditor.getState();
    const w = toWorld(e.clientX, e.clientY);
    const def = getDef(type);
    if (def?.tool) { st.setWireStyleTool(def.tool.style); return; }
    st.addComponent(type, w);
  };

  // ── derived rendering data ──
  const comps = Object.values(doc.components);
  const substrates = comps.filter((c) => getDef(c.type)?.substrate);
  const devices = comps.filter((c) => !getDef(c.type)?.substrate);
  const selComps = new Set(selection.comps);
  const selWires = new Set(selection.wires);

  // Pins/holes connected to the hovered pin (shows breadboard internal strips) or to the hovered net
  const hoverNetId = hover ? nl.pinNet.get(pinKey(hover.compId, hover.pinId)) ?? null : hoveredNet;
  const netPins = useMemo(() => {
    if (!hoverNetId) return [];
    const net = nl.netById.get(hoverNetId);
    if (!net) return [];
    const keys = new Set(net.pins.map((p) => pinKey(p.compId, p.pinId)));
    return pins.filter((p) => keys.has(pinKey(p.compId, p.pinId)));
  }, [hoverNetId, nl, pins]);
  const netWires = useMemo(() => new Set(hoverNetId ? nl.netById.get(hoverNetId)?.wires ?? [] : []), [hoverNetId, nl]);

  // Pins of the component under the cursor (or all device pins while drawing)
  const showPinsFor = useMemo(() => {
    if (drawing || tool === 'wire') return pins.filter((p) => !p.substrate);
    if (hover) return pins.filter((p) => p.compId === hover.compId && !p.substrate);
    return [];
  }, [drawing, tool, hover, pins]);

  const drawPreview = (() => {
    if (!drawing) return null;
    const st = useEditor.getState();
    const from = drawing.from.kind === 'junction' ? st.doc.junctions[drawing.from.junctionId] : pins.find((p) => drawing.from.kind === 'pin' && p.compId === drawing.from.compId && p.pinId === drawing.from.pinId);
    if (!from) return null;
    const end = hover ? { x: hover.x, y: hover.y } : snapP(cursor);
    return [{ x: from.x, y: from.y }, ...drawing.points, end];
  })();

  const gridMinor = GRID * view.zoom;
  const z = view.zoom;

  return (
    <div
      ref={wrapRef}
      className="relative h-full w-full overflow-hidden bg-[#e9edf2]"
      onDragOver={(e) => { if (e.dataTransfer.types.includes('application/x-electrolab-part')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={onDrop}
    >
      <svg
        ref={svgRef}
        className="absolute inset-0 h-full w-full touch-none select-none"
        style={{ cursor: drawing || tool === 'wire' ? 'crosshair' : tool === 'pan' ? 'grab' : hover ? 'crosshair' : 'default' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        {showGrid && (
          <>
            <defs>
              <pattern id="grid-minor" width={gridMinor} height={gridMinor} patternUnits="userSpaceOnUse" x={view.x % gridMinor} y={view.y % gridMinor}>
                {z > 0.9 ? <circle cx={0.75} cy={0.75} r={0.75} fill="#b9c3d0" /> : null}
              </pattern>
              <pattern id="grid-major" width={gridMinor * 10} height={gridMinor * 10} patternUnits="userSpaceOnUse" x={view.x % (gridMinor * 10)} y={view.y % (gridMinor * 10)}>
                <path d={`M ${gridMinor * 10} 0 L 0 0 0 ${gridMinor * 10}`} fill="none" stroke="#cdd5df" strokeWidth={1} />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#grid-minor)" />
            <rect width="100%" height="100%" fill="url(#grid-major)" />
          </>
        )}

        <g ref={worldRef} transform={`translate(${view.x} ${view.y}) scale(${z})`}>
          {substrates.map((c) => <ComponentView key={c.id} inst={c} />)}

          {/* internal connections of hovered hole / net */}
          <g data-export-ignore style={{ pointerEvents: 'none' }}>
            {netPins.filter((p) => p.substrate).map((p) => (
              <rect key={`${p.compId}${p.pinId}`} x={p.x - 2.6} y={p.y - 2.6} width={5.2} height={5.2} rx={0.8} fill="#22c55e" fillOpacity={0.55} stroke="#15803d" strokeWidth={0.5} />
            ))}
          </g>

          {devices.map((c) => <ComponentView key={c.id} inst={c} />)}

          {Object.values(doc.wires).map((w) => {
            const pts = wirePath(doc, w);
            return pts ? <WireView key={w.id} wire={w} pts={pts} selected={selWires.has(w.id)} highlighted={netWires.has(w.id) || hoverWire === w.id} /> : null;
          })}

          {Object.values(doc.junctions).map((j) => {
            const wire = Object.values(doc.wires).find((w) => (w.from.kind === 'junction' && w.from.junctionId === j.id) || (w.to.kind === 'junction' && w.to.junctionId === j.id));
            const sel = selection.junctions.includes(j.id);
            return (
              <g key={j.id} data-junction={j.id} style={{ cursor: 'move' }}>
                <circle cx={j.x} cy={j.y} r={6} fill="transparent" data-export-ignore />
                {sel && <circle cx={j.x} cy={j.y} r={4.2} fill="none" stroke="#2f9bff" strokeWidth={1} data-export-ignore />}
                <circle cx={j.x} cy={j.y} r={2.4} fill={wire?.color ?? '#333'} stroke="#000" strokeOpacity={0.5} strokeWidth={0.5} />
              </g>
            );
          })}

          {showLabels && devices.map((c) => <LabelView key={c.id} inst={c} />)}

          <g data-export-ignore>
            {/* selection outlines */}
            {[...selComps].map((id) => {
              const c = doc.components[id];
              const r = c && compRect(c);
              return r ? <rect key={id} x={r.x - 2} y={r.y - 2} width={r.w + 4} height={r.h + 4} rx={2} fill="none" stroke="#2f9bff" strokeWidth={1.2 / Math.min(z, 3) + 0.3} strokeDasharray="4 2" style={{ pointerEvents: 'none' }} /> : null;
            })}
            {highlightComps.map((id) => {
              const c = doc.components[id];
              const r = c && compRect(c);
              return r ? <rect key={`h${id}`} x={r.x - 4} y={r.y - 4} width={r.w + 8} height={r.h + 8} rx={3} fill="#f59e0b" fillOpacity={0.08} stroke="#f59e0b" strokeWidth={1.5} style={{ pointerEvents: 'none' }} /> : null;
            })}
            {/* waypoint handles of selected wires */}
            {selection.wires.map((id) => doc.wires[id]?.points.map((p, i) => (
              <rect key={`${id}${i}`} data-handle={`${id}|${i}`} x={p.x - 2.4} y={p.y - 2.4} width={4.8} height={4.8} rx={1} fill="#fff" stroke="#2f9bff" strokeWidth={1} style={{ cursor: 'move' }} />
            )))}
            {/* pin markers */}
            <g style={{ pointerEvents: 'none' }}>
              {showPinsFor.map((p) => <circle key={`${p.compId}${p.pinId}`} cx={p.x} cy={p.y} r={1.6} fill="#2f9bff" fillOpacity={0.35} stroke="#2f9bff" strokeWidth={0.4} />)}
              {netPins.filter((p) => !p.substrate).map((p) => <circle key={`n${p.compId}${p.pinId}`} cx={p.x} cy={p.y} r={2.6} fill="none" stroke="#16a34a" strokeWidth={0.9} />)}
              {hover && <circle cx={hover.x} cy={hover.y} r={3.4} fill="#2f9bff" fillOpacity={0.25} stroke="#1d6fd6" strokeWidth={1} />}
            </g>
            {drawPreview && (
              <g style={{ pointerEvents: 'none' }}>
                <polyline points={toPolyline(drawPreview)} fill="none" stroke={drawing!.color} strokeOpacity={0.85} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="5 3" />
                {drawPreview.slice(1, -1).map((p, i) => <circle key={i} cx={p.x} cy={p.y} r={1.4} fill={drawing!.color} />)}
              </g>
            )}
            {marquee && <rect x={marquee.x} y={marquee.y} width={marquee.w} height={marquee.h} fill="#2f9bff" fillOpacity={0.08} stroke="#2f9bff" strokeWidth={1 / z} strokeDasharray={`${4 / z} ${3 / z}`} />}
          </g>
        </g>
      </svg>

      {hover && !gesture.current && (
        <PinTooltip pin={hover} view={view} netName={hoverNetId ? nl.netById.get(hoverNetId)?.name : undefined} label={doc.components[hover.compId]?.label ?? ''} />
      )}
      {drawing && (
        <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-md bg-lab-900/90 px-3 py-1.5 text-xs text-lab-100 shadow-lg ring-1 ring-lab-600">
          A desenhar ligação — clique num <b>pino</b>, <b>fio</b> ou <b>junção</b> para terminar · clique na área para dobrar · <kbd>Shift</kbd> 90° · <kbd>Esc</kbd> cancela
        </div>
      )}
      {comps.length === 0 && <EmptyHint />}
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}

function orthoFrom(a: Point, b: Point): Point {
  return Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y };
}

function PinTooltip({ pin, view, netName, label }: { pin: PinHit; view: { x: number; y: number; zoom: number }; netName?: string; label: string }) {
  const x = pin.x * view.zoom + view.x, y = pin.y * view.zoom + view.y;
  const def = getDef(useEditor.getState().doc.components[pin.compId]?.type ?? '');
  const pd = def && (Array.isArray(def.pins) ? def.pins : def.pins(useEditor.getState().doc.components[pin.compId].props)).find((p) => p.id === pin.pinId);
  return (
    <div className="pointer-events-none absolute z-20 -translate-x-1/2 whitespace-nowrap rounded-md bg-lab-900/95 px-2.5 py-1.5 text-[11px] leading-tight text-lab-100 shadow-xl ring-1 ring-lab-600" style={{ left: x, top: y - 46 }}>
      <div className="font-semibold text-white">{label} · {pin.name}</div>
      <div className="text-lab-300">
        {pd?.description ? `${pd.description} · ` : ''}{pd?.polarity ? `polaridade ${pd.polarity === '+' ? 'positiva' : 'negativa'} · ` : ''}nó <span className="font-mono text-emerald-300">{netName ?? '—'}</span>
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="max-w-md rounded-xl border border-dashed border-lab-400/60 bg-white/60 px-8 py-6 text-center text-sm text-lab-600 backdrop-blur-sm">
        <div className="mb-1 text-base font-semibold text-lab-700">Laboratório vazio</div>
        Arraste componentes da biblioteca para aqui, ou abra um exemplo em <b>Projetos</b>.<br />
        Clique num pino para iniciar um fio · roda do rato = zoom · botão do meio / direito = mover vista.
      </div>
    </div>
  );
}
