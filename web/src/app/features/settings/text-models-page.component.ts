import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore, type TextModelTask } from '../../application/settings/text-model.store';
import type { AiError } from '../../domain/ai/ai-error';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { formatCount } from '../../domain/shared/locale';
import { MAX_STORY_TOKEN_BUDGET } from '../../domain/settings/settings';
import { PageComponent } from '../../shared-ui/layout/layout';
import { ModelPickerComponent } from '../../shared-ui/model-picker/model-picker.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import {
  SelectComponent,
  type SelectOption,
  type SelectValue,
} from '../../shared-ui/select/select.component';
import { SettingsRowComponent } from '../../shared-ui/settings-row/settings-row.component';
import {
  StatusLineComponent,
  type StatusTone,
} from '../../shared-ui/status-line/status-line.component';
import { ModelCatalogView } from './model-catalog-view';
import { reasoningOptions } from './reasoning-options';
import { TokenBudgetFieldComponent } from './token-budget-field.component';

/** What a group says about itself under its card: its tone, its words, and the one way to act. */
interface GroupStatus {
  readonly tone: StatusTone;
  readonly text: string;
  readonly action: string | null;
}

/**
 * The text model and the two tasks that may have a model of their own.
 *
 * One model answers for everything by default. Translation and grammar each
 * show the model that will actually run, and carry their own reasoning and
 * limit only once the learner has chosen one for them. Nothing here has a Test
 * button: choosing a model or changing how it thinks is what makes a test
 * necessary, so the test runs then, and the line under each group is the retry
 * when it did not pass.
 */
@Component({
  selector: 'mn-text-models-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ModelPickerComponent,
    PageComponent,
    PageHeaderComponent,
    RouterLink,
    SectionComponent,
    SelectComponent,
    SettingsRowComponent,
    StatusLineComponent,
    TokenBudgetFieldComponent,
  ],
  providers: [ModelCatalogView],
  template: `
    <mn-page>
      <mn-page-header heading="Text models" backTo="/settings" backLabel="Back to settings" />

      <mn-section
        heading="Text model"
        [rows]="true"
        data-capability="text"
        [attr.data-readiness]="text.readiness()"
      >
        <mn-settings-row label="Model" labelId="mn-text-model-row-label" end="choice">
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

        <mn-settings-row label="Reasoning" labelId="mn-text-reasoning-label" end="choice">
          <mn-select
            label="Reasoning"
            labelledBy="mn-text-reasoning-label"
            [options]="storyReasoningOptions()"
            [disabled]="!credential.isConfigured()"
            [value]="text.settings().reasoningEffort ?? ''"
            (valueChange)="setStoryReasoning($event)"
          />
        </mn-settings-row>

        <mn-settings-row
          label="Token limit"
          labelId="mn-text-limit-label"
          end="control"
          [summary]="budgetHint(storyTokenBudgetMax())"
        >
          <mn-token-budget-field
            testId="story-token-budget-input"
            labelledBy="mn-text-limit-label"
            [value]="text.settings().storyTokenBudget"
            [maxValue]="storyTokenBudgetMax()"
            [disabled]="!credential.isConfigured()"
            (committed)="saveStoryBudget($event)"
          />
        </mn-settings-row>

        @if (!credential.isConfigured()) {
          <mn-status-line mn-section-footer tone="warning">
            Needs a key.
            <a mn-status-line-action routerLink="/settings">Open Settings</a>
          </mn-status-line>
        } @else if (textStatus(); as status) {
          <mn-status-line mn-section-footer data-testid="text-readiness" [tone]="status.tone">
            {{ status.text }}
            @if (status.action; as action) {
              <button
                mn-status-line-action
                type="button"
                data-testid="test-text-model"
                (click)="text.test()"
              >
                {{ action }}
              </button>
            }
          </mn-status-line>
        }
      </mn-section>

      @for (task of textTasks; track task.id) {
        <mn-section
          [heading]="task.label"
          [rows]="true"
          [attr.data-capability]="task.id"
          [attr.data-readiness]="
            text.routePreset(task.id) === null ? 'inherited' : text.routeReadiness(task.id)
          "
        >
          <mn-settings-row label="Model" end="choice" [labelId]="'mn-' + task.id + '-model-label'">
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
            <mn-settings-row
              label="Reasoning"
              end="choice"
              [labelId]="'mn-' + task.id + '-reasoning-label'"
            >
              <mn-select
                label="Reasoning"
                [labelledBy]="'mn-' + task.id + '-reasoning-label'"
                [options]="reasoningOptions(routeModel(task.id))"
                [value]="text.routePreset(task.id)?.reasoningEffort ?? ''"
                (valueChange)="setTaskReasoning(task.id, $event)"
              />
            </mn-settings-row>
            <mn-settings-row
              label="Token limit"
              end="control"
              [labelId]="'mn-' + task.id + '-limit'"
              [summary]="budgetHint(tokenBudgetMax(routeModel(task.id)))"
            >
              <mn-token-budget-field
                [labelledBy]="'mn-' + task.id + '-limit'"
                [value]="text.routeTokenBudget(task.id)"
                [maxValue]="tokenBudgetMax(routeModel(task.id))"
                (committed)="setTaskBudget(task.id, $event)"
              />
            </mn-settings-row>
          }
          @if (taskStatus(task.id); as status) {
            <mn-status-line
              mn-section-footer
              [attr.data-testid]="task.id + '-readiness'"
              [tone]="status.tone"
            >
              {{ status.text }}
              @if (status.action; as action) {
                <button
                  mn-status-line-action
                  type="button"
                  data-testid="test-text-model"
                  (click)="text.testTask(task.id)"
                >
                  {{ action }}
                </button>
              }
            </mn-status-line>
          }
        </mn-section>
      }
    </mn-page>
  `,
})
export class TextModelsPageComponent {
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
  /** Said in the picker's value: the model in force, as what it is — the text model's. */
  protected readonly inheritedLabel = computed(() => {
    const name = this.inheritedName();
    return name === null ? 'Same as text model' : `Same as text model · ${name}`;
  });

