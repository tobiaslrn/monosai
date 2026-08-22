import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import type { SnapshotStats } from '../../domain/vocabulary/snapshot';

interface SummaryCard {
  readonly label: string;
  readonly value: number;
  readonly hint?: string;
}

/**
 * What a refresh found, before anything is saved.
 *
 * Counts only. There is deliberately no list of the extracted expressions and
 * no way to download them: the learner is confirming that the numbers look
 * right for their collection, not proofreading their own vocabulary.
 */
@Component({
  selector: 'mn-refresh-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="cards">
      @for (card of cards(); track card.label) {
        <div class="card">
          <dt>{{ card.label }}</dt>
          <dd>
            {{ card.value }}
            @if (card.hint) {
              <span class="hint">{{ card.hint }}</span>
            }
          </dd>
        </div>
      }
    </dl>

    @if (stats().providerWarnings.length > 0) {
      <ul class="warnings" data-testid="refresh-warnings">
        @for (warning of stats().providerWarnings; track warning) {
          <li>{{ warning }}</li>
        }
      </ul>
    }

    @if (stats().uniqueExpressions === 0) {
      <p class="mn-hint" role="alert">
        Nothing reviewed was found. Check that the deck and field you chose are the ones you study,
        then refresh again.
      </p>
    } @else if (stats().uniqueExpressions < minimum) {
      <p class="mn-hint">
        Story generation needs at least {{ minimum }} unique expressions. Reading, furigana, and
        vocabulary markers work with any number.
      </p>
    }

    <div class="actions">
      <button
        type="button"
        class="mn-button mn-button--primary"
        (click)="confirm()"
        data-testid="confirm-refresh"
      >
        Replace current vocabulary
      </button>
      <button type="button" class="mn-button" (click)="discard()" data-testid="discard-refresh">
        Discard
      </button>
    </div>
  `,
  styles: `
    /* A definition list rather than a table, so it reflows at 320px. */
    .cards {
      display: grid;
      gap: var(--space-2);
      margin: 0 0 var(--space-3);
    }

    @media (min-width: 560px) {
      .cards {
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      }
    }

    .card {
      padding: var(--space-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
    }

    .card dt {
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .card dd {
      margin: 0;
      font-size: 22px;
      font-variant-numeric: tabular-nums;
    }

    .hint {
      display: block;
      font-size: var(--text-sm);
      color: var(--text-secondary);
    }

    .warnings {
      margin: 0 0 var(--space-3);
      padding-left: var(--space-3);
      color: var(--status-warning);
      font-size: var(--text-sm);
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class RefreshSummaryComponent {
  readonly stats = input.required<SnapshotStats>();

  protected readonly minimum = GENERATION_SNAPSHOT_MINIMUM;
  private readonly refresh = inject(VocabularyRefreshStore);

  protected readonly cards = computed<readonly SummaryCard[]>(() => {
    const stats = this.stats();
    return [
      { label: 'Sources read', value: stats.mappingsQueried },
      { label: 'Reviewed notes', value: stats.reviewedEligibleNotes },
      { label: 'Values with text', value: stats.nonEmptyValues },
      {
        label: 'Empty values skipped',
        value: stats.rejectedEmptyValues,
        ...(stats.rejectedEmptyValues > 0
          ? { hint: 'These notes had nothing in the chosen field.' }
          : {}),
      },
      { label: 'Duplicates merged', value: stats.duplicateOccurrences },
      { label: 'Unique vocabulary', value: stats.uniqueExpressions },
    ];
  });

  protected confirm(): void {
    void this.refresh.confirm();
  }

  protected discard(): void {
    this.refresh.discard();
  }
}
