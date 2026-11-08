import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { NoticeComponent } from '../../shared-ui/notice/notice.component';
import { ModelCatalogView } from './model-catalog-view';
import { OpenRouterConnectionComponent } from './openrouter-connection.component';
import { TextModelsComponent } from './text-models.component';
import { VoiceModelComponent } from './voice-model.component';

/**
 * The AI configuration, shaped as the tree it actually is.
 *
 * One text model answers for everything by default; translation and grammar
 * review are branches of it that exist only when a learner deliberately opens
 * them. Nothing here has a Test button: choosing a model or changing how it
 * thinks is what makes a test necessary, so the test runs then, and the status
 * beside the model doubles as the retry when it did not pass.
 */
@Component({
  selector: 'mn-models-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    NoticeComponent,
    OpenRouterConnectionComponent,
    SectionComponent,
    TextModelsComponent,
    VoiceModelComponent,
  ],
  providers: [ModelCatalogView],
  template: `
    <mn-section heading="AI" [rows]="true">
      <mn-openrouter-connection />

      <!--
        Every control below needs a key. Drawn disabled before one existed,
        they read as values nobody had chosen; the connection comes first.
      -->
      @if (credential.isConfigured()) {
        <mn-text-models />
        <mn-voice-model />
      }

      @if (text.testFailure(); as failure) {
        <mn-notice tone="error" role="alert">{{ failure.message }}</mn-notice>
      }
      @if (tts.testFailure(); as failure) {
        <mn-notice tone="error" role="alert">{{ failure.message }}</mn-notice>
      }
    </mn-section>
  `,
})
export class ModelsSectionComponent {
  protected readonly credential = inject(CredentialStore);
  protected readonly text = inject(TextModelStore);
  protected readonly tts = inject(TtsStore);

  constructor() {
    // Created here rather than by the first panel that needs it, so the fetch
    // starts with the section, whichever panels are showing.
    inject(ModelCatalogView);
  }
}
