import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { formatCount } from '../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * Home before anything has been saved or started.
 *
 * This is the screen a stranger lands on at the public address, so it has to
 * say what Monosai is rather than only offering buttons. An empty surface has
 * nothing but words to work with, which is the one place the prose budget
 * stretches — and the one surface where the fact that a person made this is
 * allowed to show.
 *
 * Its one choice is a word source. Paste text already stands directly above it
 * among Home's actions, so it is not offered a second time here.
 *
 * It ends the moment there is a reading or a story being written.
 */
@Component({
  selector: 'mn-home-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <section class="welcome" aria-labelledby="mn-welcome-heading">
      <h2 id="mn-welcome-heading">Monosai writes Japanese you can actually read.</h2>

      <p class="lede">
        Monosai builds readable stories from at least {{ minimumWords }} words from Anki, an Anki
        package, or a pasted list. Paste Japanese text to add readings, spacing, and a dictionary.
      </p>

      <p class="local">Everything stays on this device.</p>

      <a class="choice" routerLink="/reading-level" fragment="words" [state]="homeOriginState">
        <mn-icon name="vocabulary" [size]="20" />
        <strong>Add a word list</strong>
      </a>
    </section>
  `,
  styles: `
    .welcome {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 42rem;
    }

    h2 {
      margin: 0;
      font-family: var(--font-ui);
      font-size: var(--text-2xl);
      font-weight: var(--weight-bold);
      letter-spacing: -0.02em;
      line-height: 1.25;
    }

    .lede,
    .local {
      margin: 0;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .local {
      color: var(--text-primary);
    }

    .choice {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-width: 0;
      margin-top: var(--space-2);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      color: var(--text-primary);
      text-decoration: none;
    }

    .choice:hover {
      border-color: var(--border-strong);
      background: var(--surface-sunken);
    }

    .choice mn-icon {
      flex: none;
      color: var(--action-primary);
    }

    .choice strong {
      font-weight: var(--weight-semibold);
    }
  `,
})
export class HomeWelcomeComponent {
  protected readonly homeOriginState = navigationOriginState('/home');
  /** The generation floor, said once here and defined once in the domain. */
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
