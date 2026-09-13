import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { LOGGER, serializeDiagnostics } from '../../application/shared/diagnostics';
import { DATABASE_SCHEMA_VERSION } from '../../application/shared/repository-tokens';
import {
  AI_ENDPOINT_VERSION,
  TEXT_MODEL_TEST_VERSION,
  TTS_TEST_VERSION,
} from '../../domain/ai/configuration-fingerprint';
import { EXCEPTION_PROMPT_VERSION } from '../../domain/ai/exception-policy-hash';
import { InstallPromptService } from '../../core/platform/install-prompt.service';
import { readBuildInfo } from '../../core/diagnostics/build-info';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { SettingsSectionComponent } from '../../shared-ui/settings-section/settings-section.component';

/** About, update, and local diagnostics controls. */
@Component({
  selector: 'mn-about-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, SettingsSectionComponent],
  template: `
    <mn-settings-section heading="About">
      <div class="mn-card mn-card--flush mn-settings-card">
        @let update = updates.status();
        <div class="mn-settings-row mn-settings-row--wrap">
          <div class="mn-settings-row__label">
            <span class="mn-settings-row__title">Version</span>
            <span class="mn-settings-row__hint">
              {{ build.appVersion }} · {{ install.isStandalone() ? 'Installed' : 'Not installed' }}
            </span>
          </div>
          <div class="mn-settings-row__end mn-actions">
            @if (!install.isStandalone() && install.canInstall()) {
              <button type="button" class="mn-button" (click)="installApp()">
                Install Monosai
              </button>
            }
            <button
              type="button"
              class="mn-button mn-button--ghost"
              [disabled]="update.kind === 'activating'"
              (click)="checkForUpdates()"
            >
              <mn-icon name="sync" [size]="17" />
              Check for updates
            </button>
          </div>
        </div>

        @if (updateStatusLabel(update); as statusLabel) {
          <p class="mn-settings-feedback" aria-live="polite">{{ statusLabel }}</p>
        }

        <div class="mn-settings-row mn-settings-row--wrap">
          <div class="mn-settings-row__label">
            <span class="mn-settings-row__title">Diagnostics</span>
            <span class="mn-settings-row__hint">
              Stays in this tab. Never includes your key or text.
            </span>
          </div>
          <div class="mn-settings-row__end mn-actions">
            <button
              type="button"
              class="mn-button"
              aria-label="Copy diagnostics"
              (click)="copyDiagnostics()"
            >
              <mn-icon name="copy" [size]="17" />
              Copy
            </button>
            <button
              type="button"
              class="mn-button mn-button--ghost"
              aria-label="Clear diagnostics"
              (click)="clearDiagnostics()"
            >
              Clear
            </button>
          </div>
        </div>

        @if (copyStatus() === 'copied') {
          <p class="mn-settings-feedback" role="status">Diagnostics copied.</p>
        } @else if (copyStatus() === 'failed') {
          <p class="mn-settings-feedback" role="status">
            Diagnostics could not be copied on this browser.
          </p>
        }

        <details class="mn-settings-details">
          <summary class="mn-settings-row">
            <span class="mn-settings-row__label">
              <span class="mn-settings-row__title">Technical details</span>
            </span>
            <span class="mn-settings-row__end">
              <span class="mn-settings-value">Build {{ buildSummary() }}</span>
              <mn-icon class="mn-settings-chevron" name="chevron-right" [size]="18" />
            </span>
          </summary>
          <div class="mn-settings-details__body">
            <dl class="mn-facts">
              <div>
                <dt>App version</dt>
                <dd>{{ build.appVersion }}</dd>
              </div>
              <div>
                <dt>Build commit</dt>
                <dd>{{ build.buildCommit }}</dd>
              </div>
              <div>
                <dt>Database schema version</dt>
                <dd>{{ schemaVersion }}</dd>
              </div>
              <div>
                <dt>Provider protocol</dt>
                <dd>{{ endpointVersion }}</dd>
              </div>
              <div>
                <dt>Prompt versions</dt>
                <dd>{{ promptVersions }}</dd>
              </div>
            </dl>
          </div>
        </details>
      </div>
    </mn-settings-section>
  `,
})
export class AboutSectionComponent {
  private readonly documentRef = inject(DOCUMENT);
  private readonly logger = inject(LOGGER);
  protected readonly install = inject(InstallPromptService);
  protected readonly updates = inject(AppUpdateStore);
  protected readonly copyStatus = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly build = readBuildInfo();
  protected readonly buildSummary = computed(() => this.build.buildCommit.slice(0, 7));
  protected readonly schemaVersion = inject(DATABASE_SCHEMA_VERSION);
  protected readonly endpointVersion = AI_ENDPOINT_VERSION;
  /** Versions of the internal prompt assets, so a report can name what ran. */
  protected readonly promptVersions = `text-test ${String(TEXT_MODEL_TEST_VERSION)} · tts-test ${String(TTS_TEST_VERSION)} · exception ${String(EXCEPTION_PROMPT_VERSION)}`;

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
      case 'current':
        return 'You’re up to date.';
      case 'available':
        return 'Update available.';
      case 'activating':
        return 'Updating…';
      case 'failed':
        return status.message;
    }
  }

  protected async copyDiagnostics(): Promise<void> {
    const clipboard = this.documentRef.defaultView?.navigator.clipboard;
    if (clipboard === undefined) {
      this.logger.warn('diagnostics.copy.failed');
      this.copyStatus.set('failed');
      return;
    }

    const entries = this.logger.snapshot();
    try {
      await clipboard.writeText(serializeDiagnostics(entries));
      this.logger.info('diagnostics.copy.succeeded', { count: entries.length });
      this.copyStatus.set('copied');
    } catch {
      this.logger.warn('diagnostics.copy.failed');
      this.copyStatus.set('failed');
    }
  }

  protected clearDiagnostics(): void {
    this.logger.clear();
    this.copyStatus.set('idle');
  }
}
