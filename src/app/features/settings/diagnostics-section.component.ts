import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DATABASE_SCHEMA_VERSION } from '../../application/shared/repository-tokens';
import {
  AI_ENDPOINT_VERSION,
  TEXT_MODEL_TEST_VERSION,
  TTS_TEST_VERSION,
} from '../../domain/ai/configuration-fingerprint';
import { EXCEPTION_PROMPT_VERSION } from '../../domain/ai/exception-policy-hash';
import { readBuildInfo } from '../../core/diagnostics/build-info';

/** Local build identity. Never contains user content or credentials. */
@Component({
  selector: 'mn-diagnostics-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-panel" aria-labelledby="mn-diagnostics-heading">
      <h2 id="mn-diagnostics-heading">Diagnostics</h2>
      <p class="mn-hint">For troubleshooting only.</p>
      <details>
        <summary>Show build details</summary>
        <dl>
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
      </details>
    </section>
  `,
  styles: `
    p {
      margin: 0;
    }

    summary {
      display: flex;
      align-items: center;
      min-height: var(--touch-target);
      color: var(--text-primary);
      font-weight: 500;
      cursor: pointer;
    }

    dl {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: var(--space-3) 0 0;
    }

    div {
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
  protected readonly build = readBuildInfo();
  protected readonly schemaVersion = inject(DATABASE_SCHEMA_VERSION);
  protected readonly endpointVersion = AI_ENDPOINT_VERSION;
  /** Versions of the internal prompt assets, so a report can name what ran. */
  protected readonly promptVersions = `text-test ${String(TEXT_MODEL_TEST_VERSION)} · tts-test ${String(TTS_TEST_VERSION)} · exception ${String(EXCEPTION_PROMPT_VERSION)}`;
}
