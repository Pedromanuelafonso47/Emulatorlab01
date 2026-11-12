/** SI-prefix parsing/formatting used by property editors ("4k7", "100n", "2.2M", "10µ"). */

const PREFIXES: Record<string, number> = {
  p: 1e-12, n: 1e-9, u: 1e-6, 'µ': 1e-6, 'μ': 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9,
};

/** Parse a value with optional SI prefix and unit. Supports RKM notation (4k7 = 4700). Returns NaN if invalid. */
export function parseSI(input: string | number): number {
  if (typeof input === 'number') return input;
  let s = input.trim().replace(/,/g, '.').replace(/\s+/g, '');
  s = s.replace(/(Ω|ohms?|F|H|V|A|W|Hz|s)$/i, (m) => (/^(m|M)$/.test(m) ? m : ''));
  // RKM notation: 4k7, 2R2, 1M5
  const rkm = s.match(/^(\d+)([pnuµμmkKMGR])(\d+)$/);
  if (rkm) {
    const mult = rkm[2] === 'R' ? 1 : PREFIXES[rkm[2]];
    return parseFloat(`${rkm[1]}.${rkm[3]}`) * mult;
  }
  const m = s.match(/^([-+]?\d*\.?\d+(?:e[-+]?\d+)?)([pnuµμmkKMGR]?)$/i);
  if (!m) return NaN;
  const p = m[2] === 'R' || m[2] === 'r' ? '' : m[2];
  const mult = PREFIXES[p];
  if (mult === undefined) return NaN;
  return parseFloat(m[1]) * mult;
}

const FMT: [number, string][] = [
  [1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p'],
];

export function formatSI(value: number, unit = '', digits = 3): string {
  if (!isFinite(value)) return '—';
  if (value === 0) return `0 ${unit}`.trim();
  const abs = Math.abs(value);
  for (const [f, p] of FMT) {
    if (abs >= f * 0.9999) {
      const n = value / f;
      return `${+n.toPrecision(digits)} ${p}${unit}`.trim();
    }
  }
  return `${+(value / 1e-12).toPrecision(digits)} p${unit}`;
}

/** 4-band resistor colour code. Returns band colour names (digit1, digit2, multiplier, tolerance). */
export const BAND_COLORS = ['#1b1b1b', '#7a4a1d', '#d22a1e', '#f07d14', '#f2d21b', '#2c9a3a', '#2357c4', '#7b3fb5', '#8a8a8a', '#f5f5f5'];
export const GOLD = '#c9a43a';
export const SILVER = '#c7ccd1';

export function resistorBands(ohms: number, tolerancePct = 5): string[] {
  if (!(ohms > 0)) return [BAND_COLORS[0], BAND_COLORS[0], BAND_COLORS[0], GOLD];
  let exp = Math.floor(Math.log10(ohms)) - 1;
  let sig = Math.round(ohms / 10 ** exp);
  if (sig >= 100) { sig = Math.round(sig / 10); exp += 1; }
  const d1 = Math.floor(sig / 10), d2 = sig % 10;
  const mult = exp === -1 ? GOLD : exp === -2 ? SILVER : BAND_COLORS[Math.max(0, Math.min(9, exp))];
  const tol = tolerancePct <= 1 ? BAND_COLORS[1] : tolerancePct <= 2 ? BAND_COLORS[2] : tolerancePct <= 5 ? GOLD : SILVER;
  return [BAND_COLORS[d1], BAND_COLORS[d2], mult, tol];
}
