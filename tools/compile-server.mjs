// Local compile service for the simulator: turns an Arduino sketch into an Intel HEX file with arduino-cli.
//   node tools/compile-server.mjs            → listens on http://127.0.0.1:8787
// Only localhost is accepted, the request body is size-limited, and arduino-cli is started with an argument
// array (never through a shell), so sketch text cannot inject commands.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, 'bin', 'arduino-cli.exe');
const CONFIG = join(HERE, 'arduino-cli.yaml');
const WORK = join(HERE, 'work');
const PORT = Number(process.env.COMPILE_PORT ?? 8787);
const MAX_BODY = 64 * 1024;
const ALLOWED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const BOARDS = {
  'arduino:avr:uno': 'arduino:avr:uno',
  'arduino:avr:nano': 'arduino:avr:nano',
};

const cache = new Map();

function run(args) {
  return new Promise((resolveRun) => {
    const p = spawn(CLI, ['--config-file', CONFIG, ...args], { windowsHide: true });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (err += d));
    p.on('close', (code) => resolveRun({ code, out, err }));
    p.on('error', (e) => resolveRun({ code: -1, out, err: String(e) }));
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
  if (cache.size > 200) cache.clear();
  cache.set(key, result);
  return result;
}

const send = (res, status, body, origin) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  res.end(JSON.stringify(body));
};

const server = createServer(async (req, res) => {
  const origin = req.headers.origin ?? '';
  const allowed = ALLOWED_ORIGIN.test(origin) ? origin : 'http://localhost:5173';
  if (req.method === 'OPTIONS') return send(res, 204, null, allowed);
  if (req.method !== 'POST' || req.url !== '/compile') return send(res, 404, { ok: false, error: 'not found' }, allowed);
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > MAX_BODY) return send(res, 413, { ok: false, error: 'Programa demasiado grande.' }, allowed);
  }
  let req2;
  try { req2 = JSON.parse(body); } catch { return send(res, 400, { ok: false, error: 'JSON inválido.' }, allowed); }
  const fqbn = BOARDS[req2.fqbn];
  if (!fqbn) return send(res, 400, { ok: false, error: `Placa não suportada: ${req2.fqbn}` }, allowed);
  if (typeof req2.code !== 'string' || !req2.code.trim()) return send(res, 400, { ok: false, error: 'Programa vazio.' }, allowed);
  if (!existsSync(CLI)) return send(res, 503, { ok: false, error: 'arduino-cli não encontrado em tools/bin.' }, allowed);
  try {
    return send(res, 200, await compile(req2.code, fqbn), allowed);
  } catch (e) {
    return send(res, 500, { ok: false, error: String(e?.message ?? e) }, allowed);
  }
});

// Run only when executed directly (the parser above is also used by tests).
if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  server.listen(PORT, '127.0.0.1', () => console.log(`compile service on http://127.0.0.1:${PORT}`));
}

export { server, compile };
