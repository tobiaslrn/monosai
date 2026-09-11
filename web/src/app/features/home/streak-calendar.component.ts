import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { HeatLevel } from './sample-reading-progress';

const LEGEND: readonly HeatLevel[] = [0, 1, 2, 3, 4];

/**
 * How much was read on each of the last weeks' days, one square per day, a
 * column per week, and today last and outlined.
 *
 * The grid is one image with one name: a picture of the streak its heading
 * already states, not a hundred cells to be read one by one. The days are
 * sample figures until reading is recorded, and its name says so with the
 * Sample pill on its group (ADR 0070).
 */
@Component({
  selector: 'mn-streak-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="mn-card calendar">
      <p class="head">
        <span class="streak">{{ streakDays() }}-day streak</span>
        <span class="mn-hint">Last {{ weeks() }} weeks</span>
      </p>
      <div class="grid" role="img" [attr.aria-label]="label()">
        @for (level of levels(); track $index; let last = $last) {
          <span class="cell" [attr.data-level]="level" [class.is-today]="last"></span>
        }
      </div>
      <p class="legend" aria-hidden="true">
        <span>Less</span>
        @for (level of legend; track level) {
          <span class="cell swatch" [attr.data-level]="level"></span>
        }
        <span>More</span>
      </p>
    </div>
  `,
  styles: `
    .calendar {
      gap: var(--space-2);
    }

    /*
     * Capped so a wide column does not blow the days up into tiles; the
     * heading and legend keep to the grid's width so they stay beside it.
     */
    .head,
    .grid,
    .legend {
      width: 100%;
      max-width: 30rem;
    }

    .head {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-3);
      align-items: baseline;
      justify-content: space-between;
      margin: 0;
    }

    .streak {
      font-weight: var(--weight-semibold);
    }

    .grid {
      display: grid;
      grid-auto-columns: minmax(0, 1fr);
      grid-auto-flow: column;
      grid-template-rows: repeat(7, auto);
      gap: 0.1875rem;
    }

    .cell {
      aspect-ratio: 1;
      border-radius: var(--radius-cell);
      background: var(--heat-0);
    }

    .cell[data-level='1'] {
      background: var(--heat-1);
    }

    .cell[data-level='2'] {
      background: var(--heat-2);
    }

    .cell[data-level='3'] {
      background: var(--heat-3);
    }

    .cell[data-level='4'] {
      background: var(--heat-4);
    }

    .is-today {
      outline: 2px solid var(--text-primary);
      outline-offset: 1px;
    }

    .legend {
      display: flex;
      gap: var(--space-1);
      align-items: center;
      justify-content: flex-end;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-xs);
    }

    .swatch {
      width: 0.625rem;
    }
  `,
})
export class StreakCalendarComponent {
  /** One level per day, oldest first and today last; a whole number of weeks. */
  readonly levels = input.required<readonly HeatLevel[]>();
  readonly streakDays = input.required<number>();

  protected readonly legend = LEGEND;
  protected readonly weeks = computed(() => Math.ceil(this.levels().length / 7));
  protected readonly label = computed(
    () => `Sample: ${String(this.streakDays())}-day reading streak`,
  );
}
