import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  viewChild,
  type TemplateRef,
} from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, NavigationError, Router, RouterOutlet } from '@angular/router';
import { filter, map, tap } from 'rxjs';
import { LOGGER, NOOP_LOGGER, type Logger } from '../../application/shared/diagnostics';
import { safeErrorTypeOf } from '../../domain/shared/errors';
import { classifyReadingLink } from '../../domain/reading/reading-link';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppUpdateBannerComponent } from './app-update-banner.component';
import { VocabularySyncBannerComponent } from './vocabulary-sync-banner.component';
import { HelpIntroService } from './help-intro.service';
import { AlphaNoticeService } from './alpha-notice.service';
import { ButtonDirective } from '../../shared-ui/button/button';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';
import { PageNoticeSlot } from '../../shared-ui/page-header/page-notice-slot';

/**
 * The application frame.
 *
 * The shell draws no bar of its own: every page's top bar is its
 * `mn-page-header`, and the reader keeps its own. Banners and the first-use
 * Help guide belong to non-reader surfaces; the alpha disclosure is a startup
 * release notice and may cover any route once. The one other exception is the notice that this
 * tab lost its database: a reader that cannot save must say so.
 */
@Component({
  selector: 'mn-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterOutlet,
    AppUpdateBannerComponent,
    VocabularySyncBannerComponent,
    ButtonDirective,
    NoticeComponent,
  ],
  providers: [HelpIntroService, PageNoticeSlot],
  template: `
    <a class="mn-skip-link" href="#mn-main">Skip to main content</a>

    @if (isReaderRoute()) {
      <mn-app-update-banner [supersededOnly]="true" />
    } @else {
      <mn-app-update-banner />
      <mn-vocabulary-sync-banner />
    }

    <!--
      The first-use offer belongs to the page, not above it: each page's bar
      draws it as the page's first block, in the page's own column.
    -->
    <ng-template #introNotice>
      @if (!isReaderRoute()) {
        @if (intro.visible()) {
          <aside aria-label="Help">
            <mn-notice icon="help">
              <p>New here?</p>
              <button mn-notice-action mnButton type="button" (click)="intro.finish('guide')">
                Open Help
              </button>
              <button
                mn-notice-action
                mnButton="ghost"
                type="button"
                (click)="intro.finish('dismiss')"
              >
                Dismiss
              </button>
            </mn-notice>
          </aside>
        }
        @if (intro.saveFailed()) {
          <mn-notice tone="error" icon="warning" role="alert">
            <p>Could not save</p>
            <button mn-notice-action mnButton type="button" (click)="intro.retrySave()">
              Try again
            </button>
          </mn-notice>
        }
      }
    </ng-template>

    <main id="mn-main" class="mn-main" tabindex="-1">
      <router-outlet />
    </main>
  `,
  styles: `
    :host {
      display: block;
      min-height: 100dvh;
    }
  `,
})
export class AppShellComponent {
  protected readonly intro = inject(HelpIntroService);
  private readonly introNotice = viewChild<TemplateRef<unknown>>('introNotice');
  private readonly alpha = inject(AlphaNoticeService);
  private readonly router = inject(Router);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;
  // Injected here, not just by the banner, so the update store's subscriptions
  // and timers start with the app shell rather than only if the banner
  // happens to render first.
  private readonly updateStore = inject(AppUpdateStore);

  /**
   * ADR 0025 removed application chrome from the reading surface deliberately;
   * the update banner and Help offer follow the same rule and stay reachable
   * from non-reader surfaces while a reading is open. The alpha disclosure is
   * the explicit startup exception and is handled by its own service.
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

  /**
   * Only the reader itself goes without application chrome.
   *
   * A `/reader/` URL whose segment is not an id never reaches the reader: it
   * falls through to the broken-link screen, which is an ordinary page and was
   * losing the masthead — and with it every way out of the application — to a
   * prefix match.
   */
  protected readonly isReaderRoute = computed(() => {
    const url = this.url();
    if (!url.startsWith('/reader/')) return false;
    // Not decoded: an id needs no escaping, so anything that carries some is
    // already not one.
    const [segment = ''] = url.slice('/reader/'.length).split(/[/?#]/);
    return classifyReadingLink(segment).kind === 'well-formed';
  });

  constructor() {
    const slot = inject(PageNoticeSlot);
    effect(() => {
      slot.template.set(this.introNotice() ?? null);
    });
    // Subscribed after `url`, so the route the notices are judged by is already
    // the one this navigation ended on.
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => {
        this.offerNotices();
      });
    if (this.router.navigated) {
      this.offerNotices();
    }
  }

  private offerNotices(): void {
    void this.alpha.offer();
    if (!this.isReaderRoute()) {
      this.intro.offer();
    }
  }
}
