import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'src', 'cli.ts');

function runCli(args: string[]): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return {
      status: e.status ?? 1,
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
    };
  }
}

test('CLI passes with exit 0 for black on white (21:1) and supports --json', () => {
  const res = runCli(['#000', '#fff', '--json']);
  assert.equal(res.status, 0);
  const data = JSON.parse(res.stdout);
  assert.equal(data.ratio, 21);
  assert.equal(data.formatted, '21:1');
  assert.equal(data.passesTarget, true);
  assert.equal(data.checks.normalAAA, true);
});

test('CLI exits 3 for #777 on #fff (4.48:1) and reports nearest passing color', () => {
  const res = runCli(['#777', '#fff']);
  assert.equal(res.status, 3);
  assert.match(res.stdout, /4\.48:1/);
  assert.match(res.stdout, /Too faint for small text/);
  assert.match(res.stdout, /Adjust text\s*:\s*#767676 \(4\.54:1, darker\)/);
  assert.match(res.stdout, /Adjust background:\s*#060606 \(4\.52:1, darker, flips light\/dark\)/);

  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.ok(readme.includes(res.stdout.trim()), 'README.md Quick example output must match real CLI output');
});

test('standalone web/index.html has 17.34:1 default, maxlength=64, and linear rgb() parser', () => {
  const webHtml = fs.readFileSync(path.join(ROOT, 'web', 'index.html'), 'utf8');
  assert.ok(webHtml.includes('17.34:1'), 'web/index.html should display 17.34:1');
  assert.equal(webHtml.includes('17.16'), false, 'web/index.html must not contain stale 17.16');
  assert.match(webHtml, /id="fg-in"[^>]*maxlength="64"/);
  assert.match(webHtml, /id="bg-in"[^>]*maxlength="64"/);
  assert.equal(webHtml.includes('/^rgb\\(\\s*([^)]+)\\s*\\)$/i'), false, 'web/index.html must not use backtracking rgb() regex');
});

test('CLI exits 2 on invalid color input', () => {
  const res = runCli(['not-a-color', '#fff']);
  assert.equal(res.status, 2);
  assert.match(res.stderr, /valid hex or RGB/i);
});

test('repo hygiene: MIT copyright, Patch Bandit credit, no absolute paths, no network calls', () => {
  const license = fs.readFileSync(path.join(ROOT, 'LICENSE'), 'utf8');
  assert.match(license, /MIT License/);
  assert.match(license, /Copyright \(c\) 2026 Patch Bandit/);

  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');
  assert.match(readme, /https:\/\/patchbandit\.com\/tools\/contrast-checker\//);
  assert.match(readme, /Built and maintained by \[Patch Bandit\]\(https:\/\/patchbandit\.com\)/);
  assert.match(readme, /## Not yet/);

  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist') continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(full));
      else out.push(full);
    }
    return out;
  };

  const drivePathRx = /\b[A-Za-z]:[\\/](?:git|Users|python)|\b[CD]:[\\/]/;
  const networkRx = /\bfetch\s*\(|XMLHttpRequest|navigator\.sendBeacon/;

  for (const file of walk(ROOT)) {
    const text = fs.readFileSync(file, 'utf8');
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    if (rel !== 'tests/cli-and-hygiene.test.ts') {
      assert.equal(drivePathRx.test(text), false, `Absolute drive path found in ${rel}`);
      if (rel.startsWith('src/') || rel.startsWith('web/')) {
        assert.equal(networkRx.test(text), false, `Network call found in ${rel}`);
      }
    }
  }
});
