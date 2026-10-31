import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore, type TextModelTask } from '../../application/settings/text-model.store';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { MAX_STORY_TOKEN_BUDGET } from '../../domain/settings/settings';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { ModelCatalogView } from './model-catalog-view';
import { ModelPickerComponent } from './model-picker.component';
import { TokenBudgetFieldComponent } from './token-budget-field.component';

/**
 * The text model and its two branches.
 *
 * One model answers for everything by default; translation and grammar review
 * exist only when a learner deliberately opens them.
 */
@Component({
  selector: 'mn-text-models',
  host: {
    class: 'node mn-inset mn-settings-group',
    role: 'region',
    'aria-labelledby': 'mn-text-model-label',
    'data-capability': 'text',
    '[attr.data-readiness]': 'text.readiness()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    IconComponent,
    ModelPickerComponent,
    SettingsRowComponent,
    TokenBudgetFieldComponent,
  ],
  template: `
    <div class="mn-settings-group__header">
      <h3 class="mn-group-title" id="mn-text-model-label">Text</h3>
      <div class="head-status mn-actions">
        <span
          class="mn-status-pill"
          [class.mn-status-pill--success]="text.readiness() === 'ready'"
          [class.mn-status-pill--danger]="text.readiness() === 'failed'"
          data-testid="text-readiness"
          >{{ readinessLabel(text.readiness(), text.action() === 'testing') }}</span
        >
        @if (retestable(text.readiness())) {
          <button
            type="button"
            class="mn-button mn-button--ghost"
            data-testid="test-text-model"
            [disabled]="text.action() !== 'idle'"
            (click)="text.test()"
          >
            {{ statusLabel(text.readiness(), text.action() === 'testing') }}
          </button>
        }
      </div>
    </div>

    <mn-settings-row label="Model">
      <mn-model-picker
        [compact]="true"
        data-testid="text-model-picker"
        label="text models"
        [models]="textModels()"
        [favoriteIds]="text.favoriteModelIds()"
        [selectedId]="text.settings().modelId"
        [selectedLabel]="storyModelLabel()"
        [loading]="catalogLoading()"
        [failure]="catalogFailure()"
        [disabled]="!credential.isConfigured()"
        (opened)="retryCatalog()"
        (modelSelected)="selectStoryModel($event)"
        (favoriteToggled)="text.toggleFavorite($event)"
      />
    </mn-settings-row>

    <mn-settings-row label="Reasoning" labelId="mn-text-reasoning-label">
      <select
        class="mn-control"
        aria-labelledby="mn-text-reasoning-label"
        [disabled]="!credential.isConfigured()"
        [ngModel]="text.settings().reasoningEffort ?? ''"
        (change)="setStoryReasoning($event)"
      >
        <option value="">Automatic</option>
        @for (effort of reasoningEfforts(selectedStoryModel()); track effort) {
          <option [value]="effort">{{ titleCase(effort) }}</option>
        }
      </select>
    </mn-settings-row>

    <mn-settings-row label="Token limit" labelId="mn-text-limit-label">
      <mn-token-budget-field
        testId="story-token-budget-input"
        labelledBy="mn-text-limit-label"
        [value]="text.settings().storyTokenBudget"
        [maxValue]="storyTokenBudgetMax()"
        [disabled]="!credential.isConfigured()"
        (committed)="saveStoryBudget($event)"
      />
    </mn-settings-row>

    <details
      class="mn-settings-details branches"
      [open]="hasOverrides() || branchesOpen()"
      (toggle)="setBranchesOpen($event)"
    >
      <summary class="mn-settings-row" data-testid="task-models-toggle">
        <span class="mn-settings-row__label">
          <span class="mn-settings-row__title">Translation and grammar</span>
        </span>
        <span class="mn-settings-row__end">
          <span class="mn-settings-value">{{ taskModelsSummary() }}</span>
          <mn-icon class="mn-settings-chevron" name="chevron-right" [size]="18" />
        </span>
      </summary>
      <div class="mn-settings-subrows">
        @for (task of textTasks; track task.id) {
          <div
            class="branch"
            [attr.aria-labelledby]="'mn-' + task.id + '-label'"
            [attr.data-capability]="task.id"
            [attr.data-readiness]="
              text.routePreset(task.id) === null ? 'inherited' : text.routeReadiness(task.id)
            "
          >
            <mn-settings-row [label]="task.label" [labelId]="'mn-' + task.id + '-label'">
              @if (text.routePreset(task.id) !== null && retestable(text.routeReadiness(task.id))) {
                <button
                  type="button"
                  class="mn-button mn-button--ghost"
                  data-testid="test-text-model"
                  [disabled]="text.action() !== 'idle'"
                  (click)="text.testTask(task.id)"
                >
                  {{ statusLabel(text.routeReadiness(task.id), text.action() === 'testing') }}
                </button>
              } @else if (
                text.routePreset(task.id) !== null && text.routeReadiness(task.id) === 'ready'
              ) {
                <span class="mn-status-pill mn-status-pill--success">Ready</span>
              }
              <mn-model-picker
                [compact]="true"
                [attr.data-testid]="task.id + '-model-picker'"
                [label]="task.label + ' models'"
                fallbackLabel="Same as text"
                [models]="textModels()"
                [favoriteIds]="text.favoriteModelIds()"
                [selectedId]="routeModelId(task.id)"
                [selectedLabel]="text.routePreset(task.id)?.name ?? null"
                [loading]="catalogLoading()"
                [failure]="catalogFailure()"
                [disabled]="!credential.isConfigured()"
                (opened)="retryCatalog()"
                (fallbackSelected)="clearTaskModel(task.id)"
                (modelSelected)="selectTaskModel(task.id, $event)"
                (favoriteToggled)="text.toggleFavorite($event)"
              />
            </mn-settings-row>

            @if (text.routePreset(task.id) !== null) {
              <div class="mn-settings-subrows">
                <mn-settings-row label="Reasoning" [labelId]="'mn-' + task.id + '-reasoning-label'">
                  <select
                    class="mn-control"
                    [attr.aria-labelledby]="'mn-' + task.id + '-reasoning-label'"
                    [ngModel]="text.routePreset(task.id)?.reasoningEffort ?? ''"
                    (change)="setTaskReasoning(task.id, $event)"
                  >
                    <option value="">Automatic</option>
                    @for (effort of reasoningEfforts(routeModel(task.id)); track effort) {
                      <option [value]="effort">{{ titleCase(effort) }}</option>
                    }
                  </select>
                </mn-settings-row>
                <mn-settings-row label="Token limit" [labelId]="'mn-' + task.id + '-limit'">
                  <mn-token-budget-field
                    [labelledBy]="'mn-' + task.id + '-limit'"
                    [value]="text.routeTokenBudget(task.id)"
                    [maxValue]="tokenBudgetMax(routeModel(task.id))"
                    (committed)="setTaskBudget(task.id, $event)"
                  />
                </mn-settings-row>
              </div>
            }
          </div>
        }
      </div>
    </details>
  `,
  styles: `
    :host {
      display: block;
    }
    h3 {
      margin: 0;
    }
    .head-status {
      flex: 0 1 auto;
      justify-content: flex-end;
      flex-wrap: nowrap;
    }
    .branch {
      min-width: 0;
    }
    .branches {
      border-top: 1px solid var(--border-subtle);
    }
    .branches > summary {
      color: var(--text-secondary);
    }
    .branches .mn-settings-subrows .mn-settings-subrows {
      padding-inline-start: var(--space-4);
    }
  `,
})
export class TextModelsComponent {
  private readonly catalog = inject(ModelCatalogView);
  protected readonly credential = inject(CredentialStore);
  protected readonly text = inject(TextModelStore);
  protected readonly branchesOpen = signal(false);
  protected readonly textModels = this.catalog.textModels;
  protected readonly catalogLoading = this.catalog.loading;
  protected readonly catalogFailure = this.catalog.failure;
  protected readonly textTasks = [
    { id: 'translation' as const, label: 'Translation' },
    { id: 'grammar' as const, label: 'Grammar' },
  ];

