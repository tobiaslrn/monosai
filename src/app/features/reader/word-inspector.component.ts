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
        </header>

        @if (store.formSummary(); as formSummary) {
          <mn-word-form-summary [summary]="formSummary" [surface]="word.word.surface" />
        }

        <button type="button" class="sentence-route" (click)="sentenceActions.emit()">
          <span>Sentence</span>
          <mn-icon name="chevron-right" [size]="18" />
        </button>

        <section class="dictionary-section" aria-labelledby="mn-inspector-dictionary">
          <h3 id="mn-inspector-dictionary">Meanings</h3>
          @switch (store.dictionary().kind) {
            @case ('looking-up') {
              <p class="mn-hint" role="status">Looking up…</p>
            }
            @case ('not-found') {
              <p class="mn-hint">
                No bundled definition. Monosai ships a compact dictionary, so uncommon words are not
                always covered.
              </p>
            }
            @case ('failed') {
              <p class="mn-error" role="alert">
                The dictionary is unavailable ({{ failureCode() }}). The rest of this word's details
                are unaffected.
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
                <button type="button" class="more" (click)="expand()">
                  More ({{ hiddenSenseCount() }})
                </button>
              }
            }
          }
        </section>

        @if (hasNotes() || grammar().stale) {
          <section class="grammar-section" aria-labelledby="mn-inspector-grammar">
            <h3 id="mn-inspector-grammar">Grammar here</h3>

            @if (grammar().stale) {
              <p class="mn-hint">
                Analyzed under an earlier grammar profile. It can be re-analyzed from the sentence.
              </p>
            }

            @if (grammarLabels().length > 0) {
              <div class="grammar-labels" aria-label="Grammar findings">
                @for (finding of grammar().findings; track $index) {
                  <span class="finding-label">{{ finding.label }}</span>
                }
                @for (finding of grammar().sentenceFindings; track $index) {
                  <span class="finding-label">
                    {{ finding.label }} <span class="scope">whole sentence</span>
                  </span>
                }
              </div>

              <details class="grammar-details mn-disclosure">
                <summary>Details</summary>
                <div class="grammar-explanations">
                  @for (finding of grammar().findings; track $index) {
                    <p lang="en">
                      <strong>{{ finding.label }}</strong> — {{ finding.explanationEn }}
                    </p>
                  }
                  @for (finding of grammar().sentenceFindings; track $index) {
                    <p lang="en">
                      <strong>{{ finding.label }}</strong>
                      <span class="scope">whole sentence</span> —
                      {{ finding.explanationEn }}
                    </p>
                  }
                </div>
              </details>
            }
          </section>
        }

        @if (warningPresentation(); as presentation) {
          <section class="status" aria-labelledby="mn-inspector-status">
            <h3 id="mn-inspector-status">
              <span class="badge">{{ presentation.label }}</span>
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
          <button
            type="button"
            class="next-action mn-button mn-button--secondary"
            [disabled]="adding()"
            (click)="addWord()"
          >
            {{ adding() ? 'Adding…' : 'Add to word list' }}
          </button>
        }
        @if (addedTo(); as label) {
          <p role="status" class="mn-hint">Added to {{ label }}.</p>
        }
        @if (addFailure(); as failure) {
          <p role="alert" class="mn-error">{{ failure }} Your word lists are unchanged.</p>
        }
      </div>
    }
  `,
  styles: `
    .inspector {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
    }

    header {
      display: flex;
      gap: var(--space-2);
      align-items: flex-start;
      justify-content: space-between;
    }

    .header-actions {
      display: flex;
      flex: none;
      gap: var(--space-2);
      align-items: flex-start;
    }

    .headword {
      min-width: 0;
    }

    .surface {
      margin: 0;
      font-family: var(--font-japanese);
      font-size: 28px;
      font-weight: 700;
      line-height: 1.15;
      overflow-wrap: anywhere;
    }

    .surface ruby {
      ruby-position: over;
    }

    .surface rt {
      color: var(--text-secondary);
      font-size: 0.48em;
      font-weight: 500;
      line-height: 1;
    }

    .ruby-base {
      white-space: nowrap;
    }

    .close {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--touch-target);
      height: var(--touch-target);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      cursor: pointer;
    }

    /* The same quiet section label the sentence card uses, so the two match. */
    h3 {
      margin: 0 0 var(--space-2);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    /* Except this one, which is a status badge rather than a label. */
    .status h3 {
      color: inherit;
      letter-spacing: normal;
      text-transform: none;
    }

    .badge {
      display: inline-block;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
      font-size: var(--text-sm);
    }

    .status .form-name {
      font-weight: 600;
    }

    .status .form-example {
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      font-size: var(--text-lg);
    }

    .status p {
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

    .more {
      display: inline-flex;
      align-items: center;
      min-height: var(--touch-target);
      margin-top: var(--space-1);
      padding: 0;
      border: 0;
      background: none;
      color: var(--text-primary);
      font: inherit;
      font-size: var(--text-sm);
      text-decoration: underline;
      cursor: pointer;
    }

    .finding-label {
      display: inline-block;
      padding: var(--space-1) var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
      font-weight: 600;
    }

    .grammar-labels {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-2);
    }

    .grammar-details {
      margin-top: var(--space-2);
    }

    .grammar-explanations {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .grammar-explanations p {
      margin: var(--space-2) 0 0;
    }

    /* Ruled in the marker's own colour, so the section names the underline. */
    .grammar-section {
      padding-inline-start: var(--space-3);
      border-inline-start: 2px solid var(--marker-grammar);
    }

    .scope {
      display: inline-block;
      margin-inline-start: var(--space-2);
      padding: 0 var(--space-2);
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 400;
    }

    section p + p {
      margin-block: var(--space-1) 0;
    }

    section .mn-button {
      margin-top: var(--space-2);
    }

    .next-action {
      margin: 0;
      padding: var(--space-3);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
      font-size: var(--text-sm);
    }

    .sentence-route {
      display: inline-flex;
      align-items: center;
      align-self: flex-start;
      gap: var(--space-1);
      min-height: var(--touch-target);
      padding: 0;
      border: 0;
      border-radius: var(--radius-control);
      background: none;
      color: var(--text-secondary);
      font: inherit;
      font-size: var(--text-sm);
      cursor: pointer;
    }

    .sentence-route:hover {
      color: var(--text-primary);
      text-decoration: underline;
    }

    .sentence-route:focus-visible {
      outline: 2px solid var(--action-primary);
      outline-offset: 2px;
    }

    .sentence-route mn-icon {
      color: currentColor;
    }

    /* Keep the quiet route near the form, rather than visually promoting it. */
    .sentence-route + .dictionary-section {
      margin-top: calc(-1 * var(--space-1));
    }

    .mn-error {
      margin: 0;
      color: var(--status-danger);
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

  protected readonly grammarLabels = computed(() => {
    const grammar = this.grammar();
    return [...grammar.findings, ...grammar.sentenceFindings].map((finding) => finding.label);
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

  protected readonly failureCode = computed(() => {
    const state = this.store.dictionary();
    return state.kind === 'failed' ? state.error.code : '';
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
