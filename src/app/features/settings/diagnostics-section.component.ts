import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DATABASE_SCHEMA_VERSION } from '../../application/shared/repository-tokens';
import { readBuildInfo } from '../../core/diagnostics/build-info';

/** Local build identity. Never contains user content or credentials. */
@Component({
  selector: 'mn-diagnostics-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="mn-panel" aria-labelledby="mn-diagnostics-heading">
      <h2 id="mn-diagnostics-heading">Diagnostics</h2>
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
      </dl>
    </section>
  `,
  styles: `
    dl {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      margin: 0;
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
}
