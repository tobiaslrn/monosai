import { Dialog } from '@angular/cdk/dialog';
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import type { TextModelPreset, TtsPreset } from '../../domain/settings/settings';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { openAddModelDialog, type AddModelKind } from './add-model-dialog.component';

interface ModelRow {
  readonly key: string;
  readonly name: string;
  readonly modelId: string;
  readonly text: TextModelPreset | null;
  readonly audio: TtsPreset | null;
}

@Component({
  selector: 'mn-models-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [],
  host: {
    '(document:pointerdown)': 'onDocumentPointerDown($event)',
    '(document:keydown.escape)': 'closeAddMenu($event)',
  },
  template: `
    <section class="mn-panel models" aria-labelledby="mn-models-heading">
      <div class="heading-row">
        <h2 id="mn-models-heading">Models</h2>
        <div class="add-menu">
          <button
            #addMenuButton
            type="button"
            class="mn-button add-menu-button"
            popovertarget="mn-add-model-menu"
            aria-haspopup="menu"
            aria-controls="mn-add-model-menu"
            [attr.aria-expanded]="addMenuOpen()"
            data-testid="add-model"
          >
            Add model
          </button>
          <div
            #addMenu
            id="mn-add-model-menu"
            class="menu"
            popover
            role="menu"
            aria-label="Model type"
            (toggle)="onAddMenuToggle($event)"
          >
            <button
              type="button"
              role="menuitem"
              data-testid="add-text-model"
              (click)="add('text')"
            >
              Text model
            </button>
            <button type="button" role="menuitem" data-testid="add-tts-model" (click)="add('tts')">
              Audio model
            </button>
          </div>
        </div>
      </div>

      <details class="key-card mn-disclosure" open>
        <summary>API key</summary>
        <div class="key-controls">
          <p class="mn-visually-hidden" role="status" data-testid="credential-state">
            {{
              credential.isConfigured()
                ? 'Key saved. Monosai does not display saved keys.'
                : 'No key saved.'
            }}
          </p>
          <label class="mn-visually-hidden" for="mn-openrouter-key">API key</label>
          <div class="credential-row">
            <input
              class="mn-control"
              id="mn-openrouter-key"
              type="password"
              autocomplete="off"
              spellcheck="false"
              data-testid="api-key-input"
              [placeholder]="credential.isConfigured() ? '••••••••••••••••' : 'Paste your key'"
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
                Save
              </button>
              @if (credential.isConfigured()) {
                <button
                  type="button"
                  class="mn-button mn-button--danger"
                  data-testid="remove-key"
                  (click)="removeKey()"
                >
                  Remove
                </button>
              }
            </div>
          </div>
        </div>
      </details>

      <section class="defaults" aria-labelledby="mn-defaults-heading">
        <h3 id="mn-defaults-heading">Default models</h3>
        <div class="default-list">
          <label class="default-row">
            <span>Text</span>
            <select
              class="mn-control"
              data-testid="text-preset-select"
              [value]="text.activePresetId() ?? ''"
              (change)="setTextDefault($event)"
            >
              <option value="">Not configured</option>
              @for (preset of text.compatiblePresets(); track preset.id) {
                <option [value]="preset.id">{{ preset.name }}</option>
              }
            </select>
          </label>
          <label class="default-row">
            <span>Audio</span>
            <select
              class="mn-control"
              data-testid="tts-preset-select"
              [value]="tts.activePresetId() ?? ''"
              (change)="setAudioDefault($event)"
            >
              <option value="">Not configured</option>
              @for (preset of tts.compatiblePresets(); track preset.id) {
                <option [value]="preset.id">{{ preset.name }}</option>
              }
            </select>
          </label>
          <label class="default-row">
            <span>Grammar judgement</span>
            <select
              class="mn-control"
              data-testid="default-grammar-model"
              [value]="text.grammarPresetId() ?? ''"
              (change)="setGrammarDefault($event)"
            >
              <option value="">Use default text</option>
              @for (preset of text.compatiblePresets(); track preset.id) {
                <option [value]="preset.id">{{ preset.name }}</option>
              }
            </select>
          </label>
        </div>
      </section>

      @if (rows().length === 0) {
        <p class="empty">No models configured.</p>
      } @else {
        <ul class="model-list" aria-label="Configured models">
          @for (row of rows(); track row.key) {
            <li class="model-row" [attr.data-testid]="'model-row-' + row.key">
              <div class="model-main">
                <div class="model-name">
                  <strong>{{ row.name }}</strong>
                  <div class="badges" aria-label="Capabilities and defaults">
                    @if (row.text) {
                      <span>Story</span><span>Translation</span><span>Grammar</span>
                    }
                    @if (row.audio) {
                      <span>Audio</span>
                    }
                    @if (row.text?.id === text.activePresetId()) {
                      <span class="default">Default text</span>
                    }
                    @if (row.text?.id === text.grammarPresetId()) {
                      <span class="default">Grammar judgement</span>
                    }
                    @if (row.audio?.id === tts.activePresetId()) {
                      <span class="default">Default audio</span>
                    }
                  </div>
                </div>
                <div class="row-actions">
                  @if (row.text) {
                    <span
                      class="mn-visually-hidden"
                      data-capability="text"
                      [attr.data-readiness]="rowReadiness(row, 'text')"
                      >{{ rowReadiness(row, 'text') }}</span
                    >
                    <button
                      type="button"
                      class="mn-button"
                      data-testid="test-text-model"
                      [disabled]="!credential.isConfigured() || testing() !== null"
                      (click)="testText(row)"
                    >
                      {{ testing() === row.key + ':text' ? 'Testing…' : 'Test' }}
                    </button>
                  }
                  @if (row.audio) {
                    <span
                      class="mn-visually-hidden"
                      data-capability="audio"
                      [attr.data-readiness]="rowReadiness(row, 'audio')"
                      >{{ rowReadiness(row, 'audio') }}</span
                    >
                    <button
                      type="button"
                      class="mn-button"
                      data-testid="test-tts"
                      [disabled]="!credential.isConfigured() || testing() !== null"
                      (click)="testAudio(row)"
                    >
                      {{ testing() === row.key + ':audio' ? 'Testing…' : 'Test' }}
                    </button>
                  }
                  <button
                    type="button"
                    class="mn-button"
                    (click)="toggleDetails(row.key)"
                    [attr.aria-expanded]="expanded() === row.key"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="mn-button danger"
                    [attr.data-testid]="row.text ? 'remove-text-model' : 'remove-tts-model'"
                    (click)="remove(row)"
                  >
                    Remove
                  </button>
                </div>
              </div>
              @if (expanded() === row.key) {
                <div class="details">
                  <p>
                    <span>Model ID</span><strong>{{ row.modelId }}</strong>
                  </p>
                  @if (row.text; as textPreset) {
                    <label
                      ><span>Reasoning</span
                      ><input
                        class="mn-control"
                        type="text"
                        [value]="textPreset.reasoningEffort ?? ''"
                        (change)="updateReasoning(textPreset.id, $event)"
                    /></label>
                  }
                  @if (row.audio; as audio) {
                    <label
                      ><span>Voice</span
                      ><input
                        class="mn-control"
                        type="text"
                        [value]="audio.voiceId"
                        (change)="updateVoice(audio.id, $event)"
                    /></label>
                    <label
                      ><span>Speed</span
                      ><input
                        class="mn-control"
                        type="number"
                        min="0.5"
                        max="2"
                        step="0.05"
                        [value]="audio.speed"
                        (change)="updateSpeed(audio.id, $event)"
                    /></label>
                  }
                  @if (row.text && text.testFailure(); as failure) {
                    <p role="alert" class="error">{{ failure.message }}</p>
                  }
                  @if (row.audio && tts.testFailure(); as failure) {
                    <p role="alert" class="error">{{ failure.message }}</p>
                  }
                </div>
              }
            </li>
          }
        </ul>
      }

      <details class="key-card mn-disclosure">
        <summary>Generation settings</summary>
        <div class="key-controls">
          <div class="budget-setting">
            <label for="mn-story-token-budget">Story token budget</label>
            <input
              id="mn-story-token-budget"
              class="mn-control"
              type="number"
              min="4096"
              max="32768"
              step="1"
              data-testid="story-token-budget-input"
              [value]="text.storyTokenBudgetDraft()"
              [attr.aria-invalid]="!text.isStoryTokenBudgetValid()"
              (input)="setBudget($event)"
            />
            <button
              type="button"
              class="mn-button"
              data-testid="save-story-token-budget"
              [disabled]="!text.isStoryTokenBudgetValid() || !text.hasUnsavedStoryTokenBudget()"
              (click)="saveBudget()"
            >
              Save
            </button>
          </div>
        </div>
      </details>
    </section>
  `,
  styles: `
    .models {
      gap: var(--space-4);
    }
    .heading-row,
    .model-main,
    .row-actions,
    .actions {
      display: flex;
      align-items: center;
      gap: var(--space-2);
    }
    .heading-row,
    .model-main {
      justify-content: space-between;
    }
    h2,
    h3,
    p {
      margin: 0;
    }
    .add-menu {
      display: flex;
    }
    .add-menu-button {
      anchor-name: --mn-add-model-anchor;
    }
    .menu {
      position: absolute;
      position-anchor: --mn-add-model-anchor;
      position-area: bottom span-left;
      z-index: 3;
      inset: auto;
      min-width: 11rem;
      margin: var(--space-1) 0 0;
      padding: var(--space-1);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }
    .menu:not(:popover-open) {
      display: none;
    }
    .menu button {
      width: 100%;
      min-height: var(--touch-target);
      padding: var(--space-2);
      border: 0;
      border-radius: var(--radius-control);
      background: none;
      color: inherit;
      font: inherit;
      text-align: left;
      cursor: pointer;
    }
    .menu button:hover,
    .menu button:focus-visible {
      background: var(--surface-sunken);
    }
    .key-card,
    .defaults {
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
    }
    .key-card summary {
      min-height: var(--touch-target);
      cursor: pointer;
      font-weight: 700;
    }
    .key-controls {
      display: grid;
      gap: var(--space-2);
      padding-top: var(--space-2);
    }
    .credential-row {
      display: grid;
      grid-template-columns: minmax(12rem, 1fr) auto;
      gap: var(--space-2);
      align-items: center;
    }
    .budget-setting {
      display: grid;
      grid-template-columns: auto minmax(8rem, 10rem) auto;
      gap: var(--space-2);
      align-items: center;
      justify-content: start;
    }
    .default-list {
      display: grid;
      margin: var(--space-2) calc(-1 * var(--space-3)) calc(-1 * var(--space-3));
    }
    .default-row {
      display: grid;
      grid-template-columns: minmax(10rem, 1fr) minmax(14rem, 20rem);
      gap: var(--space-3);
      align-items: center;
      padding: var(--space-3);
      border-top: 1px solid var(--border-subtle);
    }
    .default-row > span {
      font-weight: 600;
    }
    .model-list {
      display: grid;
      gap: var(--space-2);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .model-row {
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
    }
    .model-name {
      min-width: 0;
    }
    .badges {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1);
      margin-top: var(--space-1);
    }
    .badges span {
      padding: 0.15rem 0.5rem;
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
    .badges .default {
      background: var(--action-primary-soft);
      color: var(--action-primary);
      font-weight: 700;
    }
    .details {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      margin-top: var(--space-3);
      padding-top: var(--space-3);
      border-top: 1px solid var(--border-subtle);
    }
    .details p,
    .details label {
      display: grid;
      gap: var(--space-1);
      min-width: 8rem;
    }
    .details span {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
    .details strong {
      overflow-wrap: anywhere;
    }
    .danger,
    .error {
      color: var(--status-danger);
    }
    .empty {
      padding: var(--space-4);
      color: var(--text-secondary);
      text-align: center;
    }
    @media (max-width: 42rem) {
      .default-row {
        grid-template-columns: 1fr;
        gap: var(--space-1);
      }
      .model-main {
        align-items: flex-start;
        flex-direction: column;
      }
      .credential-row {
        grid-template-columns: 1fr;
      }
    }
    @media (max-width: 30rem) {
      .budget-setting {
        grid-template-columns: minmax(0, 1fr) auto;
      }
      .budget-setting label {
        grid-column: 1 / -1;
      }
    }
  `,
})
export class ModelsSectionComponent {
  private readonly dialog = inject(Dialog);
  protected readonly credential = inject(CredentialStore);
  protected readonly text = inject(TextModelStore);
  protected readonly tts = inject(TtsStore);
  protected readonly keyDraft = signal('');
  protected readonly expanded = signal<string | null>(null);
  protected readonly testing = signal<string | null>(null);
  protected readonly addMenuOpen = signal(false);
  private readonly addMenu = viewChild.required<ElementRef<HTMLElement>>('addMenu');
  private readonly addMenuButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('addMenuButton');

