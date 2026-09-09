import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLOCK } from '../../application/shared/repository-tokens';
import { difficultyPercent } from '../../domain/anki/scheduling-signals';
import { formatDate, formatRelativeDay } from '../../domain/shared/locale';
import type {
  CapturedSourceObservation,
  VocabularyEntry,
} from '../../domain/vocabulary/vocabulary-repository';

/** One vocabulary item, with its compact value and native expandable detail. */
@Component({
  selector: 'mn-vocabulary-browse-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <details
      class="mn-disclosure"
      [attr.data-testid]="'vocabulary-row-' + entry().itemId"
      [open]="expanded()"
      (toggle)="toggle($event)"
    >
      <summary>
        <span class="summary-content">
          <span class="summary-main">
            <span class="expression" lang="ja">{{ entry().visibleExpression }}</span>
            <span class="meaning">{{ entry().meaning ?? '—' }}</span>
          </span>
          <span class="summary-meta">
            <span>Difficulty {{ difficultyLabel() }}</span>
            <span>First studied · {{ firstStudiedLabel() }}</span>
          </span>
        </span>
      </summary>

      <div class="detail">
        <dl>
          <div>
            <dt>Reading</dt>
            <dd lang="ja">{{ entry().readingHiragana ?? '—' }}</dd>
          </div>
          <div>
            <dt>First studied</dt>
            <dd>{{ firstStudiedDate() }}</dd>
          </div>
        </dl>

        <div class="sources">
          <h3>Contributing sources</h3>
          <ul>
            @for (sourceId of entry().sourceIds; track sourceId) {
              <li>
                @if (sourceFor(sourceId); as source) {
                  <a [routerLink]="['/reading-level/source', sourceId]">{{ source.label }}</a>
                } @else {
                  <span>Source no longer available</span>
                }
              </li>
            } @empty {
              <li>Source no longer available</li>
            }
          </ul>
        </div>
      </div>
    </details>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .mn-disclosure {
      border-block-end: 1px solid var(--border-subtle);
    }

    .mn-disclosure > summary {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: 4.5rem;
      padding-block: var(--space-2);
    }

    .summary-content,
    .summary-main,
    .summary-meta {
      display: grid;
      gap: 0.2rem;
      min-width: 0;
    }

    .summary-content {
      display: flex;
      flex: 1 1 auto;
      align-items: center;
      gap: var(--space-3);
    }

    .summary-main {
      flex: 1 1 auto;
    }

    .summary-meta {
      flex: 0 0 auto;
    }

    .expression {
      overflow-wrap: anywhere;
      font-size: var(--text-lg);
      font-weight: 650;
    }

    .meaning,
    .summary-meta,
    dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .meaning {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .summary-meta {
      justify-items: end;
      text-align: end;
      white-space: nowrap;
    }

    .detail {
      display: grid;
      gap: var(--space-3);
      padding: 0 0 var(--space-4) calc(0.55rem + var(--space-2));
    }

    dl {
      display: grid;
      gap: var(--space-2);
      margin: 0;
    }

    dl > div {
      display: grid;
      grid-template-columns: 8rem minmax(0, 1fr);
      gap: var(--space-3);
    }

    dt,
    dd {
      margin: 0;
    }

    dd {
      overflow-wrap: anywhere;
    }

    .sources {
      display: grid;
      gap: var(--space-1);
    }

    h3 {
      margin: 0;
      font-size: var(--text-sm);
      font-weight: 650;
    }

    ul {
      display: grid;
      gap: var(--space-1);
      margin: 0;
      padding-inline-start: var(--space-4);
    }

    @media (max-width: 32em) {
      .mn-disclosure > summary {
        align-items: stretch;
        gap: var(--space-1);
      }

      .summary-content {
        display: grid;
        gap: var(--space-1);
      }

      .summary-meta {
        grid-template-columns: repeat(2, auto);
        justify-content: start;
        justify-items: start;
        text-align: start;
      }

      .detail {
        padding-inline-start: calc(0.55rem + var(--space-1));
      }
    }
  `,
})
export class VocabularyBrowseRowComponent {
  private readonly clock = inject(CLOCK);

  readonly entry = input.required<VocabularyEntry>();
  readonly sources = input.required<readonly CapturedSourceObservation[]>();
  readonly expanded = input(false);
  readonly expandedChange = output<boolean>();

  protected readonly difficultyLabel = computed(() => {
    const percent = difficultyPercent(this.entry().fsrsDifficulty);
    return percent === null ? '—' : `${String(percent)} %`;
  });

  protected firstStudiedLabel(): string {
    const timestamp = this.entry().firstReviewedAt;
    return timestamp === undefined ? '—' : formatRelativeDay(timestamp, this.clock.now());
  }

  protected firstStudiedDate(): string {
    const timestamp = this.entry().firstReviewedAt;
    return timestamp === undefined ? '—' : formatDate(timestamp);
  }

  protected sourceFor(sourceId: string): CapturedSourceObservation | undefined {
    return this.sources().find((source) => source.sourceId === sourceId);
  }

  protected toggle(event: Event): void {
    const open = (event.target as HTMLDetailsElement).open;
    if (open === this.expanded()) {
      return;
    }
    this.expandedChange.emit(open);
  }
}
