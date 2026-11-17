import { describe, it, expect } from 'vitest';
// @ts-expect-error — plain ESM helper outside src (tools/), imported for its parser only
import { parseErrors } from '../../../tools/compile-server.mjs';

describe('compile-service error parsing', () => {
  it('extracts line, column and message from gcc diagnostics', () => {
    const text = "Compiling sketch...\nsketch/sketch.ino: In function 'void loop()':\nsketch/sketch.ino:7:23: error: expected ';' before '}' token\n";
    const { errors, missingHeader } = parseErrors(text) as { errors: { line: number; col: number; message: string }[]; missingHeader: string | null };
    expect(errors).toEqual([{ line: 7, col: 23, message: "expected ';' before '}' token" }]);
    expect(missingHeader).toBeNull();
  });

  it('recognises a missing library header', () => {
    const text = 'sketch/sketch.ino:1:10: fatal error: DHT.h: No such file or directory\n';
    const { missingHeader } = parseErrors(text) as { missingHeader: string | null };
    expect(missingHeader).toBe('DHT.h');
  });
});
