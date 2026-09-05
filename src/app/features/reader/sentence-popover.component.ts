import { DOCUMENT } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import type { SentenceAids } from '../../application/enrichment/sentence-aids.store';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { enrichmentCanRetry } from './enrichment-failure-copy';
import { AidFailureComponent } from './aid-failure.component';

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
  imports: [IconComponent, AidFailureComponent],
  template: `
    <div class="sentence-popover">
      @if (aids().translation; as translation) {
        <p class="translation" lang="en">{{ translation.textEn }}</p>
      } @else if (isRunning()) {
        <p class="mn-hint" role="status">Translating…</p>
      }

      <mn-aid-failure
        [failure]="aids().translationAction.error"
        [setupMessage]="translationSetupNeeded() ? 'No translation model is configured.' : null"
      />

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
      <mn-aid-failure
        [failure]="aids().grammarAction.error"
        [setupMessage]="grammarSetupNeeded() ? 'No grammar model is configured.' : null"
      />

      @if (audioRunning()) {
        <p class="mn-hint" role="status">Generating…</p>
      }
      <mn-aid-failure
        [failure]="aids().audioAction.error"
        [setupMessage]="audioSetupNeeded() ? 'No voice is configured.' : null"
      />

      <!--
        The sentence's actions as one tray: an icon, a label, and nothing else.
        What an AI action sends is said once, in Settings, rather than under
        each button that could trigger one. Copy is local and always available.

        A tray rather than a row of ordinary buttons because these are the only
        controls in the popover and they share one shape: on a phone they split
        the width evenly and reach the touch target without stretching into
        full-width bars.
      -->
      <div class="actions">
        <button type="button" class="action" (click)="copySentence()">
          <mn-icon [name]="copyStatus() === 'copied' ? 'check' : 'copy'" [size]="18" />
          <span>{{ copyStatus() === 'copied' ? 'Copied' : 'Copy' }}</span>
        </button>

        @if (translateOffer(); as offer) {
          <button type="button" class="action" (click)="translate.emit()">
            <mn-icon name="translate" [size]="18" />
            <span>{{ offer }}</span>
          </button>
        }

        @if (grammarOffer(); as offer) {
          <button type="button" class="action" (click)="analyzeGrammar.emit()">
            <mn-icon name="grammar" [size]="18" />
            <span>{{ offer }}</span>
          </button>
        }

        @if (audioOffer(); as offer) {
          <button
            type="button"
            class="action"
            [class.is-primary]="offer === 'Play'"
            (click)="audioAction()"
          >
            <mn-icon [name]="offer === 'Play' ? 'play' : 'audio'" [size]="18" />
            <span>{{ offer }}</span>
          </button>
        }
      </div>

      @if (copyStatus() === 'copied') {
        <p class="mn-visually-hidden" role="status" aria-live="polite">Sentence copied.</p>
      } @else if (copyStatus() === 'failed') {
        <p class="mn-error" role="alert">
          Copy failed. The sentence is unchanged; select it in the reader and copy it instead.
        </p>
      }
    </div>
  `,
  styles: `
    .sentence-popover {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      align-items: flex-start;
    }

    /*
     * The answer to the press, so it leads at reading size rather than at the
     * size of the notes under it.
     */
    .translation {
      margin: 0;
      font-size: var(--text-lg);
      line-height: 1.55;
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

    /*
     * A tray: one row, equal shares, and a rule above it, so the three things
     * that spend a request are visibly one group and visibly the bottom of the
     * card rather than three loose buttons among the notes.
     */
    .actions {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-2);
      align-self: stretch;
      padding-top: var(--space-3);
      border-top: 1px solid var(--border-subtle);
    }

    .action {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      justify-content: center;
      min-width: 0;
      min-height: var(--touch-target);
      padding: var(--space-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      color: var(--text-primary);
      font: inherit;
      font-size: var(--text-sm);
      font-weight: 500;
      cursor: pointer;
      transition:
        background-color var(--motion-fast) ease-out,
        border-color var(--motion-fast) ease-out,
        transform var(--motion-fast) ease-out;
    }

    .action span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .action mn-icon {
      flex: none;
      color: var(--text-secondary);
    }

    .action:hover {
      border-color: var(--action-primary);
      background: var(--action-primary-soft);
    }

    .action:active {
      transform: translateY(1px);
    }

    /* Playing a clip that already exists is a result rather than a request. */
    .action.is-primary {
      border-color: transparent;
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    .action.is-primary mn-icon {
      color: inherit;
    }

    .action.is-primary:hover {
      background: var(--action-primary-hover);
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

    /* A quiet section label rather than a heading competing with the answer. */
    h3 {
      margin: 0 0 var(--space-2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
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

    .setup-message {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }

    .mn-error {
      color: var(--status-danger);
    }
  `,
})
export class SentencePopoverComponent {
  private readonly documentRef = inject(DOCUMENT);

