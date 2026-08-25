import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { MODEL_CATALOG } from '../../application/shared/ai-tokens';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { ModelPickerComponent } from './model-picker.component';

@Component({
  selector: 'mn-models-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModelPickerComponent],
  template: `
    <section class="mn-panel models" aria-labelledby="mn-models-heading">
      <div>
        <h2 id="mn-models-heading">AI models</h2>
        <p class="mn-hint">Choose directly from OpenRouter. Changes are saved on this device.</p>
      </div>

      <details class="key-card mn-disclosure" [open]="!credential.isConfigured()">
        <summary>
          OpenRouter
          <span class="connection-state">{{
            credential.isConfigured() ? 'Connected' : 'Not connected'
          }}</span>
        </summary>
        <div class="key-controls">
          <label class="mn-visually-hidden" for="mn-openrouter-key">OpenRouter API key</label>
          <div class="credential-row">
            <input
              class="mn-control"
              id="mn-openrouter-key"
              type="password"
              autocomplete="off"
              spellcheck="false"
              data-testid="api-key-input"
              [placeholder]="credential.isConfigured() ? 'Replace saved key' : 'Paste your key'"
              [value]="keyDraft()"
              (input)="onKeyInput($event)"
            />
            <div class="actions">
              <button
                type="button"
                class="mn-button mn-button--primary"
                data-testid="save-key"
                [disabled]="keyDraft().trim() === '' || credential.action() !== 'idle'"
                (click)="saveKey()"
              >
                {{ credential.isConfigured() ? 'Replace key' : 'Save key' }}
              </button>
              @if (credential.isConfigured()) {
                <button type="button" class="mn-button mn-button--danger" (click)="removeKey()">
                  Remove
                </button>
              }
            </div>
          </div>
        </div>
      </details>

      <div class="model-fields" [class.disabled]="!credential.isConfigured()">
        <section class="model-field" aria-labelledby="mn-text-model-label">
          <div class="field-heading">
            <div>
              <h3 id="mn-text-model-label">Text model</h3>
              <p class="mn-hint">Used for stories, translations, and grammar.</p>
            </div>
            <span class="status" [attr.data-readiness]="text.readiness()">{{ textStatus() }}</span>
          </div>
          <mn-model-picker
            label="text models"
            data-testid="text-model-picker"
            [models]="textModels()"
            [favoriteIds]="text.favoriteModelIds()"
            [selectedId]="text.settings().modelId"
            [loading]="catalogLoading()"
            [failure]="catalogFailure()"
            [disabled]="!credential.isConfigured()"
            (opened)="loadCatalog()"
            (modelSelected)="selectTextModel($event)"
            (favoriteToggled)="text.toggleFavorite($event)"
          />
          @if (selectedTextModel(); as model) {
            <div class="options">
              <label class="mn-field"
                ><span>Reasoning</span>
                <select
                  class="mn-control"
                  [value]="text.settings().reasoningEffort ?? ''"
                  (change)="setReasoning($event)"
                >
                  <option value="">Automatic</option>
                  @for (effort of reasoningEfforts(model); track effort) {
                    <option [value]="effort">{{ titleCase(effort) }}</option>
                  }
                </select>
              </label>
            </div>
          }
          <div class="actions">
            <button
              type="button"
              class="mn-button"
              data-testid="test-text-model"
              [disabled]="text.settings().modelId === '' || text.action() !== 'idle'"
              (click)="text.test()"
            >
              {{ text.action() === 'testing' ? 'Testing…' : 'Test text model' }}
            </button>
          </div>
          @if (text.testFailure(); as failure) {
            <p class="error" role="alert">{{ failure.message }}</p>
          }
        </section>

        <section class="model-field" aria-labelledby="mn-audio-model-label">
          <div class="field-heading">
            <div>
              <h3 id="mn-audio-model-label">Reading audio</h3>
              <p class="mn-hint">Speech models only.</p>
            </div>
            <span class="status" [attr.data-readiness]="tts.readiness()">{{ audioStatus() }}</span>
          </div>
          <mn-model-picker
            label="speech models"
            data-testid="audio-model-picker"
            [models]="speechModels()"
            [favoriteIds]="tts.favoriteModelIds()"
            [selectedId]="tts.settings().modelId"
            [loading]="catalogLoading()"
            [failure]="catalogFailure()"
            [disabled]="!credential.isConfigured()"
            (opened)="loadCatalog()"
            (modelSelected)="selectSpeechModel($event)"
            (favoriteToggled)="tts.toggleFavorite($event)"
          />
          @if (selectedSpeechModel(); as model) {
            <div class="options audio-options">
              <div class="mn-field">
                <span>Voice</span>
                @if (model.supportedVoices.length > 0) {
                  <select
                    aria-label="Voice"
                    class="mn-control"
                    [value]="tts.draft().voiceId"
                    (change)="setVoice($event)"
                  >
                    @for (voice of model.supportedVoices; track voice) {
                      <option [value]="voice">{{ voice }}</option>
                    }
                  </select>
                } @else {
                  <input
                    aria-label="Voice ID"
                    class="mn-control"
                    type="text"
                    placeholder="Voice ID"
                    [value]="tts.draft().voiceId"
                    (change)="setVoice($event)"
                  />
                }
              </div>
              <label class="mn-field compact"
                ><span>Speed</span>
                <input
                  class="mn-control"
                  type="number"
                  min="0.5"
                  max="2"
                  step="0.05"
                  [value]="tts.draft().speed"
                  (change)="setSpeed($event)"
                />
              </label>
            </div>
          }
          <div class="actions">
            <button
              type="button"
              class="mn-button"
              data-testid="test-tts"
              [disabled]="
                tts.draft().modelId === '' || tts.draft().voiceId === '' || tts.action() !== 'idle'
              "
              (click)="tts.test()"
            >
              {{ tts.action() === 'testing' ? 'Testing…' : 'Test reading audio' }}
            </button>
          </div>
          @if (tts.testFailure(); as failure) {
            <p class="error" role="alert">{{ failure.message }}</p>
          }
        </section>
      </div>
    </section>
  `,
  styles: `
    .models,
    .model-fields,
    .model-field {
      gap: var(--space-4);
    }
    h2,
    h3,
    p {
      margin: 0;
    }
    .key-card,
    .model-field {
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
    }
    .key-card summary {
      display: flex;
      align-items: center;
      min-height: var(--touch-target);
      font-weight: 700;
    }
    .connection-state {
      margin-left: auto;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 500;
    }
    .key-controls {
      padding-top: var(--space-2);
    }
    .credential-row {
      display: grid;
      grid-template-columns: minmax(12rem, 1fr) auto;
      gap: var(--space-2);
    }
    .actions,
    .field-heading {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .field-heading {
      justify-content: space-between;
    }
    .model-fields,
    .model-field {
      display: grid;
    }
    .model-fields.disabled {
      opacity: 0.65;
    }
    .status {
      flex: none;
      padding: 0.15rem 0.55rem;
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
      color: var(--text-secondary);
      font-size: 12px;
      font-weight: 700;
    }
    .status[data-readiness='ready'] {
      background: var(--status-success-soft);
      color: var(--status-success);
    }
    .status[data-readiness='failed'] {
      background: var(--status-danger-soft);
      color: var(--status-danger);
    }
    .options {
      display: grid;
      grid-template-columns: minmax(12rem, 20rem);
      gap: var(--space-3);
      padding-left: var(--space-3);
      border-left: 2px solid var(--action-primary-soft);
    }
    .audio-options {
      grid-template-columns: minmax(12rem, 20rem) minmax(7rem, 9rem);
    }
    .error {
      color: var(--status-danger);
    }
    @media (max-width: 36rem) {
      .credential-row,
      .audio-options {
        grid-template-columns: 1fr;
      }
      .field-heading {
        align-items: flex-start;
      }
    }
  `,
})
export class ModelsSectionComponent {
  private readonly dialog = inject(Dialog);
  private readonly catalog = inject(MODEL_CATALOG);
  protected readonly credential = inject(CredentialStore);
  protected readonly text = inject(TextModelStore);
  protected readonly tts = inject(TtsStore);
  protected readonly keyDraft = signal('');
  protected readonly textModels = signal<readonly ModelCapabilities[]>([]);
  protected readonly speechModels = signal<readonly ModelCapabilities[]>([]);
  protected readonly catalogLoading = signal(false);
  protected readonly catalogFailure = signal<string | null>(null);
  private catalogLoaded = false;

