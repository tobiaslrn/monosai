import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { wordReading } from '../../domain/reading/token-presentation';

/**
 * The hover preview.
 *
 * A reading and one gloss, and nothing that can be interacted with: clicking
 * pins the full card instead. It is `aria-hidden` because it duplicates what
 * the token button already announces, and it must never become a second thing
 * a screen reader has to walk past.
 */
@Component({
  selector: 'mn-word-preview',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    @if (store.preview(); as preview) {
      <span class="preview">
        <span class="surface" lang="ja">{{ preview.word.surface }}</span>
        @if (reading(); as reading) {
          <span class="reading" lang="ja">{{ reading }}</span>
        }
        @if (preview.glossEn; as gloss) {
          <span class="gloss" lang="en">{{ gloss }}</span>
        }
      </span>
    }
  `,
  styles: `
    .preview {
      display: flex;
      gap: var(--space-2);
      align-items: baseline;
      max-width: min(20rem, calc(100vw - 2 * var(--space-4)));
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
      font-size: var(--text-sm);
    }

    .surface {
      font-family: var(--font-japanese);
    }

    .reading,
    .gloss {
      color: var(--text-secondary);
    }

    .gloss {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `,
})
export class WordPreviewComponent {
  protected readonly store = inject(WordInspectorStore);

  /** Suppressed for a kana word, where it would only repeat the surface. */
  protected readonly reading = computed(() => {
    const preview = this.store.preview();
    return preview === null ? null : wordReading(preview.word);
  });
}