  readonly aids = input.required<SentenceAids>();
  /** The immutable Japanese source, copied without any rendered annotations. */
  readonly sentenceText = input.required<string>();
  /**
   * Imported readings only. A generated story was reviewed against the profile
   * captured with it, and re-analysing one would judge frozen text by a profile
   * it was never written for.
   */
  readonly canAnalyze = input(false);
  /** Whether a tested model is available for the translation action. */
  readonly translationModelConfigured = input(true);
  /** Whether a tested model is available for the grammar action. */
  readonly grammarModelConfigured = input(true);
  readonly audioModelConfigured = input(true);
  /** Words in this sentence carrying the vocabulary warning, in reading order. */
  readonly unknownWords = input<readonly UnknownWord[]>([]);

  readonly translate = output<void>();
  readonly analyzeGrammar = output<void>();
  /** Synthesizes this one sentence. Never plays it: producing is not hearing. */
  readonly generateAudio = output<void>();
  readonly playAudio = output<void>();
  protected readonly copyStatus = signal<'idle' | 'copied' | 'failed'>('idle');

  protected readonly isRunning = computed(() => this.aids().translationAction.state === 'running');

  /** Null once a translation is stored: the English above it is the answer. */
  protected readonly translateOffer = computed(() => {
    const aids = this.aids();
    if (aids.translation !== null || aids.translationAction.state === 'running') {
      return null;
    }
    if (!enrichmentCanRetry(aids.translationAction.error)) return null;
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
    if (!enrichmentCanRetry(aids.grammarAction.error)) return null;
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
    if (!enrichmentCanRetry(aids.audioAction.error)) return null;
    return aids.audioAction.state === 'failed' ? 'Audio again' : 'Audio';
  });

  protected readonly translationSetupNeeded = computed(() => {
    const failure = this.aids().translationAction.error;
    return (
      !this.translationModelConfigured() &&
      failure?.source === 'provider' &&
      failure.error.code === 'capability-unsupported'
    );
  });

  protected readonly audioSetupNeeded = computed(() => {
    const failure = this.aids().audioAction.error;
    return (
      !this.audioModelConfigured() &&
      failure?.source === 'provider' &&
      failure.error.code === 'capability-unsupported'
    );
  });

  protected readonly grammarSetupNeeded = computed(() => {
    const failure = this.aids().grammarAction.error;
    return (
      !this.grammarModelConfigured() &&
      failure?.source === 'provider' &&
      failure.error.code === 'capability-unsupported'
    );
  });

  protected audioAction(): void {
    if (this.aids().audio === null) {
      this.generateAudio.emit();
      return;
    }
    this.playAudio.emit();
  }

  protected async copySentence(): Promise<void> {
    const clipboard = this.documentRef.defaultView?.navigator.clipboard;
    if (clipboard === undefined) {
      this.copyStatus.set('failed');
      return;
    }
    try {
      await clipboard.writeText(this.sentenceText());
      this.copyStatus.set('copied');
    } catch {
      this.copyStatus.set('failed');
    }
  }
}
