import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { WordFormSummary } from '../../domain/reading/word-form-summary';

/** The small, non-interactive form block at the top of a word lookup. */
@Component({
  selector: 'mn-word-form-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="form-summary" aria-label="Word form">
      <p class="dictionary-line" aria-label="Dictionary form and part of speech">
        @if (summary().dictionaryForm !== surface()) {
          <strong class="dictionary-form" lang="ja">{{ summary().dictionaryForm }}</strong>
        }
        @if (summary().partOfSpeech; as partOfSpeech) {
          @if (summary().dictionaryForm !== surface()) {
            <span class="separator" aria-hidden="true">·</span>
          }
          <span class="part-of-speech">{{ partOfSpeech }}</span>
        }
      </p>

      @if (summary().formLabels.length > 0) {
        <p class="form-line">
          @for (label of summary().formLabels; track label) {
            <span class="form-tag">{{ label }}</span>
            @if (!$last) {
              <span class="separator form-separator" aria-hidden="true">{{ ' · ' }}</span>
            }
          }
        </p>
      }
    </section>
  `,
  styles: `
    .form-summary {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
    }

    .dictionary-line,
    .form-line {
      margin: 0;
    }

    .dictionary-line {
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--space-1);
      align-items: baseline;
      font-size: var(--text-lg);
      line-height: 1.25;
    }

    .dictionary-form {
      font-family: var(--font-japanese);
      overflow-wrap: anywhere;
    }

    .separator {
      color: var(--text-secondary);
    }

    .part-of-speech {
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--action-primary-soft);
      color: var(--action-primary);
      font-size: var(--text-sm);
      line-height: 1.2;
    }

    .form-line {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      color: var(--text-primary);
      font-size: var(--text-sm);
      font-weight: 600;
      line-height: 1.4;
    }

    .form-tag {
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--action-primary-soft);
      color: var(--action-primary);
      font-weight: 500;
    }

    .form-separator {
      display: none;
    }
  `,
})
export class WordFormSummaryComponent {
  readonly surface = input('');
  readonly summary = input.required<WordFormSummary>();
}
