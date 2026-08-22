import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';

@Component({
  selector: 'mn-vocabulary-sync-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (message(); as text) {
      <aside class="banner" [class.attention]="isAttention()" aria-live="polite">
        <span>{{ text }}</span>
        <span class="actions">
          @if (canRetry()) {
            <button type="button" class="link" (click)="retry()">Retry now</button>
          }
          <a routerLink="/vocabulary">Manage sources</a>
        </span>
      </aside>
    }
  `,
  styles: `
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
  `,
})
export class VocabularySyncBannerComponent {
  protected readonly coordinator = inject(AutomaticAnkiSyncCoordinator, { optional: true });

  protected readonly message = computed(() => {
    const status = this.coordinator?.status();
    if (status === undefined) {
      return null;
    }
    switch (status.kind) {
      case 'idle':
        return null;
      case 'checking':
        return 'Checking Anki for reviewed vocabulary…';
      case 'updated':
        return `Vocabulary updated · ${String(status.snapshot.uniqueEntryCount)} unique expressions`;
      case 'waiting':
        return null;
      case 'attention':
        return status.message;
    }
  });
  protected readonly isAttention = computed(() => this.coordinator?.status().kind === 'attention');
  protected readonly canRetry = computed(() => this.coordinator?.status().kind === 'attention');

  protected retry(): void {
    void this.coordinator?.trigger(true);
  }
}
