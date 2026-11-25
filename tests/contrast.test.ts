import assert from 'node:assert/strict';
import test from 'node:test';
import {
  MAX_COLOR_INPUT_LENGTH,
  MAX_HASH_LENGTH,
  WCAG_THRESHOLDS,
  contrastRatio,
  decodeHashState,
  encodeHashState,
  evaluateContrast,
  findNearestPassingColor,
  formatContrastRatio,
  formatRgb,
  hslToRgb,
  parseColor,
  pickReadableInk,
  relativeLuminance,
  rgbToHex,
  rgbToHsl,
  roundContrastRatio,
} from '../src/core/index.ts';

test('parseColor parses hex and RGB forms and rejects invalid or alpha strings', () => {
  assert.deepEqual(parseColor('#777'), { r: 119, g: 119, b: 119 });
  assert.deepEqual(parseColor('777'), { r: 119, g: 119, b: 119 });
  assert.deepEqual(parseColor('#fff'), { r: 255, g: 255, b: 255 });
  assert.deepEqual(parseColor('#140A22'), { r: 20, g: 10, b: 34 });
  assert.deepEqual(parseColor('rgb(119, 119, 119)'), { r: 119, g: 119, b: 119 });
  assert.deepEqual(parseColor('RGB(20 10 34)'), { r: 20, g: 10, b: 34 });
  assert.deepEqual(parseColor('255, 242, 222'), { r: 255, g: 242, b: 222 });

  assert.equal(parseColor(''), null);
  assert.equal(parseColor('#1234'), null);
  assert.equal(parseColor('#12345678'), null);
  assert.equal(parseColor('rgb(256, 0, 0)'), null);
  assert.equal(parseColor('rgb(1.5, 2, 3)'), null);
  assert.equal(parseColor('1.5, 2, 3'), null);
  assert.equal(parseColor('rgb(0,0,0) rgb(0,0,0)'), null);
  assert.equal(parseColor('rgba(0, 0, 0, 0.5)'), null);
  assert.equal(parseColor(' '.repeat(MAX_COLOR_INPUT_LENGTH + 1) + '#fff'), null);
});

test('parseColor and decodeHashState resist ReDoS and enforce input length limits', () => {
  const hostileRgb = `rgb(${' '.repeat(100_000)}x`;
  const t0 = performance.now();
  assert.equal(parseColor(hostileRgb), null);
  const dtRgb = performance.now() - t0;
  assert.ok(dtRgb < 50, `Expected linear rejection (<50ms), took ${dtRgb.toFixed(2)}ms`);

  const shortHostile = `rgb(${' '.repeat(55)}x`;
  assert.ok(shortHostile.length <= MAX_COLOR_INPUT_LENGTH);
  assert.equal(parseColor(shortHostile), null);

  const hostileHash = `#fg=rgb(${'+'.repeat(100_000)}x&bg=fff`;
  const t1 = performance.now();
  assert.deepEqual(decodeHashState(hostileHash), {});
  const dtHash = performance.now() - t1;
  assert.ok(dtHash < 50, `Expected linear hash rejection (<50ms), took ${dtHash.toFixed(2)}ms`);

  const overCapHash = `#fg=777&bg=fff&pad=${'a'.repeat(MAX_HASH_LENGTH)}`;
  assert.deepEqual(decodeHashState(overCapHash), {});
});

test('known WCAG contrast pairs match spec (#777 on #fff = 4.48, black on white = 21)', () => {
  const black = parseColor('#000')!;
  const white = parseColor('#fff')!;
  const gray777 = parseColor('#777')!;
  const gray767676 = parseColor('#767676')!;

  assert.equal(relativeLuminance(black), 0);
  assert.equal(relativeLuminance(white), 1);

  assert.equal(roundContrastRatio(contrastRatio(black, white)), 21);
  assert.equal(formatContrastRatio(contrastRatio(black, white)), '21:1');
  assert.equal(roundContrastRatio(contrastRatio(white, white)), 1);

  const r777 = evaluateContrast(gray777, white);
  assert.equal(r777.rounded, 4.48);
  assert.equal(r777.formatted, '4.48:1');
  assert.equal(r777.checks.normalAA, false);
  assert.equal(r777.checks.normalAAA, false);
  assert.equal(r777.checks.largeAA, true);
  assert.equal(r777.checks.largeAAA, false);
  assert.equal(r777.checks.uiAA, true);
  assert.equal(r777.grade, 'AA Large');

  const r76 = evaluateContrast(gray767676, white);
  assert.equal(r76.rounded, 4.54);
  assert.equal(r76.checks.normalAA, true);
  assert.equal(r76.checks.normalAAA, false);
});

test('findNearestPassingColor produces verified passing colors and returns null when impossible', () => {
  const white = parseColor('#fff')!;
  const gray777 = parseColor('#777')!;
  const fixed = findNearestPassingColor(gray777, white, WCAG_THRESHOLDS.normalAA);
  assert.ok(fixed);
  assert.equal(fixed.direction, 'darker');
  assert.equal(fixed.flipsPolarity, false);
  assert.ok(fixed.ratio >= 4.5);
  assert.equal(contrastRatio(parseColor(fixed.hex)!, white), fixed.ratio);

  const bgPolarityFlip = findNearestPassingColor(white, gray777, WCAG_THRESHOLDS.normalAA);
  assert.ok(bgPolarityFlip);
  assert.equal(bgPolarityFlip.direction, 'darker');
  assert.equal(bgPolarityFlip.flipsPolarity, true);
  assert.ok(bgPolarityFlip.ratio >= 4.5);

  const midGray = parseColor('#767676')!;
  assert.equal(findNearestPassingColor(white, midGray, WCAG_THRESHOLDS.normalAAA), null);
  const bgFix = findNearestPassingColor(midGray, white, WCAG_THRESHOLDS.normalAAA);
  assert.ok(bgFix);
  assert.ok(bgFix.ratio >= 7);
});

test('URL hash roundtrip, formatting, HSL, and readable ink helpers work accurately', () => {
  const fg = parseColor('#140a22')!;
  const bg = parseColor('#fff2de')!;
  const hash = encodeHashState(fg, bg);
  assert.equal(hash, '#fg=140a22&bg=fff2de');
  assert.deepEqual(decodeHashState(hash), { fg, bg });
  assert.deepEqual(decodeHashState('#fg=777&bg=nothex'), { fg: { r: 119, g: 119, b: 119 } });

  assert.equal(rgbToHex(fg), '#140a22');
  assert.equal(formatRgb(fg), 'rgb(20, 10, 34)');
  const back = hslToRgb(rgbToHsl(fg));
  assert.ok(Math.abs(back.r - fg.r) <= 1);
  assert.equal(pickReadableInk(bg), '#140a22');
  assert.equal(pickReadableInk(fg), '#fff2de');
});
