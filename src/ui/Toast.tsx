import { useEffect, useState } from 'react';
import { useEditor } from '@/store/editor';

export function Toast() {
  const toast = useEditor((s) => s.toast);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!toast) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 3200);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast || !visible) return null;
  const color = { info: 'border-sky-500/50', warn: 'border-amber-500/60', error: 'border-red-500/60', ok: 'border-emerald-500/60' }[toast.level];
  return (
    <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 -translate-x-1/2 px-4">
      <div className={`max-w-xl rounded-lg border ${color} bg-lab-850/95 px-4 py-2.5 text-[13px] text-lab-100 shadow-2xl backdrop-blur`}>{toast.msg}</div>
    </div>
  );
}
