import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { navigationOriginState } from '../../core/routing/navigation-history.service';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { audioStatus, joinSummary, readinessStatus, type AiStatus } from './ai-status';
import { OpenRouterConnectionComponent } from './openrouter-connection.component';
import { audioStatusOf } from './voice-status';

/**
 * The AI group of the overview: the key, and one row for each of its two pages.
 *
 * The overview says where each stands and nothing more: a row opens a page that
 * has the settings and the cause of a failure. Without a key the two pages are
 * drawn disabled, because nothing on them can work yet.
 */
@Component({
  selector: 'mn-ai-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [OpenRouterConnectionComponent, SectionComponent, SettingsRowComponent],
  template: `
    <mn-section heading="AI" [rows]="true">
      <mn-openrouter-connection />

      <mn-settings-row
        label="Text models"
        end="nav"
        link="/settings/text-models"
        testId="open-text-models"
        [state]="origin"
        [disabled]="!credential.isConfigured()"
        [summary]="textSummary().summary"
        [status]="textSummary().status.tone"
        [statusText]="textSummary().status.text"
      />
      <mn-settings-row
        label="Voice"
        end="nav"
        link="/settings/voice"
        testId="open-voice"
        [state]="origin"
        [disabled]="!credential.isConfigured()"
        [summary]="voiceSummary().summary"
        [status]="voiceSummary().status.tone"
        [statusText]="voiceSummary().status.text"
      />
    </mn-section>
  `,
})
export class AiSectionComponent {
  protected readonly credential = inject(CredentialStore);
  private readonly text = inject(TextModelStore);
  private readonly tts = inject(TtsStore);
  protected readonly origin = navigationOriginState('/settings');

  /**
   * Where the text models stand across all three of their routes: the worst of
   * the text model and any translation or grammar model of its own, so a route
   * that failed its test is not hidden behind a text model that passed.
   */
  protected readonly textSummary = computed(() => {
    const none: AiStatus = { tone: null, text: 'Needs a key' };
    if (!this.credential.isConfigured()) {
      return { status: none, summary: null };
    }
    const routes = [
      { subject: null, readiness: this.text.readiness() },
      ...(['translation', 'grammar'] as const)
        .filter((task) => this.text.routePreset(task) !== null)
        .map((task) => ({
          subject: task === 'translation' ? 'Translation' : 'Grammar',
          readiness: this.text.routeReadiness(task),
        })),
    ];
    const worst =
      (['failed', 'stale', 'untested'] as const)
        .map((level) => routes.find((route) => route.readiness === level))
        .find((route) => route !== undefined) ?? routes[0];
    const settings = this.text.settings();
    const model =
      this.text.presets().find((preset) => preset.id === this.text.activePresetId())?.name ??
      (settings.modelId === '' ? null : settings.modelId);
    return {
      status: readinessStatus(worst?.readiness ?? 'incomplete', worst?.subject ?? null),
      summary: model,
    };
  });

  protected readonly voiceSummary = computed(() => {
    if (!this.credential.isConfigured()) {
      return { status: { tone: null, text: 'Needs a key' } satisfies AiStatus, summary: null };
    }
    const settings = this.tts.settings();
    const name =
      this.tts.presets().find((preset) => preset.id === settings.activePresetId)?.name ??
      (settings.modelId === '' ? null : settings.modelId);
    return {
      status: audioStatus(audioStatusOf(this.tts)),
      summary: joinSummary([name, this.tts.draft().voiceId]),
    };
  });
}
