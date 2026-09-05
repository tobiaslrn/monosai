import type { MarkupTextExtractor } from '../../domain/anki/markup-text';

/**
 * Elements whose content is never visible text. Media elements are listed too:
 * a field holding an image or a sound tag contributes nothing readable, and
 * their attributes must not leak into the expression.
 */
const DROPPED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'IFRAME',
  'OBJECT',
  'EMBED',
  'AUDIO',
  'VIDEO',
  'CANVAS',
  'SVG',
  'IMG',
  'HEAD',
  'TITLE',
]);

/**
 * Elements a reader sees as starting a new line. Anki wraps typed lines in
 * `div`s, so treating them as line breaks is what keeps a two-line field
 * two lines instead of one run-on string.
 */
const BLOCK_TAGS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DD',
  'DIV',
  'DL',
  'DT',
  'FIELDSET',
  'FIGCAPTION',
  'FIGURE',
  'FOOTER',
  'FORM',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'LI',
  'MAIN',
  'NAV',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TBODY',
  'TD',
  'TFOOT',
  'TH',
  'THEAD',
  'TR',
  'UL',
]);

function appendSeparator(parts: string[]): void {
  const previous = parts.at(-1);
  if (previous === undefined || previous.endsWith('\n')) {
    return;
  }
  parts.push('\n');
}

function walk(node: Node, parts: string[]): void {
  for (const child of node.childNodes) {
    if (child.nodeType === child.TEXT_NODE) {
      parts.push(child.nodeValue ?? '');
      continue;
    }
    if (child.nodeType !== child.ELEMENT_NODE) {
      continue;
    }

    const tag = (child as Element).tagName.toUpperCase();
    if (DROPPED_TAGS.has(tag)) {
      continue;
    }
    if (tag === 'BR') {
      parts.push('\n');
      continue;
    }
    if (BLOCK_TAGS.has(tag)) {
      appendSeparator(parts);
      walk(child, parts);
      appendSeparator(parts);
      continue;
    }
    walk(child, parts);
  }
}

/**
 * Reads visible text out of Anki field markup using an inert parsed document.
 *
 * `DOMParser` with `text/html` never executes scripts, runs event handlers, or
 * fetches anything the markup references, and the document is never attached to
 * the page. That is the whole reason field values go through here rather than
 * through any innerHTML path: a malicious collection must be unable to do
 * anything except contribute text.
 *
 * This is main-thread only — `DOMParser` does not exist in a worker — which is
 * why the package worker returns raw field values and extraction happens after
 * they cross back.
 */
export class DomMarkupTextExtractor implements MarkupTextExtractor {
  constructor(private readonly parser: DOMParser = new DOMParser()) {}

  toVisibleText(markup: string): string {
    const document = this.parser.parseFromString(markup, 'text/html');
    const parts: string[] = [];
    walk(document.body, parts);
    return parts.join('');
  }
}
