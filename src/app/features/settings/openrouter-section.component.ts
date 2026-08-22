import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { openAddModelDialog } from './add-model-dialog.component';
import { ConfigurationStatusComponent } from './configuration-status.component';

/** OpenRouter credentials and the active registered text-model preset. */
@Component({
  selector: 'mn-openrouter-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfigurationStatusComponent],
  template: `
    <section class="mn-panel" aria-labelledby="mn-openrouter-heading">
      <h2 id="mn-openrouter-heading">AI text features</h2>
      <p class="mn-hint">
        Story generation, translation, and grammar review use your own OpenRouter key. Reading and
        importing never do.
      </p>

      <div class="group">
        <h3>API key</h3>
        <p class="state" role="status" data-testid="credential-state">{{ credentialState() }}</p>

        <div class="mn-field">
          <label for="mn-openrouter-key">
            {{ credential.isConfigured() ? 'Replace key' : 'API key' }}
          </label>
          <input
            id="mn-openrouter-key"
            type="password"
            autocomplete="off"
            spellcheck="false"
            data-testid="api-key-input"
            [value]="keyDraft()"
            (input)="onKeyInput($event)"
          />
          <p class="mn-hint">
            Stored on this device only. Monosai never shows it again after saving.
          </p>
        </div>

        <div class="actions-row">
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
            @if (removeStage() === 'idle') {
              <button
                type="button"
                class="mn-button mn-button--danger"
                data-testid="remove-key"
                (click)="beginRemove()"
              >
                Remove key
              </button>
            } @else {
              <button
                type="button"
                class="mn-button mn-button--danger"
                data-testid="confirm-remove-key"
                [disabled]="credential.action() !== 'idle'"
                (click)="confirmRemove()"
              >
                Yes, remove it
              </button>
              <button type="button" class="mn-button" (click)="cancelRemove()">Cancel</button>
            }
          }
        </div>

        @if (removeStage() === 'confirming') {
          <p role="alert" class="warning">
            Removing the key stops AI features until a new one is saved. Your readings, vocabulary,
            and saved aids stay.
          </p>
        }

        @if (credential.failure(); as failure) {
          <p role="alert" class="warning">{{ failure.message }}</p>
        }
      </div>

      <div class="group">
        <div class="section-heading">
          <div>
            <h3>Text model</h3>
            <p class="mn-hint">Choose a registered model or add another OpenRouter preset.</p>
          </div>
          <button
            type="button"
            class="mn-button"
            data-testid="add-text-model"
            [disabled]="!credential.isConfigured()"
            (click)="addModel()"
          >
            Add model
          </button>
        </div>

        @if (textModel.presets().length > 0) {
          <div class="preset-picker">
            <div class="mn-field">
              <label for="mn-text-preset">Active model</label>
              <select
                id="mn-text-preset"
                data-testid="text-preset-select"
                [value]="textModel.activePresetId() ?? ''"
                (change)="selectPreset($event)"
              >
                <option value="" disabled>Choose a model</option>
                @for (preset of textModel.presets(); track preset.id) {
                  <option [value]="preset.id">{{ preset.name }}</option>
                }
              </select>
            </div>
            <button
              type="button"
              class="mn-button remove-model"
              data-testid="remove-text-model"
              [disabled]="activePreset() === null"
              (click)="removeActiveModel()"
            >
              Remove
            </button>
          </div>
        } @else {
          <div class="empty-state">
            <span aria-hidden="true">＋</span>
            <div>
              <strong>No registered text models</strong>
              <p>Add one to discover its capabilities and generation settings.</p>
            </div>
          </div>
        }

        @if (activePreset(); as preset) {
          <div class="preset-summary">
            <div>
              <span>Model ID</span><strong>{{ preset.modelId }}</strong>
            </div>
            @if (preset.reasoningEffort; as effort) {
              <div>
                <span>Reasoning</span><strong>{{ effort }}</strong>
              </div>
            }
          </div>
        } @else if (textModel.settings().modelId !== '') {
          <p class="mn-hint">Current unregistered model: {{ textModel.settings().modelId }}</p>
        }

        <div class="actions-row">
          <button
            type="button"
            class="mn-button mn-button--primary"
            data-testid="test-text-model"
            [disabled]="!canTest()"
            (click)="test()"
          >
            Test configuration
          </button>
          @if (textModel.action() === 'testing') {
            <button
              type="button"
              class="mn-button"
              data-testid="cancel-text-test"
              (click)="cancel()"
            >
              Cancel
            </button>
          }
        </div>

        @if (textModel.action() === 'testing') {
          <p class="mn-hint" role="status">Testing the model…</p>
        } @else {
          <mn-configuration-status
            [readiness]="textModel.readiness()"
            [lastTestedAt]="textModel.lastTestedAt()"
            [failure]="textModel.testFailure()"
          />
        }

        @if (textModel.structuredOutput() === 'json-contract') {
          <p class="mn-hint">
            This model needed the plain JSON contract rather than provider-native structured output.
            Generation will use it, with one extra formatting attempt when needed.
          </p>
        }

        @if (textModel.storageFailure(); as failure) {
          <p role="alert" class="warning">{{ failure.message }}</p>
        }
      </div>
    </section>
  `,
  styles: `
    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      padding-top: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }

    .group h3,
    .state,
    .empty-state p {
      margin: 0;
    }
    .state,
    .empty-state p {
      color: var(--text-secondary);
    }

    .section-heading,
    .actions-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
    }

    .actions-row {
      justify-content: flex-start;
    }

    .preset-picker {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
      gap: var(--space-2);
    }

    .remove-model {
      color: var(--status-danger);
    }

    .empty-state {
      display: flex;
      align-items: center;
      gap: var(--space-3);
      padding: var(--space-4);
      border: 1px dashed var(--border-strong);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
    }

    .empty-state > span {
      display: grid;
      width: 2.5rem;
      height: 2.5rem;
      place-items: center;
      border-radius: 50%;
      background: var(--action-primary-soft);
      color: var(--action-primary);
      font-size: 1.4rem;
    }

    .preset-summary {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: var(--space-3);
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
    }

    .preset-summary div {
      display: flex;
      min-width: 0;
      flex-direction: column;
      gap: var(--space-1);
    }
    .preset-summary span {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
    .preset-summary strong {
      overflow-wrap: anywhere;
    }
    .warning {
      margin: 0;
      color: var(--status-danger);
    }

    @media (max-width: 32rem) {
      .section-heading {
        align-items: stretch;
        flex-direction: column;
      }
      .preset-picker {
        grid-template-columns: 1fr;
        align-items: stretch;
      }
      .preset-summary {
        grid-template-columns: 1fr;
      }
    }
  `,
})
export class OpenRouterSectionComponent {
  private readonly dialog = inject(Dialog);
  protected readonly credential = inject(CredentialStore);
  protected readonly textModel = inject(TextModelStore);
  protected readonly keyDraft = signal('');
  protected readonly removeStage = signal<'idle' | 'confirming'>('idle');

