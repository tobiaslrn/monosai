import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { formatCount } from '../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * The Library before there is anything on it.
 *
 * This is the screen a stranger lands on at the public address, so it has to
 * say what Monosai is rather than only offering two buttons. An empty surface
 * has nothing but words to work with, which is the one place the prose budget
 * stretches — and the one surface where the fact that a person made this is
 * allowed to show.
 *
 * Word sources come first, with Anki the first suggested source. The shelf's
 * New story action stays above this empty body, so setup never hides writing.
 *
 * It ends the moment the library has a reading in it.
 */
@Component({
  selector: 'mn-library-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  template: `
    <section class="welcome" aria-labelledby="mn-welcome-heading">
      <h2 id="mn-welcome-heading">Monosai writes Japanese you can actually read.</h2>

      <p class="lede">
        I made this while studying a frequency deck, because I could not find anything simple enough
        to read yet. Monosai builds stories from your word list — at least
        {{ minimumWords }} words from Anki, an Anki package, or a pasted list — and adds readings,
        spacing and a dictionary to anything else you paste.
      </p>

      <p class="local">Everything stays on this device.</p>

      <div class="choices">
        <a class="choice" routerLink="/reading-level" fragment="words" [state]="libraryOriginState">
          <mn-icon name="vocabulary" [size]="20" />
          <span>
            <strong>Add a word list</strong>
            <small>Stories get written from words you know.</small>
          </span>
        </a>
        <a class="choice" routerLink="/add" [state]="libraryOriginState">
          <mn-icon name="add" [size]="20" />
          <span>
            <strong>Paste Japanese text</strong>
            <small>Read something you already have.</small>
          </span>
        </a>
      </div>
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
      font-size: 28px;
      font-weight: 700;
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

    .choices {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
      margin-top: var(--space-2);
    }

    .choice {
      display: flex;
      gap: var(--space-3);
      align-items: flex-start;
      min-width: 0;
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

    .choice span {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
    }

    .choice strong {
      font-weight: 600;
    }

    .choice small {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: 1.45;
    }

    @media (max-width: 599px) {
      h2 {
        font-size: 24px;
      }

      .choices {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class LibraryWelcomeComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
  /** The generation floor, said once here and defined once in the domain. */
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
