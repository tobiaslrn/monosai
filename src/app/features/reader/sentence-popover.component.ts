import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { SentenceAids } from '../../application/enrichment/sentence-aids.store';
import { describeEnrichmentFailure } from './enrichment-failure-copy';

/** One word in this sentence that the learner's vocabulary does not cover. */
export interface UnknownWord {
  readonly surface: string;
  /** Which kind of warning it is, in the same words the word popover uses. */
  readonly label: string;
}

/**
 * What a selected sentence offers: its translation, and the grammar that is
 * unfamiliar in it.
 *
 * Both are here because pressing the sentence is the gesture learners actually
 * make. Grammar also lives in the word popover, where a note is attached to the
 * word it is about; this is the same material reached the other way round, for
 * the reader who noticed a marked sentence rather than a marked word.
 *
 * Only findings outside the learner's profile appear. A note saying a form is
 * one they already know is what buried the Japanese in the first place, and it
 * is still available at the word.
 *
 * Every action that spends a request is here and nowhere else, so word details
 * stay a read-only lookup and a stray press on a line costs nothing. Opening a
 * sentence requests nothing by itself.
 *
 * The actions are three labels with nothing written under them. What an AI
 * action sends is a property of the application, said once in Settings, and
 * repeating it three times per popover is what made a sentence feel expensive
 * to press.
 */
