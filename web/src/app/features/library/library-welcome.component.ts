import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { HomeArtComponent } from './home-art.component';

/**
 * The Library before there is anything on it.
 *
 * This is the screen a stranger lands on at the public address, so it has to
 * say what Monosai is rather than only offering two buttons. It owns the
 * headline here: the standing line above it states a count, and an empty
 * collection has no count to state, so two display headlines were competing
 * for the same screen with nothing to choose between them.
 *
 * Two doors, not three. Each names what it costs in four words, because the
 * half of Monosai that works immediately and the half that needs an account,
 * a key and money were indistinguishable at the one moment the difference
 * decides what a stranger does next. Adding words is not a door — it is a step
 * behind the second one, and it belongs in that setup path rather than
 * competing with it here.
 *
 * It ends the moment the library has a reading in it.
 */
@Component({
  selector: 'mn-library-welcome',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, HomeArtComponent],
  template: `
    <section class="welcome" aria-labelledby="mn-welcome-heading">
      <div class="intro">
        <div class="words">
          <h2 id="mn-welcome-heading">Monosai writes Japanese you can actually read.</h2>
          <p class="lede">
            Stories built from the words you already know, and a reader for any Japanese you paste.
          </p>
        </div>
        <mn-home-art class="art" />
      </div>

      <div class="choices">
        <a class="choice" routerLink="/add" [state]="libraryOriginState">
          <mn-icon name="file" [size]="20" />
          <span>
            <strong>Paste Japanese text</strong>
            <small>Works now. No account.</small>
          </span>
        </a>
        <!--
          The sparkle is the one mark that means "this spends your OpenRouter
          credit". See the design system: it appears on every such control and
          on nothing else.
        -->
        <a class="choice choice--ai" routerLink="/generate" [state]="libraryOriginState">
          <mn-icon name="generate" [size]="20" />
          <span>
            <strong>Write with AI</strong>
            <small>Needs an OpenRouter key.</small>
          </span>
        </a>
      </div>

      <p class="local">Everything stays on this device.</p>
    </section>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    .welcome {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      max-width: 42rem;
    }

    /*
     * The words and the drawing share a row and neither is laid over the
     * other. The illustration used to be positioned across the whole hero, and
     * on a phone the lamp and the leaves sat on top of the sentence.
     */
    .intro {
      display: flex;
      gap: var(--space-4);
      align-items: center;
    }

    .words {
      display: flex;
      flex: 1 1 auto;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }

    .art {
      flex: none;
      width: 32%;
      max-width: 11rem;
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
      font-size: var(--text-sm);
    }

    .choices {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
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

    .choice--ai mn-icon {
      color: var(--accent-secondary);
    }

    .choice span {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
    }

    .choice strong {
      font-weight: var(--weight-semibold);
    }

    .choice small {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      line-height: 1.45;
    }

    @media (max-width: breakpoints.$narrow-max) {
      /*
       * A phone gives the sentence the width instead of the picture: at this
       * size the drawing shrinks to something unreadable long before the
       * headline stops needing the room.
       */
      .art {
        width: 30%;
        max-width: 7rem;
      }

      .choices {
        grid-template-columns: minmax(0, 1fr);
      }
    }
  `,
})
export class LibraryWelcomeComponent {
  protected readonly libraryOriginState = navigationOriginState('/library');
}
