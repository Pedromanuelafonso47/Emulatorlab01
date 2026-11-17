import { useMemo, useState } from 'react';
import { CheckCircle2, Circle, ChevronRight, GraduationCap } from 'lucide-react';
import { useEditor } from '@/store/editor';
import { useAnalysis } from '@/store/derived';
import { LEVELS, type Lesson } from '@/learn/lessons';
import { checkLesson } from '@/learn/check';

/** Guided lessons: each step turns green when its parts and connections exist on the netlist. */
export function LearnTab() {
  const doc = useEditor((s) => s.doc);
  const { nl } = useAnalysis();
  const [lessonId, setLessonId] = useState(LEVELS[0].lessons[0].id);
  const lesson: Lesson = LEVELS.flatMap((l) => l.lessons).find((l) => l.id === lessonId) ?? LEVELS[0].lessons[0];
  const results = useMemo(() => checkLesson(doc, nl, lesson), [doc, nl, lesson]);
  const done = results.filter((r) => r.ok).length;
  const current = results.findIndex((r) => !r.ok);

  return (
    <div className="flex h-full min-h-0 font-sans text-[12.5px]">
      <aside className="w-56 shrink-0 overflow-y-auto border-r border-lab-700 bg-lab-900/50 p-2">
        {LEVELS.map((level) => (
          <div key={level.id} className="mb-3">
            <div className="mb-1 px-1 text-[10.5px] font-semibold uppercase tracking-wide text-lab-400">{level.title}</div>
            {level.lessons.map((l) => (
              <button key={l.id} onClick={() => setLessonId(l.id)}
                className={`mb-0.5 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left ${l.id === lesson.id ? 'bg-accent/20 text-white' : 'text-lab-300 hover:bg-lab-800'}`}>
                <ChevronRight className="h-3 w-3 shrink-0 opacity-60" />{l.title}
              </button>
            ))}
          </div>
        ))}
      </aside>

      <section className="min-w-0 flex-1 overflow-y-auto p-3">
        <div className="mb-1 flex items-center gap-2 text-[14px] font-semibold text-white">
          <GraduationCap className="h-4 w-4 text-accent" />{lesson.title}
          <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] ${done === results.length ? 'bg-emerald-500/20 text-emerald-300' : 'bg-lab-700 text-lab-300'}`}>
            {done}/{results.length} passos
          </span>
        </div>
        <p className="mb-3 text-lab-400">{lesson.summary}</p>

        <ol className="space-y-2">
          {lesson.steps.map((s, i) => {
            const r = results[i];
            const active = i === current;
            return (
              <li key={i} className={`rounded-lg border p-2.5 ${r.ok ? 'border-emerald-700/60 bg-emerald-950/30' : active ? 'border-accent/70 bg-lab-800' : 'border-lab-700 bg-lab-900/40 opacity-70'}`}>
                <div className="flex gap-2">
                  {r.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-lab-500" />}
                  <div className="min-w-0">
                    <div className="text-lab-100">{i + 1}. {s.text}</div>
                    {!r.ok && active && r.missing.length > 0 && (
                      <ul className="mt-1 list-disc pl-4 text-[11.5px] text-amber-300">
                        {r.missing.map((m) => <li key={m}>{m}</li>)}
                      </ul>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>

        {done === results.length && (
          <div className="mt-4 rounded-lg border border-emerald-700/60 bg-emerald-950/30 p-3 text-emerald-200">
            Aula concluída. Experimente alterar valores e observar o efeito na simulação.
          </div>
        )}
      </section>
    </div>
  );
}
