// Pure browser-side WCAG 2.1/2.2 color contrast math, color parsing, nearest passing color
// solver, and URL hash state helpers. No dependencies, no network calls.

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number; // 0..360
  s: number; // 0..1
  l: number; // 0..1
}

export interface WcagChecks {
  normalAA: boolean;
  normalAAA: boolean;
  largeAA: boolean;
  largeAAA: boolean;
  uiAA: boolean;
}

export type ContrastGrade = 'AAA' | 'AA' | 'AA Large' | 'Fail';

export interface ContrastReport {
  fg: RgbColor;
  bg: RgbColor;
  fgHex: string;
  bgHex: string;
  ratio: number;
  rounded: number;
  formatted: string;
  checks: WcagChecks;
  grade: ContrastGrade;
  verdict: string;
}

export interface NearestColorResult {
  rgb: RgbColor;
  hex: string;
  ratio: number;
  rounded: number;
  formatted: string;
  direction: 'unchanged' | 'darker' | 'lighter';
  flipsPolarity: boolean;
}

export interface HashColorState {
  fg?: RgbColor;
  bg?: RgbColor;
}

export const MAX_COLOR_INPUT_LENGTH = 64;
export const MAX_HASH_LENGTH = 256;

export const WCAG_THRESHOLDS = {
  normalAA: 4.5,
  normalAAA: 7,
  largeAA: 3,
  largeAAA: 4.5,
  uiAA: 3,
} as const;

export const DEFAULT_FG = '#fff2de';
export const DEFAULT_BG = '#140a22';

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function toHexByte(value: number): string {
  return clampByte(value).toString(16).padStart(2, '0');
}

export function rgbToHex(rgb: RgbColor): string {
  return `#${toHexByte(rgb.r)}${toHexByte(rgb.g)}${toHexByte(rgb.b)}`;
}

export function formatRgb(rgb: RgbColor): string {
  return `rgb(${clampByte(rgb.r)}, ${clampByte(rgb.g)}, ${clampByte(rgb.b)})`;
}

function parseChannelValue(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const num = Number(raw);
  if (!Number.isInteger(num) || num < 0 || num > 255) return null;
  return num;
}

/**
 * Parse a hex color (#rgb, #rrggbb, with or without leading #) or RGB color
 * (rgb(r, g, b), rgb(r g b), or r, g, b) with integer 0..255 channels.
 * Returns null on invalid, oversized, fractional, or alpha inputs.
 */
export function parseColor(input: string): RgbColor | null {
  if (typeof input !== 'string' || input.length > MAX_COLOR_INPUT_LENGTH) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Hex: #rgb, rgb, #rrggbb, rrggbb
  const hexMatch = trimmed.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hexMatch) {
    const digits = hexMatch[1];
    if (digits.length === 3) {
      return {
        r: Number.parseInt(digits[0] + digits[0], 16),
        g: Number.parseInt(digits[1] + digits[1], 16),
        b: Number.parseInt(digits[2] + digits[2], 16),
      };
    }
    return {
      r: Number.parseInt(digits.slice(0, 2), 16),
      g: Number.parseInt(digits.slice(2, 4), 16),
      b: Number.parseInt(digits.slice(4, 6), 16),
    };
  }

  // rgb(r, g, b) or rgb(r g b) via a strictly linear parser
  if (
    trimmed.length >= 5 &&
    trimmed.slice(0, 4).toLowerCase() === 'rgb(' &&
    trimmed.endsWith(')')
  ) {
    const body = trimmed.slice(4, -1).trim();
    if (!body || body.includes('(') || body.includes(')')) return null;
    const parts = body.includes(',')
      ? body.split(',').map((part) => part.trim())
      : body.split(/\s+/);
    if (parts.length !== 3) return null;
    const r = parseChannelValue(parts[0]);
    const g = parseChannelValue(parts[1]);
    const b = parseChannelValue(parts[2]);
    if (r === null || g === null || b === null) return null;
    return { r, g, b };
  }

  // Bare comma triplet: r, g, b
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((part) => part.trim());
    if (parts.length === 3) {
      const r = parseChannelValue(parts[0]);
      const g = parseChannelValue(parts[1]);
      const b = parseChannelValue(parts[2]);
      if (r !== null && g !== null && b !== null) {
        return { r, g, b };
      }
    }
  }

  return null;
}

