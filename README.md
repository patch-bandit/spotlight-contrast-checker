# Spotlight: Color Contrast Checker

Check WCAG AA and AAA color contrast for hex or RGB pairs, see a live preview, and grab the nearest passing color right in your browser or terminal.

Use it online at [patchbandit.com/tools/contrast-checker](https://patchbandit.com/tools/contrast-checker/), or grab this repo and run it yourself. MIT licensed; see `LICENSE`.

## Quick example

```bash
node src/cli.ts "#777" "#fff"
```

Output:

```text
Foreground: #777777 (rgb(119, 119, 119))
Background: #ffffff (rgb(255, 255, 255))
Contrast:   4.48:1 (AA Large)
Verdict:    Too faint for small text. Fine for big headings and UI parts.

Normal text: AA (4.5:1) FAIL | AAA (7:1) FAIL
Large text:  AA (3:1) PASS   | AAA (4.5:1) FAIL
UI parts:    AA (3:1) PASS

Nearest passing colors for 4.5:1:
  Adjust text      : #767676 (4.54:1, darker)
  Adjust background: #060606 (4.52:1, darker, flips light/dark)
```

## What it does

- Accepts 3-digit hex, 6-digit hex, `rgb(r, g, b)`, `rgb(r g b)`, and native browser color pickers, plus a one-click swap button.
- Evaluates WCAG 2.1 and 2.2 contrast ratios for normal text (AA 4.5:1, AAA 7:1), large text (AA 3:1, AAA 4.5:1), and UI components and icons (AA 3:1).
- Suggests the nearest passing color for both foreground and background while holding hue and saturation steady.
- Stores shareable pairs in the URL hash only (`#fg=140a22&bg=fff2de`).
- Ships with no runtime dependencies.

## Privacy

Nothing leaves your device. The standalone page in `web/index.html` is a single static HTML file with no external scripts, no fonts loaded from outside hosts, no cookies, and no tracking. Shareable color pairs stay in the URL hash fragment, which browsers keep local.

## Standalone web page

Open `web/index.html` in any browser, or serve the `web/` directory with any static host.

## Command line

Requires Node 22.18+ or Node 24+ (native TypeScript execution, no build step):

```bash
node src/cli.ts "#140a22" "#fff2de"
node src/cli.ts "rgb(119, 119, 119)" "#ffffff" --target 7
node src/cli.ts "#000" "#fff" --json
```

Exit codes: `0` passes the target ratio (default `4.5`), `1` usage error, `2` invalid color or target, `3` valid pair that fails the target ratio.

## Library usage

Import the pure functions directly from `src/core/index.ts`:

```ts
import { evaluateContrast, findNearestPassingColor, parseColor } from './src/core/index.ts';

const fg = parseColor('#777')!;
const bg = parseColor('#fff')!;
const report = evaluateContrast(fg, bg);
const fix = findNearestPassingColor(fg, bg, 4.5);
```

## Tests

```bash
npm test
```

The test suite verifies known WCAG pairs (`#777` on `#fff` = `4.48`, `#000` on `#fff` = `21`), hex and RGB parsing, nearest-passing-color search (including mid-tone AAA edge cases), URL hash round trips, CLI exit codes, and repo hygiene (no absolute paths or network calls).

## Not yet

- Alpha / semi-transparent foreground compositing over a background (`rgba()` or 8-digit hex).
- APCA / WCAG 3 draft perceptual contrast scoring alongside WCAG 2.x ratios.
- Palette matrix mode for checking a full list of brand colors at once.

## License

MIT. See `LICENSE` and `NOTICE`.

Built and maintained by [Patch Bandit](https://patchbandit.com). Got an idea for the next tool? Drop it in [ideas](https://github.com/patch-bandit/ideas/discussions).
