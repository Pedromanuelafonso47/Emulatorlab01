/**
 * Cloud projects on Supabase (Postgres + Auth), through its REST and Auth HTTP APIs.
 * Only the signed-in user's own projects are sent, and access is enforced by row-level security
 * on the server (see supabase/schema.sql), not by this client.
 */
import type { CircuitDocument } from '@/domain/types';
import { validateDocument } from '@/persistence/projects';

export interface CloudProject { id: string; name: string; updatedAt: string; isPublic: boolean }
export interface CloudSession { accessToken: string; refreshToken?: string; userId: string; email: string }

export class CloudError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

type Fetch = typeof fetch;

const SESSION_KEY = 'electrolab.cloud.session';

export class SupabaseCloud {
  private session: CloudSession | null = null;

  constructor(private url: string, private anonKey: string, private http: Fetch = (...a) => fetch(...a)) {
    this.url = url.replace(/\/+$/, '');
  }

  /** The stored session, if the browser keeps one (a convenience only; the server decides access). */
  restore(): CloudSession | null {
    try {
      const raw = globalThis.localStorage?.getItem(SESSION_KEY);
      this.session = raw ? (JSON.parse(raw) as CloudSession) : null;
    } catch { this.session = null; }
    return this.session;
  }

  current(): CloudSession | null { return this.session; }

  async signUp(email: string, password: string): Promise<void> {
    await this.request('POST', '/auth/v1/signup', { email, password }, { auth: false });
  }

  async signIn(email: string, password: string): Promise<CloudSession> {
    const body = await this.request<{ access_token: string; refresh_token?: string; user: { id: string; email: string } }>(
      'POST', '/auth/v1/token?grant_type=password', { email, password }, { auth: false });
    this.session = { accessToken: body.access_token, refreshToken: body.refresh_token, userId: body.user.id, email: body.user.email };
    try { globalThis.localStorage?.setItem(SESSION_KEY, JSON.stringify(this.session)); } catch { /* storage blocked */ }
    return this.session;
  }

  async signOut(): Promise<void> {
    if (this.session) {
      try { await this.request('POST', '/auth/v1/logout', {}); } catch { /* token may already be expired */ }
    }
    this.session = null;
    try { globalThis.localStorage?.removeItem(SESSION_KEY); } catch { /* storage blocked */ }
  }

  async listProjects(): Promise<CloudProject[]> {
    const rows = await this.request<{ id: string; name: string; updated_at: string; is_public: boolean }[]>(
      'GET', '/rest/v1/projects?select=id,name,updated_at,is_public&order=updated_at.desc');
    return rows.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updated_at, isPublic: r.is_public }));
  }

  async saveProject(id: string, name: string, doc: CircuitDocument): Promise<void> {
    this.requireSession();
    await this.request('POST', '/rest/v1/projects?on_conflict=id', [{
      id, name, doc, owner: this.session!.userId, updated_at: new Date().toISOString(),
    }], { prefer: 'resolution=merge-duplicates,return=minimal' });
  }

  async loadProject(id: string): Promise<CircuitDocument | null> {
    const rows = await this.request<{ doc: unknown }[]>('GET', `/rest/v1/projects?select=doc&id=eq.${encodeURIComponent(id)}`);
    const doc = rows[0]?.doc;
    if (!doc) return null;
    if (!validateDocument(doc)) throw new CloudError('O projeto na nuvem não tem um formato válido.', 422);
    return doc;
  }

  async setPublic(id: string, isPublic: boolean): Promise<void> {
    await this.request('PATCH', `/rest/v1/projects?id=eq.${encodeURIComponent(id)}`, { is_public: isPublic }, { prefer: 'return=minimal' });
  }

  /** Anyone can read a project that its owner has made public (no sign-in needed). */
  async loadShared(id: string): Promise<CircuitDocument | null> {
    const rows = await this.request<{ doc: unknown }[]>('GET', `/rest/v1/projects?select=doc&id=eq.${encodeURIComponent(id)}&is_public=eq.true`, undefined, { auth: false });
    const doc = rows[0]?.doc;
    return doc && validateDocument(doc) ? doc : null;
  }

  async deleteProject(id: string): Promise<void> {
    await this.request('DELETE', `/rest/v1/projects?id=eq.${encodeURIComponent(id)}`, undefined, { prefer: 'return=minimal' });
  }

  // ───────── internals ─────────

  private requireSession() {
    if (!this.session) throw new CloudError('Inicie sessão para usar os projetos na nuvem.', 401);
  }

  private async request<T = unknown>(method: string, path: string, body?: unknown, opts: { auth?: boolean; prefer?: string } = {}): Promise<T> {
    const headers: Record<string, string> = { apikey: this.anonKey, 'Content-Type': 'application/json' };
    const useAuth = opts.auth ?? true;
    if (useAuth) headers.Authorization = `Bearer ${this.session?.accessToken ?? this.anonKey}`;
    if (opts.prefer) headers.Prefer = opts.prefer;
    const res = await this.http(`${this.url}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      let message = `Erro ${res.status} na nuvem.`;
      try { const j = (await res.json()) as { msg?: string; message?: string; error_description?: string }; message = j.error_description ?? j.msg ?? j.message ?? message; } catch { /* no json */ }
      throw new CloudError(message, res.status);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** Configuration from the build environment (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). Null when not configured. */
export function cloudFromEnv(env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>): SupabaseCloud | null {
  const url = env.VITE_SUPABASE_URL, key = env.VITE_SUPABASE_ANON_KEY;
  return url && key ? new SupabaseCloud(url, key) : null;
}