  protected readonly textStatus = computed(() =>
    this.statusOf(
      this.text.readiness(),
      this.text.action() === 'testing',
      this.text.testFailure(),
      'Ready. Used for stories, and for translation and grammar unless they have their own.',
    ),
  );

  /** A task that has no model of its own shows the text model's line, so it has none. */
  protected taskStatus(task: TextModelTask): GroupStatus | null {
    if (this.text.routePreset(task) === null) return null;
    return this.statusOf(
      this.text.routeReadiness(task),
      this.text.action() === 'testing',
      this.text.routeFailure(task),
      'Ready.',
    );
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

  /**
   * What a group says about itself under its card. Only a configured model that
   * no test vouches for can be retried, and the retry is the line's one link.
   */
  private statusOf(
    readiness: ConfigurationReadiness,
    testing: boolean,
    failure: AiError | null,
    readyLine: string,
  ): GroupStatus | null {
    if (testing) {
      return { tone: 'info', text: 'Testing…', action: null };
    }
    switch (readiness) {
      case 'ready':
        return { tone: 'success', text: readyLine, action: null };
      case 'untested':
        return { tone: 'warning', text: 'Not tested.', action: 'Test now' };
      case 'stale':
        return {
          tone: 'warning',
          text: 'Settings changed since the last test.',
          action: 'Test again',
        };
      case 'failed':
        return {
          tone: 'danger',
          text: failure === null ? 'Test failed.' : `Test failed. ${failure.message}`,
          action: 'Test again',
        };
      case 'no-credential':
      case 'incomplete':
        return null;
    }
  }

  private modelById(modelId: string): ModelCapabilities | null {
    return this.textModels().find((model) => model.modelId === modelId) ?? null;
  }
}
