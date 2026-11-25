#!/usr/bin/env node
import {
  WCAG_THRESHOLDS,
  evaluateContrast,
  findNearestPassingColor,
  formatRgb,
  parseColor,
} from './core/index.ts';

function usage(): void {
  console.error(
    'Usage: node src/cli.ts <foreground> <background> [--target <ratio>] [--json]\n' +
      'Example: node src/cli.ts "#777" "#fff"',
  );
}

const rawArgs = process.argv.slice(2);
const positional: string[] = [];
let jsonMode = false;
let target: number = WCAG_THRESHOLDS.normalAA;

for (let i = 0; i < rawArgs.length; i += 1) {
  const arg = rawArgs[i];
  if (arg === '--json') {
    jsonMode = true;
  } else if (arg === '--help' || arg === '-h') {
    usage();
    process.exit(0);
  } else if (arg === '--target') {
    const next = rawArgs[i + 1];
    if (!next) {
      console.error('Error: --target requires a number between 1 and 21.');
      process.exit(2);
    }
    target = Number(next);
    i += 1;
  } else if (arg.startsWith('-')) {
    console.error(`Error: unknown option ${arg}`);
    usage();
    process.exit(1);
  } else {
    positional.push(arg);
  }
}

if (positional.length !== 2) {
  usage();
  process.exit(1);
}

if (!Number.isFinite(target) || target < 1 || target > 21) {
  console.error('Error: --target must be a number between 1 and 21.');
  process.exit(2);
}

const fg = parseColor(positional[0]);
const bg = parseColor(positional[1]);
if (!fg || !bg) {
  console.error('Error: provide two valid hex or RGB colors (for example "#777" "#fff" or "rgb(20, 10, 34)" "#fff2de").');
  process.exit(2);
}

const report = evaluateContrast(fg, bg);
const nearestFg = findNearestPassingColor(fg, bg, target);
const nearestBg = findNearestPassingColor(bg, fg, target);
const passesTarget = report.ratio >= target;

if (jsonMode) {
  console.log(
    JSON.stringify(
      {
        foreground: { hex: report.fgHex, rgb: formatRgb(fg) },
        background: { hex: report.bgHex, rgb: formatRgb(bg) },
        ratio: report.rounded,
        exactRatio: report.ratio,
        formatted: report.formatted,
        grade: report.grade,
        verdict: report.verdict,
        checks: report.checks,
        target,
        passesTarget,
        nearest: {
          foreground: nearestFg,
          background: nearestBg,
        },
      },
      null,
      2,
    ),
  );
} else {
  const tag = (ok: boolean) => (ok ? 'PASS' : 'FAIL');
  const nearLine = (label: string, res: ReturnType<typeof findNearestPassingColor>) => {
    if (!res) return `  ${label}: no sRGB match for ${target}:1`;
    if (res.direction === 'unchanged') return `  ${label}: ${res.hex} (${res.formatted}, already passing)`;
    const note = res.flipsPolarity ? `${res.direction}, flips light/dark` : res.direction;
    return `  ${label}: ${res.hex} (${res.formatted}, ${note})`;
  };

  console.log(`Foreground: ${report.fgHex} (${formatRgb(fg)})`);
  console.log(`Background: ${report.bgHex} (${formatRgb(bg)})`);
  console.log(`Contrast:   ${report.formatted} (${report.grade})`);
  console.log(`Verdict:    ${report.verdict}`);
  console.log('');
  console.log(`Normal text: AA (4.5:1) ${tag(report.checks.normalAA)} | AAA (7:1) ${tag(report.checks.normalAAA)}`);
  console.log(`Large text:  AA (3:1) ${tag(report.checks.largeAA)}   | AAA (4.5:1) ${tag(report.checks.largeAAA)}`);
  console.log(`UI parts:    AA (3:1) ${tag(report.checks.uiAA)}`);
  console.log('');
  console.log(`Nearest passing colors for ${target}:1:`);
  console.log(nearLine('Adjust text      ', nearestFg));
  console.log(nearLine('Adjust background', nearestBg));
}

process.exit(passesTarget ? 0 : 3);
