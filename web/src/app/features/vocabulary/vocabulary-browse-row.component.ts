import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CLOCK } from '../../application/shared/repository-tokens';
import { difficultyPercent } from '../../domain/anki/scheduling-signals';
import { formatDate, formatRelativeDay, startSentence } from '../../domain/shared/locale';
import type {
  CapturedSourceObservation,
  VocabularyEntry,
} from '../../domain/vocabulary/vocabulary-repository';
import { EntryComponent, FigureComponent } from '../../shared-ui/entry-list/entry-list.component';
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
  imports: [RouterLink, EntryComponent, FigureComponent, IconComponent],
  template: `
    <mn-entry
      [testId]="'vocabulary-row-' + entry().itemId"
      [open]="expanded()"
      (openChange)="expandedChange.emit($event)"
    >
      <span mn-entry-title lang="ja">{{ entry().visibleExpression }}</span>
      <span mn-entry-meta>{{ entry().meaning ?? '—' }}</span>
      <mn-figure
        mn-entry-figure
        label="Difficulty"
        data-testid="difficulty"
        [tone]="isHard() ? 'warning' : 'default'"
        >{{ difficultyLabel() }}</mn-figure
      >
      <mn-figure mn-entry-figure label="First studied" tone="quiet">{{
        firstStudiedLabel()
      }}</mn-figure>

      @if (entry().readingHiragana; as reading) {
        <p mn-entry-lead lang="ja">{{ reading }}</p>
      }
      <p class="mn-hint">First studied {{ firstStudiedDate() }}</p>
      <h3 class="mn-visually-hidden">Contributing sources</h3>
      <ul>
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
    </mn-entry>
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
}
