import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import type { CircuitDocument } from '@/domain/types';
import { getDef, valueLabel } from '@/library/registry';
import { labDefsContent } from '@/library/render/primitives';
import { unionRects, type Rect } from '@/domain/geometry';
import { compRect } from '@/store/editor';

export function download(name: string, data: Blob | string, mime = 'application/octet-stream') {
  const blob = typeof data === 'string' ? new Blob([data], { type: mime }) : data;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const safe = (s: string) => s.replace(/[^\w\-]+/g, '_').slice(0, 60) || 'projeto';

export function exportJSON(doc: CircuitDocument) {
  download(`${safe(doc.name)}.electrolab.json`, JSON.stringify(doc, null, 2), 'application/json');
}

/** Bill of materials grouped by type + value. */
export function buildBOM(doc: CircuitDocument) {
  const rows = new Map<string, { qty: number; name: string; value: string; refs: string[]; category: string }>();
  for (const c of Object.values(doc.components)) {
    const def = getDef(c.type);
    if (!def) continue;
    const value = valueLabel(def, c.props);
    const key = `${c.type}|${value}`;
    const r = rows.get(key) ?? { qty: 0, name: def.name, value, refs: [], category: def.category };
    r.qty++; r.refs.push(c.label);
    rows.set(key, r);
  }
  const wires = Object.values(doc.wires);
  const byStyle = new Map<string, number>();
  wires.forEach((w) => byStyle.set(w.style, (byStyle.get(w.style) ?? 0) + 1));
  const styleName: Record<string, string> = { wire: 'Fio de ligação', 'jumper-mm': 'Jumper macho-macho', 'jumper-mf': 'Jumper macho-fêmea', 'jumper-ff': 'Jumper fêmea-fêmea' };
  for (const [s, n] of byStyle) rows.set(`wire|${s}`, { qty: n, name: styleName[s] ?? s, value: '', refs: [], category: 'assembly' });
  return [...rows.values()].sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export function exportBOM(doc: CircuitDocument) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ['Qtd;Componente;Valor;Referências', ...buildBOM(doc).map((r) => [r.qty, esc(r.name), esc(r.value), esc(r.refs.join(', '))].join(';'))];
  download(`${safe(doc.name)}-BOM.csv`, '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
}

/** Serialise the live canvas world group into a standalone SVG (with shared gradients embedded). */
export function buildSVG(doc: CircuitDocument, worldGroup: SVGGElement): { svg: string; w: number; h: number } {
  const rects = Object.values(doc.components).map(compRect).filter(Boolean) as Rect[];
  const r = unionRects(rects) ?? { x: 0, y: 0, w: 100, h: 100 };
  const pad = 20;
  const vb = { x: r.x - pad, y: r.y - pad, w: r.w + pad * 2, h: r.h + pad * 2 };
  const defs = renderToStaticMarkup(createElement('defs', null, labDefsContent()));
  const clone = worldGroup.cloneNode(true) as SVGGElement;
  clone.removeAttribute('transform');
  clone.querySelectorAll('[data-export-ignore]').forEach((n) => n.remove());
  const scale = 4;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}" width="${vb.w * scale}" height="${vb.h * scale}">${defs}<rect x="${vb.x}" y="${vb.y}" width="${vb.w}" height="${vb.h}" fill="#f4f6f9"/>${clone.outerHTML}</svg>`;
  return { svg, w: vb.w * scale, h: vb.h * scale };
}

export function exportSVG(doc: CircuitDocument, worldGroup: SVGGElement) {
  download(`${safe(doc.name)}.svg`, buildSVG(doc, worldGroup).svg, 'image/svg+xml');
}

export async function exportPNG(doc: CircuitDocument, worldGroup: SVGGElement) {
  const { svg, w, h } = buildSVG(doc, worldGroup);
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = url; });
  const maxSide = 6000;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k); canvas.height = Math.round(h * k);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(url);
  canvas.toBlob((b) => b && download(`${safe(doc.name)}.png`, b, 'image/png'), 'image/png');
}
