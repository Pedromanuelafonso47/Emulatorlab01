/**
 * Electrical and naming description of the boards that can run a sketch.
 * No imports: shared by the library-side builder (programs.ts) and the simulation runtime (host.ts).
 */
export interface BoardSpec {
  /** Logic high level (V) — also the pull-up rail. */
  vcc: number;
  /** ADC full-scale reference (V). */
  vref: number;
  /** ADC resolution in bits. */
  adcBits: number;
  /** Sketch number of the first analogue pin (A0), when the board numbers them separately. */
  analogBase?: number;
  /** Analogue pins with their sketch constants (A0…). */
  analogConsts?: Record<string, number>;
  /** PWM-capable pin names, or 'all' (ESP32 LEDC). */
  pwm: Set<string> | 'all';
}

const UNO_PWM = new Set(['D3', 'D5', 'D6', 'D9', 'D10', 'D11']);

const avrAnalog = (base: number, n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`A${i}`, base + i]));

export const BOARDS: Record<string, BoardSpec> = {
  'arduino-uno': { vcc: 5, vref: 5, adcBits: 10, analogBase: 14, analogConsts: avrAnalog(14, 6), pwm: UNO_PWM },
  'arduino-nano': { vcc: 5, vref: 5, adcBits: 10, analogBase: 14, analogConsts: avrAnalog(14, 8), pwm: UNO_PWM },
  'arduino-mega': { vcc: 5, vref: 5, adcBits: 10, analogBase: 54, analogConsts: avrAnalog(54, 16), pwm: new Set(['D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'D11', 'D12', 'D13', 'D44', 'D45', 'D46']) },
  'esp32-devkit': { vcc: 3.3, vref: 3.3, adcBits: 12, pwm: 'all' },
};

/** Whether a board type can run a sketch in this version of the simulator. */
export const isExecutableBoard = (type: string) => type in BOARDS;

/** Sketch number → board pin name (D0–D53 or A0+ for the analogue block). */
export function pinNameFor(spec: BoardSpec, n: number): string {
  if (spec.analogBase !== undefined && n >= spec.analogBase && n < spec.analogBase + 16) return `A${n - spec.analogBase}`;
  return `D${n}`;
}
