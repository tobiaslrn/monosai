import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';

/**
 * A non-modal update notice.
 *
 * Deliberately never a dialog: it must not steal focus from a form the
 * learner is in the middle of. While busy work is in progress it says so and
 * disables the action rather than hiding it, so the update stays visible and
 * predictable instead of silently withheld.
 */
@Component({
  selector: 'mn-app-update-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let status = store.status();
    @if (status.kind === 'available' || status.kind === 'activating' || status.kind === 'failed') {
      <div class="banner" role="status" aria-live="polite">
        @switch (status.kind) {
          @case ('available') {
            <p>A new version of Monosai has downloaded.</p>
            @if (store.isBusy()) {
              <p class="hint">
                Waiting until {{ store.busyReason() ?? 'the current work' }} finishes before
                updating.
              </p>
              <button type="button" class="mn-button mn-button--primary" disabled>
                Update and reload
              </button>
            } @else {
              <div class="actions">
                <button type="button" class="mn-button mn-button--primary" (click)="activate()">
                  Update and reload
                </button>
                <button type="button" class="mn-button" (click)="dismiss()">Not now</button>
              </div>
            }
          }
          @case ('activating') {
            <p>Updating…</p>
          }
          @case ('failed') {
            <p>{{ status.message }}</p>
            @if (store.isBusy()) {
              <p class="hint">
                Waiting until {{ store.busyReason() ?? 'the current work' }} finishes.
              </p>
            }
            <div class="actions">
              @if (status.recovery === 'reload') {
                <button
                  type="button"
                  class="mn-button"
                  [disabled]="store.isBusy()"
                  (click)="reload()"
                >
                  Reload to recover
                </button>
              } @else {
                <button type="button" class="mn-button" (click)="retry()">Try again</button>
              }
            </div>
          }
        }
      </div>
    }
  `,
  styles: `
    .banner {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-3) var(--space-4);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--action-primary-soft);
      color: var(--text-primary);
    }

    p {
      margin: 0;
    }

    .hint {
      color: var(--text-secondary);
    }

    .actions {
      display: flex;
      gap: var(--space-2);
    }
  `,
})
export class AppUpdateBannerComponent {
  protected readonly store = inject(AppUpdateStore);

  protected activate(): void {
    void this.store.activate();
  }

  protected retry(): void {
    void this.store.check();
  }

  protected reload(): void {
    this.store.reloadNow();
  }

  protected dismiss(): void {
    this.store.dismiss();
  }
}
