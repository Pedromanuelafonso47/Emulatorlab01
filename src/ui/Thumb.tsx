import { memo } from 'react';
import type { ComponentDef } from '@/library/types';
import { defaultProps, getBBox } from '@/library/registry';

/** Renders a component's real SVG artwork scaled into a box. */
export const Thumb = memo(function Thumb({ def, size = 56 }: { def: ComponentDef; size?: number }) {
  const props = defaultProps(def);
  const bb = getBBox(def, props);
  const pad = Math.max(bb.w, bb.h) * 0.06;
  return (
    <svg width={size} height={size} viewBox={`${bb.x - pad} ${bb.y - pad} ${bb.w + pad * 2} ${bb.h + pad * 2}`} className="shrink-0" aria-hidden>
      {def.render({ props })}
    </svg>
  );
});
