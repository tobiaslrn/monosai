import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { ConfigurationStatusComponent } from './configuration-status.component';

/**
 * The OpenRouter key and the exact text model.
 *
 * The saved key is never rendered, echoed, or revealed: the input is cleared
 * the moment it is handed to the repository, and what remains on screen is only
 * whether a key is configured and when it last changed. Testing is an explicit
 * action; nothing here reaches the network on its own.
 */
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
        <h3 id="mn-openrouter-key-heading">API key</h3>
        <p class="state" role="status" data-testid="credential-state">
          {{ credentialState() }}
        </p>

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
        <h3 id="mn-openrouter-model-heading">Text model</h3>

        <div class="mn-field">
          <label for="mn-text-model">Exact model ID</label>
          <input
            id="mn-text-model"
            type="text"
            autocomplete="off"
            spellcheck="false"
            placeholder="vendor/model-name"
            data-testid="text-model-input"
            [value]="textModel.draftModelId()"
            (input)="onModelInput($event)"
          />
          <p class="mn-hint">
            Copied exactly from OpenRouter. Changing it marks the test out of date but keeps
            everything already generated.
          </p>
        </div>

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
          } @else if (textModel.hasUnsavedModelId()) {
            <button type="button" class="mn-button" data-testid="save-text-model" (click)="save()">
              Save
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

    .group h3 {
      margin: 0;
    }

    .state {
      margin: 0;
      color: var(--text-secondary);
    }

    .actions-row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .warning {
      margin: 0;
      color: var(--status-danger);
    }
  `,
})
export class OpenRouterSectionComponent {
  protected readonly credential = inject(CredentialStore);
  protected readonly textModel = inject(TextModelStore);

  /**
   * The unsaved contents of the key field.
   *
   * It holds only what the learner is typing right now and is emptied as soon
   * as the value is handed to the repository, so no saved key is ever kept in
   * component state.
   */
  protected readonly keyDraft = signal('');
  protected readonly removeStage = signal<'idle' | 'confirming'>('idle');

  protected readonly credentialState = computed(() =>
    this.credential.isConfigured()
      ? `Key saved${this.savedAt()}. Monosai does not display saved keys.`
      : 'No key saved. AI features stay unavailable until one is.',
  );

  protected readonly canTest = computed(
    () =>
      this.textModel.action() === 'idle' &&
      this.credential.isConfigured() &&
      this.textModel.draftModelId().trim() !== '',
  );

  constructor() {
    void this.credential.load().then(() => this.textModel.load());
  }

  protected onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
  }

  protected onModelInput(event: Event): void {
    this.textModel.setDraftModelId((event.target as HTMLInputElement).value);
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

  protected save(): void {
    void this.textModel.save();
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
