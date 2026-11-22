import { Dialog } from '@angular/cdk/dialog';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import type { ModelCapabilities } from '../../../domain/ai/model-catalog';
import { AlphaNoticeDialogComponent } from '../../../shared-ui/alpha-notice-dialog/alpha-notice-dialog.component';
import { ButtonDirective } from '../../../shared-ui/button/button';
import { openConfirmDialog } from '../../../shared-ui/confirm-dialog/confirm-dialog.component';
import { openDialog } from '../../../shared-ui/dialog/dialog';
import { DialogGroupComponent } from '../../../shared-ui/dialog-group/dialog-group.component';
import { openFieldDialog } from '../../../shared-ui/field-dialog/field-dialog.component';
import { IconComponent } from '../../../shared-ui/icon/icon.component';
import { ClusterComponent, PageComponent } from '../../../shared-ui/layout/layout';
import {
  MenuComponent,
  MenuItemDirective,
  MenuTriggerDirective,
} from '../../../shared-ui/menu/menu.component';
import { openModelPicker } from '../../../shared-ui/model-picker/model-picker-dialog.component';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import {
  OverlayTriggerDirective,
  SheetPopoverComponent,
} from '../../../shared-ui/popover/sheet-popover.component';
import { RangeFieldComponent } from '../../../shared-ui/range-field/range-field.component';
import { openRenameDialog } from '../../../shared-ui/rename-dialog/rename-dialog.component';
import { RowComponent } from '../../../shared-ui/row/row.component';
import { SectionComponent } from '../../../shared-ui/section/section.component';
import { SelectComponent, type SelectOption } from '../../../shared-ui/select/select.component';
import { SettingsRowComponent } from '../../../shared-ui/settings-row/settings-row.component';
import { SwitchRowComponent } from '../../../shared-ui/switch-row/switch-row.component';
import { GalleryTaskDialogComponent } from '../gallery-task-dialog.component';

