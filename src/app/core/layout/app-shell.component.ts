import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * The application frame.
 *
 * Deliberately almost nothing: Monosai has no persistent navigation, because
 * the reading is the application and a bar of six equal destinations said
 * otherwise. Each page carries its own way back, so the frame owns only the
 * skip link and the main landmark.
 */
@Component({
  selector: 'mn-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: `
    <a class="mn-skip-link" href="#mn-main">Skip to main content</a>

    <main id="mn-main" class="main" tabindex="-1">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }

    .main {
      min-width: 0;
      padding: var(--space-5) var(--space-4);
      overflow-x: hidden;
    }

    .main:focus {
      outline: none;
    }

    @media (min-width: 960px) {
      .main {
        padding: var(--space-6);
      }
    }
  `,
})
export class AppShellComponent {}
