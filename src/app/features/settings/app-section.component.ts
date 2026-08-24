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
    <section class="mn-panel" aria-labelledby="mn-app-heading">
      <h2 id="mn-app-heading">App</h2>

      <dl>
        <div>
          <dt>Installed</dt>
          <dd>{{ install.isStandalone() ? 'Yes' : 'No' }}</dd>
        </div>
      </dl>

      @let update = updates.status();
      <div class="actions">
        @if (!install.isStandalone()) {
          <button
            type="button"
            class="mn-button"
            [disabled]="!install.canInstall()"
            (click)="installApp()"
          >
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

      @if (!install.isStandalone() && !install.canInstall()) {
        <p class="mn-hint">Installation is not available from this browser right now.</p>
      }
      <p class="mn-hint" aria-live="polite">{{ updateStatusLabel(update) }}</p>
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
      display: grid;
      grid-template-columns: minmax(10rem, 16rem) minmax(0, 1fr);
      gap: var(--space-2);
      align-items: baseline;
    }

    dt {
      color: var(--text-secondary);
    }

    dd {
      margin: 0;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-top: var(--space-4);
    }

    @media (max-width: 32rem) {
      dl div {
        grid-template-columns: 1fr auto;
      }
    }
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