@Component({
  selector: 'mn-sentence-popover',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="sentence-popover">
      @if (aids().translation; as translation) {
        <p class="translation" lang="en">{{ translation.textEn }}</p>
      } @else if (isRunning()) {
        <p class="mn-hint" role="status">Translating…</p>
      }

      @if (failure(); as failure) {
        <p class="mn-error" role="alert">{{ failure }}</p>
      }

      <!--
        The two warnings the page marks, said in words. A learner who pressed a
        sentence because something in it was underlined should find out what,
        without hunting for the underline that sent them here.
      -->
      @if (unknownWords().length > 0) {
        <section class="vocabulary" aria-labelledby="mn-sentence-vocabulary">
          <h3 id="mn-sentence-vocabulary">Words you may not know</h3>
          <ul class="words">
            @for (word of unknownWords(); track word.surface) {
              <li>
                <span class="surface" lang="ja">{{ word.surface }}</span>
                <span class="scope">{{ word.label }}</span>
              </li>
            }
          </ul>
        </section>
      }

      @if (concerns().length > 0) {
        <section class="grammar" aria-labelledby="mn-sentence-grammar">
          <h3 id="mn-sentence-grammar">Grammar</h3>
          @for (finding of concerns(); track $index) {
            <p class="finding-label">{{ finding.label }}</p>
            <p class="finding-text" lang="en">{{ finding.explanationEn }}</p>
          }
        </section>
      }

      @if (grammarRunning()) {
        <p class="mn-hint" role="status">Analyzing…</p>
      }
      @if (grammarFailure(); as failure) {
        <p class="mn-error" role="alert">{{ failure }}</p>
      }

      @if (audioRunning()) {
        <p class="mn-hint" role="status">Generating…</p>
      }
      @if (audioFailure(); as failure) {
        <p class="mn-error" role="alert">{{ failure }}</p>
      }

      <!--
        Every action that spends a request, as three labels and nothing else.
        What an AI action sends is said once, in Settings, rather than under each
        button that could trigger one.
      -->
      <div class="actions">
        @if (translateOffer(); as offer) {
          <button type="button" class="mn-button" (click)="translate.emit()">{{ offer }}</button>
        }

        @if (grammarOffer(); as offer) {
          <button type="button" class="mn-button" (click)="analyzeGrammar.emit()">
            {{ offer }}
          </button>
        }

        @if (audioOffer(); as offer) {
          <button type="button" class="mn-button" (click)="audioAction()">{{ offer }}</button>
        }
      </div>
    </div>
  `,
  styles: `
    .sentence-popover {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      align-items: flex-start;
    }

    .translation {
      margin: 0;
      font-size: var(--text-md);
      line-height: 1.6;
    }

    /* Ruled in each marker's own colour, so a section names its underline. */
    .grammar,
    .vocabulary {
      align-self: stretch;
      padding-inline-start: var(--space-3);
      border-inline-start: 2px solid var(--marker-grammar);
    }

    .vocabulary {
      border-inline-start-color: var(--marker-vocabulary);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-self: stretch;
    }

    .words {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .words li {
      display: flex;
      gap: var(--space-2);
      align-items: baseline;
    }

    .words .surface {
      font-family: var(--font-japanese);
      font-size: var(--text-lg);
    }

    .scope {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    h3 {
      margin: 0 0 var(--space-1);
      font-size: var(--text-md);
    }

    .finding-label {
      margin: var(--space-2) 0 0;
      font-weight: 600;
    }

    .finding-text {
      margin: 0;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .mn-hint,
    .mn-error {
      margin: 0;
      font-size: var(--text-sm);
    }

    .mn-error {
      color: var(--status-danger);
    }
  `,
})
export class SentencePopoverComponent {
  readonly aids = input.required<SentenceAids>();
  /**
   * Imported readings only. A generated story was reviewed against the profile
   * captured with it, and re-analysing one would judge frozen text by a profile
   * it was never written for.
   */
  readonly canAnalyze = input(false);
  /** Words in this sentence carrying the vocabulary warning, in reading order. */
  readonly unknownWords = input<readonly UnknownWord[]>([]);

  readonly translate = output<void>();
  readonly analyzeGrammar = output<void>();
  /** Synthesizes this one sentence. Never plays it: producing is not hearing. */
  readonly generateAudio = output<void>();
  readonly playAudio = output<void>();

  protected readonly isRunning = computed(() => this.aids().translationAction.state === 'running');

  /** Null once a translation is stored: the English above it is the answer. */
  protected readonly translateOffer = computed(() => {
    const aids = this.aids();
    if (aids.translation !== null || aids.translationAction.state === 'running') {
      return null;
    }
    return aids.translationAction.state === 'failed' ? 'Translate again' : 'Translate';
  });

  protected readonly concerns = computed(
    () => this.aids().grammar?.findings.filter((finding) => !finding.inProfile) ?? [],
  );

  protected readonly grammarRunning = computed(() => this.aids().grammarAction.state === 'running');

  /** The wording of the offer, or null when an analysis would say nothing new. */
  protected readonly grammarOffer = computed(() => {
    const aids = this.aids();
    if (!this.canAnalyze()) {
      return null;
    }
    if (aids.grammarAction.state === 'running') {
      return null;
    }
    if (aids.grammarAction.state === 'failed') {
      return 'Grammar again';
    }
    if (aids.grammar === null) {
      return 'Grammar';
    }
    return aids.grammarStale ? 'Grammar again' : null;
  });

  protected readonly audioRunning = computed(() => this.aids().audioAction.state === 'running');

  /**
   * One button for both halves of audio: producing a clip and playing it are
   * never the same press, so the label says which one this is.
   */
  protected readonly audioOffer = computed(() => {
    const aids = this.aids();
    if (aids.audioAction.state === 'running') {
      return null;
    }
    if (aids.audio !== null) {
      return 'Play';
    }
    return aids.audioAction.state === 'failed' ? 'Audio again' : 'Audio';
  });

  protected readonly failure = computed(() =>
    describeEnrichmentFailure(this.aids().translationAction.error),
  );

  protected readonly audioFailure = computed(() =>
    describeEnrichmentFailure(this.aids().audioAction.error),
  );

  protected readonly grammarFailure = computed(() =>
    describeEnrichmentFailure(this.aids().grammarAction.error),
  );

  protected audioAction(): void {
    if (this.aids().audio === null) {
      this.generateAudio.emit();
      return;
    }
    this.playAudio.emit();
  }
}
