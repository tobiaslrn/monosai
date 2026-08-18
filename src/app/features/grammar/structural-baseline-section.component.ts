import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { LanguageStore } from '../../application/language/language.store';
import {
  STRUCTURAL_BASELINE_CATEGORIES,
  type StructuralBaselineCategory,
  type StructuralBaselineEntry,
} from '../../domain/language/structural-baseline';

const CATEGORY_LABELS: Readonly<Record<StructuralBaselineCategory, string>> = {
  particle: 'Particles',
  copula: 'Copula',
  auxiliary: 'Auxiliaries',
  inflection: 'Inflections',
  conjunction: 'Conjunctions',
  'formal-noun': 'Formal nouns',
  affix: 'Prefixes and suffixes',
  counter: 'Counters',
  punctuation: 'Punctuation',
};

interface CategoryGroup {
  readonly category: StructuralBaselineCategory;
  readonly label: string;
  readonly entries: readonly StructuralBaselineEntry[];
}

/**
 * Read-only publication of the structural baseline.
 *
 * The baseline is the reason a sentence full of particles is not reported as
 * unknown vocabulary, so the learner is entitled to see exactly what it covers.
 * It is 177 entries, which is far too long to sit above the preset picker, so it
 * is collapsed by default and expands in place.
 */
@Component({
  selector: 'mn-structural-baseline-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p class="mn-hint">
      Monosai always treats these sentence-building forms as readable. They are grammar, not
      vocabulary, so they are never counted as words you need in Anki and you cannot edit them.
    </p>

    @if (groups().length === 0) {
      <p class="mn-hint">Language assets are still loading.</p>
    } @else {
      <details>
        <summary>
          Show all {{ entryCount() }} forms
          <span class="mn-hint">({{ groups().length }} categories)</span>
        </summary>

        <div class="groups">
          @for (group of groups(); track group.category) {
            <section [attr.aria-labelledby]="'mn-baseline-' + group.category">
              <h3 [id]="'mn-baseline-' + group.category">
                {{ group.label }}
                <span class="mn-hint">{{ group.entries.length }}</span>
              </h3>
              <dl>
                @for (entry of group.entries; track entry.id) {
                  <div class="entry">
                    <dt>
                      <span class="name">{{ entry.nameEn }}</span>
                      <span class="forms" lang="ja">{{ formsOf(entry) }}</span>
                    </dt>
                    <dd>
                      <span>{{ entry.descriptionEn }}</span>
                      @if (entry.exampleJa) {
                        <span class="example" lang="ja">{{ entry.exampleJa }}</span>
                      }
                    </dd>
                  </div>
                }
              </dl>
            </section>
          }
        </div>
      </details>
    }
  `,
  styles: `
    summary {
      min-height: 44px;
      padding: var(--space-2) 0;
      cursor: pointer;
    }

    summary:focus-visible {
      outline: 2px solid var(--focus-ring);
      outline-offset: 2px;
    }

    .groups {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      margin-top: var(--space-3);
    }

    h3 {
      display: flex;
      gap: var(--space-2);
      align-items: baseline;
      margin: 0 0 var(--space-2);
      font-size: var(--text-md);
    }

    dl {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
    }

    .entry {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      padding-bottom: var(--space-2);
      border-bottom: 1px solid var(--border-subtle);
    }

    dt {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: baseline;
      /* Long form lists must wrap rather than widen the page at 360px. */
      min-width: 0;
    }

    .name {
      font-weight: 600;
    }

    .forms {
      font-size: var(--text-lg);
    }

    dd {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      margin: 0;
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .example {
      color: var(--text-primary);
      font-size: var(--text-md);
    }
  `,
})
export class StructuralBaselineSectionComponent {
  private readonly language = inject(LanguageStore);

  protected readonly entryCount = computed(() => this.language.structuralBaseline().length);

  /** Empty categories are dropped so the list never shows a heading with nothing under it. */
  protected readonly groups = computed<readonly CategoryGroup[]>(() => {
    const entries = this.language.structuralBaseline();
    return STRUCTURAL_BASELINE_CATEGORIES.map((category) => ({
      category,
      label: CATEGORY_LABELS[category],
      entries: entries.filter((entry) => entry.category === category),
    })).filter((group) => group.entries.length > 0);
  });

  protected formsOf(entry: StructuralBaselineEntry): string {
    return entry.forms.join('、');
  }
}
