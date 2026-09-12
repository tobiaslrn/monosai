/**
 * Small, provider-facing Markdown renderers.
 *
 * Markdown is only an input wire format for OpenRouter. These helpers do not
 * parse it again: every value that can contain learner or provider text is
 * rendered as one physical line, and the surrounding prompt layer remains the
 * source of meaning.
 */

/** A value with a short ordinal used by indexed data sections. */
export interface MarkdownIndexedEntry {
  readonly index?: number | string;
  readonly id?: number | string;
  readonly value?: string;
  readonly text?: string;
  readonly textJa?: string;
}

export type MarkdownIndexedInput = MarkdownIndexedEntry | readonly [number | string, string];

const LEADING_MARKDOWN_CONTROL = /^(?:#{1,6}|[-+*>`~]|\d+[.)])/u;

/** Escapes one value without ever introducing a physical line break. */
export function markdownLineValue(value: string): string {
  const escaped = value.replaceAll('\\', '\\\\').replaceAll('\r', '\\r').replaceAll('\n', '\\n');
  return LEADING_MARKDOWN_CONTROL.test(escaped) ? `\\${escaped}` : escaped;
}

/** Renders a fixed heading; the title is still kept safe if a caller supplies one. */
export function markdownHeading(level: number, title: string): string {
  if (!Number.isInteger(level) || level < 1 || level > 6) {
    throw new RangeError('markdownHeading: level must be an integer from 1 to 6');
  }
  return `${'#'.repeat(level)} ${markdownLineValue(title)}`;
}

/** Renders a small named field, with its value on one physical line. */
export function markdownField(label: string, value: string): string {
  return `${label}: ${markdownLineValue(value)}`;
}

/** Renders a heading followed by one unbulleted value per physical line. */
export function markdownLineList(heading: string, values: readonly string[], level = 2): string {
  if (values.length === 0) {
    return '';
  }
  return markdownDocument([
    markdownHeading(level, heading),
    values.map((value) => markdownLineValue(value)).join('\n'),
  ]);
}

/** Renders a heading followed by `[ordinal] value` lines in the supplied order. */
export function markdownIndexedLines(
  heading: string,
  entries: readonly MarkdownIndexedInput[],
  level = 2,
): string {
  if (entries.length === 0) {
    return '';
  }
  const lines = entries.map((entry) => {
    if (isMarkdownIndexedTuple(entry)) {
      return `[${markdownLineValue(String(entry[0]))}] ${markdownLineValue(entry[1])}`;
    }
    const index = entry.index ?? entry.id ?? '';
    const value = entry.value ?? entry.text ?? entry.textJa ?? '';
    return `[${markdownLineValue(String(index))}] ${markdownLineValue(value)}`;
  });
  return markdownDocument([markdownHeading(level, heading), lines.join('\n')]);
}

function isMarkdownIndexedTuple(
  entry: MarkdownIndexedInput,
): entry is readonly [number | string, string] {
  return Array.isArray(entry);
}

/** Joins already-rendered sections with one blank line and omits empty ones. */
export function markdownDocument(sections: readonly string[]): string {
  return sections.filter((section) => section.trim() !== '').join('\n\n');
}

/** Renders a small Markdown list whose bullets are part of the wire format. */
export function markdownBulletedList(
  heading: string,
  values: readonly string[],
  level = 1,
): string {
  if (values.length === 0) {
    return '';
  }
  return markdownDocument([
    markdownHeading(level, heading),
    values.map((value) => `- ${markdownLineValue(value)}`).join('\n'),
  ]);
}