  protected readonly activePreset = computed(() => {
    const activeId = this.textModel.activePresetId();
    return this.textModel.presets().find((preset) => preset.id === activeId) ?? null;
  });
  protected readonly credentialState = computed(() =>
    this.credential.isConfigured()
      ? `Key saved${this.savedAt()}. Monosai does not display saved keys.`
      : 'No key saved. AI features stay unavailable until one is.',
  );
  protected readonly canTest = computed(
    () =>
      this.textModel.action() === 'idle' &&
      this.credential.isConfigured() &&
      this.textModel.settings().modelId !== '',
  );

  constructor() {
    void this.credential.load().then(() => this.textModel.load());
  }

  protected onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
  }

  protected saveKey(): void {
    const value = this.keyDraft();
    this.keyDraft.set('');
    void this.credential.save(value);
  }

  protected beginRemove(): void {
    this.removeStage.set('confirming');
  }
  protected cancelRemove(): void {
    this.removeStage.set('idle');
  }

  protected confirmRemove(): void {
    this.removeStage.set('idle');
    void this.credential.remove();
  }

  protected async addModel(): Promise<void> {
    const result = await openAddModelDialog(this.dialog, { kind: 'text' });
    if (result?.kind === 'text') {
      await this.textModel.registerPreset(result.preset);
    }
  }

  protected selectPreset(event: Event): void {
    void this.textModel.selectPreset((event.target as HTMLSelectElement).value);
  }

  protected async removeActiveModel(): Promise<void> {
    const preset = this.activePreset();
    if (preset === null) {
      return;
    }
    const confirmed = await openConfirmDialog(this.dialog, {
      title: `Remove ${preset.name}?`,
      message: 'This removes the registered model preset from this device.',
      details: [preset.modelId, 'Your readings and everything already generated stay untouched.'],
      footnote: 'If another preset becomes active, test it before generation.',
      confirmLabel: 'Remove model',
      cancelLabel: 'Keep model',
      tone: 'danger',
    });
    if (confirmed) {
      await this.textModel.removePreset(preset.id);
    }
  }

  protected test(): void {
    void this.textModel.test();
  }
  protected cancel(): void {
    this.textModel.cancelTest();
  }

  private savedAt(): string {
    const updated = this.credential.status().updatedAt;
    return updated === null ? '' : ` on ${new Date(updated).toLocaleDateString()}`;
  }
}
