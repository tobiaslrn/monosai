import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { LOGGER, serializeDiagnostics } from '../../application/shared/diagnostics';
import { atLeast } from '../../application/shared/minimum-duration';
import { InstallPromptService } from '../../core/platform/install-prompt.service';
import { readBuildInfo } from '../../core/diagnostics/build-info';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { SectionComponent } from '../../shared-ui/section/section.component';

/** About, update, and local diagnostics controls. */
@Component({
  selector: 'mn-about-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionComponent, SettingsRowComponent],
  template: `
    <mn-section heading="About" [rows]="true">
      @let update = updates.status();
      <mn-settings-row
        label="Version"
        [value]="
          build.appVersion + ' · ' + (install.isStandalone() ? 'Installed' : 'Not installed')
        "
      />

      @if (!install.isStandalone() && install.canInstall()) {
        <mn-settings-row label="Install Monosai" action="accent" (pressed)="installApp()" />
      }

      <mn-settings-row
        label="Check for updates"
        testId="check-updates"
        action="accent"
        glyph="sync"
        [disabled]="update.kind === 'activating'"
        [busy]="checking()"
        (pressed)="checkForUpdates()"
      >
        <!--
          The result's line is made when the check starts and filled when it ends, so the
          answer arrives into room already kept for it, and a live region that exists
          before its words change is announced reliably.
        -->
        @let statusLabel = checking() ? '' : updateStatusLabel(update);
        @if (checking() || statusLabel !== '') {
          <span mn-settings-row-detail class="mn-settings-row__result" aria-live="polite">{{
            statusLabel
          }}</span>
        }
      </mn-settings-row>

      <mn-settings-row
        label="Copy diagnostics"
        action="accent"
        glyph="copy"
        testId="copy-diagnostics"
        [summary]="copySummary()"
        (pressed)="copyDiagnostics()"
      />

      <mn-settings-row
        label="Technical details"
        end="nav"
        link="/settings/technical"
        testId="technical-details"
        [state]="origin"
        [summary]="'Build ' + buildSummary()"
      />
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
  protected readonly origin = navigationOriginState('/settings');

  /** What Copy diagnostics says under it: what it never includes, then its result. */
  protected readonly copySummary = computed(() => {
    switch (this.copyStatus()) {
      case 'copied':
        return 'Copied.';
      case 'failed':
        return 'Could not copy on this browser.';
      case 'idle':
        return 'Never includes your key or text';
    }
  });

  protected async installApp(): Promise<void> {
    await this.install.install();
  }

  /**
   * While a check the learner asked for is running, its control is busy: it keeps its label and
   * size, and its glyph turns. The busy state is held for a perceivable moment, and the answer
   * is shown once it ends.
   */
  protected readonly checking = signal(false);

  protected async checkForUpdates(): Promise<void> {
    if (this.checking()) {
      return;
    }
    this.checking.set(true);
    try {
      await atLeast(this.updates.check());
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
