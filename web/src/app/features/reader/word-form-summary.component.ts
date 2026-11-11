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
          <span class="part-of-speech mn-status-pill">{{ partOfSpeech }}</span>
        }
      </p>

      @if (summary().formLabels.length > 0) {
        <p class="form-line">
          @for (label of summary().formLabels; track label) {
            <span class="mn-status-pill">{{ label }}</span>
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
      gap: 0 var(--space-2);
      align-items: baseline;
      font-size: var(--text-lg);
      line-height: var(--leading-tight);
    }

    .dictionary-form {
      font-family: var(--font-japanese);
      overflow-wrap: anywhere;
    }

    .form-line {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
    }
  `,
})
export class WordFormSummaryComponent {
  readonly surface = input('');
  readonly summary = input.required<WordFormSummary>();
}
