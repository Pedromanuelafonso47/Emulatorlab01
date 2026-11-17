// Compile service for the simulator: turns an Arduino sketch into an Intel HEX file with arduino-cli.
//
//   node tools/compile-server.mjs                     → http://127.0.0.1:8787 (local development)
//
// Configuration (environment variables, all optional):
//   PORT               listen port                         (default 8787; COMPILE_PORT also accepted)
//   HOST               listen address                      (default 127.0.0.1; use 0.0.0.0 in containers)
//   ALLOWED_ORIGINS    comma-separated browser origins     (default: localhost / 127.0.0.1 on any port)
//   ARDUINO_CLI        path to the arduino-cli binary      (default: tools/bin/arduino-cli[.exe])
//   ARDUINO_CLI_CONFIG path to the arduino-cli config       (default: tools/arduino-cli.yaml)
//   MAX_CONCURRENT     compilations running at once        (default 2)
//   COMPILE_TIMEOUT_S  seconds before a compilation is killed (default 120)
//   RATE_PER_MINUTE    compile requests per client IP       (default 30)
//
// Safety: the request body is size-limited, arduino-cli is started with an argument array (never a shell),
// concurrency and time are bounded, and sketch text is never written to the log.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const CLI = env.ARDUINO_CLI ?? join(HERE, 'bin', process.platform === 'win32' ? 'arduino-cli.exe' : 'arduino-cli');
const CONFIG = env.ARDUINO_CLI_CONFIG ?? join(HERE, 'arduino-cli.yaml');
const WORK = join(HERE, 'work');
const PORT = Number(env.PORT ?? env.COMPILE_PORT ?? 8787);
const HOST = env.HOST ?? '127.0.0.1';
const MAX_BODY = 64 * 1024;
const MAX_CONCURRENT = Number(env.MAX_CONCURRENT ?? 2);
const TIMEOUT_MS = Number(env.COMPILE_TIMEOUT_S ?? 120) * 1000;
const RATE = Number(env.RATE_PER_MINUTE ?? 30);
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const ALLOWED = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean) : null;
const BOARDS = new Set(['arduino:avr:uno', 'arduino:avr:nano', 'arduino:avr:mega', 'rp2040:rp2040:rpipico']);

const cache = new Map();
const hits = new Map();          // ip → timestamps of recent requests
let running = 0;
const waiting = [];

function originAllowed(origin) {
  if (!origin) return false;
  if (ALLOWED) return ALLOWED.includes(origin);
  return LOCAL_ORIGIN.test(origin);
}

/** Fixed-window limiter per client address. */
function rateOk(ip) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (list.length >= RATE) { hits.set(ip, list); return false; }
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 10_000) hits.clear();
  return true;
}

/** At most MAX_CONCURRENT compilations; the rest wait their turn. */
function slot() {
  if (running < MAX_CONCURRENT) { running++; return Promise.resolve(); }
  return new Promise((r) => waiting.push(r));
}
function release() {
  const next = waiting.shift();
  if (next) next(); else running--;
}

function run(args) {
  return new Promise((resolveRun) => {
    const p = spawn(CLI, ['--config-file', CONFIG, ...args], { windowsHide: true });
    let out = '', err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); err += '\nTempo esgotado.'; }, TIMEOUT_MS);
    p.stdout.on('data', (d) => { if (out.length < 200_000) out += d; });
    p.stderr.on('data', (d) => { if (err.length < 200_000) err += d; });
    p.on('close', (code) => { clearTimeout(timer); resolveRun({ code, out, err }); });
    p.on('error', (e) => { clearTimeout(timer); resolveRun({ code: -1, out, err: String(e) }); });
  });
}

/** Parses gcc-style diagnostics: sketch.ino:LINE:COL: error: MESSAGE. Missing headers are reported separately. */
export function parseErrors(text) {
  const errors = [];
  const re = /sketch\.ino:(\d+):(\d+): (?:fatal )?error: (.+)/g;
  let m;
  while ((m = re.exec(text))) errors.push({ line: Number(m[1]), col: Number(m[2]), message: m[3].trim() });
  const header = /fatal error: ([^:\s]+\.h): No such file/.exec(text);
  return { errors, missingHeader: header ? header[1] : null };
}

async function compile(code, fqbn) {
  const key = createHash('sha256').update(fqbn + '\n' + code).digest('hex');
  if (cache.has(key)) return cache.get(key);
  await slot();
  try {
    const dir = join(WORK, key.slice(0, 16));
    const sketchDir = join(dir, 'sketch');
    const outDir = join(dir, 'out');
    await rm(dir, { recursive: true, force: true });
    await mkdir(sketchDir, { recursive: true });
    await writeFile(join(sketchDir, 'sketch.ino'), code, 'utf8');
    const r = await run(['compile', '--fqbn', fqbn, '--output-dir', outDir, sketchDir]);
    let result;
    if (r.code === 0) {
      const hex = await readFile(join(outDir, 'sketch.ino.hex'), 'utf8');
      result = { ok: true, hex, size: r.out.match(/Sketch uses (\d+) bytes/)?.[1] ?? null };
    } else {
      const text = r.err + r.out;
      const { errors, missingHeader } = parseErrors(text);
      result = { ok: false, errors: errors.length ? errors : [{ line: 1, col: 1, message: text.split('\n').find((l) => /error/i.test(l)) ?? 'Falha na compilação.' }], missingHeader };
    }
    await rm(dir, { recursive: true, force: true });   // the HEX is kept in the cache, not on disk
    if (cache.size > 200) cache.clear();
    cache.set(key, result);
    return result;
  } finally {
    release();
  }
}

const send = (res, status, body, origin) => {
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Vary': 'Origin' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type';
  }
  res.writeHead(status, headers);
  res.end(body === null ? undefined : JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  const origin = req.headers.origin ?? '';
  const allowed = originAllowed(origin) ? origin : null;
  if (req.method === 'OPTIONS') return send(res, allowed ? 204 : 403, null, allowed);
  if (req.method !== 'POST' || req.url !== '/compile') return send(res, 404, { ok: false, error: 'not found' }, allowed);
  if (!allowed) return send(res, 403, { ok: false, error: 'Origem não permitida.' }, null);
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!rateOk(ip)) return send(res, 429, { ok: false, error: 'Demasiados pedidos. Tente de novo dentro de um minuto.' }, allowed);
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) return send(res, 413, { ok: false, error: 'Programa demasiado grande.' }, allowed);
  }
  let parsed;
  try { parsed = JSON.parse(body); } catch { return send(res, 400, { ok: false, error: 'JSON inválido.' }, allowed); }
  if (!BOARDS.has(parsed.fqbn)) return send(res, 400, { ok: false, error: `Placa não suportada: ${parsed.fqbn}` }, allowed);
  if (typeof parsed.code !== 'string' || !parsed.code.trim()) return send(res, 400, { ok: false, error: 'Programa vazio.' }, allowed);
  if (!existsSync(CLI)) return send(res, 503, { ok: false, error: 'arduino-cli não encontrado.' }, allowed);
  try {
    return send(res, 200, await compile(parsed.code, parsed.fqbn), allowed);
  } catch (e) {
    console.error('compile failed:', String(e?.message ?? e));
    return send(res, 500, { ok: false, error: 'Falha interna na compilação.' }, allowed);
  }
});

// Run only when executed directly (the parser above is also used by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  server.listen(PORT, HOST, () => console.log(`compile service on http://${HOST}:${PORT}`));
}

export { server, compile };
