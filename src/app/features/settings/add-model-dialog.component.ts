import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import type { Dialog } from '@angular/cdk/dialog';
import { ModelCapabilitiesStore } from '../../application/settings/model-capabilities.store';
import { MAX_TTS_SPEED, MIN_TTS_SPEED } from '../../application/settings/tts.store';
import { isGeminiTtsModel, resolveTtsVoice } from '../../domain/ai/tts-configuration';
import type { TextModelPreset, TtsPreset } from '../../domain/settings/settings';
import { ModelCapabilitiesComponent } from './model-capabilities.component';

export type AddModelKind = 'text' | 'tts';

export interface AddModelDialogData {
  readonly kind: AddModelKind;
}

export type AddModelDialogResult =
  | { readonly kind: 'text'; readonly preset: TextModelPreset }
  | { readonly kind: 'tts'; readonly preset: TtsPreset };

@Component({
  selector: 'mn-add-model-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ModelCapabilitiesComponent],
  template: `
    <div class="dialog">
      <header class="header">
        <div>
          <p class="eyebrow">{{ data.kind === 'text' ? 'TEXT MODEL' : 'VOICE MODEL' }}</p>
          <h2 id="mn-add-model-title">
            {{ data.kind === 'text' ? 'Add a text model' : 'Add a voice model' }}
          </h2>
          <p id="mn-add-model-description" class="intro">
            Paste the exact OpenRouter model ID. Monosai will find the choices that model supports.
          </p>
        </div>
        <button type="button" class="close" aria-label="Close dialog" (click)="cancel()">×</button>
      </header>

      <ol class="steps" aria-label="Add model progress">
        <li class="active"><span>1</span> Model</li>
        <li [class.active]="capabilityState().result !== null"><span>2</span> Configure</li>
        <li [class.active]="canSave()"><span>3</span> Save</li>
      </ol>

      <div class="fields">
        <div class="mn-field">
          <label for="mn-new-model-name">Display name</label>
          <input
            id="mn-new-model-name"
            type="text"
            autocomplete="off"
            placeholder="My Gemini model"
            [value]="name()"
            (input)="setName($event)"
          />
          <p class="mn-hint">A short name you will recognize in Settings.</p>
        </div>

        <div class="mn-field">
          <label for="mn-new-model-id">Exact OpenRouter model ID</label>
          <div class="discover-row">
            <input
              id="mn-new-model-id"
              type="text"
              autocomplete="off"
              spellcheck="false"
              placeholder="google/gemini-…"
              data-testid="add-model-id"
              [value]="modelId()"
              (input)="setModelId($event)"
              (keydown.enter)="discover()"
              cdkFocusInitial
            />
            <button
              type="button"
              class="mn-button mn-button--primary"
              data-testid="dialog-discover-model"
              [disabled]="!canDiscover()"
              (click)="discover()"
            >
              {{ capabilityState().action === 'loading' ? 'Discovering…' : 'Discover' }}
            </button>
          </div>
        </div>
      </div>

      <mn-model-capabilities [state]="capabilityState()" />

      @if (capabilityState().result; as model) {
        <section class="configuration" aria-labelledby="mn-model-options-heading">
          <div class="configuration-heading">
            <div class="success-mark" aria-hidden="true">✓</div>
            <div>
              <h3 id="mn-model-options-heading">Preset options</h3>
              <p>Choose how Monosai should use this model.</p>
            </div>
          </div>

          @if (data.kind === 'text') {
            @if (model.reasoning?.supportedEfforts; as efforts) {
              <div class="mn-field">
                <label for="mn-new-reasoning-effort">Reasoning effort</label>
                <select
                  id="mn-new-reasoning-effort"
                  data-testid="reasoning-effort-select"
                  [value]="reasoningEffort()"
                  (change)="setReasoningEffort($event)"
                >
                  @for (effort of efforts; track effort) {
                    <option [value]="effort" [selected]="effort === reasoningEffort()">
                      {{ effort }}
                    </option>
                  }
                </select>
                <p class="mn-hint">Lower effort is usually faster for structured generation.</p>
              </div>
            } @else {
              <p class="mn-hint">This model does not advertise configurable reasoning effort.</p>
            }
          } @else {
            <div class="option-grid">
              <div class="mn-field">
                <label for="mn-new-voice">Voice</label>
                @if (model.supportedVoices.length > 0) {
                  <select
                    id="mn-new-voice"
                    data-testid="voice-select"
                    [value]="voiceId()"
                    (change)="setVoice($event)"
                  >
                    @if (geminiTts()) {
                      <option value="">Default (Kore)</option>
                    }
                    @for (voice of model.supportedVoices; track voice) {
                      <option [value]="voice">{{ voice }}</option>
                    }
                  </select>
                } @else {
                  <input
                    id="mn-new-voice"
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    placeholder="Voice ID"
                    [value]="voiceId()"
                    (input)="setVoice($event)"
                  />
                }
                @if (geminiTts()) {
                  <p class="mn-hint">Optional for Gemini. Leaving this blank uses Kore.</p>
                }
              </div>

              <div class="mn-field">
                <label for="mn-new-speed">Speed · {{ speed().toFixed(2) }}×</label>
                <input
                  id="mn-new-speed"
                  type="range"
                  [min]="minSpeed"
                  [max]="maxSpeed"
                  step="0.05"
                  [disabled]="!speedSupported()"
                  [value]="speed()"
                  (input)="setSpeed($event)"
                />
                @if (!speedSupported()) {
                  <p class="mn-hint">This model does not advertise speed control.</p>
                }
              </div>
            </div>
          }
        </section>
      }

      <footer class="actions">
        <button type="button" class="mn-button" (click)="cancel()">Cancel</button>
        <button
          type="button"
          class="mn-button mn-button--primary"
          data-testid="save-model-preset"
          [disabled]="!canSave()"
          (click)="save()"
        >
          Save model
        </button>
      </footer>
    </div>
  `,
  styles: `
    .dialog {
      display: flex;
      flex-direction: column;
      gap: var(--space-4);
      width: min(42rem, calc(100vw - 2 * var(--space-4)));
      max-height: min(48rem, calc(100dvh - 2 * var(--space-4)));
      overflow: auto;
      padding: var(--space-5);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    .header {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--space-4);
    }

    .eyebrow {
      margin: 0 0 var(--space-1);
      color: var(--action-primary);
      font-size: var(--text-sm);
      font-weight: 700;
      letter-spacing: 0.12em;
    }

    h2,
    h3,
    p {
      margin: 0;
    }

    h2 {
      font-size: clamp(1.35rem, 4vw, 1.75rem);
    }

    h3 {
      font-size: 1rem;
    }

    .intro,
    .configuration-heading p {
      margin-top: var(--space-1);
      color: var(--text-secondary);
    }

    .close {
      display: grid;
      flex: 0 0 auto;
      width: var(--touch-target);
      height: var(--touch-target);
      place-items: center;
      padding: 0;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
      color: var(--text-secondary);
      font: inherit;
      font-size: 1.35rem;
      cursor: pointer;
    }

    .close:hover {
      color: var(--text-primary);
    }

    .steps {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      margin: 0;
      padding: 0;
      list-style: none;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .steps li {
      display: flex;
      align-items: center;
      gap: var(--space-2);
      padding-bottom: var(--space-2);
      border-bottom: 2px solid var(--border-subtle);
    }

    .steps span {
      display: grid;
      width: 1.5rem;
      height: 1.5rem;
      place-items: center;
      border-radius: 50%;
      background: var(--surface-sunken);
      font-weight: 700;
    }

    .steps .active {
      border-color: var(--action-primary);
      color: var(--text-primary);
    }

    .steps .active span,
    .success-mark {
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    .fields {
      display: grid;
      grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
      gap: var(--space-3);
    }

    .discover-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-2);
    }

    .configuration {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
    }

    .configuration-heading {
      display: flex;
      align-items: center;
      gap: var(--space-3);
    }

    .success-mark {
      display: grid;
      flex: 0 0 auto;
      width: 2rem;
      height: 2rem;
      place-items: center;
      border-radius: 50%;
      font-weight: 700;
    }

    .option-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-3);
    }

    .actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
      padding-top: var(--space-3);
      border-top: 1px solid var(--border-subtle);
    }

    @media (max-width: 36rem) {
      .dialog {
        width: calc(100vw - 2 * var(--space-2));
        max-height: calc(100dvh - 2 * var(--space-2));
        padding: var(--space-4);
      }

      .fields,
      .option-grid,
      .discover-row {
        grid-template-columns: 1fr;
      }

      .steps li {
        gap: var(--space-1);
        font-size: 0.75rem;
      }
    }
  `,
})
export class AddModelDialogComponent {
  private readonly dialogRef = inject<DialogRef<AddModelDialogResult>>(DialogRef);
  private readonly capabilities = inject(ModelCapabilitiesStore);
  protected readonly data = inject<AddModelDialogData>(DIALOG_DATA);

