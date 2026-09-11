import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { ReaderWordListService } from '../../application/vocabulary/reader-word-list.service';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import type { GrammarFinding } from '../../domain/enrichment/records';
import type { DictionaryEntry } from '../../domain/language/dictionary';
import { wordRubySegments } from '../../domain/reading/word-ruby';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { WordFormSummaryComponent } from './word-form-summary.component';

/**
 * What the reader knows about the grammar around one word.
 *
 * Grammar lives here rather than under the sentence: a note is worth reading
 * when a learner has stopped at the word it is about, and printing every note
 * under every sentence buried the Japanese it was explaining.
 */
export interface WordGrammarState {
  /** Stored findings whose span covers this word. */
  readonly findings: readonly GrammarFinding[];
  /** Findings said about the whole sentence, which no word can be marked for. */
  readonly sentenceFindings: readonly GrammarFinding[];
  /** Whether this sentence has an analysis at all. */
  readonly analyzed: boolean;
  /** True only for an imported analysis judged against an older profile. */
  readonly stale: boolean;
}

/** Meanings shown before the learner asks for the rest of the entry. */
const COLLAPSED_SENSE_LIMIT = 2;

/** Keeps the collapsed lookup to two meanings across all returned entries. */
function limitEntries(
  entries: readonly DictionaryEntry[],
  limit: number,
): readonly DictionaryEntry[] {
  let remaining = limit;
  const limited: DictionaryEntry[] = [];

  for (const entry of entries) {
    if (remaining === 0) {
      break;
    }
    const senses = entry.senses.slice(0, remaining);
    if (senses.length > 0) {
      limited.push({ ...entry, senses });
      remaining -= senses.length;
    }
  }
  return limited;
}

export const NO_WORD_GRAMMAR: WordGrammarState = {
  findings: [],
  sentenceFindings: [],
  analyzed: false,
  stale: false,
};

/**
 * Word details.
 *
 * Entirely local: the bundled dictionary, the stored analysis,
 * and locally computed status all read from disk, so opening a word costs
 * nothing and works offline. Adding a word is an explicit transactional local write.
 * Everything
 * that does spend one is on the sentence.
 */
