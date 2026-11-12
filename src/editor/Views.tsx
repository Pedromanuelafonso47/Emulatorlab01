import { memo } from 'react';
import type { ComponentInstance, Point, Wire } from '@/domain/types';
import { getBBox, getDef, valueLabel } from '@/library/registry';
import { transformRect } from '@/domain/geometry';
import { toPolyline } from './geometry';

export const ComponentView = memo(function ComponentView({ inst }: { inst: ComponentInstance }) {
  const def = getDef(inst.type);
  if (!def) {
    return (
      <g transform={`translate(${inst.x} ${inst.y})`} data-comp={inst.id}>
        <rect x={-15} y={-15} width={30} height={30} fill="#5a1d1d" stroke="#f44" strokeDasharray="2 2" />
        <text x={0} y={0} fontSize={4} fill="#fff" textAnchor="middle">?{inst.type}</text>
      </g>
    );
  }
  const t = `translate(${inst.x} ${inst.y}) rotate(${inst.rotation * 90})${inst.flip ? ' scale(-1 1)' : ''}`;
  const bb = getBBox(def, inst.props);
  return (
    <g transform={t} data-comp={inst.id} style={{ cursor: 'move' }} filter={def.substrate ? undefined : 'url(#f-shadow)'}>
      {/* invisible hit area so thin parts are easy to grab */}
      <rect x={bb.x} y={bb.y} width={bb.w} height={bb.h} fill="transparent" />
      {def.render({ props: inst.props })}
    </g>
  );
});

export const LabelView = memo(function LabelView({ inst }: { inst: ComponentInstance }) {
  const def = getDef(inst.type);
  if (!def || def.substrate) return null;
  const r = transformRect(getBBox(def, inst.props), inst, inst.rotation, inst.flip);
  const v = valueLabel(def, inst.props);
  return (
    <g style={{ pointerEvents: 'none' }} data-export-label>
      <text x={r.x + r.w / 2} y={r.y + r.h + 6} fontSize={4.6} textAnchor="middle" fontFamily="Inter, Segoe UI, sans-serif" fontWeight={700} fill="#1f2a3a" stroke="#f4f6f9" strokeWidth={1.6} paintOrder="stroke">
        {inst.label}
        {v && <tspan fontWeight={500} fill="#3b4a60"> {v}</tspan>}
      </text>
    </g>
  );
});

function endCap(a: Point, b: Point, style: Wire['style'], end: 'from' | 'to') {
  if (style === 'wire') return <circle cx={a.x} cy={a.y} r={1.3} fill="url(#g-metal-r)" />;
  const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
  const male = style === 'jumper-mm' || (style === 'jumper-mf' && end === 'from');
  return (
    <g transform={`translate(${a.x} ${a.y}) rotate(${ang})`}>
      {male && <line x1={0} y1={0} x2={3} y2={0} stroke="url(#g-gold)" strokeWidth={1.3} />}
      <rect x={male ? 2.6 : 0} y={-2} width={8.5} height={4} rx={0.6} fill="#17191c" stroke="#000" strokeWidth={0.3} />
      <rect x={male ? 3.4 : 0.8} y={-1.4} width={2} height={2.8} fill="#2b2e33" />
    </g>
  );
}

export const WireView = memo(function WireView({ wire, pts, selected, highlighted }: { wire: Wire; pts: Point[]; selected: boolean; highlighted: boolean }) {
  const line = toPolyline(pts);
  const width = wire.style === 'wire' ? 1.9 : 2.3;
  const dark = wire.color.toLowerCase() === '#212121' || wire.color.toLowerCase() === '#000000';
  return (
    <g data-wire={wire.id} style={{ cursor: 'pointer' }}>
      {(selected || highlighted) && <polyline points={line} fill="none" stroke={selected ? '#2f9bff' : '#ffd23a'} strokeOpacity={0.55} strokeWidth={width + 4} strokeLinecap="round" strokeLinejoin="round" data-export-ignore />}
      <polyline points={line} fill="none" stroke="#000" strokeOpacity={0.35} strokeWidth={width + 0.9} strokeLinecap="round" strokeLinejoin="round" transform="translate(0.5 0.8)" />
      <polyline points={line} fill="none" stroke={wire.color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={line} fill="none" stroke="#fff" strokeOpacity={dark ? 0.25 : 0.35} strokeWidth={width * 0.3} strokeLinecap="round" strokeLinejoin="round" transform="translate(-0.3 -0.45)" />
      {endCap(pts[0], pts[1], wire.style, 'from')}
      {endCap(pts[pts.length - 1], pts[pts.length - 2], wire.style, 'to')}
      <polyline points={line} fill="none" stroke="transparent" strokeWidth={8} strokeLinecap="round" data-export-ignore />
    </g>
  );
});
