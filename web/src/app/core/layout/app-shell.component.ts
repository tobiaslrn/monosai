import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { filter, map, tap } from 'rxjs';
import { LOGGER, NOOP_LOGGER, type Logger } from '../../application/shared/diagnostics';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import { classifyReadingLink } from '../../domain/reading/reading-link';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppUpdateBannerComponent } from './app-update-banner.component';
import { MainNavComponent } from './main-nav.component';
import { VocabularySyncBannerComponent } from './vocabulary-sync-banner.component';
import { HelpIntroService } from './help-intro.service';

/**
 * The application frame.
 *
 * The shell draws no top bar of its own: every page's top bar is its
 * `mn-page-header`, and the reader keeps its own. Banners and the first-use
 * guide belong to non-reader surfaces only, and the docked tab bar to the three
 * tab pages only.
 */
@Component({
  selector: 'mn-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    AppUpdateBannerComponent,
    MainNavComponent,
    VocabularySyncBannerComponent,
  ],
  providers: [HelpIntroService],
  host: { '[class.has-tab-bar]': 'isTabRoute()' },
  template: `
    <a class="mn-skip-link" href="#mn-main">Skip to main content</a>

    @if (!isReaderRoute()) {
      <mn-app-update-banner />
      <mn-vocabulary-sync-banner />
      @if (intro.visible()) {
        <aside class="intro-error intro-offer" aria-label="A little help getting started">
          <button type="button" class="mn-button" (click)="intro.finish('dismiss')">Got it</button>
          <button type="button" class="mn-button" (click)="intro.finish('guide')">
            Read the guide
          </button>
        </aside>
      }
      @if (intro.saveFailed()) {
        <div class="intro-error" role="alert">
          <div class="mn-notice mn-notice--error">
            <p>Could not save your Help preference.</p>
            <button type="button" class="mn-button" (click)="intro.retrySave()">Try again</button>
          </div>
        </div>
      }
    }

    <main id="mn-main" class="main" tabindex="-1">
      <router-outlet />
    </main>

    @if (isTabRoute()) {
      <mn-main-nav placement="bottom" />
    }
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    :host {
      display: block;
      min-height: 100dvh;
    }

    /*
     * Below the wide breakpoint a tab page has the tab bar docked beneath it.
     * The page reserves that height so its last row is never under the bar,
     * and the offset is published for anything else docked to the bottom edge.
     */
    @media (max-width: breakpoints.$wide-max) {
      :host(.has-tab-bar) {
        --bottom-dock: calc(var(--tab-bar-height) + env(safe-area-inset-bottom));
      }

      :host(.has-tab-bar) .main {
        padding-bottom: calc(var(--space-6) + var(--bottom-dock));
      }
    }

    /* No top padding: each page's sticky top bar starts at the viewport edge. */
    .main {
      min-width: 0;
      padding: 0 var(--space-4) var(--space-6);
      /* Clip stray paint without turning this sticky ancestor into a scrollport. */
      overflow-x: clip;
    }

    .main:focus {
      outline: none;
    }

    .intro-error {
      max-width: var(--page-measure);
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

    @media (min-width: breakpoints.$wide) {
      .main {
        padding: 0 var(--space-6) var(--space-6);
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
      map((event) => ({ url: event.urlAfterRedirects, completed: true, tab: this.isTabPage() })),
    ),
    {
      initialValue: {
        url: this.router.url,
        completed: this.router.navigated,
        tab: this.isTabPage(),
      },
    },
  );

  /** Home, Library and Settings declare themselves tab pages in their route data. */
  protected readonly isTabRoute = computed(() => this.url().tab);

  /**
   * Only the reader itself goes without application chrome.
   *
   * A `/reader/` URL whose segment is not an id never reaches the reader: it
   * falls through to the broken-link screen, which is an ordinary page and was
   * losing the masthead — and with it every way out of the application — to a
   * prefix match.
   */
  protected readonly isReaderRoute = computed(() => {
    const url = this.url().url;
    if (!url.startsWith('/reader/')) return false;
    // Not decoded: an id needs no escaping, so anything that carries some is
    // already not one.
    const segment = url.slice('/reader/'.length).split(/[/?#]/)[0];
    return classifyReadingLink(segment).kind === 'well-formed';
  });

  private isTabPage(): boolean {
    let route = this.router.routerState.snapshot.root;
    while (route.firstChild !== null) {
      route = route.firstChild;
    }
    return route.data['tab'] === true;
  }

  constructor() {
    effect(() => {
      if (!this.isReaderRoute() && this.url().completed) {
        this.intro.offer();
      }
    });
  }
}
