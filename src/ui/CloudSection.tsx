import { useState } from 'react';
import { Cloud, LogIn, LogOut, UploadCloud } from 'lucide-react';
import { useEditor } from '@/store/editor';
import { cloudFromEnv, CloudError, type CloudProject, type SupabaseCloud } from '@/cloud/supabase';

/** Cloud projects (Supabase). Shown only when the build has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. */
const cloud: SupabaseCloud | null = cloudFromEnv();

export function CloudSection({ onOpened }: { onOpened: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [who, setWho] = useState<string | null>(() => (cloud?.restore()?.email ?? null));
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  if (!cloud) {
    return (
      <div className="rounded-lg border border-dashed border-lab-600 p-3 text-[12px] text-lab-400">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-lab-300"><Cloud className="h-3.5 w-3.5" />Nuvem não configurada</div>
        Defina <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> e execute <code>supabase/schema.sql</code> no seu projeto Supabase.
      </div>
    );
  }

  const run = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true); setMsg(null);
    try { await fn(); if (ok) setMsg({ kind: 'ok', text: ok }); }
    catch (e) { setMsg({ kind: 'err', text: e instanceof CloudError || e instanceof Error ? e.message : 'Erro desconhecido.' }); }
    finally { setBusy(false); }
  };

  const signIn = () => run(async () => {
    const s = await cloud.signIn(email.trim(), password);
    setWho(s.email); setPassword('');
    setProjects(await cloud.listProjects());
  });
  const signUp = () => run(async () => {
    await cloud.signUp(email.trim(), password);
    setMsg({ kind: 'ok', text: 'Conta criada. Confirme o e-mail se o seu projeto Supabase o exigir, depois entre.' });
  });
  const signOut = () => run(async () => { await cloud.signOut(); setWho(null); setProjects([]); }, 'Sessão terminada.');
  const refresh = () => run(async () => setProjects(await cloud.listProjects()));
  const save = () => run(async () => {
    const st = useEditor.getState();
    await cloud.saveProject(st.projectId, st.doc.name || 'Projeto sem título', st.doc);
    st.set({ dirty: false });
    setProjects(await cloud.listProjects());
  }, 'Projeto guardado na nuvem.');
  const open = (p: CloudProject) => run(async () => {
    const doc = await cloud.loadProject(p.id);
    if (!doc) throw new Error('Projeto não encontrado.');
    useEditor.getState().loadDocument(doc, p.id);
    onOpened();
  });
  const togglePublic = (p: CloudProject) => run(async () => {
    await cloud.setPublic(p.id, !p.isPublic);
    setProjects(await cloud.listProjects());
  }, p.isPublic ? 'Projeto deixou de ser público.' : 'Projeto público: quem tiver o ID pode abri-lo.');

  return (
    <div className="space-y-2 text-[12.5px]">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-lab-400"><Cloud className="h-3.5 w-3.5" />Nuvem</div>
      {!who ? (
        <div className="space-y-1.5">
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail" type="email" autoComplete="email"
            className="w-full rounded-md border border-lab-600 bg-lab-900 px-2 py-1.5 text-lab-100 focus:border-accent focus:outline-none" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Palavra-passe" type="password" autoComplete="current-password"
            className="w-full rounded-md border border-lab-600 bg-lab-900 px-2 py-1.5 text-lab-100 focus:border-accent focus:outline-none" />
          <div className="flex gap-2">
            <button disabled={busy || !email || !password} onClick={signIn} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-white disabled:bg-lab-700 disabled:text-lab-400"><LogIn className="h-3.5 w-3.5" />Entrar</button>
            <button disabled={busy || !email || !password} onClick={signUp} className="flex-1 rounded-md border border-lab-600 px-3 py-1.5 text-lab-200 hover:bg-lab-800 disabled:text-lab-500">Criar conta</button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-lab-200">{who}</span>
            <button onClick={signOut} disabled={busy} className="flex items-center gap-1 rounded-md px-2 py-1 text-lab-400 hover:bg-lab-800 hover:text-white"><LogOut className="h-3.5 w-3.5" />Sair</button>
          </div>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy} className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-accent px-3 py-1.5 font-semibold text-white disabled:bg-lab-700"><UploadCloud className="h-3.5 w-3.5" />Guardar projeto atual na nuvem</button>
            <button onClick={refresh} disabled={busy} className="rounded-md border border-lab-600 px-3 py-1.5 text-lab-200 hover:bg-lab-800">Atualizar</button>
          </div>
          <div className="space-y-1">
            {projects.length === 0 && <div className="text-lab-500">Sem projetos na nuvem.</div>}
            {projects.map((p) => (
              <div key={p.id} className="flex items-center gap-2 rounded-md border border-lab-700 bg-lab-850 px-2.5 py-1.5">
                <button className="min-w-0 flex-1 text-left" onClick={() => open(p)}>
                  <div className="truncate text-lab-100">{p.name}</div>
                  <div className="text-[11px] text-lab-500">{new Date(p.updatedAt).toLocaleString('pt-PT')}{p.isPublic ? ' · público' : ''}</div>
                </button>
                <button onClick={() => togglePublic(p)} disabled={busy} className="rounded px-1.5 py-0.5 text-[11px] text-lab-300 hover:bg-lab-700">{p.isPublic ? 'Tornar privado' : 'Tornar público'}</button>
              </div>
            ))}
          </div>
        </div>
      )}
      {msg && <div className={`rounded-md px-2.5 py-1.5 text-[12px] ${msg.kind === 'ok' ? 'bg-emerald-500/15 text-emerald-200' : 'bg-red-500/15 text-red-200'}`}>{msg.text}</div>}
    </div>
  );
}
