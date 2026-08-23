import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
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

      <div class="mn-field connection-port">
        <label for="mn-anki-connect-port">AnkiConnect port</label>
        <input
          id="mn-anki-connect-port"
          type="number"
          inputmode="numeric"
          min="1"
          max="65535"
          step="1"
          required
          [value]="settings.ankiConnectPort()"
          aria-describedby="mn-anki-connect-port-hint"
          data-testid="anki-connect-port"
          (change)="saveAnkiConnectPort($event)"
        />
        <span id="mn-anki-connect-port-hint" class="mn-hint">
          The AnkiConnect add-on uses 8765 by default. Changes apply to the next connection.
        </span>
      </div>

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

    .connection-port {
      max-width: 24rem;
    }

    .connection-port input {
      max-width: 10rem;
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
  protected readonly settings = inject(AppSettingsStore);

  protected saveAnkiConnectPort(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (!input.validity.valid) {
      input.value = String(this.settings.ankiConnectPort());
      return;
    }
    void this.settings.setAnkiConnectPort(input.valueAsNumber);
  }

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
