import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { InstallPromptService } from '../../core/platform/install-prompt.service';

/**
 * Install, update, and version status.
 *
 * The one predictable place the install affordance lives: there is no prompt
 * in the reader or the library, and the browser's own mini-infobar is
 * suppressed in favour of this button.
 */
@Component({
  selector: 'mn-app-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-card" aria-labelledby="mn-app-heading">
      <div class="mn-stack">
        <h2 id="mn-app-heading" class="mn-card-title">App</h2>

        <dl class="mn-facts">
          <div>
            <dt>Installed</dt>
            <dd>{{ install.isStandalone() ? 'Yes' : 'No' }}</dd>
          </div>
        </dl>

        @let update = updates.status();
        <div class="mn-actions">
          @if (!install.isStandalone() && install.canInstall()) {
            <button type="button" class="mn-button" (click)="installApp()">
              Install Monosai
            </button>
          }
          <button
            type="button"
            class="mn-button"
            [disabled]="update.kind === 'activating'"
            (click)="checkForUpdates()"
          >
            Check for updates
          </button>
        </div>

        @if (updateStatusLabel(update); as statusLabel) {
          <p class="mn-hint" aria-live="polite">{{ statusLabel }}</p>
        }
      </div>
    </section>
  `,
})
export class AppSectionComponent {
  protected readonly install = inject(InstallPromptService);
  protected readonly updates = inject(AppUpdateStore);

  protected async installApp(): Promise<void> {
    await this.install.install();
  }

  protected checkForUpdates(): void {
    void this.updates.check();
  }

  protected updateStatusLabel(status: ReturnType<AppUpdateStore['status']>): string {
    switch (status.kind) {
      case 'unsupported':
        return 'Updates unavailable.';
      case 'idle':
        return '';
      case 'available':
        return 'Update available.';
      case 'activating':
        return 'Updating…';
      case 'failed':
        return status.message;
    }
  }
}
