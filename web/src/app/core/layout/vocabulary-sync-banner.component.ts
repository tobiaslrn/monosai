import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { BannerComponent } from '../../shared-ui/banner/banner.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { vocabularyCountLabel } from '../../shared-ui/vocabulary-standing/vocabulary-standing';

@Component({
  selector: 'mn-vocabulary-sync-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, BannerComponent, ButtonDirective],
  template: `
    @if (coordinator?.status(); as status) {
      @switch (status.kind) {
        @case ('updated') {
          @if (!status.requested) {
            <aside
              class="toast"
              role="status"
              aria-live="polite"
              aria-atomic="true"
              data-testid="vocabulary-sync-toast"
            >
              Vocabulary updated · {{ wordCount(status.snapshot.uniqueEntryCount) }}
            </aside>
          }
        }
        @case ('attention') {
          <mn-banner
            class="banner attention"
            tone="warning"
            icon="warning"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            <p>{{ status.message }}</p>
            <button mn-banner-action mnButton="ghost" type="button" (click)="retry()">
              Retry now
            </button>
            <a mn-banner-action mnButton="ghost" routerLink="/reading-level" fragment="words"
              >Manage sources</a
            >
          </mn-banner>
        }
      }
    }
  `,
  styles: `
    @use '../../../styles/motion' as motion;

    .toast {
      position: fixed;
      right: max(var(--space-4), env(safe-area-inset-right));
      bottom: max(var(--space-4), env(safe-area-inset-bottom));
      z-index: 90;
      width: min(30rem, calc(100vw - 2 * var(--space-4)));
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--status-success-soft);
      color: var(--text-primary);
      box-shadow: var(--shadow-overlay);
      font-size: var(--text-sm);
      @include motion.toast;
    }
  `,
})
export class VocabularySyncBannerComponent {
  protected readonly coordinator = inject(AutomaticAnkiSyncCoordinator, { optional: true });

  /** The same wording the Library and the reading-level page use. */
  protected wordCount(count: number): string {
    return vocabularyCountLabel(count);
  }

  /**
   * Not marked as the learner's own read: this button goes away with the banner,
   * so the toast is the only thing left to report the result, and the
   * coordinator raises it even when no word changed.
   */
  protected retry(): void {
    void this.coordinator?.retry();
  }
}
