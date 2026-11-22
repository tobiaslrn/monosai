import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { LOGGER, serializeDiagnostics } from '../../application/shared/diagnostics';
import { InstallPromptService } from '../../core/platform/install-prompt.service';
import { readBuildInfo } from '../../core/diagnostics/build-info';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { SectionComponent } from '../../shared-ui/section/section.component';

/** About and local diagnostics controls. */
@Component({
  selector: 'mn-about-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SectionComponent, SettingsRowComponent],
  template: `
    <mn-section heading="About" [rows]="true">
      <mn-settings-row
        label="Version"
        [value]="
          build.appVersion + ' · ' + (install.isStandalone() ? 'Installed' : 'Not installed')
        "
      />

      @if (!install.isStandalone() && install.canInstall()) {
        <mn-settings-row label="Install Monosai" action="action" (pressed)="installApp()" />
      }

      <mn-settings-row
        label="Copy diagnostics"
        action="action"
        glyph="copy"
        testId="copy-diagnostics"
        [live]="true"
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
  protected readonly copyStatus = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly build = readBuildInfo();
  protected readonly buildSummary = computed(() => this.build.buildCommit.slice(0, 7));
  protected readonly origin = navigationOriginState('/settings');

  /** What Copy diagnostics says under it: what it never includes, then its result. */
  protected readonly copySummary = computed(() => {
    switch (this.copyStatus()) {
      case 'copied':
        return 'Copied';
      case 'failed':
        return 'Could not copy';
      case 'idle':
        return 'Leaves out your key and text';
    }
  });

  protected async installApp(): Promise<void> {
    await this.install.install();
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
