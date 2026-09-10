import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLOCK } from '../../application/shared/repository-tokens';
import { difficultyPercent } from '../../domain/anki/scheduling-signals';
import { formatDate, formatRelativeDay, startSentence } from '../../domain/shared/locale';
import type {
  CapturedSourceObservation,
  VocabularyEntry,
} from '../../domain/vocabulary/vocabulary-repository';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * From this difficulty up a word is marked as one the learner still finds
 * hard. The number is printed either way, so the colour is never the only
 * thing saying it.
 */
const HARD_DIFFICULTY_PERCENT = 50;

/**
 * One vocabulary item: a row of columns that opens into its detail.
 *
 * The summary's column widths match the list header in the page. Both are
 * declared in rem so they grow with the text, and a list too narrow for them
 * — a phone at a large text size — stacks the two figures under the word.
 */
@Component({
  selector: 'mn-vocabulary-browse-row',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <details
      class="entry"
      [attr.data-testid]="'vocabulary-row-' + entry().itemId"
      [open]="expanded()"
      (toggle)="toggle($event)"
    >
      <summary>
        <span class="word">
          <span class="expression" lang="ja">{{ entry().visibleExpression }}</span>
          <span class="meaning">{{ entry().meaning ?? '—' }}</span>
        </span>
        <span class="figures">
          <span class="difficulty" [class.is-hard]="isHard()">
            <span class="cell-label">Difficulty </span>{{ difficultyLabel() }}
          </span>
          <span class="studied">
            <span class="cell-label">First studied </span>{{ firstStudiedLabel() }}
          </span>
        </span>
        <mn-icon class="chevron" name="chevron-right" />
      </summary>

      <div class="detail">
        @if (entry().readingHiragana; as reading) {
          <p class="reading" lang="ja">{{ reading }}</p>
        }
        <p class="studied-date">First studied {{ firstStudiedDate() }}</p>
        <h3 class="mn-visually-hidden">Contributing sources</h3>
        <ul class="sources">
          @for (sourceId of entry().sourceIds; track sourceId) {
            <li>
              <mn-icon name="anki-source" [size]="18" />
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
    </details>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    .entry {
      border-block-end: 1px solid var(--border-subtle);
    }

    .entry[open] {
      border-radius: var(--radius-card);
      border-block-end-color: transparent;
      background: color-mix(in srgb, var(--surface-sunken) 70%, transparent);
    }

    summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) 10.25rem 1.25rem;
      gap: var(--space-3);
      align-items: center;
      min-height: 3.75rem;
      padding: var(--space-2) var(--space-3);
      border-radius: var(--radius-card);
      list-style: none;
      cursor: pointer;
    }

    summary::-webkit-details-marker {
      display: none;
    }

    summary:hover {
      background: color-mix(in srgb, var(--surface-sunken) 60%, transparent);
    }

    .word {
      display: grid;
      min-width: 0;
    }

    .expression {
      overflow-wrap: anywhere;
      font-size: var(--text-lg);
      font-weight: var(--weight-semibold);
    }

    .meaning {
      overflow-wrap: anywhere;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    /* Two columns while the list is wide enough, a quiet line under the word when not. */
    .figures {
      display: grid;
      grid-template-columns: 4.25rem 5.25rem;
      gap: var(--space-3);
      align-items: center;
      font-size: var(--text-sm);
      font-variant-numeric: tabular-nums;
    }

    .studied {
      color: var(--text-secondary);
    }

    .difficulty.is-hard {
      color: var(--status-warning);
      font-weight: var(--weight-semibold);
    }

    .cell-label {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }

    .chevron {
      color: var(--text-secondary);
      transition: transform var(--motion-fast) ease-out;
    }

    .entry[open] .chevron {
      transform: rotate(-90deg);
    }

    @media (prefers-reduced-motion: reduce) {
      .chevron {
        transition: none;
      }
    }

    .detail {
      display: grid;
      gap: var(--space-1);
      padding: 0 var(--space-3) var(--space-3);
    }

    .detail p {
      margin: 0;
    }

    .reading {
      font-size: var(--text-lg);
    }

    .studied-date {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .sources {
      display: grid;
      gap: var(--space-1);
      margin: var(--space-2) 0 0;
      padding: 0;
      list-style: none;
    }

    .sources li {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-height: var(--touch-target);
      overflow-wrap: anywhere;
    }

    .sources mn-icon {
      flex: none;
      color: var(--text-secondary);
    }

    /* The open row's tint darkens the page, so the link takes the darker green. */
    .sources a {
      color: var(--action-primary-text);
    }

    @container vocabulary-list (max-width: 20rem) {
      summary {
        grid-template-columns: minmax(0, 1fr) 1.25rem;
      }

      .figures {
        display: flex;
        flex-wrap: wrap;
        grid-column: 1;
        gap: 0 var(--space-3);
      }

      .cell-label {
        position: static;
        width: auto;
        height: auto;
        overflow: visible;
        clip-path: none;
        color: var(--text-secondary);
        font-weight: var(--weight-regular);
      }

      .chevron {
        grid-row: 1 / span 2;
        grid-column: 2;
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

  private readonly percent = computed(() => difficultyPercent(this.entry().fsrsDifficulty));

  protected readonly difficultyLabel = computed(() => {
    const percent = this.percent();
    return percent === null ? '—' : `${String(percent)}%`;
  });

  protected readonly isHard = computed(() => {
    const percent = this.percent();
    return percent !== null && percent >= HARD_DIFFICULTY_PERCENT;
  });

  protected firstStudiedLabel(): string {
    const timestamp = this.entry().firstReviewedAt;
    return timestamp === undefined
      ? '—'
      : startSentence(formatRelativeDay(timestamp, this.clock.now()));
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
