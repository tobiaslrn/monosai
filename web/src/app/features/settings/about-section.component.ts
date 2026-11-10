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
import { ButtonDirective } from '../../shared-ui/button/button';
import { DisclosureComponent } from '../../shared-ui/disclosure/disclosure.component';
import { FactsComponent } from '../../shared-ui/facts/facts.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { SectionComponent } from '../../shared-ui/section/section.component';

/** About, update, and local diagnostics controls. */
@Component({
  selector: 'mn-about-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    DisclosureComponent,
    FactsComponent,
    IconComponent,
    SectionComponent,
    SettingsRowComponent,
  ],
  template: `
    <mn-section heading="About" [rows]="true">
      @let update = updates.status();
      <mn-settings-row label="Version" [actions]="true">
        <span mn-settings-row-detail class="mn-settings-row__hint">
          {{ build.appVersion }} · {{ install.isStandalone() ? 'Installed' : 'Not installed' }}
        </span>
        @if (updateStatusLabel(update); as statusLabel) {
          <span mn-settings-row-detail class="mn-settings-row__result" aria-live="polite">
            {{ statusLabel }}
          </span>
        }
        @if (!install.isStandalone() && install.canInstall()) {
          <button type="button" mnButton (click)="installApp()">Install Monosai</button>
        }
        <button
          type="button"
          mnButton="ghost"
          [disabled]="update.kind === 'activating'"
          [attr.aria-busy]="checking() ? 'true' : null"
          (click)="checkForUpdates()"
        >
          <mn-icon name="sync" [size]="17" />
          {{ checking() ? 'Checking for updates…' : 'Check for updates' }}
        </button>
      </mn-settings-row>

      <mn-settings-row label="Diagnostics" [actions]="true">
        <span mn-settings-row-detail class="mn-settings-row__hint">
          Stays in this tab. Never includes your key or text.
        </span>
        @if (copyStatus() === 'copied') {
          <span mn-settings-row-detail class="mn-settings-row__result" role="status">
            Diagnostics copied.
          </span>
        } @else if (copyStatus() === 'failed') {
          <span mn-settings-row-detail class="mn-settings-row__result" role="status">
            Diagnostics could not be copied on this browser.
          </span>
        }
        <button type="button" mnButton aria-label="Copy diagnostics" (click)="copyDiagnostics()">
          <mn-icon name="copy" [size]="17" />
          Copy
        </button>
      </mn-settings-row>

      <mn-disclosure heading="Technical details" [value]="'Build ' + buildSummary()">
        <mn-facts [facts]="technicalFacts()" />
      </mn-disclosure>
    </mn-section>
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
  protected readonly textModelTestVersion = TEXT_MODEL_TEST_VERSION;
  protected readonly ttsTestVersion = TTS_TEST_VERSION;
  protected readonly exceptionPromptVersion = EXCEPTION_PROMPT_VERSION;
  protected readonly technicalFacts = computed(() => [
    { label: 'App version', value: this.build.appVersion },
    { label: 'Build commit', value: this.buildSummary() },
    { label: 'Database schema version', value: String(this.schemaVersion) },
    { label: 'Provider protocol', value: this.endpointVersion },
    { label: 'Text model test', value: String(this.textModelTestVersion) },
    { label: 'Voice model test', value: String(this.ttsTestVersion) },
    { label: 'Exception review', value: String(this.exceptionPromptVersion) },
  ]);

  protected async installApp(): Promise<void> {
    await this.install.install();
  }

  /** While a check the learner asked for is running, its control is busy. */
  protected readonly checking = signal(false);

  protected async checkForUpdates(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    try {
      await this.updates.check();
    } finally {
      this.checking.set(false);
    }
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
      case 'superseded':
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
}
