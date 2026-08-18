import { ChangeDetectionStrategy, Component, computed, inject, output } from '@angular/core';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { PART_OF_SPEECH_LABELS } from '../../domain/reading/token';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * Word details.
 *
 * Everything shown is local: the bundled dictionary, the stored analysis, and
 * locally computed status. Opening a word never makes a request, so inspection
 * works offline and costs nothing.
 */
@Component({
  selector: 'mn-word-inspector',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
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

        <section aria-labelledby="mn-inspector-context">
          <h3 id="mn-inspector-context">In this sentence</h3>
          <p class="context" lang="ja">{{ word.sentence.japaneseText }}</p>
        </section>

        @if (nextAction(); as action) {
          <p class="next-action">{{ action }}</p>
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

    .context {
      margin: 0;
      font-family: var(--font-japanese);
      line-height: 1.8;
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
  readonly closed = output<void>();

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