const MODELS: readonly ModelCapabilities[] = [
  model('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 1_048_576, 65_536, true),
  model('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 200_000, 64_000, true),
  model('openai/gpt-5-mini', 'GPT-5 Mini', 400_000, 128_000, true),
  model('deepseek/deepseek-v3.2', 'DeepSeek V3.2', 163_840, null, false),
  model('mistralai/mistral-small-3.2', 'Mistral Small 3.2', 131_072, 16_384, false),
];

function model(
  modelId: string,
  name: string,
  contextLength: number,
  maxCompletionTokens: number | null,
  reasoning: boolean,
): ModelCapabilities {
  return {
    modelId,
    name,
    contextLength,
    maxCompletionTokens,
    inputModalities: ['text'],
    outputModalities: ['text'],
    supportedParameters: [],
    supportedVoices: [],
    reasoning: reasoning
      ? {
          supportedEfforts: ['low', 'medium', 'high'],
          defaultEffort: 'medium',
          defaultEnabled: true,
          mandatory: false,
          supportsMaxTokens: true,
        }
      : null,
  };
}

/**
 * The five overlay kinds. Each is opened by its own control, as on a real
 * screen; the screenshot suite presses each and captures it open.
 */
@Component({
  selector: 'mn-gallery-overlays',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ButtonDirective,
    ClusterComponent,
    DialogGroupComponent,
    IconComponent,
    MenuComponent,
    MenuItemDirective,
    MenuTriggerDirective,
    OverlayTriggerDirective,
    PageComponent,
    PageHeaderComponent,
    RangeFieldComponent,
    RowComponent,
    SectionComponent,
    SelectComponent,
    SettingsRowComponent,
    SheetPopoverComponent,
    SwitchRowComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Overlays" backTo="/gallery" backLabel="Back to gallery" />

      <mn-section heading="Dialogs">
        <mn-cluster>
          <button mnButton type="button" (click)="openTask()">Open task dialog</button>
          <button mnButton type="button" (click)="openPicker()">Open picker</button>
          <button mnButton type="button" (click)="openConfirmation()">Open confirmation</button>
          <button mnButton type="button" (click)="openField()">Open field dialog</button>
          <button mnButton type="button" (click)="openRename()">Open rename dialog</button>
          <button mnButton type="button" (click)="openNotice()">Open notice dialog</button>
          <button mnButton type="button" [mnOverlayTrigger]="sheet" aria-haspopup="dialog">
            Open sheet
          </button>
        </mn-cluster>
      </mn-section>

      <mn-section heading="Menus and dropdowns" [rows]="true">
        <mn-row heading="A walk in the park">
          <span mn-row-meta>420 characters · Short story</span>
          <span mn-row-menu>
            <button
              mnButton="icon"
              type="button"
              aria-haspopup="menu"
              aria-label="Story actions"
              title="Story actions"
              [mnMenuTrigger]="actions"
            >
              <mn-icon name="overflow" />
            </button>
            <mn-menu #actions="mnMenu" [menu]="true" aria-label="Story actions">
              <button mnMenuItem type="button" (click)="actions.hide()">
                <mn-icon name="rename" />
                <span>Rename</span>
              </button>
              <button mnMenuItem type="button" (click)="actions.hide()">
                <mn-icon name="copy" />
                <span>Copy text</span>
              </button>
              <button mnMenuItem="danger" type="button" (click)="actions.hide()">
                <mn-icon name="delete" />
                <span>Delete</span>
              </button>
            </mn-menu>
          </span>
        </mn-row>
        <mn-settings-row label="Pace" labelId="mn-gallery-overlays-pace" end="choice">
          <mn-select
            label="Pace"
            labelledBy="mn-gallery-overlays-pace"
            [options]="paces"
            [value]="pace()"
            (valueChange)="pace.set($event)"
          />
        </mn-settings-row>
      </mn-section>
    </mn-page>

    <mn-sheet-popover
      #sheet="mnSheetPopover"
      heading="Filters"
      role="dialog"
      (dismissed)="sheet.hide()"
    >
      <mn-dialog-group heading="Show">
        <mn-switch-row [checked]="true">Words to learn</mn-switch-row>
        <mn-switch-row>Words you know</mn-switch-row>
        <mn-range-field
          label="Difficulty"
          valueLabel="20–80%"
          [max]="100"
          [value]="20"
          [high]="80"
          lowLabel="Lowest difficulty"
          highLabel="Highest difficulty"
        />
      </mn-dialog-group>
      <button mn-dialog-action="start" mnButton="ghost" type="button">Reset</button>
      <button mn-dialog-action mnButton="primary" type="button" (click)="sheet.hide()">Show</button>
    </mn-sheet-popover>
  `,
})
export class GalleryOverlaysComponent {
  private readonly dialog = inject(Dialog);
  protected readonly paces: readonly SelectOption[] = [
    { value: 'gentle', label: 'Gentle', description: 'One new word per paragraph' },
    { value: 'steady', label: 'Steady', description: 'A few new words per paragraph' },
    { value: 'brisk', label: 'Brisk' },
  ];
  protected readonly pace = signal<string | number>('steady');
  private readonly favourites = signal<readonly string[]>(['google/gemini-2.5-flash']);

  protected openTask(): void {
    openDialog(this.dialog, GalleryTaskDialogComponent, {
      data: null,
      modal: true,
      labelledBy: 'mn-gallery-task-title',
    });
  }

  protected openPicker(): void {
    void openModelPicker(this.dialog, {
      title: 'Text model',
      models: () => MODELS,
      favoriteIds: () => this.favourites(),
      selectedId: () => 'anthropic/claude-haiku-4.5',
      loading: () => false,
      failure: () => null,
      toggleFavorite: (modelId) => {
        this.favourites.update((ids) =>
          ids.includes(modelId) ? ids.filter((id) => id !== modelId) : [...ids, modelId],
        );
      },
    });
  }

  protected openConfirmation(): void {
    void openConfirmDialog(this.dialog, {
      title: 'Delete this story?',
      message: 'This cannot be undone.',
      details: ['Its saved audio goes with it.'],
      confirmLabel: 'Delete',
      cancelLabel: 'Keep story',
      tone: 'danger',
    });
  }

  protected openField(): void {
    void openFieldDialog(this.dialog, {
      title: 'Answer length',
      label: 'Tokens',
      value: '4096',
      hint: 'Up to 65,536 tokens',
      inputMode: 'numeric',
      problem: (entry) => (/^\d+$/.test(entry.trim()) ? null : 'Enter a whole number'),
    });
  }

  protected openRename(): void {
    void openRenameDialog(this.dialog, { currentTitle: 'A walk in the park' });
  }

  protected openNotice(): void {
    openDialog(this.dialog, AlphaNoticeDialogComponent, {
      data: { acknowledge: () => Promise.resolve(true) },
      modal: true,
      role: 'alertdialog',
      labelledBy: 'mn-alpha-title',
      describedBy: 'mn-alpha-message',
      requireAnswer: true,
    });
  }
}
