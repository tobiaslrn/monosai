/**
 * Turns provider markup into visible text.
 *
 * This is a port because the only trustworthy way to do it in a browser is an
 * inert parsed document, and the domain must not reach for a browser global.
 * Implementations must never attach the parsed document, execute it, or load
 * anything it references.
 */
export interface MarkupTextExtractor {
  /**
   * Visible text of `markup`, or `null` when no safe text can be produced.
   *
   * Element boundaries that a reader would see as a line break become `\n`.
   * Script, style, and media content contributes nothing.
   */
  toVisibleText(markup: string): string | null;
}
