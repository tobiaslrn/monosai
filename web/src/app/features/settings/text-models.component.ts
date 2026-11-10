import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore, type TextModelTask } from '../../application/settings/text-model.store';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { formatCount } from '../../domain/shared/locale';
import { MAX_STORY_TOKEN_BUDGET } from '../../domain/settings/settings';
import { ButtonDirective } from '../../shared-ui/button/button';
import { GroupHeaderComponent } from '../../shared-ui/group/group-header.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import { ModelCatalogView } from './model-catalog-view';
import { ModelPickerComponent } from '../../shared-ui/model-picker/model-picker.component';
import {
  SelectComponent,
  type SelectOption,
  type SelectValue,
} from '../../shared-ui/select/select.component';
import { reasoningOptions } from './reasoning-options';
import { TokenBudgetFieldComponent } from './token-budget-field.component';

/**
 * The text model and the two tasks that may have a model of their own.
 *
 * One model answers for everything by default. Translation and grammar each
 * show the model that will actually run, and carry their own reasoning and
 * limit only once the learner has chosen one for them.
 */
@Component({
  selector: 'mn-text-models',
  host: {
    class: 'node mn-settings-group',
    role: 'region',
    'aria-labelledby': 'mn-text-model-label',
    'data-capability': 'text',
    '[attr.data-readiness]': 'groupReadiness()',
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    GroupHeaderComponent,
    ModelPickerComponent,
    SelectComponent,
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

    <mn-settings-row label="Model" labelId="mn-text-model-row-label">
      <mn-model-picker
        data-testid="text-model-picker"
        label="text models"
        labelledBy="mn-text-model-row-label"
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
      <mn-select
        label="Reasoning"
        labelledBy="mn-text-reasoning-label"
        [options]="storyReasoningOptions()"
        [disabled]="!credential.isConfigured()"
        [value]="text.settings().reasoningEffort ?? ''"
        (valueChange)="setStoryReasoning($event)"
      />
    </mn-settings-row>

    <mn-settings-row label="Token limit" labelId="mn-text-limit-label">
      <span mn-settings-row-note class="mn-settings-row__note">{{
        budgetHint(storyTokenBudgetMax())
      }}</span>
      <mn-token-budget-field
        testId="story-token-budget-input"
        labelledBy="mn-text-limit-label"
        [value]="text.settings().storyTokenBudget"
        [maxValue]="storyTokenBudgetMax()"
        [disabled]="!credential.isConfigured()"
        (committed)="saveStoryBudget($event)"
      />
    </mn-settings-row>

    @for (task of textTasks; track task.id) {
      <div
        class="mn-settings-cluster"
        [attr.aria-labelledby]="'mn-' + task.id + '-label'"
        [attr.data-capability]="task.id"
        [attr.data-readiness]="
          text.routePreset(task.id) === null ? 'inherited' : text.routeReadiness(task.id)
        "
      >
        <mn-group-header [heading]="task.label" [headingId]="'mn-' + task.id + '-label'">
          @if (text.routePreset(task.id) === null) {
            <span class="mn-status-pill" [attr.data-testid]="task.id + '-readiness'"
              >Uses text model</span
            >
          } @else {
            <span
              class="mn-status-pill"
              [class.mn-status-pill--success]="text.routeReadiness(task.id) === 'ready'"
              [class.mn-status-pill--danger]="text.routeReadiness(task.id) === 'failed'"
              [attr.data-testid]="task.id + '-readiness'"
              >{{ readinessLabel(text.routeReadiness(task.id), text.action() === 'testing') }}</span
            >
            @if (retestable(text.routeReadiness(task.id))) {
              <button
                type="button"
                [mnButton]="text.routeReadiness(task.id) === 'failed' ? 'danger' : 'ghost'"
                data-testid="test-text-model"
                [disabled]="text.action() !== 'idle'"
                (click)="text.testTask(task.id)"
              >
                {{ statusLabel(text.routeReadiness(task.id), text.action() === 'testing') }}
              </button>
            }
          }
        </mn-group-header>

        <mn-settings-row label="Model" [labelId]="'mn-' + task.id + '-model-label'">
          @if (text.routePreset(task.id) === null && inheritedName() !== null) {
            <span mn-settings-row-note class="mn-settings-row__note">Same as the text model</span>
          }
          <mn-model-picker
            [attr.data-testid]="task.id + '-model-picker'"
            [label]="task.id + ' models'"
            [labelledBy]="'mn-' + task.id + '-model-label'"
            fallbackLabel="Use the text model"
            [inheritedLabel]="inheritedLabel()"
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
          <mn-settings-row label="Reasoning" [labelId]="'mn-' + task.id + '-reasoning-label'">
            <mn-select
              label="Reasoning"
              [labelledBy]="'mn-' + task.id + '-reasoning-label'"
              [options]="reasoningOptions(routeModel(task.id))"
              [value]="text.routePreset(task.id)?.reasoningEffort ?? ''"
              (valueChange)="setTaskReasoning(task.id, $event)"
            />
          </mn-settings-row>
          <mn-settings-row label="Token limit" [labelId]="'mn-' + task.id + '-limit'">
            <span mn-settings-row-note class="mn-settings-row__note">{{
              budgetHint(tokenBudgetMax(routeModel(task.id)))
            }}</span>
            <mn-token-budget-field
              [labelledBy]="'mn-' + task.id + '-limit'"
              [value]="text.routeTokenBudget(task.id)"
              [maxValue]="tokenBudgetMax(routeModel(task.id))"
              (committed)="setTaskBudget(task.id, $event)"
            />
          </mn-settings-row>
        }
      </div>
    }
  `,
})
export class TextModelsComponent {
  private readonly catalog = inject(ModelCatalogView);
  protected readonly credential = inject(CredentialStore);
  protected readonly text = inject(TextModelStore);
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
  protected readonly storyReasoningOptions = computed(() =>
    this.reasoningOptions(this.selectedStoryModel()),
  );
  protected readonly storyTokenBudgetMax = computed(() =>
    this.tokenBudgetMax(this.selectedStoryModel()),
  );
  protected readonly storyModelLabel = computed(
    () =>
      this.text.presets().find((preset) => preset.id === this.text.activePresetId())?.name ?? null,
  );
  /** The model a translation or grammar task that has none of its own will actually run. */
  protected readonly inheritedName = computed(() => {
    const name = this.storyModelLabel() ?? this.selectedStoryModel()?.name ?? '';
    return name === '' ? null : name;
  });
  /** Said in the picker's trigger, muted: the value in force, not a label for inheriting. */
  protected readonly inheritedLabel = computed(() => this.inheritedName() ?? 'Same as text model');
  /**
   * Where the group stands across all three routes: the worst of the text model
   * and any translation or grammar model of its own, so a route that failed its
   * test is not hidden behind a text model that passed.
   */
  protected readonly groupReadiness = computed<ConfigurationReadiness>(() => {
    const own = this.textTasks
      .filter((task) => this.text.routePreset(task.id) !== null)
      .map((task) => this.text.routeReadiness(task.id));
    const all = [this.text.readiness(), ...own];
    return (
      (['failed', 'stale', 'untested'] as const).find((worst) => all.includes(worst)) ??
      this.text.readiness()
    );
  });

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
  protected async setStoryReasoning(value: SelectValue): Promise<void> {
    await this.text.setReasoningEffort(String(value) || null);
    await this.text.test();
  }
  protected async setTaskReasoning(task: TextModelTask, value: SelectValue): Promise<void> {
    await this.text.setTaskReasoning(task, String(value) || null);
    await this.text.testTask(task);
  }
  protected saveStoryBudget(tokenBudget: number): void {
    this.text.setStoryTokenBudgetDraft(String(tokenBudget));
    void this.text.saveStoryTokenBudget();
  }
  protected setTaskBudget(task: TextModelTask, tokenBudget: number): void {
    void this.text.setTaskTokenBudget(task, tokenBudget);
  }
  protected reasoningOptions(model: ModelCapabilities | null): readonly SelectOption<string>[] {
    return reasoningOptions(model?.reasoning?.supportedEfforts ?? ['low', 'medium', 'high']);
  }
  /** Uses the provider-reported limit when available, otherwise stays manual. */
  protected tokenBudgetMax(model: ModelCapabilities | null): number {
    const reported = model?.maxCompletionTokens;
    return reported !== null && reported !== undefined && reported > 0
      ? Math.min(reported, MAX_STORY_TOKEN_BUDGET)
      : MAX_STORY_TOKEN_BUDGET;
  }
  protected budgetHint(max: number): string {
    return `Up to ${formatCount(max)} tokens`;
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
