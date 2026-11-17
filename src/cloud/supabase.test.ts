import { describe, it, expect } from 'vitest';
import { SupabaseCloud, CloudError, cloudFromEnv } from './supabase';
import type { CircuitDocument } from '@/domain/types';

const doc: CircuitDocument = { version: 1, name: 'Teste', components: {}, wires: {}, junctions: {} };
const URL_BASE = 'https://example.supabase.co';

/** A fake Supabase: records every request and answers from a route table. */
function fakeHttp(routes: Record<string, (req: { method: string; url: string; headers: Record<string, string>; body: unknown }) => { status?: number; json?: unknown }>) {
  const calls: { method: string; url: string; headers: Record<string, string>; body: unknown }[] = [];
  const http = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const call = { method: init?.method ?? 'GET', url, headers, body };
    calls.push(call);
    const key = Object.keys(routes).find((k) => url.includes(k));
    const r = key ? routes[key](call) : { status: 404, json: { msg: 'not found' } };
    const status = r.status ?? 200;
    return new Response(status === 204 ? null : JSON.stringify(r.json ?? null), { status });
  }) as typeof fetch;
  return { http, calls };
}

describe('SupabaseCloud', () => {
  it('signs in with the anon key and keeps the session for later requests', async () => {
    const { http, calls } = fakeHttp({
      '/auth/v1/token': () => ({ json: { access_token: 'tok', refresh_token: 'r', user: { id: 'u1', email: 'a@b.pt' } } }),
    });
    const cloud = new SupabaseCloud(URL_BASE + '/', 'anon-key', http);
    const s = await cloud.signIn('a@b.pt', 'pw');
    expect(s.userId).toBe('u1');
    expect(calls[0].url).toBe(`${URL_BASE}/auth/v1/token?grant_type=password`);
    expect(calls[0].headers.apikey).toBe('anon-key');
    expect(calls[0].headers.Authorization).toBeUndefined();   // sign-in is not authenticated
    expect(calls[0].body).toEqual({ email: 'a@b.pt', password: 'pw' });
  });

  it('refuses to save to the cloud without a session', async () => {
    const { http, calls } = fakeHttp({});
    const cloud = new SupabaseCloud(URL_BASE, 'anon-key', http);
    await expect(cloud.saveProject('p1', 'Projeto', doc)).rejects.toBeInstanceOf(CloudError);
    expect(calls).toHaveLength(0);   // nothing leaves the browser without a session
  });

  it('saves a project as an upsert owned by the signed-in user', async () => {
    const { http, calls } = fakeHttp({
      '/auth/v1/token': () => ({ json: { access_token: 'tok', user: { id: 'u1', email: 'a@b.pt' } } }),
      '/rest/v1/projects': () => ({ status: 201, json: null }),
    });
    const cloud = new SupabaseCloud(URL_BASE, 'anon-key', http);
    await cloud.signIn('a@b.pt', 'pw');
    await cloud.saveProject('11111111-1111-4111-8111-111111111111', 'Projeto', doc);
    const save = calls[calls.length - 1];
    expect(save.method).toBe('POST');
    expect(save.url).toContain('on_conflict=id');
    expect(save.headers.Authorization).toBe('Bearer tok');
    expect(save.headers.Prefer).toContain('merge-duplicates');
    const row = (save.body as Record<string, unknown>[])[0];
    expect(row.owner).toBe('u1');
    expect(row.name).toBe('Projeto');
    expect(row.doc).toEqual(doc);
  });

  it('lists projects and maps the columns', async () => {
    const { http } = fakeHttp({
      '/auth/v1/token': () => ({ json: { access_token: 'tok', user: { id: 'u1', email: 'a@b.pt' } } }),
      '/rest/v1/projects?select=id': () => ({ json: [{ id: 'p1', name: 'Divisor', updated_at: '2026-01-01T00:00:00Z', is_public: true }] }),
    });
    const cloud = new SupabaseCloud(URL_BASE, 'anon-key', http);
    await cloud.signIn('a@b.pt', 'pw');
    expect(await cloud.listProjects()).toEqual([{ id: 'p1', name: 'Divisor', updatedAt: '2026-01-01T00:00:00Z', isPublic: true }]);
  });

  it('rejects a cloud document that is not a circuit', async () => {
    const { http } = fakeHttp({
      '/auth/v1/token': () => ({ json: { access_token: 'tok', user: { id: 'u1', email: 'a@b.pt' } } }),
      '/rest/v1/projects?select=doc': () => ({ json: [{ doc: { nope: true } }] }),
    });
    const cloud = new SupabaseCloud(URL_BASE, 'anon-key', http);
    await cloud.signIn('a@b.pt', 'pw');
    await expect(cloud.loadProject('p1')).rejects.toThrow(/formato válido/);
  });

  it('shows the server message on errors', async () => {
    const { http } = fakeHttp({
      '/auth/v1/token': () => ({ status: 400, json: { error_description: 'Invalid login credentials' } }),
    });
    const cloud = new SupabaseCloud(URL_BASE, 'anon-key', http);
    await expect(cloud.signIn('a@b.pt', 'x')).rejects.toThrow('Invalid login credentials');
  });

  it('reads shared projects anonymously', async () => {
    const { http, calls } = fakeHttp({ '/rest/v1/projects?select=doc': () => ({ json: [{ doc }] }) });
    const cloud = new SupabaseCloud(URL_BASE, 'anon-key', http);
    expect(await cloud.loadShared('p9')).toEqual(doc);
    expect(calls[0].url).toContain('is_public=eq.true');
    expect(calls[0].headers.apikey).toBe('anon-key');
    expect(calls[0].headers.Authorization).toBeUndefined();   // anonymous: the public key only
  });

  it('is not configured unless both environment variables are set', () => {
    expect(cloudFromEnv({})).toBeNull();
    expect(cloudFromEnv({ VITE_SUPABASE_URL: URL_BASE })).toBeNull();
    expect(cloudFromEnv({ VITE_SUPABASE_URL: URL_BASE, VITE_SUPABASE_ANON_KEY: 'k' })).toBeInstanceOf(SupabaseCloud);
  });
});
