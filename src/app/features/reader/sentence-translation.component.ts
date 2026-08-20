import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * The saved English of one sentence, under the Japanese it belongs to.
 *
 * A block-level `span` rather than a `div`, because the reader renders a
 * paragraph as one `<p>` and a `<div>` inside it would close the paragraph.
 * The text is bound by interpolation only: a translation is provider output and
 * is never treated as markup.
 */
@Component({
  selector: 'mn-sentence-translation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="translation" lang="en">{{ text() }}</span>`,
  styles: `
    :host {
      display: block;
    }

    .translation {
      display: block;
      margin: var(--space-1) 0 var(--space-2);
      padding-inline-start: var(--space-3);
      border-inline-start: 2px solid var(--border-subtle);
      color: var(--text-secondary);
      font-family: var(--font-ui);
      font-size: var(--text-sm);
      line-height: 1.6;
    }
  `,
})
export class SentenceTranslationComponent {
  readonly text = input.required<string>();
}