  protected readonly rows = computed<readonly ModelRow[]>(() => {
    const rows = new Map<string, ModelRow>();
    for (const preset of this.text.presets()) {
      rows.set(preset.modelId, {
        key: preset.modelId.replaceAll('/', '-'),
        name: preset.name,
        modelId: preset.modelId,
        text: preset,
        audio: null,
      });
    }
    for (const preset of this.tts.presets()) {
      const prior = rows.get(preset.modelId);
      rows.set(
        preset.modelId,
        prior === undefined
          ? {
              key: preset.modelId.replaceAll('/', '-'),
              name: preset.name,
              modelId: preset.modelId,
              text: null,
              audio: preset,
            }
          : { ...prior, audio: preset },
      );
    }
    return [...rows.values()];
  });

  protected onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
  }
  protected saveKey(): void {
    const value = this.keyDraft();
    this.keyDraft.set('');
    void this.credential.save(value);
  }
  protected async removeKey(): Promise<void> {
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Remove API key?',
      message: 'AI requests will be unavailable until another key is saved.',
      details: ['Configured models and saved content stay on this device.'],
      confirmLabel: 'Remove key',
      cancelLabel: 'Keep key',
      tone: 'danger',
    });
    if (confirmed) await this.credential.remove();
  }
  protected async add(kind: AddModelKind): Promise<void> {
    this.hideAddMenu();
    const result = await openAddModelDialog(this.dialog, { kind });
    if (result?.kind === 'text') await this.text.registerPreset(result.preset);
    if (result?.kind === 'tts') await this.tts.registerPreset(result.preset);
  }

  protected onAddMenuToggle(event: Event): void {
    this.addMenuOpen.set((event.currentTarget as HTMLElement).matches(':popover-open'));
  }

  protected closeAddMenu(event: Event): void {
    const menu = this.addMenu().nativeElement;
    if (!menu.matches(':popover-open')) {
      return;
    }
    event.preventDefault();
    this.hideAddMenu();
  }

  protected onDocumentPointerDown(event: PointerEvent): void {
    const menu = this.addMenu().nativeElement;
    if (!menu.matches(':popover-open') || !(event.target instanceof Node)) {
      return;
    }
    if (menu.contains(event.target) || this.addMenuButton().nativeElement.contains(event.target)) {
      return;
    }
    this.hideAddMenu();
  }

  private hideAddMenu(): void {
    const menu = this.addMenu().nativeElement;
    if (typeof menu.hidePopover === 'function' && menu.matches(':popover-open')) {
      menu.hidePopover();
    }
  }
  protected setTextDefault(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) void this.text.selectPreset(id);
  }
  protected setAudioDefault(event: Event): void {
    const id = (event.target as HTMLSelectElement).value;
    if (id) void this.tts.selectPreset(id);
  }
  protected setGrammarDefault(event: Event): void {
    void this.text.setGrammarPreset((event.target as HTMLSelectElement).value || null);
  }
  protected setBudget(event: Event): void {
    this.text.setStoryTokenBudgetDraft((event.target as HTMLInputElement).value);
  }
  protected saveBudget(): void {
    void this.text.saveStoryTokenBudget();
  }
  protected updateReasoning(id: string, event: Event): void {
    const value = (event.target as HTMLInputElement).value.trim();
    void this.text.updatePreset(id, { reasoningEffort: value || null });
  }
  protected updateVoice(id: string, event: Event): void {
    void this.tts.updatePreset(id, { voiceId: (event.target as HTMLInputElement).value.trim() });
  }
  protected updateSpeed(id: string, event: Event): void {
    void this.tts.updatePreset(id, { speed: Number((event.target as HTMLInputElement).value) });
  }
  protected toggleDetails(key: string): void {
    this.expanded.update((value) => (value === key ? null : key));
  }
  protected async testText(row: ModelRow): Promise<void> {
    if (!row.text) return;
    this.testing.set(row.key + ':text');
    try {
      await this.text.testPreset(row.text.id);
    } finally {
      this.testing.set(null);
      this.expanded.set(row.key);
    }
  }
  protected async testAudio(row: ModelRow): Promise<void> {
    if (!row.audio) return;
    this.testing.set(row.key + ':audio');
    try {
      await this.tts.testPreset(row.audio.id);
    } finally {
      this.testing.set(null);
      this.expanded.set(row.key);
    }
  }
  protected rowReadiness(row: ModelRow, capability: 'text' | 'audio'): string {
    if (!this.credential.isConfigured()) return 'not-configured';
    if (capability === 'text') {
      if (row.text && this.text.compatiblePresets().some((item) => item.id === row.text?.id))
        return 'ready';
      if (this.text.testFailure() !== null) return 'failed';
      return row.text?.lastTestFingerprint ? 'stale' : 'untested';
    }
    if (row.audio && this.tts.compatiblePresets().some((item) => item.id === row.audio?.id))
      return 'ready';
    if (this.tts.testFailure() !== null) return 'failed';
    return row.audio?.lastTestFingerprint ? 'stale' : 'untested';
  }
  protected async remove(row: ModelRow): Promise<void> {
    const affectsDefault =
      row.text?.id === this.text.activePresetId() ||
      row.audio?.id === this.tts.activePresetId() ||
      row.text?.id === this.text.grammarPresetId();
    const confirmed = await openConfirmDialog(this.dialog, {
      title: `Remove ${row.name}?`,
      message: affectsDefault
        ? 'This model is a default. The affected default will be left unconfigured.'
        : 'This removes the configured model from this device.',
      details: [row.modelId, 'Saved stories, aids, and audio stay.'],
      confirmLabel: 'Remove model',
      cancelLabel: 'Keep model',
      tone: 'danger',
    });
    if (!confirmed) return;
    if (row.text) await this.text.removePreset(row.text.id);
    if (row.audio) await this.tts.removePreset(row.audio.id);
  }
}