@Component({
  selector: 'mn-word-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, WordFormSummaryComponent],
  template: `
    @if (store.selected(); as word) {
      <div class="inspector">
        <header>
          <div class="headword">
            <h2 class="surface" lang="ja">
              @for (segment of rubySegments(); track $index) {
                @if (segment.reading !== null) {
                  <ruby>
                    <span class="ruby-base">{{ segment.text }}</span>
                    <rt lang="ja">{{ segment.reading }}</rt>
                  </ruby>
                } @else {
                  <span>{{ segment.text }}</span>
                }
              }
            </h2>
          </div>
          <!--
            The route on to everything the sentence can be asked for. An arrow
            that branches off and turns up rather than a labelled row: the
            sentence is the level this word sits inside, not the next thing
            along, and that is the one relationship an icon can actually draw.
            The tooltip and accessible name carry the word.
          -->
          <button
            type="button"
            class="mn-icon-button sentence-details"
            title="Sentence details"
            aria-label="Sentence details"
            (click)="sentenceActions.emit()"
          >
            <mn-icon name="sentence-details" />
          </button>
        </header>

        @if (store.formSummary(); as formSummary) {
          <mn-word-form-summary [summary]="formSummary" [surface]="word.word.surface" />
        }

        <section class="dictionary-section" aria-labelledby="mn-inspector-dictionary">
          <h3 class="mn-group-title" id="mn-inspector-dictionary">Meanings</h3>
          @switch (store.dictionary().kind) {
            @case ('looking-up') {
              <p class="mn-hint" role="status">Looking up…</p>
            }
            @case ('not-found') {
              <p class="mn-hint">No definition found.</p>
            }
            @case ('failed') {
              <p class="mn-notice mn-notice--error" role="alert">
                The dictionary is unavailable. The rest of this word's details are unaffected.
              </p>
            }
            @case ('found') {
              <ol class="senses">
                @for (entry of visibleEntries(); track entry.id) {
                  <li>
                    @if (otherForms(entry).length > 0) {
                      <p class="entry-forms" lang="ja">{{ otherForms(entry).join('、') }}</p>
                    }
                    <ol class="glosses">
                      @for (sense of entry.senses; track $index) {
                        <li lang="en">{{ sense.glossesEn.join('; ') }}</li>
                      }
                    </ol>
                  </li>
                }
              </ol>

              <!--
                Two meanings answer the question a learner stopped for. The rest
                are a dictionary page, and asking for one is a press.
              -->
              @if (hiddenSenseCount() > 0) {
                <button type="button" class="mn-button mn-button--ghost" (click)="expand()">
                  More ({{ hiddenSenseCount() }})
                </button>
              }
            }
          }
        </section>

        @if (hasNotes() || grammar().stale) {
          <section class="grammar-section" aria-labelledby="mn-inspector-grammar">
            <h3 class="mn-group-title" id="mn-inspector-grammar">Grammar</h3>

            @if (grammar().stale) {
              <p class="mn-hint">
                Analyzed under an earlier grammar profile. It can be re-analyzed from the sentence.
              </p>
            }

            <!--
              Every rule once, in full. The fold used to print each label twice
              — a row of chips and then the same labels again inside a
              disclosure — so the explanation a reader stopped for was the one
              thing they had to ask for a second time.
            -->
            @for (finding of grammar().findings; track $index) {
              <div class="finding">
                <p class="finding-label">{{ finding.label }}</p>
                <p class="finding-text" lang="en">{{ finding.explanationEn }}</p>
              </div>
            }
            @for (finding of grammar().sentenceFindings; track $index) {
              <div class="finding">
                <p class="finding-label">
                  {{ finding.label }} <span class="scope mn-status-pill">whole sentence</span>
                </p>
                <p class="finding-text" lang="en">{{ finding.explanationEn }}</p>
              </div>
            }
          </section>
        }

        @if (warningPresentation(); as presentation) {
          <section class="warning" aria-labelledby="mn-inspector-status">
            <h3 id="mn-inspector-status">
              <span class="mn-status-pill mn-status-pill--warning">{{ presentation.label }}</span>
            </h3>
            @if (presentation.structuralForm; as form) {
              <p class="form-name">{{ form.nameEn }}</p>
              <p>{{ form.descriptionEn }}</p>
              @if (form.exampleJa; as example) {
                <p class="form-example" lang="ja">{{ example }}</p>
              }
            }
          </section>
        }

        @if (canAdd()) {
          <button type="button" class="mn-button" [disabled]="adding()" (click)="addWord()">
            {{ adding() ? 'Adding…' : 'Add to word list' }}
          </button>
        }
        @if (addedTo(); as label) {
          <p role="status" class="mn-hint">Added to {{ label }}.</p>
        }
        @if (addFailure(); as failure) {
          <p role="alert" class="mn-notice mn-notice--error">
            {{ failure }} Your word lists are unchanged.
          </p>
        }
      </div>
    }
  `,
  styles: `
    .inspector {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
    }

    header {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      justify-content: space-between;
      /* Clear of the card's own corner control, and nothing on a sheet. */
      padding-inline-end: var(--mn-popover-close-inset, 0px);
    }

    /* Long words wrap inside their own column rather than pushing the route
     * off the card. */
    .headword {
      flex: 1;
      min-width: 0;
    }

    .sentence-details {
      flex: none;
    }

    .sentence-details mn-icon {
      color: var(--text-secondary);
    }

    .sentence-details:hover mn-icon {
      color: var(--text-primary);
    }

    .surface {
      margin: 0;
      font-family: var(--font-japanese);
      /* Keep the headword in the shared display hierarchy. */
      font-size: var(--text-2xl);
      font-weight: var(--weight-bold);
      line-height: 1.15;
      overflow-wrap: anywhere;
    }

    .surface ruby {
      ruby-position: over;
    }

    .surface rt {
      color: var(--text-secondary);
      /* stylelint-disable-next-line declaration-property-value-allowed-list -- reading surface follows the reader scale */
      font-size: 0.48em;
      font-weight: var(--weight-medium);
      line-height: 1;
    }

    .ruby-base {
      white-space: nowrap;
    }

    /* The same group title the sentence card uses, so the two match. */
    h3 {
      margin: 0 0 var(--space-2);
    }

    .warning .form-name {
      font-weight: var(--weight-semibold);
    }

    .warning .form-example {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      font-size: var(--text-lg);
    }

    .warning p {
      margin: var(--space-2) 0 0;
      color: var(--text-secondary);
    }

    .senses {
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .senses > li + li {
      margin-top: var(--space-2);
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-subtle);
    }

    .glosses {
      margin: 0;
      padding-inline-start: var(--space-5);
      list-style: decimal;
    }

    .glosses > li + li {
      margin-top: var(--space-1);
    }

    .entry-forms {
      margin: 0 0 var(--space-1);
      color: var(--text-secondary);
      font-family: var(--font-japanese);
      font-size: var(--text-sm);
    }

    /* The same shape the sentence card gives a finding, so one rule reads the
     * same whichever way the reader arrived at it. */
    .finding + .finding {
      margin-top: var(--space-3);
    }

    .finding-label {
      margin: 0;
      font-weight: var(--weight-semibold);
    }

    .finding-text {
      margin: 0;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    /* Ruled in the marker's own colour, so the section names the underline. */
    .grammar-section {
      padding-inline-start: var(--space-3);
      border-inline-start: 2px solid var(--marker-grammar);
    }

    .scope {
      margin-inline-start: var(--space-2);
    }

    section p + p {
      margin-block: var(--space-1) 0;
    }

    section button {
      margin-top: var(--space-2);
    }

    p[role] {
      margin: 0;
    }
  `,
})
export class WordInspectorComponent {
  private readonly wordList = inject(ReaderWordListService);
  protected readonly adding = signal(false);
  protected readonly addedTo = signal<string | null>(null);
  protected readonly addFailure = signal<string | null>(null);
  protected readonly store = inject(WordInspectorStore);

