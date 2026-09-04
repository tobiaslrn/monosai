import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { vocabularyCountLabel } from '../../shared-ui/vocabulary-standing/vocabulary-standing';

@Component({
  selector: 'mn-vocabulary-sync-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (coordinator?.status(); as status) {
      @switch (status.kind) {
        @case ('updated') {
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
        @case ('attention') {
          <aside class="banner attention" role="status" aria-live="polite" aria-atomic="true">
            <span>{{ status.message }}</span>
            <span class="actions">
              <button type="button" class="link" (click)="retry()">Retry now</button>
              <a routerLink="/reading-level" fragment="words">Manage sources</a>
            </span>
          </aside>
        }
      }
    }
  `,
  styles: `
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
      animation: vocabulary-sync-toast 8s ease-in-out both;
    }

    @keyframes vocabulary-sync-toast {
      0% {
        opacity: 0;
        transform: translate(1rem, 1rem);
      }

      12%,
      75% {
        opacity: 1;
        transform: translate(0, 0);
      }

      100% {
        opacity: 0;
        transform: translate(1rem, 1rem);
      }
    }

    .banner {
      display: flex;
      justify-content: center;
      align-items: center;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-3);
      padding: var(--space-2) var(--space-4);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-raised);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .banner.attention {
      background: var(--status-warning-soft);
      color: var(--text-primary);
    }

    .actions {
      display: inline-flex;
      gap: var(--space-2);
    }

    a,
    .link {
      color: var(--accent-strong);
      font: inherit;
      text-decoration: underline;
    }

    .link {
      padding: 0;
      border: 0;
      background: transparent;
      cursor: pointer;
    }

    @media (prefers-reduced-motion: reduce) {
      .toast {
        animation: none;
      }
    }
  `,
})
export class VocabularySyncBannerComponent {
  protected readonly coordinator = inject(AutomaticAnkiSyncCoordinator, { optional: true });

  /** The same wording the Library and the reading-level page use. */
  protected wordCount(count: number): string {
    return vocabularyCountLabel(count);
  }

  protected retry(): void {
    void this.coordinator?.trigger(true);
  }
}
