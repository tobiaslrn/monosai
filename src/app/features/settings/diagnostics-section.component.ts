import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { LanguageStore } from '../../application/language/language.store';
import { DATABASE_SCHEMA_VERSION } from '../../application/shared/repository-tokens';
import {
  AI_ENDPOINT_VERSION,
  TEXT_MODEL_TEST_VERSION,
  TTS_TEST_VERSION,
} from '../../domain/ai/configuration-fingerprint';
import { EXCEPTION_PROMPT_VERSION } from '../../domain/ai/exception-policy-hash';
import { readBuildInfo } from '../../core/diagnostics/build-info';
import { LOGGER, serializeDiagnostics } from '../../application/shared/diagnostics';
import { LanguageAssetsSectionComponent } from './language-assets-section.component';

/** Local build identity. Never contains user content or credentials. */
@Component({
  selector: 'mn-diagnostics-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LanguageAssetsSectionComponent],
  template: `
    <section class="mn-panel" aria-labelledby="mn-diagnostics-heading">
      <h2 id="mn-diagnostics-heading">Troubleshooting</h2>
      <p class="mn-hint">
        Copy a privacy-safe diagnostic log when you need help. Logs stay in this tab, disappear on
        reload, and never include your API key or reading content.
      </p>
      <div class="actions">
        <button type="button" class="mn-button" (click)="copyDiagnostics()">
          Copy diagnostics
        </button>
        <button type="button" class="mn-button" (click)="clearDiagnostics()">
          Clear diagnostics
        </button>
      </div>
      @if (copyStatus() === 'copied') {
        <p class="status" role="status">Diagnostics copied.</p>
      } @else if (copyStatus() === 'failed') {
        <p class="status" role="status">Diagnostics could not be copied on this browser.</p>
      }
      @if (language.status() === 'failed') {
        <mn-language-assets-section />
      }
      <details class="mn-disclosure advanced">
        <summary>Advanced technical details</summary>
        <dl>
          <div class="detail-row">
            <dt>App version</dt>
            <dd>{{ build.appVersion }}</dd>
          </div>
          <div class="detail-row">
            <dt>Build commit</dt>
            <dd>{{ build.buildCommit }}</dd>
          </div>
          <div class="detail-row">
            <dt>Database schema version</dt>
            <dd>{{ schemaVersion }}</dd>
          </div>
          <div class="detail-row">
            <dt>Provider protocol</dt>
            <dd>{{ endpointVersion }}</dd>
          </div>
          <div class="detail-row">
            <dt>Prompt versions</dt>
            <dd>{{ promptVersions }}</dd>
          </div>
        </dl>
        @if (language.status() !== 'failed') {
          <mn-language-assets-section />
        }
      </details>
    </section>
  `,
  styles: `
    p {
      margin: 0;
    }

    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: flex-start;
    }

    .status {
      color: var(--text-secondary);
    }

    .advanced {
      padding-top: var(--space-2);
      border-top: 1px solid var(--border-subtle);
    }

    dl {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: var(--space-3) 0 0;
    }

    .detail-row {
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
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class DiagnosticsSectionComponent {
  private readonly documentRef = inject(DOCUMENT);
  private readonly logger = inject(LOGGER);
  protected readonly language = inject(LanguageStore);
  protected readonly copyStatus = signal<'idle' | 'copied' | 'failed'>('idle');
  protected readonly build = readBuildInfo();
  protected readonly schemaVersion = inject(DATABASE_SCHEMA_VERSION);
  protected readonly endpointVersion = AI_ENDPOINT_VERSION;
  /** Versions of the internal prompt assets, so a report can name what ran. */
  protected readonly promptVersions = `text-test ${String(TEXT_MODEL_TEST_VERSION)} · tts-test ${String(TTS_TEST_VERSION)} · exception ${String(EXCEPTION_PROMPT_VERSION)}`;

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
