import { GRID, type Point, type Rotation } from './types';

export const snap = (v: number, step = GRID) => Math.round(v / step) * step;
export const snapPoint = (p: Point, step = GRID): Point => ({ x: snap(p.x, step), y: snap(p.y, step) });

/** Transform a local point by flip + quarter-turn rotation around the origin, then translate. */
export function transformPoint(p: Point, origin: Point, rotation: Rotation, flip = false): Point {
  let x = flip ? -p.x : p.x;
  let y = p.y;
  for (let i = 0; i < rotation; i++) { const t = x; x = -y; y = t; }
  return { x: origin.x + x, y: origin.y + y };
}

export interface Rect { x: number; y: number; w: number; h: number }

export function transformRect(r: Rect, origin: Point, rotation: Rotation, flip = false): Rect {
  const corners = [
    { x: r.x, y: r.y }, { x: r.x + r.w, y: r.y }, { x: r.x, y: r.y + r.h }, { x: r.x + r.w, y: r.y + r.h },
  ].map((c) => transformPoint(c, origin, rotation, flip));
  const xs = corners.map((c) => c.x), ys = corners.map((c) => c.y);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export const rectsIntersect = (a: Rect, b: Rect) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export const rectContains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

export function normRect(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export const dist2 = (a: Point, b: Point) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/** Closest point on segment ab to p, with parameter t∈[0,1]. */
export function projectOnSegment(p: Point, a: Point, b: Point): { point: Point; t: number; d2: number } {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, d2: dist2(p, point) };
}

export function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rects) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
