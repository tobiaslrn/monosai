import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { filter, map, tap } from 'rxjs';
import { LOGGER, NOOP_LOGGER, type Logger } from '../../application/shared/diagnostics';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppUpdateBannerComponent } from './app-update-banner.component';
import { VocabularySyncBannerComponent } from './vocabulary-sync-banner.component';
import { AppBarComponent } from './app-bar.component';
import { HelpIntroService } from './help-intro.service';

/**
 * The application frame.
 *
 * Utilities and the first-use guide belong to non-reader surfaces only.
 * Reader routes retain their own controls without application chrome.
 */
@Component({
  selector: 'mn-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, AppUpdateBannerComponent, VocabularySyncBannerComponent, AppBarComponent],
  providers: [HelpIntroService],
  template: `
    <a class="mn-skip-link" href="#mn-main">Skip to main content</a>

    @if (!isReaderRoute()) {
      <mn-app-bar />
      <mn-app-update-banner />
      <mn-vocabulary-sync-banner />
      @if (intro.visible()) {
        <aside class="intro-error intro-offer" aria-label="A little help getting started">
          <p class="mn-hint">Help explains word lists, stories, and reading aids.</p>
          <button type="button" class="mn-button" (click)="intro.finish('dismiss')">Got it</button>
          <button type="button" class="mn-button" (click)="intro.finish('guide')">
            Read the guide
          </button>
        </aside>
      }
      @if (intro.saveFailed()) {
        <div class="intro-error" role="alert">
          <p>Your Help preference could not be saved. The introduction may appear next time.</p>
          <button type="button" class="mn-button" (click)="intro.retrySave()">Try again</button>
        </div>
      }
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

    .intro-error {
      max-width: var(--layout-measure);
      margin: var(--space-4) auto;
      padding-inline: var(--space-4);
    }
    .intro-offer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-2);
    }
    .intro-offer p {
      margin: 0;
      flex: 1 1 15rem;
    }

    @media (min-width: 960px) {
      .main {
        padding: var(--space-6);
      }
    }
  `,
})
export class AppShellComponent {
  protected readonly intro = inject(HelpIntroService);
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
      // Keep the completed navigation as an event, even when its URL matches
      // Router.url. The first NavigationEnd must wake the intro effect.
      map((event) => ({ url: event.urlAfterRedirects, completed: true })),
    ),
    { initialValue: { url: this.router.url, completed: this.router.navigated } },
  );

  protected readonly isReaderRoute = computed(() => this.url().url.startsWith('/reader/'));

  constructor() {
    effect(() => {
      if (!this.isReaderRoute() && this.url().completed) {
        this.intro.offer();
      }
    });
  }
}
