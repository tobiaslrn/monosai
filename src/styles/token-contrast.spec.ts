import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * WCAG 2.2 contrast checks for the design tokens, in both themes.
 *
 * `testing-and-delivery.md` §6 requires this and nothing previously computed
 * it: Milestone 5 shipped a 2.4:1 badge that only manual inspection caught.
 * This parses the committed source of truth directly rather than duplicating
 * the palette as a second literal, so a future token edit cannot drift out of
 * sync with what this test checks.
 */

// Resolved from `process.cwd()`, matching the existing pattern in
// `allowed-actions.spec.ts`: the unit-test builder bundles spec files in a
// way that leaves both `__dirname` and `import.meta.url` pointing at a
// synthetic root rather than this file's real location, so neither is a
// reliable anchor. `process.cwd()` is the repo root wherever this runs.
const TOKENS_PATH = join(process.cwd(), 'src', 'styles', '_tokens.scss');

type Palette = ReadonlyMap<string, string>;

function extractMixin(source: string, mixinName: string): Palette {
  const start = source.indexOf(`@mixin ${mixinName}`);
  if (start === -1) {
    throw new Error(`mixin ${mixinName} not found in ${TOKENS_PATH}`);
  }
  const bodyStart = source.indexOf('{', start);
  const bodyEnd = source.indexOf('\n}', bodyStart);
  const body = source.slice(bodyStart, bodyEnd);

  const palette = new Map<string, string>();
  for (const match of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6});/g)) {
    palette.set(match[1], match[2].toLowerCase());
  }
  return palette;
}

function hexToRgb(hex: string): readonly [number, number, number] {
  const value = hex.slice(1);
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const channel = (component: number): number => {
    const normalized = component / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(hexA: string, hexB: string): number {
  const luminanceA = relativeLuminance(hexToRgb(hexA));
  const luminanceB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(luminanceA, luminanceB);
  const darker = Math.min(luminanceA, luminanceB);
  return (lighter + 0.05) / (darker + 0.05);
}

function tokenOf(palette: Palette, name: string): string {
  const value = palette.get(name);
  if (value === undefined) {
    throw new Error(`token --${name} not found`);
  }
  return value;
}

/**
 * Every semantic foreground/background pairing the UI actually composites,
 * with the WCAG 2.2 category that governs it: `text` (body/label text, 4.5:1)
 * or `ui` (non-text UI components and their states — borders that outline an
 * interactive control, focus indicators, markers — 3:1).
 */
const PAIRINGS: readonly {
  readonly foreground: string;
  readonly background: string;
  readonly kind: 'text' | 'ui';
}[] = [
  { foreground: 'text-primary', background: 'surface-canvas', kind: 'text' },
  { foreground: 'text-primary', background: 'surface-panel', kind: 'text' },
  { foreground: 'text-primary', background: 'surface-raised', kind: 'text' },
  { foreground: 'text-secondary', background: 'surface-canvas', kind: 'text' },
  { foreground: 'text-secondary', background: 'surface-panel', kind: 'text' },
  { foreground: 'text-inverse', background: 'surface-inverse', kind: 'text' },
  { foreground: 'text-on-action', background: 'action-primary', kind: 'text' },
  { foreground: 'action-primary', background: 'surface-canvas', kind: 'ui' },
  { foreground: 'accent-secondary', background: 'surface-canvas', kind: 'ui' },
  { foreground: 'status-success', background: 'status-success-soft', kind: 'text' },
  { foreground: 'status-warning', background: 'status-warning-soft', kind: 'text' },
  { foreground: 'status-danger', background: 'status-danger-soft', kind: 'text' },
  // Outlines interactive control boundaries (buttons, text inputs), not a
  // decorative divider, so it must clear the UI-component minimum.
  { foreground: 'border-strong', background: 'surface-canvas', kind: 'ui' },
  { foreground: 'border-strong', background: 'surface-panel', kind: 'ui' },
  { foreground: 'focus-ring', background: 'surface-canvas', kind: 'ui' },
  // The reader's only two markers, drawn against the canvas they sit on.
  { foreground: 'marker-vocabulary', background: 'surface-canvas', kind: 'ui' },
  { foreground: 'marker-grammar', background: 'surface-canvas', kind: 'ui' },
];

const MINIMUM_RATIO: Record<'text' | 'ui', number> = { text: 4.5, ui: 3 };

describe.each([
  ['light', 'light-palette'],
  ['dark', 'dark-palette'],
] as const)('%s theme token contrast', (themeName, mixinName) => {
  const source = readFileSync(TOKENS_PATH, 'utf8');
  const palette = extractMixin(source, mixinName);

  it.each(PAIRINGS)(
    '$foreground on $background meets the $kind minimum',
    ({ foreground, background, kind }) => {
      const ratio = contrastRatio(tokenOf(palette, foreground), tokenOf(palette, background));
      expect(
        ratio,
        `${themeName}: --${foreground} on --${background} is ${ratio.toFixed(2)}:1, needs ${String(MINIMUM_RATIO[kind])}:1`,
      ).toBeGreaterThanOrEqual(MINIMUM_RATIO[kind]);
    },
  );
});
