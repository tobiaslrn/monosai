import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import type { GrammarFinding } from '../../domain/enrichment/records';
import { PART_OF_SPEECH_LABELS } from '../../domain/reading/token';
import { IconComponent } from '../../shared-ui/icon/icon.component';

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

export const NO_WORD_GRAMMAR: WordGrammarState = {
  findings: [],
  sentenceFindings: [],
  analyzed: false,
  stale: false,
};

/**
 * Word details.
 *
 * Read-only, and entirely local: the bundled dictionary, the stored analysis,
 * and locally computed status all read from disk, so opening a word costs
 * nothing, works offline, and can never spend a request by accident. Everything
 * that does spend one is on the sentence.
 */
@Component({
  selector: 'mn-word-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, NgTemplateOutlet],
  template: `
    @if (store.selected(); as word) {
      <div class="inspector">
        <header>
          <div class="headword">
            <p class="surface" lang="ja">{{ word.token.surface }}</p>
            @if (word.token.readingHiragana; as reading) {
              <p class="reading" lang="ja">{{ reading }}</p>
            }
          </div>
          <button type="button" class="close" aria-label="Close word details" (click)="onClose()">
            <mn-icon name="close" />
          </button>
        </header>

        <dl class="facts">
          @if (word.token.lemma; as lemma) {
            <div>
              <dt>Dictionary form</dt>
              <dd lang="ja">{{ lemma }}</dd>
            </div>
          }
          @if (partOfSpeech(); as pos) {
            <div>
              <dt>Part of speech</dt>
              <dd>{{ pos }}</dd>
            </div>
          }
        </dl>

        <!--
          A note the learner came here for should not sit below a dictionary
          they have to scroll past: when this word carries one, it leads.
        -->
        @if (hasNotes()) {
          <ng-container *ngTemplateOutlet="grammarSection" />
        }

        @if (store.presentation(); as presentation) {
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
            <p>{{ presentation.explanation }}</p>
          </section>
        } @else {
          <p class="mn-hint">
            Connect Anki to see whether you have reviewed this word. Reading works without it.
          </p>
        }

        <section aria-labelledby="mn-inspector-dictionary">
          <h3 id="mn-inspector-dictionary">Dictionary</h3>
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
                @for (entry of entries(); track entry.id) {
                  <li>
                    @if (entry.writtenForms.length > 0) {
                      <p class="entry-forms" lang="ja">{{ entry.writtenForms.join('、') }}</p>
                    }
                    <ol class="glosses">
                      @for (sense of entry.senses; track $index) {
                        <li lang="en">{{ sense.glossesEn.join('; ') }}</li>
                      }
                    </ol>
                  </li>
                }
              </ol>
            }
          }
        </section>

        @if (!hasNotes()) {
          <ng-container *ngTemplateOutlet="grammarSection" />
        }

        @if (nextAction(); as action) {
          <p class="next-action">{{ action }}</p>
        }

        <!--
          The keyboard's only route to a sentence, and invisible to everyone
          else: selecting one is a press on whitespace that a keyboard cannot
          aim, while the words are already focus stops. Word details themselves
          are read-only — everything that spends a request is on the sentence.
        -->
        <button type="button" class="sentence-route" (click)="sentenceRequested.emit()">
          Open this sentence
        </button>
      </div>
    }

    <ng-template #grammarSection>
      <section class="grammar-section" aria-labelledby="mn-inspector-grammar">
        <h3 id="mn-inspector-grammar">Grammar here</h3>

        @if (grammar().stale) {
          <p class="mn-hint">
            Analyzed under an earlier grammar profile. It can be re-analyzed from the sentence.
          </p>
        }

        @for (finding of grammar().findings; track $index) {
          <p class="finding-label">{{ finding.label }}</p>
          <p lang="en">{{ finding.explanationEn }}</p>
        } @empty {
          @if (grammar().sentenceFindings.length === 0) {
            <p class="mn-hint">
              {{
                grammar().analyzed
                  ? 'Nothing here is outside your grammar profile.'
                  : 'This sentence has not been analyzed.'
              }}
            </p>
          }
        }

        <!--
            Said about the sentence rather than any part of it, so no word could
            be marked for it and every word has to carry it.
          -->
        @for (finding of grammar().sentenceFindings; track $index) {
          <p class="finding-label">{{ finding.label }} <span class="scope">whole sentence</span></p>
          <p lang="en">{{ finding.explanationEn }}</p>
        }
      </section>
    </ng-template>
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
    }

    .surface {
      margin: 0;
      font-family: var(--font-japanese);
      font-size: 28px;
    }

    .reading {
      margin: 0;
      color: var(--text-secondary);
      font-family: var(--font-japanese);
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

    h3 {
      margin: 0 0 var(--space-2);
      font-size: var(--text-md);
    }

    .facts {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      margin: 0;
    }

    dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    dd {
      margin: 0;
    }

    .badge {
      display: inline-block;
      padding: 2px var(--space-2);
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

    .senses,
    .glosses {
      margin: 0;
      padding-inline-start: var(--space-5);
    }

    .senses > li + li {
      margin-top: var(--space-3);
    }

    .entry-forms {
      margin: 0 0 var(--space-1);
      font-family: var(--font-japanese);
    }

    .finding-label {
      margin: 0;
      font-weight: 600;
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

    /*
     * The skip-link pattern: laid out only while it holds focus, so a keyboard
     * keeps its route to the sentence and everyone else sees a plain lookup.
     */
    .sentence-route {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      border: 0;
      clip-path: inset(50%);
    }

    /*
     * Plain :focus rather than :focus-visible: the control is invisible at rest,
     * so it must lay itself out whenever it holds focus.
     */
    .sentence-route:focus {
      position: static;
      width: 100%;
      height: auto;
      min-height: var(--touch-target);
      margin: 0;
      padding: var(--space-2) var(--space-3);
      overflow: visible;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
      color: var(--text-primary);
      font: inherit;
      text-align: start;
      clip-path: none;
      cursor: pointer;
    }

    .next-action {
      margin: 0;
      padding: var(--space-3);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
      font-size: var(--text-sm);
    }

    .mn-error {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class WordInspectorComponent {
  protected readonly store = inject(WordInspectorStore);

  /** The grammar around this word, and whether it can still be analysed. */
  readonly grammar = input<WordGrammarState>(NO_WORD_GRAMMAR);

  readonly closed = output<void>();
  readonly sentenceRequested = output<void>();

  /** Whether this word has grammar to read, which decides where the section goes. */
  protected readonly hasNotes = computed(() => {
    const grammar = this.grammar();
    return grammar.findings.length > 0 || grammar.sentenceFindings.length > 0;
  });

  protected readonly partOfSpeech = computed(() => {
    const pos = this.store.selected()?.token.partOfSpeech;
    return pos === undefined ? null : PART_OF_SPEECH_LABELS[pos];
  });

  protected readonly entries = computed(() => {
    const state = this.store.dictionary();
    return state.kind === 'found' ? state.entries : [];
  });

  protected readonly failureCode = computed(() => {
    const state = this.store.dictionary();
    return state.kind === 'failed' ? state.error.code : '';
  });

  protected readonly nextAction = computed(() => this.store.presentation()?.nextAction ?? null);

  protected onClose(): void {
    this.closed.emit();
  }
}