  protected readonly minSpeed = MIN_TTS_SPEED;
  protected readonly maxSpeed = MAX_TTS_SPEED;
  protected readonly name = signal('');
  protected readonly modelId = signal('');
  protected readonly reasoningEffort = signal('minimal');
  protected readonly voiceId = signal('');
  protected readonly speed = signal(1);

  protected readonly capabilityState = computed(() =>
    this.data.kind === 'text' ? this.capabilities.text() : this.capabilities.tts(),
  );
  protected readonly geminiTts = computed(
    () => this.data.kind === 'tts' && isGeminiTtsModel(this.modelId()),
  );
  protected readonly speedSupported = computed(() => {
    const result = this.capabilityState().result;
    return (
      this.data.kind === 'tts' &&
      !this.geminiTts() &&
      (result?.supportedParameters.includes('speed') ?? false)
    );
  });
  protected readonly canDiscover = computed(
    () => this.modelId().trim() !== '' && this.capabilityState().action === 'idle',
  );
  protected readonly canSave = computed(() => {
    const model = this.capabilityState().result;
    if (model?.modelId !== this.modelId().trim()) {
      return false;
    }
    if (this.data.kind === 'text') {
      return model.outputModalities.includes('text');
    }
    return (
      (model.outputModalities.includes('audio') ||
        model.supportedVoices.length > 0 ||
        this.geminiTts()) &&
      (this.geminiTts() || model.supportedVoices.length > 0 || this.voiceId().trim() !== '')
    );
  });

