import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { ContinueReadingTarget } from '../../domain/reading/progress';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * Continue reading.
 *
 * The target is derived from the most recently opened surviving reading, so it
 * repairs itself when the reading it pointed at is deleted.
 */
@Component({
  selector: 'mn-continue-reading-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <section class="card" aria-labelledby="mn-continue-heading">
      <div class="body">
        <p class="eyebrow" id="mn-continue-heading">Continue reading</p>
        <h2>{{ target().title }}</h2>
        <p class="progress">
          {{ percent() }}% read · sentence
          {{ ((target().progress?.positionInReading ?? 0) + 1).toLocaleString('en') }} of
          {{ target().sentenceCount.toLocaleString('en') }}
        </p>
        <div
          class="track"
          role="progressbar"
          aria-labelledby="mn-continue-heading"
          [attr.aria-valuenow]="percent()"
          aria-valuemin="0"
          aria-valuemax="100"
          [attr.aria-valuetext]="percent() + '% read'"
        >
          <div class="fill" [style.inline-size.%]="percent()"></div>
        </div>
      </div>

      <a class="mn-button mn-button--primary" [routerLink]="['/reader', target().readingId]">
        <mn-icon name="library" [size]="18" />
        <span>Resume</span>
      </a>
    </section>
  `,
  styles: `
    .card {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-4);
      align-items: center;
      justify-content: space-between;
      padding: var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--action-primary-soft);
    }

    .body {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: min(100%, 16rem);
      gap: var(--space-1);
    }

    .eyebrow {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    h2 {
      margin: 0;
      font-size: 20px;
    }

    .progress {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .track {
      width: 100%;
      height: 6px;
      margin-top: var(--space-1);
      overflow: hidden;
      border-radius: var(--radius-pill);
      background: var(--surface-raised);
    }

    .fill {
      height: 100%;
      background: var(--action-primary);
    }
  `,
})
export class ContinueReadingCardComponent {
  readonly target = input.required<ContinueReadingTarget>();
  readonly percent = input.required<number>();
}
