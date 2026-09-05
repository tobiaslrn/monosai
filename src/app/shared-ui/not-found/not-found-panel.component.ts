import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * "What this link addressed is not here."
 *
 * Three routes can reach that conclusion — a reading id that is not an id, a
 * well-formed id with no reading behind it, and a generation run that ended
 * with the tab that owned it — and they used to look like three applications:
 * different panels, different wording shapes, and a full-width outlined button
 * that appeared nowhere else in Monosai. They are one event told three times,
 * so they share one panel and the application's ordinary action pair.
 *
 * What differs between them is only what is true: the heading names the thing
 * that was not found, the lines below say why and what is unaffected, and the
 * primary action is the one that leads somewhere useful from there.
 */
@Component({
  selector: 'mn-not-found-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <section class="mn-panel" role="alert">
      <h2>{{ heading() }}</h2>
      @for (line of explanation(); track line) {
        <p class="mn-hint">{{ line }}</p>
      }
      <div class="actions">
        <a class="mn-button mn-button--primary" [routerLink]="primaryLink()">{{
          primaryLabel()
        }}</a>
        @if (secondaryLink(); as link) {
          <a class="mn-button" [routerLink]="link">{{ secondaryLabel() }}</a>
        }
      </div>
    </section>
  `,
  styles: `
    h2 {
      margin: 0;
      font-size: var(--text-lg);
    }

    p {
      margin: 0;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
  `,
})
export class NotFoundPanelComponent {
  readonly heading = input.required<string>();
  /** One line per fact. Each says something the application actually knows. */
  readonly explanation = input.required<readonly string[]>();
  readonly primaryLink = input<string>('/library');
  readonly primaryLabel = input('Go to library');
  readonly secondaryLink = input<string | null>(null);
  readonly secondaryLabel = input('');
}