  protected readonly selectedTextModel = computed(
    () => this.textModels().find((model) => model.modelId === this.text.settings().modelId) ?? null,
  );
  protected readonly selectedSpeechModel = computed(
    () =>
      this.speechModels().find((model) => model.modelId === this.tts.settings().modelId) ?? null,
  );
  protected readonly textStatus = computed(() => this.statusLabel(this.text.readiness()));
  protected readonly audioStatus = computed(() => this.statusLabel(this.tts.readiness()));

  protected onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
  }
  protected async saveKey(): Promise<void> {
    const saved = await this.credential.save(this.keyDraft());
    this.keyDraft.set('');
    if (saved) {
      this.catalogLoaded = false;
      await this.loadCatalog();
    }
  }
  protected async removeKey(): Promise<void> {
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Remove API key?',
      message: 'AI requests will be unavailable until another key is saved.',
      details: ['Your model choices and saved content stay on this device.'],
      confirmLabel: 'Remove key',
      cancelLabel: 'Keep key',
      tone: 'danger',
    });
    if (confirmed) await this.credential.remove();
  }
  protected async loadCatalog(): Promise<void> {
    if (this.catalogLoaded || this.catalogLoading() || !this.credential.isConfigured()) return;
    this.catalogLoading.set(true);
    this.catalogFailure.set(null);
    const [text, speech] = await Promise.all([
      this.catalog.list('text'),
      this.catalog.list('speech'),
    ]);
    this.catalogLoading.set(false);
    if (!text.ok || !speech.ok) {
      this.catalogFailure.set(
        (!text.ok ? text.error : !speech.ok ? speech.error : null)?.message ??
          'Could not load models.',
      );
      return;
    }
    this.textModels.set(text.value);
    this.speechModels.set(speech.value);
    this.catalogLoaded = true;
  }
  protected async selectTextModel(model: ModelCapabilities): Promise<void> {
    this.text.setDraftModelId(model.modelId);
    await this.text.save();
    await this.text.setReasoningEffort(model.reasoning?.defaultEffort ?? null);
  }
  protected async selectSpeechModel(model: ModelCapabilities): Promise<void> {
    this.tts.setDraft({ modelId: model.modelId, voiceId: model.supportedVoices[0] ?? '' });
    await this.tts.save();
  }
  protected setReasoning(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    void this.text.setReasoningEffort(value || null);
  }
  protected setVoice(event: Event): void {
    this.tts.setDraft({ voiceId: (event.target as HTMLInputElement).value });
    void this.tts.save();
  }
  protected setSpeed(event: Event): void {
    this.tts.setDraft({ speed: Number((event.target as HTMLInputElement).value) });
    void this.tts.save();
  }
  protected reasoningEfforts(model: ModelCapabilities): readonly string[] {
    return model.reasoning?.supportedEfforts ?? ['low', 'medium', 'high'];
  }
  protected titleCase(value: string): string {
    return value.charAt(0).toLocaleUpperCase() + value.slice(1);
  }
  private statusLabel(readiness: string): string {
    return (
      (
        {
          ready: 'Ready',
          untested: 'Not tested',
          stale: 'Test again',
          failed: 'Test failed',
          'not-configured': 'Not configured',
        } as Record<string, string>
      )[readiness] ?? readiness
    );
  }
}
