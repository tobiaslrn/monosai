import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { filter, map, tap } from 'rxjs';
import { LOGGER, NOOP_LOGGER, type Logger } from '../../application/shared/diagnostics';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppUpdateBannerComponent } from './app-update-banner.component';
import { VocabularySyncBannerComponent } from './vocabulary-sync-banner.component';

/**
 * The application frame.
 *
 * Deliberately almost nothing: Monosai has no persistent navigation, because
 * the reading is the application and a bar of six equal destinations said
 * otherwise. Each page carries its own way back, so the frame owns only the
 * skip link, the update banner, and the main landmark.
 */
@Component({
  selector: 'mn-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, AppUpdateBannerComponent, VocabularySyncBannerComponent],
  template: `
    <a class="mn-skip-link" href="#mn-main">Skip to main content</a>

    @if (!isReaderRoute()) {
      <mn-app-update-banner />
      <mn-vocabulary-sync-banner />
    }

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
      /* Clip stray paint without turning this sticky ancestor into a scrollport. */
      overflow-x: clip;
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
export class AppShellComponent {
  private readonly router = inject(Router);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;
  // Injected here, not just by the banner, so the update store's subscriptions
  // and timers start with the app shell rather than only if the banner
  // happens to render first.
  private readonly updateStore = inject(AppUpdateStore);

  /**
   * ADR 0025 removed application chrome from the reading surface deliberately;
   * the update banner follows the same rule and stays reachable from Settings
   * instead while a reading is open.
   */
  private readonly url = toSignal(
    this.router.events.pipe(
      tap((event) => {
        if (event instanceof NavigationError) {
          this.logger.error('app.route.navigation.failed', {
            errorType: safeErrorTypeOf(event.error),
          });
        }
      }),
      filter((event) => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  protected readonly isReaderRoute = computed(() => this.url().startsWith('/reader/'));
}
