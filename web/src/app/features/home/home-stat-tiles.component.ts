import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatCompactCount, formatCount } from '../../domain/shared/locale';

/** The three figures Home gives for how much the learner has read. */
export interface ReadingFigures {
  readonly storiesRead: number;
  readonly thisWeek: number;
  readonly charactersRead: number;
}

/**
 * Three equal figures in a row. Each is shortened to fit its tile and said in
 * full to assistive technology.
 */
@Component({
  selector: 'mn-home-stat-tiles',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="tiles">
      @for (tile of tiles(); track tile.label) {
        <li class="mn-card tile">
          <span class="value" aria-hidden="true">{{ tile.shown }}</span>
          <span class="mn-visually-hidden">{{ tile.spoken }}</span>
          <span class="label">{{ tile.label }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    .tiles {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }

    .tile {
      gap: var(--space-1);
    }

    .value {
      font-size: var(--text-xl);
      font-weight: var(--weight-semibold);
      font-variant-numeric: tabular-nums;
      line-height: 1.2;
    }

    .label {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: 1.3;
    }
  `,
})
export class HomeStatTilesComponent {
  readonly figures = input.required<ReadingFigures>();

  protected readonly tiles = computed(() => {
    const figures = this.figures();
    return [
      { value: figures.storiesRead, label: 'stories read' },
      { value: figures.thisWeek, label: 'this week' },
      { value: figures.charactersRead, label: 'characters read' },
    ].map((tile) => ({
      label: tile.label,
      shown: formatCompactCount(tile.value),
      spoken: formatCount(tile.value),
    }));
  });
}
