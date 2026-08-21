import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { readBuildInfo } from '../../core/diagnostics/build-info';
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
    <section class="mn-panel" aria-labelledby="mn-app-heading">
      <h2 id="mn-app-heading">App</h2>

      <dl>
        <div>
          <dt>Installed</dt>
          <dd>{{ install.isStandalone() ? 'Yes' : 'No' }}</dd>
        </div>
        <div>
          <dt>Version</dt>
          <dd>{{ build.appVersion }}</dd>
        </div>
      </dl>

      @if (!install.isStandalone()) {
        <div class="actions">
          <button
            type="button"
            class="mn-button"
            [disabled]="!install.canInstall()"
            (click)="installApp()"
          >
            Install Monosai
          </button>
          @if (!install.canInstall()) {
            <p class="mn-hint">
              Your browser has not offered installation yet, or Monosai is already installed.
            </p>
          }
        </div>
      }

      @let update = updates.status();
      <div class="actions">
        <button
          type="button"
          class="mn-button"
          [disabled]="update.kind === 'activating'"
          (click)="checkForUpdates()"
        >
          Check for updates
        </button>
        <p class="mn-hint" aria-live="polite">{{ updateStatusLabel(update) }}</p>
      </div>
    </section>
  `,
  styles: `
    dl {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
    }

    dl div {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: space-between;
    }

    dt {
      color: var(--text-secondary);
    }

    dd {
      margin: 0;
    }

    .actions {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      align-items: flex-start;
      margin-top: var(--space-4);
    }
  `,
})
export class AppSectionComponent {
  protected readonly install = inject(InstallPromptService);
  protected readonly updates = inject(AppUpdateStore);
  protected readonly build = readBuildInfo();

  protected async installApp(): Promise<void> {
    await this.install.install();
  }

  protected checkForUpdates(): void {
    void this.updates.check();
  }

  protected updateStatusLabel(status: ReturnType<AppUpdateStore['status']>): string {
    switch (status.kind) {
      case 'unsupported':
        return 'Updates are not available in this environment.';
      case 'idle':
        return 'Monosai is up to date.';
      case 'available':
        return 'An update has downloaded. Activate it from the banner at the top of the app.';
      case 'activating':
        return 'Updating…';
      case 'failed':
        return status.message;
    }
  }
}
