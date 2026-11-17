/**
 * Client for the local compile service (tools/compile-server.mjs). Returns the HEX of a sketch, or
 * says why the sketch must run on the built-in interpreter instead.
 */
export type CompileOutcome =
  | { kind: 'hex'; hex: string }
  | { kind: 'error'; errors: { line: number; col: number; message: string }[] }
  | { kind: 'library'; header: string }
  | { kind: 'unavailable'; reason: string };

const FQBN: Record<string, string> = {
  'arduino-uno': 'arduino:avr:uno',
  'arduino-nano': 'arduino:avr:nano',
  'arduino-mega': 'arduino:avr:mega',
};

const SERVICE = (import.meta.env.VITE_COMPILE_URL as string | undefined) ?? 'http://127.0.0.1:8787';
const cache = new Map<string, CompileOutcome>();

/** Boards whose sketches are compiled and run on the AVR emulator. */
export const isEmulatedBoard = (board: string) => board in FQBN;

export async function compileForBoard(board: string, code: string): Promise<CompileOutcome> {
  const fqbn = FQBN[board];
  if (!fqbn) return { kind: 'unavailable', reason: 'Placa sem emulador de processador.' };
  const key = fqbn + '\n' + code;
  const hit = cache.get(key);
  if (hit) return hit;
  let outcome: CompileOutcome;
  try {
    const res = await fetch(`${SERVICE}/compile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fqbn, code }),
    });
    const body = (await res.json()) as { ok: boolean; hex?: string; errors?: { line: number; col: number; message: string }[]; missingHeader?: string | null; error?: string };
    if (body.ok && body.hex) outcome = { kind: 'hex', hex: body.hex };
    else if (body.missingHeader) outcome = { kind: 'library', header: body.missingHeader };
    else if (body.errors) outcome = { kind: 'error', errors: body.errors };
    else outcome = { kind: 'unavailable', reason: body.error ?? 'Falha no serviço de compilação.' };
  } catch {
    outcome = { kind: 'unavailable', reason: 'Serviço de compilação não está a correr (node tools/compile-server.mjs).' };
  }
  // Only cache real results: an unavailable service should be retried on the next run.
  if (outcome.kind !== 'unavailable') cache.set(key, outcome);
  return outcome;
}
