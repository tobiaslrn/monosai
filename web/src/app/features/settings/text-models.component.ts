import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore, type TextModelTask } from '../../application/settings/text-model.store';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { MAX_STORY_TOKEN_BUDGET } from '../../domain/settings/settings';
import { ButtonDirective } from '../../shared-ui/button/button';
import { DisclosureComponent } from '../../shared-ui/disclosure/disclosure.component';
import { GroupHeaderComponent } from '../../shared-ui/group/group-header.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { ModelCatalogView } from './model-catalog-view';
import { ModelPickerComponent } from '../../shared-ui/model-picker/model-picker.component';
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
    ButtonDirective,
    DisclosureComponent,
    GroupHeaderComponent,
    ModelPickerComponent,
    SettingsRowComponent,
    TokenBudgetFieldComponent,
  ],
  template: `
    <mn-group-header heading="Text" headingId="mn-text-model-label">
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
          [mnButton]="text.readiness() === 'failed' ? 'danger' : 'ghost'"
          data-testid="test-text-model"
          [disabled]="text.action() !== 'idle'"
          (click)="text.test()"
        >
          {{ statusLabel(text.readiness(), text.action() === 'testing') }}
        </button>
      }
    </mn-group-header>

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

    <mn-disclosure
      heading="Translation and grammar"
      tone="quiet"
      testId="task-models-toggle"
      [rows]="true"
      [value]="taskModelsSummary()"
      [open]="hasOverrides() || branchesOpen()"
      (openChange)="branchesOpen.set($event)"
    >
      @for (task of textTasks; track task.id) {
        <div
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
                [mnButton]="text.routeReadiness(task.id) === 'failed' ? 'danger' : 'ghost'"
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
    </mn-disclosure>
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