  protected readonly selectedStoryModel = computed(() =>
    this.modelById(this.text.settings().modelId),
  );
  protected readonly storyTokenBudgetMax = computed(() =>
    this.tokenBudgetMax(this.selectedStoryModel()),
  );
  protected readonly storyModelLabel = computed(
    () =>
      this.text.presets().find((preset) => preset.id === this.text.activePresetId())?.name ?? null,
  );
  protected readonly taskModelsSummary = computed(() =>
    this.textTasks.some((task) => this.text.routePreset(task.id) !== null)
      ? 'Custom models'
      : 'Same model',
  );
  /** The branches open on their own once a learner has set one. */
  protected readonly hasOverrides = computed(
    () => this.text.grammarPresetId() != null || this.text.translationPresetId() != null,
  );

  protected setBranchesOpen(event: Event): void {
    this.branchesOpen.set((event.target as HTMLDetailsElement).open);
  }
  protected retryCatalog(): void {
    this.catalog.retry();
  }

  /**
   * Choosing a model is what makes the previous test meaningless, so the new
   * configuration is tested immediately instead of leaving a button to press.
   */
  protected async selectStoryModel(model: ModelCapabilities): Promise<void> {
    this.text.setDraftModelId(model.modelId);
    await this.text.save();
    await this.text.setReasoningEffort(model.reasoning?.defaultEffort ?? null);
    await this.text.test();
  }
  protected async selectTaskModel(task: TextModelTask, model: ModelCapabilities): Promise<void> {
    const stored = await this.text.setTaskModel(task, {
      modelId: model.modelId,
      name: model.name,
      reasoningEffort: model.reasoning?.defaultEffort ?? null,
    });
    if (stored) await this.text.testTask(task);
  }
  protected clearTaskModel(task: TextModelTask): void {
    void this.text.setTaskModel(task, null);
  }
  protected routeModelId(task: TextModelTask): string {
    return this.text.routePreset(task)?.modelId ?? '';
  }
  protected routeModel(task: TextModelTask): ModelCapabilities | null {
    return this.modelById(this.routeModelId(task));
  }
  protected async setStoryReasoning(event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    await this.text.setReasoningEffort(value || null);
    await this.text.test();
  }
  protected async setTaskReasoning(task: TextModelTask, event: Event): Promise<void> {
    const value = (event.target as HTMLSelectElement).value;
    await this.text.setTaskReasoning(task, value || null);
    await this.text.testTask(task);
  }
  protected saveStoryBudget(tokenBudget: number): void {
    this.text.setStoryTokenBudgetDraft(String(tokenBudget));
    void this.text.saveStoryTokenBudget();
  }
  protected setTaskBudget(task: TextModelTask, tokenBudget: number): void {
    void this.text.setTaskTokenBudget(task, tokenBudget);
  }
  protected reasoningEfforts(model: ModelCapabilities | null): readonly string[] {
    return model?.reasoning?.supportedEfforts ?? ['low', 'medium', 'high'];
  }
  /** Uses the provider-reported limit when available, otherwise stays manual. */
  protected tokenBudgetMax(model: ModelCapabilities | null): number {
    const reported = model?.maxCompletionTokens;
    return reported !== null && reported !== undefined && reported > 0
      ? Math.min(reported, MAX_STORY_TOKEN_BUDGET)
      : MAX_STORY_TOKEN_BUDGET;
  }
  protected titleCase(value: string): string {
    return value.charAt(0).toLocaleUpperCase() + value.slice(1);
  }
  /** Only a configured model that no test vouches for can be retried. */
  protected retestable(readiness: ConfigurationReadiness): boolean {
    return readiness === 'untested' || readiness === 'stale' || readiness === 'failed';
  }
  /** Where a capability stands, as a badge. Never an instruction — that is the
   * button beside it. */
  protected readinessLabel(readiness: ConfigurationReadiness, busy = false): string {
    if (busy) {
      return 'Testing…';
    }
    return {
      ready: 'Ready',
      untested: 'Not tested',
      stale: 'Needs testing',
      failed: 'Test failed',
      'no-credential': 'No key',
      incomplete: 'No model',
    }[readiness];
  }

  protected statusLabel(readiness: ConfigurationReadiness, busy = false): string {
    if (busy) {
      return 'Testing…';
    }
    return {
      ready: 'Ready',
      untested: 'Test now',
      stale: 'Test again',
      failed: 'Failed — retry',
      'no-credential': 'No key',
      incomplete: 'No model',
    }[readiness];
  }
  private modelById(modelId: string): ModelCapabilities | null {
    return this.textModels().find((model) => model.modelId === modelId) ?? null;
  }
}