/**
 * WCAG 2.1 / 2.2 relative luminance for an 8-bit sRGB color.
 * Note: For all 8-bit integers 0..255, threshold 0.04045 (WCAG 2.1/2.2) and
 * 0.03928 (WCAG 2.0) give the exact same result because 10/255 < 0.03928 and 11/255 > 0.04045.
 */
export function relativeLuminance(rgb: RgbColor): number {
  const linearize = (channel: number): number => {
    const s = clampByte(channel) / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

/**
 * Exact unrounded WCAG 2.x contrast ratio in the range [1, 21].
 */
export function contrastRatio(fg: RgbColor, bg: RgbColor): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function roundContrastRatio(ratio: number): number {
  return Math.round(ratio * 100) / 100;
}

export function formatContrastRatio(ratio: number): string {
  const rounded = roundContrastRatio(ratio);
  return Number.isInteger(rounded) ? `${rounded}:1` : `${rounded.toFixed(2)}:1`;
}

export function evaluateContrast(fg: RgbColor, bg: RgbColor): ContrastReport {
  const ratio = contrastRatio(fg, bg);
  const rounded = roundContrastRatio(ratio);
  const checks: WcagChecks = {
    normalAA: ratio >= WCAG_THRESHOLDS.normalAA,
    normalAAA: ratio >= WCAG_THRESHOLDS.normalAAA,
    largeAA: ratio >= WCAG_THRESHOLDS.largeAA,
    largeAAA: ratio >= WCAG_THRESHOLDS.largeAAA,
    uiAA: ratio >= WCAG_THRESHOLDS.uiAA,
  };

  let grade: ContrastGrade;
  let verdict: string;
  if (checks.normalAAA) {
    grade = 'AAA';
    verdict = 'Sharp and clear everywhere. Passes small text, big headings, and UI parts at AAA.';
  } else if (checks.normalAA) {
    grade = 'AA';
    verdict =
      'Solid for normal text, big headings, and UI parts at AA. Push it higher if you want AAA for small text.';
  } else if (checks.largeAA) {
    grade = 'AA Large';
    verdict = 'Too faint for small text. Fine for big headings and UI parts.';
  } else {
    grade = 'Fail';
    verdict = 'Too faint for text and UI parts. Hard to read at any size.';
  }

  return {
    fg,
    bg,
    fgHex: rgbToHex(fg),
    bgHex: rgbToHex(bg),
    ratio,
    rounded,
    formatted: formatContrastRatio(ratio),
    checks,
    grade,
    verdict,
  };
}

export function rgbToHsl(rgb: RgbColor): HslColor {
  const r = clampByte(rgb.r) / 255;
  const g = clampByte(rgb.g) / 255;
  const b = clampByte(rgb.b) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;

  if (d === 0) {
    return { h: 0, s: 0, l };
  }

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) {
    h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  } else if (max === g) {
    h = ((b - r) / d + 2) * 60;
  } else {
    h = ((r - g) / d + 4) * 60;
  }

  return { h, s, l };
}

export function hslToRgb(hsl: HslColor): RgbColor {
  const h = ((hsl.h % 360) + 360) % 360;
  const s = Math.min(1, Math.max(0, hsl.s));
  const l = Math.min(1, Math.max(0, hsl.l));

  if (s === 0) {
    const gray = clampByte(l * 255);
    return { r: gray, g: gray, b: gray };
  }

  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hueToChannel = (t: number): number => {
    let wrapped = t;
    if (wrapped < 0) wrapped += 1;
    if (wrapped > 1) wrapped -= 1;
    if (wrapped < 1 / 6) return p + (q - p) * 6 * wrapped;
    if (wrapped < 1 / 2) return q;
    if (wrapped < 2 / 3) return p + (q - p) * (2 / 3 - wrapped) * 6;
    return p;
  };

  const hk = h / 360;
  return {
    r: clampByte(hueToChannel(hk + 1 / 3) * 255),
    g: clampByte(hueToChannel(hk) * 255),
    b: clampByte(hueToChannel(hk - 1 / 3) * 255),
  };
}

function perceptualDistance(a: RgbColor, b: RgbColor): number {
  const rMean = (a.r + b.r) / 2;
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return Math.sqrt(
    (2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db,
  );
}

const BLACK: RgbColor = { r: 0, g: 0, b: 0 };
const WHITE: RgbColor = { r: 255, g: 255, b: 255 };

function searchLightness(
  hsl: HslColor,
  fixed: RgbColor,
  targetRatio: number,
  direction: 'darker' | 'lighter',
): RgbColor | null {
  const extreme = direction === 'darker' ? BLACK : WHITE;
  if (contrastRatio(extreme, fixed) < targetRatio) {
    return null;
  }

  let best: RgbColor = extreme;
  let low = direction === 'darker' ? 0 : hsl.l;
  let high = direction === 'darker' ? hsl.l : 1;

  for (let step = 0; step < 24; step += 1) {
    const mid = (low + high) / 2;
    const candidate = hslToRgb({ h: hsl.h, s: hsl.s, l: mid });
    if (contrastRatio(candidate, fixed) >= targetRatio) {
      best = candidate;
      if (direction === 'darker') {
        low = mid;
      } else {
        high = mid;
      }
    } else if (direction === 'darker') {
      high = mid;
    } else {
      low = mid;
    }
  }

  return best;
}

/**
 * Find the nearest sRGB color to `moving` (keeping hue and saturation while shifting lightness)
 * that reaches `targetRatio` against `fixed`. Returns null when no sRGB color can reach
 * `targetRatio` against `fixed` (for example, 7:1 against a mid-tone gray).
 */
export function findNearestPassingColor(
  moving: RgbColor,
  fixed: RgbColor,
  targetRatio: number,
): NearestColorResult | null {
  if (!Number.isFinite(targetRatio) || targetRatio < 1 || targetRatio > 21) {
    throw new RangeError('Target contrast ratio must be between 1 and 21.');
  }

  const currentRatio = contrastRatio(moving, fixed);
  if (currentRatio >= targetRatio) {
    return {
      rgb: moving,
      hex: rgbToHex(moving),
      ratio: currentRatio,
      rounded: roundContrastRatio(currentRatio),
      formatted: formatContrastRatio(currentRatio),
      direction: 'unchanged',
      flipsPolarity: false,
    };
  }

  const hsl = rgbToHsl(moving);
  const darker = searchLightness(hsl, fixed, targetRatio, 'darker');
  const lighter = searchLightness(hsl, fixed, targetRatio, 'lighter');

  if (!darker && !lighter) return null;

  let chosen: RgbColor;
  let direction: 'darker' | 'lighter';
  if (darker && lighter) {
    if (perceptualDistance(moving, darker) <= perceptualDistance(moving, lighter)) {
      chosen = darker;
      direction = 'darker';
    } else {
      chosen = lighter;
      direction = 'lighter';
    }
  } else if (darker) {
    chosen = darker;
    direction = 'darker';
  } else {
    chosen = lighter!;
    direction = 'lighter';
  }

  const ratio = contrastRatio(chosen, fixed);
  const movingLum = relativeLuminance(moving);
  const fixedLum = relativeLuminance(fixed);
  const chosenLum = relativeLuminance(chosen);
  const flipsPolarity =
    (movingLum > fixedLum && chosenLum < fixedLum) ||
    (movingLum < fixedLum && chosenLum > fixedLum);

  return {
    rgb: chosen,
    hex: rgbToHex(chosen),
    ratio,
    rounded: roundContrastRatio(ratio),
    formatted: formatContrastRatio(ratio),
    direction,
    flipsPolarity,
  };
}

/**
 * Pick high-contrast Patch Bandit ink or cream text for a given swatch background.
 */
export function pickReadableInk(bg: RgbColor): '#140a22' | '#fff2de' {
  const ink: RgbColor = { r: 0x14, g: 0x0a, b: 0x22 };
  const cream: RgbColor = { r: 0xff, g: 0xf2, b: 0xde };
  return contrastRatio(ink, bg) >= contrastRatio(cream, bg) ? '#140a22' : '#fff2de';
}

export function encodeHashState(fg: RgbColor, bg: RgbColor): string {
  return `#fg=${rgbToHex(fg).slice(1)}&bg=${rgbToHex(bg).slice(1)}`;
}

export function decodeHashState(hash: string): HashColorState {
  if (typeof hash !== 'string' || hash.length > MAX_HASH_LENGTH) return {};
  const cleaned = hash.replace(/^#/, '').trim();
  if (!cleaned) return {};
  const params = new URLSearchParams(cleaned);
  const fgRaw = params.get('fg');
  const bgRaw = params.get('bg');
  const out: HashColorState = {};
  if (fgRaw) {
    const parsed = parseColor(fgRaw);
    if (parsed) out.fg = parsed;
  }
  if (bgRaw) {
    const parsed = parseColor(bgRaw);
    if (parsed) out.bg = parsed;
  }
  return out;
}