  constructor() {
    this.capabilities.clear(this.data.kind);
  }

  protected setName(event: Event): void {
    this.name.set((event.target as HTMLInputElement).value);
  }

  protected setModelId(event: Event): void {
    this.modelId.set((event.target as HTMLInputElement).value);
    this.capabilities.clear(this.data.kind);
  }

  protected setReasoningEffort(event: Event): void {
    this.reasoningEffort.set((event.target as HTMLSelectElement).value);
  }

  protected setVoice(event: Event): void {
    this.voiceId.set((event.target as HTMLInputElement | HTMLSelectElement).value);
  }

  protected setSpeed(event: Event): void {
    this.speed.set(Number((event.target as HTMLInputElement).value));
  }

  protected async discover(): Promise<void> {
    if (!this.canDiscover()) {
      return;
    }
    await this.capabilities.discover(this.data.kind, this.modelId());
    const model = this.capabilityState().result;
    if (model === null) {
      return;
    }
    if (this.name().trim() === '') {
      this.name.set(model.name);
    }
    const efforts = model.reasoning?.supportedEfforts;
    const defaultEffort = model.reasoning?.defaultEffort;
    if (efforts?.length) {
      this.reasoningEffort.set(defaultEffort ?? efforts[0]);
    }
  }

  protected save(): void {
    const model = this.capabilityState().result;
    if (!this.canSave() || model === null) {
      return;
    }
    const id = globalThis.crypto.randomUUID();
    const name = this.name().trim() || model.name;
    if (this.data.kind === 'text') {
      this.dialogRef.close({
        kind: 'text',
        preset: {
          id,
          name,
          modelId: model.modelId,
          reasoningEffort: model.reasoning === null ? null : this.reasoningEffort(),
        },
      });
      return;
    }
    this.dialogRef.close({
      kind: 'tts',
      preset: {
        id,
        name,
        modelId: model.modelId,
        voiceId: resolveTtsVoice(model.modelId, this.voiceId()),
        speed: this.speedSupported() ? this.speed() : 1,
      },
    });
  }

  protected cancel(): void {
    this.dialogRef.close();
  }
}

export async function openAddModelDialog(
  dialog: Dialog,
  data: AddModelDialogData,
): Promise<AddModelDialogResult | null> {
  const ref = dialog.open<AddModelDialogResult, AddModelDialogData>(AddModelDialogComponent, {
    data,
    role: 'dialog',
    ariaLabelledBy: 'mn-add-model-title',
    ariaDescribedBy: 'mn-add-model-description',
    hasBackdrop: true,
  });
  return await new Promise<AddModelDialogResult | null>((resolve) => {
    ref.closed.subscribe((result) => {
      resolve(result ?? null);
    });
  });
}
