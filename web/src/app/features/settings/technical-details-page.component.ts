import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { DATABASE_SCHEMA_VERSION } from '../../application/shared/repository-tokens';
import { readBuildInfo } from '../../core/diagnostics/build-info';
import {
  AI_ENDPOINT_VERSION,
  TEXT_MODEL_TEST_VERSION,
  TTS_TEST_VERSION,
} from '../../domain/ai/configuration-fingerprint';
import { EXCEPTION_PROMPT_VERSION } from '../../domain/ai/exception-policy-hash';
import { PageComponent } from '../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';

/** The version facts a bug report needs, one fact to a row. */
@Component({
  selector: 'mn-technical-details-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PageComponent, PageHeaderComponent, SectionComponent, SettingsRowComponent],
  template: `
    <mn-page>
      <mn-page-header heading="Technical details" backTo="/settings" backLabel="Back to settings" />
      <mn-section label="Versions" [rows]="true">
        @for (fact of facts(); track fact.label) {
          <mn-settings-row [label]="fact.label" [value]="fact.value" />
        }
      </mn-section>
    </mn-page>
  `,
})
export class TechnicalDetailsPageComponent {
  private readonly build = readBuildInfo();
  private readonly schemaVersion = inject(DATABASE_SCHEMA_VERSION);

  protected readonly facts = computed(() => [
    { label: 'App version', value: this.build.appVersion },
    { label: 'Build commit', value: this.build.buildCommit.slice(0, 7) },
    { label: 'Database schema version', value: String(this.schemaVersion) },
    { label: 'Provider protocol', value: AI_ENDPOINT_VERSION },
    { label: 'Text model test', value: String(TEXT_MODEL_TEST_VERSION) },
    { label: 'Voice model test', value: String(TTS_TEST_VERSION) },
    { label: 'Exception review', value: String(EXCEPTION_PROMPT_VERSION) },
  ]);
}
