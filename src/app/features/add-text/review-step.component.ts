import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { ImportStore } from '../../application/reading/import.store';
import {
  ReviewSentenceComponent,
  type SentenceMergeRequest,
  type SentenceSplitRequest,
} from './review-sentence.component';

/**
 * Step 2 of Add text: confirm the sentence structure.
 *
 * Sentences are grouped by the paragraphs the learner's own blank lines
 * produced. Only boundaries are editable here; the text itself is corrected by
 * going back to raw input.
 */
@Component({
  selector: 'mn-review-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReviewSentenceComponent],
  template: `
    <div class="mn-field">
      <label for="mn-review-title">Title</label>
      <input
        id="mn-review-title"
        type="text"
        [value]="store.titleInput()"
        [attr.placeholder]="store.derivedTitle()"
        (input)="onTitle($event)"
      />
    </div>

    <p class="mn-hint">
      {{ store.sentenceCount().toLocaleString('en') }} sentences in
      {{ paragraphCount().toLocaleString('en') }} paragraphs. Split or merge any sentence Monosai
      divided differently from how you read it.
    </p>

    @if (store.editFailure(); as failure) {
      <p class="mn-error" role="alert">{{ failure.message }}</p>
    }

    @for (paragraph of paragraphs(); track paragraph.id; let paragraphIndex = $index) {
      <section class="paragraph" [attr.aria-label]="'Paragraph ' + (paragraphIndex + 1)">
        @for (sentence of paragraph.sentences; track sentence.id; let index = $index) {
          <mn-review-sentence
            [sentence]="sentence"
            [index]="index"
            [total]="paragraph.sentences.length"
            (split)="onSplit($event)"
            (merge)="onMerge($event)"
          />
        }
      </section>
    }
  `,
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    .paragraph {
      display: flex;
      flex-direction: column;
      padding: var(--space-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
    }

    .mn-error {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class ReviewStepComponent {
  protected readonly store = inject(ImportStore);

  protected readonly paragraphs = computed(() => this.store.draft()?.paragraphs ?? []);
  protected readonly paragraphCount = computed(() => this.paragraphs().length);

  protected onTitle(event: Event): void {
    this.store.setTitle((event.target as HTMLInputElement).value);
  }

  protected onSplit(request: SentenceSplitRequest): void {
    void this.store.split(request.sentenceId, request.offsetUtf16);
  }

  protected onMerge(request: SentenceMergeRequest): void {
    void this.store.merge(request.sentenceId, request.direction);
  }
}
