/**
 * Visual review sheet (developer tool, not part of the normal test run).
 *
 *   SHEET_CAT=passive SHEET_OUT=<file.html> npx vitest run src/library/render/sheet.test.tsx
 *
 * Renders every part of a category (or SHEET_TYPES=a,b for specific types) at large scale into a
 * static HTML page, so the drawings can be inspected and screenshotted at full size.
 */
import { it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { writeFileSync } from 'node:fs';
import { createElement } from 'react';
import '@/library';
import { allDefs, defaultProps } from '@/library/registry';
import { labDefsContent } from './primitives';
import { getBBox } from '@/library/registry';

const cat = process.env.SHEET_CAT;
const types = process.env.SHEET_TYPES?.split(',').map((s) => s.trim()).filter(Boolean);
const out = process.env.SHEET_OUT;

it.skipIf(!out || (!cat && !types))('render sheet', () => {
  const defs = allDefs().filter((d) => (types ? types.includes(d.type) : d.category === cat) && !d.tool && !d.comingSoon);
  const cells = defs.map((def) => {
    const props = defaultProps(def);
    const b = getBBox(def, props);
    const pad = 12;
    const vb = `${b.x - pad} ${b.y - pad} ${b.w + pad * 2} ${b.h + pad * 2}`;
    const svg = renderToStaticMarkup(createElement('svg', { viewBox: vb, xmlns: 'http://www.w3.org/2000/svg', width: 420, height: (420 * (b.h + pad * 2)) / (b.w + pad * 2) },
      createElement('defs', null, labDefsContent()),
      createElement('rect', { x: b.x - pad, y: b.y - pad, width: b.w + pad * 2, height: b.h + pad * 2, fill: '#e9edf2' }),
      createElement('g', null, def.render({ props, state: {} }) as never),
    ));
    const status = def.sim.status;
    return `<figure><div class="svg">${svg}</div><figcaption><b>${def.name}</b><span class="t">${def.type} · ${def.category} · ${status}</span></figcaption></figure>`;
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:24px;background:#0c1018;font-family:Segoe UI,Arial,sans-serif;color:#e6edf7}
  h1{font-size:20px;margin:0 0 16px}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(460px,1fr));gap:18px}
  figure{margin:0;background:#161c27;border:1px solid #2a3443;border-radius:10px;padding:12px}
  .svg svg{width:100%;height:auto;display:block}
  figcaption{margin-top:8px;font-size:14px}
  .t{display:block;font-size:11px;color:#8b98ab;margin-top:2px;font-family:Consolas,monospace}
  </style></head><body><h1>${cat ?? types?.join(', ')} — ${defs.length} peças</h1><div class="grid">${cells.join('')}</div></body></html>`;
  writeFileSync(out!, html, 'utf8');
});