  private readonly expandedSignal = signal(false);

  constructor() {
    // A new word is a new lookup: it opens collapsed, whatever the last one did.
    effect(() => {
      this.store.selected();
      this.expandedSignal.set(false);
      this.addedTo.set(null);
      this.addFailure.set(null);
    });
  }

  /** The grammar around this word, and whether it can still be analysed. */
  readonly grammar = input<WordGrammarState>(NO_WORD_GRAMMAR);

  /** Opens the request-spending actions for this word's sentence. */
  readonly sentenceActions = output<void>();

  /** Whether this word has stored grammar findings to show. */
  protected readonly hasNotes = computed(() => {
    const grammar = this.grammar();
    return grammar.findings.length > 0 || grammar.sentenceFindings.length > 0;
  });

  /** Presentation-only ruby, derived from the token readings of the tapped form. */
  protected readonly rubySegments = computed(() => {
    const selected = this.store.selected();
    return selected === null ? [] : wordRubySegments(selected.word);
  });

  protected readonly entries = computed(() => {
    const state = this.store.dictionary();
    return state.kind === 'found' ? state.entries : [];
  });

  /**
   * The entries as shown. Collapsed, this is the first two meanings across all
   * returned entries.
   */
  protected readonly visibleEntries = computed(() => {
    const entries = this.entries();
    if (this.expandedSignal() || entries.length === 0) {
      return entries;
    }
    return limitEntries(entries, COLLAPSED_SENSE_LIMIT);
  });

  protected readonly hiddenSenseCount = computed(() => {
    const total = this.entries().reduce((count, entry) => count + entry.senses.length, 0);
    const shown = this.visibleEntries().reduce((count, entry) => count + entry.senses.length, 0);
    return total - shown;
  });

  /**
   * The status, only when it is a warning.
   *
   * "Known from Anki", "this is a particle" and the rest are three ways of
   * saying the word is readable, and printing them here would just move the
   * clutter the reader already keeps off the page into the inspector instead.
   */
  protected readonly canAdd = computed(
    () =>
      this.addedTo() === null &&
      (this.store.selected()?.status == null || this.warningPresentation() !== null),
  );

  protected readonly warningPresentation = computed(() => {
    const presentation = this.store.presentation();
    return this.addedTo() === null && presentation?.marker === 'warning-vocabulary'
      ? presentation
      : null;
  });

  protected otherForms(entry: DictionaryEntry): readonly string[] {
    const surface = this.store.selected()?.word.surface;
    const dictionaryForm = this.store.formSummary()?.dictionaryForm;
    return entry.writtenForms.filter((form) => form !== surface && form !== dictionaryForm);
  }

  protected async addWord(): Promise<void> {
    const selected = this.store.selected();
    if (selected === null || this.adding()) return;
    this.adding.set(true);
    this.addFailure.set(null);
    try {
      const result = await this.wordList.add(selected.word.head.lemma ?? selected.word.surface);
      if (this.store.selected() !== selected) return;
      if (result.ok) this.addedTo.set(result.value);
      else this.addFailure.set(result.error.message);
    } finally {
      this.adding.set(false);
    }
  }

  protected expand(): void {
    this.expandedSignal.set(true);
  }
}
