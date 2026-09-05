import { Dialog } from '@angular/cdk/dialog';
import { DOCUMENT } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { CredentialStore } from '../../application/settings/credential.store';
import { TextModelStore, type TextModelTask } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { MODEL_CATALOG } from '../../application/shared/ai-tokens';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { ModelCapabilities } from '../../domain/ai/model-catalog';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { ModelPickerComponent } from './model-picker.component';
import { SpeedFieldComponent } from './speed-field.component';
import { TokenBudgetFieldComponent } from './token-budget-field.component';

/**
 * Every state the audio configuration can be in, as one surface has to say it.
 *
 * Readiness plus the two states a test itself is in, so nothing on screen has
 * to combine three signals to answer "can this read to me yet".
 */
export type AudioStatus = ConfigurationReadiness | 'testing' | 'cancelled';

/**
 * The AI configuration, shaped as the tree it actually is.
 *
 * One text model answers for everything by default; translation and grammar
 * review are branches of it that exist only when a learner deliberately opens
 * them. Nothing here has a Test button: choosing a model or changing how it
 * thinks is what makes a test necessary, so the test runs then, and the status
 * beside the model doubles as the retry when it did not pass.
 */
@Component({
  selector: 'mn-models-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ModelPickerComponent, SpeedFieldComponent, TokenBudgetFieldComponent],
  host: {
    '(document:pointerdown)': 'closeConnectionMenuFromOutside($event)',
    '(document:keydown.escape)': 'connectionMenuOpen.set(false)',
  },
  template: `
    <section class="mn-panel models" aria-labelledby="mn-models-heading">
      <header class="section-head">
        <h2 id="mn-models-heading">AI &amp; generation</h2>
        <div class="connection">
          <button
            #connectionButton
            type="button"
            class="mn-button connection-button"
            data-testid="connect-openrouter"
            [class.mn-button--primary]="!credential.isConfigured()"
            [attr.aria-expanded]="connectionMenuOpen()"
            aria-haspopup="dialog"
            (click)="toggleConnectionMenu()"
          >
            <span class="connection-dot" [class.connected]="credential.isConfigured()"></span>
            {{ credential.isConfigured() ? 'OpenRouter connected' : 'Connect OpenRouter' }}
            <svg
              class="chevron"
              [class.chevron--up]="connectionMenuOpen()"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="M4 6.5 8 10.5 12 6.5"
                fill="none"
                stroke="currentColor"
                stroke-width="1.75"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
          @if (connectionMenuOpen()) {
            <div
              #connectionMenu
              class="connection-menu"
              role="dialog"
              aria-label="OpenRouter connection"
            >
              <label class="mn-field">
                <span>{{ credential.isConfigured() ? 'Replace API key' : 'API key' }}</span>
                <input
                  class="mn-control"
                  type="password"
                  autocomplete="off"
                  spellcheck="false"
                  data-testid="api-key-input"
                  placeholder="sk-or-…"
                  [value]="keyDraft()"
                  (input)="onKeyInput($event)"
                />
              </label>
              <div class="connection-actions">
                <button
                  type="button"
                  class="mn-button mn-button--primary"
                  data-testid="save-key"
                  [disabled]="keyDraft().trim() === '' || credential.action() !== 'idle'"
                  (click)="saveKey()"
                >
                  {{ credential.isConfigured() ? 'Replace key' : 'Connect' }}
                </button>
                @if (credential.isConfigured()) {
                  <button type="button" class="mn-button mn-button--danger" (click)="removeKey()">
                    Delete key
                  </button>
                }
              </div>
            </div>
          }
        </div>
      </header>

      <div class="tree">
        <section
          class="node"
          aria-labelledby="mn-text-model-label"
          data-capability="text"
          [attr.data-readiness]="text.readiness()"
        >
          <div class="node-head">
            <h3 id="mn-text-model-label">Text</h3>
            @if (retestable(text.readiness())) {
              <button
                type="button"
                class="status status--action"
                data-testid="test-text-model"
                [disabled]="text.action() !== 'idle'"
                (click)="text.test()"
              >
                {{ statusLabel(text.readiness(), text.action() === 'testing') }}
              </button>
            } @else if (text.readiness() === 'ready') {
              <span class="status status--ok">Ready</span>
            }
          </div>

          <mn-model-picker
            class="picker"
            data-testid="text-model-picker"
            label="text models"
            [models]="textModels()"
            [favoriteIds]="text.favoriteModelIds()"
            [selectedId]="text.settings().modelId"
            [selectedLabel]="storyModelLabel()"
            [loading]="catalogLoading()"
            [failure]="catalogFailure()"
            [disabled]="!credential.isConfigured()"
            (opened)="loadCatalog()"
            (modelSelected)="selectStoryModel($event)"
            (favoriteToggled)="text.toggleFavorite($event)"
          />

          <div class="options">
            <label class="option">
              <span>Reasoning</span>
              <select
                class="mn-control"
                [disabled]="!credential.isConfigured()"
                [ngModel]="text.settings().reasoningEffort ?? ''"
                (change)="setStoryReasoning($event)"
              >
                <option value="">Automatic</option>
                @for (effort of reasoningEfforts(selectedStoryModel()); track effort) {
                  <option [value]="effort">{{ titleCase(effort) }}</option>
                }
              </select>
            </label>
            <div class="option">
              <span id="mn-text-limit-label">Token limit</span>
              <mn-token-budget-field
                testId="story-token-budget-input"
                labelledBy="mn-text-limit-label"
                [value]="text.settings().storyTokenBudget"
                [disabled]="!credential.isConfigured()"
                (committed)="saveStoryBudget($event)"
              />
            </div>
          </div>

          <details class="mn-disclosure branches" [open]="hasOverrides()">
            <summary data-testid="task-models-toggle">
              Separate models for translation and grammar
            </summary>
            @for (task of textTasks; track task.id) {
              <div
                class="branch"
                [attr.aria-labelledby]="'mn-' + task.id + '-label'"
                [attr.data-capability]="task.id"
                [attr.data-readiness]="
                  text.routePreset(task.id) === null ? 'inherited' : text.routeReadiness(task.id)
                "
              >
                <div class="node-head">
                  <h4 [id]="'mn-' + task.id + '-label'">{{ task.label }}</h4>
                  @if (
                    text.routePreset(task.id) !== null && retestable(text.routeReadiness(task.id))
                  ) {
                    <button
                      type="button"
                      class="status status--action"
                      data-testid="test-text-model"
                      [disabled]="text.action() !== 'idle'"
                      (click)="text.testTask(task.id)"
                    >
                      {{ statusLabel(text.routeReadiness(task.id), text.action() === 'testing') }}
                    </button>
                  } @else if (
                    text.routePreset(task.id) !== null && text.routeReadiness(task.id) === 'ready'
                  ) {
                    <span class="status status--ok">Ready</span>
                  }
                </div>

                <mn-model-picker
                  class="picker"
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
                  (opened)="loadCatalog()"
                  (fallbackSelected)="clearTaskModel(task.id)"
                  (modelSelected)="selectTaskModel(task.id, $event)"
                  (favoriteToggled)="text.toggleFavorite($event)"
                />

                @if (text.routePreset(task.id) !== null) {
                  <div class="options">
                    <label class="option">
                      <span>Reasoning</span>
                      <select
                        class="mn-control"
                        [ngModel]="text.routePreset(task.id)?.reasoningEffort ?? ''"
                        (change)="setTaskReasoning(task.id, $event)"
                      >
                        <option value="">Automatic</option>
                        @for (effort of reasoningEfforts(routeModel(task.id)); track effort) {
                          <option [value]="effort">{{ titleCase(effort) }}</option>
                        }
                      </select>
                    </label>
                    <div class="option">
                      <span [id]="'mn-' + task.id + '-limit'">Token limit</span>
                      <mn-token-budget-field
                        [labelledBy]="'mn-' + task.id + '-limit'"
                        [value]="text.routeTokenBudget(task.id)"
                        (committed)="setTaskBudget(task.id, $event)"
                      />
                    </div>
                  </div>
                }
              </div>
            }
          </details>
        </section>

        <section
          class="node"
          aria-labelledby="mn-audio-model-label"
          data-capability="audio"
          [attr.data-readiness]="tts.readiness()"
        >
          <div class="node-head">
            <h3 id="mn-audio-model-label">Audio</h3>
            <!--
              The same two answers the Text head gives — where this stands, and
              the press that moves it on — because a speech model that has never
              been previewed looks identical to one that has, and only the
              second of them can be generated with.
            -->
            <div class="head-status">
              <span
                class="status"
                [class.status--ok]="tts.readiness() === 'ready'"
                [class.status--bad]="audioStatus() === 'failed'"
                data-testid="audio-readiness"
                [title]="audioStatusTitle()"
                >{{ audioStatusLabel() }}</span
              >
              @if (tts.action() === 'testing') {
                <button
                  type="button"
                  class="status status--action"
                  data-testid="cancel-tts-test"
                  (click)="tts.cancelTest()"
                >
                  Stop
                </button>
              } @else {
                <button
                  type="button"
                  class="status status--action"
                  data-testid="test-tts"
                  [disabled]="tts.draft().modelId === '' || tts.draft().voiceId === ''"
                  (click)="testAudio()"
                >
                  Preview
                </button>
              }
            </div>
          </div>

          <mn-model-picker
            class="picker"
            data-testid="audio-model-picker"
            label="speech models"
            [speech]="true"
            [models]="speechModels()"
            [favoriteIds]="tts.favoriteModelIds()"
            [selectedId]="tts.settings().modelId"
            [selectedLabel]="speechModelLabel()"
            [loading]="catalogLoading()"
            [failure]="catalogFailure()"
            [disabled]="!credential.isConfigured()"
            (opened)="loadCatalog()"
            (modelSelected)="selectSpeechModel($event)"
            (favoriteToggled)="tts.toggleFavorite($event)"
          />

          <div class="options">
            <div class="option">
              <span id="mn-voice-label">Voice</span>
              @if (selectedSpeechModel()?.supportedVoices?.length) {
                <select
                  class="mn-control"
                  aria-labelledby="mn-voice-label"
                  [disabled]="!credential.isConfigured()"
                  [ngModel]="tts.draft().voiceId"
                  (change)="setVoice($event)"
                >
                  @for (voice of selectedSpeechModel()?.supportedVoices ?? []; track voice) {
                    <option [value]="voice">{{ voice }}</option>
                  }
                </select>
              } @else {
                <input
                  class="mn-control"
                  type="text"
                  aria-labelledby="mn-voice-label"
                  placeholder="Voice ID"
                  [disabled]="!credential.isConfigured()"
                  [value]="tts.draft().voiceId"
                  (change)="setVoice($event)"
                />
              }
            </div>
            <div class="option">
              <span id="mn-speed-label">Speed</span>
              <mn-speed-field
                testId="tts-speed-input"
                labelledBy="mn-speed-label"
                [value]="tts.settings().speed"
                [disabled]="!credential.isConfigured()"
                (committed)="setSpeed($event)"
              />
            </div>
          </div>

          <!-- Speed is only ever produced by the model, so the surface says
               which channel carried it rather than implying it took effect. -->
          @if (paceNote(); as note) {
            <p class="hint" data-testid="audio-pace-note">{{ note }}</p>
          }

          <!--
            Both sentences are about money and about audio that looks lost, which
            is what the prose budget keeps room for. The first says why the
            Preview is a press here when a text model tests itself on selection;
            the second says where the clips went when a voice changed under a
            reading that already had audio.
          -->
          @if (audioReadinessNote(); as note) {
            <p class="hint" data-testid="audio-readiness-note">{{ note }}</p>
          }

          <!-- The preview is heard, not operated: it starts itself and leaves no player behind. -->
          @if (sampleUrl(); as url) {
            <audio
              #sampleAudio
              class="mn-visually-hidden"
              autoplay
              preload="auto"
              [src]="url"
              (canplay)="playSample()"
            ></audio>
          }
        </section>
      </div>

      @if (text.testFailure(); as failure) {
        <p class="error" role="alert">{{ failure.message }}</p>
      }
      @if (tts.testFailure(); as failure) {
        <p class="error" role="alert">{{ failure.message }}</p>
      }
    </section>
  `,
  styles: `
    .models {
      gap: var(--space-3);
    }
    h2,
    h3,
    h4,
    p {
      margin: 0;
    }
    h2 {
      font-size: var(--text-lg);
      letter-spacing: -0.01em;
    }
    .section-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-3);
    }
    .connection {
      position: relative;
    }
    .connection-button {
      white-space: nowrap;
      // Loading credentials changes both foreground and background. Blending
      // between the two palettes briefly makes the label unreadable.
      transition: transform var(--motion-fast) ease-out;
    }
    .connection-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: currentcolor;
      opacity: 0.55;
    }
    .chevron {
      flex: none;
      width: 1rem;
      height: 1rem;
      opacity: 0.7;
      transition: transform var(--motion-fast) ease-out;
    }
    .chevron--up {
      transform: rotate(180deg);
    }
    .connection-dot.connected {
      background: var(--status-success);
      opacity: 1;
    }
    .connection-menu {
      position: absolute;
      z-index: 30;
      inset: calc(100% + var(--space-1)) 0 auto auto;
      display: grid;
      gap: var(--space-3);
      width: min(23rem, calc(100vw - 2 * var(--space-4)));
      padding: var(--space-3);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-control);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }
    .connection-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--space-2);
    }
    /* Two jobs, two columns on a desktop; one column as soon as that is tight. */
    .tree {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
      gap: var(--space-3);
    }
    .node {
      display: grid;
      /* Equal-height cards must not spread their rows to fill the difference:
         the spare space belongs at the bottom, not between the fields. */
      align-content: start;
      gap: var(--space-2);
      min-width: 0;
      padding: var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
    }
    /*
     * A fixed height regardless of what sits on the right. Otherwise a pill
     * button makes one head taller than a head carrying plain text, and every
     * field below it in that column sits a few pixels off its neighbour.
     */
    .node-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--space-2);
      min-height: 1.75rem;
      min-width: 0;
    }
    .node-head h3 {
      overflow: hidden;
      font-size: var(--text-sm);
      font-weight: 700;
      letter-spacing: 0.06em;
      text-overflow: ellipsis;
      text-transform: uppercase;
    }
    /* A branch is subordinate to its node, and its label says so. */
    .node-head h4 {
      overflow: hidden;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 600;
      text-overflow: ellipsis;
    }
    .picker {
      display: block;
      min-width: 0;
    }
    .options {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }
    .option {
      display: grid;
      flex: 1 1 7rem;
      gap: 2px;
      min-width: 0;
    }
    .option > span {
      color: var(--text-secondary);
      font-size: 12px;
    }
    .hint {
      color: var(--text-secondary);
      font-size: 12px;
    }
    .status {
      flex: none;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      white-space: nowrap;
    }
    .status--ok {
      color: var(--status-success);
    }
    .status--bad {
      color: var(--status-danger);
    }
    /* Where this stands, and the press that moves it on, on one line. */
    .head-status {
      display: flex;
      flex: none;
      align-items: center;
      gap: var(--space-2);
      min-width: 0;
    }
    .head-status .status {
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .status--action {
      padding: 2px var(--space-2);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-pill);
      background: none;
      color: var(--text-primary);
      cursor: pointer;
    }
    .status--action:hover:not(:disabled) {
      background: var(--surface-sunken);
    }
    .status--action:disabled {
      color: var(--text-secondary);
      cursor: default;
    }
    .branches {
      margin-top: var(--space-1);
      border-top: 1px solid var(--border-subtle);
    }
    .branches > summary {
      min-height: 2rem;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 500;
    }
    .branch {
      display: grid;
      gap: var(--space-2);
      padding-block: var(--space-1) var(--space-3);
      padding-inline-start: var(--space-3);
      border-inline-start: 2px solid var(--border-subtle);
    }
    .error {
      padding: var(--space-3);
      border-radius: var(--radius-control);
      background: var(--status-danger-soft);
      color: var(--status-danger);
    }
    @media (max-width: 40rem) {
      .connection,
      .connection-button {
        width: 100%;
      }
      .connection-menu {
        inset-inline: 0;
        width: 100%;
      }
    }
  `,
})
export class ModelsSectionComponent {
  private readonly dialog = inject(Dialog);
  private readonly catalog = inject(MODEL_CATALOG);
  private readonly document = inject(DOCUMENT);
  protected readonly credential = inject(CredentialStore);
  protected readonly text = inject(TextModelStore);
  protected readonly tts = inject(TtsStore);
  protected readonly keyDraft = signal('');
  protected readonly connectionMenuOpen = signal(false);
  protected readonly textModels = signal<readonly ModelCapabilities[]>([]);
  protected readonly speechModels = signal<readonly ModelCapabilities[]>([]);
  protected readonly catalogLoading = signal(false);
  protected readonly catalogFailure = signal<string | null>(null);
  protected readonly sampleUrl = signal<string | null>(null);
  protected readonly textTasks = [
    { id: 'translation' as const, label: 'Translation' },
    { id: 'grammar' as const, label: 'Grammar' },
  ];
  private catalogLoaded = false;
  private readonly connectionMenu = viewChild<ElementRef<HTMLElement>>('connectionMenu');
  private readonly connectionButton =
    viewChild.required<ElementRef<HTMLButtonElement>>('connectionButton');
  private readonly sampleAudio = viewChild<ElementRef<HTMLAudioElement>>('sampleAudio');

  protected readonly selectedStoryModel = computed(() =>
    this.modelById(this.text.settings().modelId),
  );
  protected readonly storyModelLabel = computed(
    () =>
      this.text.presets().find((preset) => preset.id === this.text.activePresetId())?.name ?? null,
  );
  protected readonly selectedSpeechModel = computed(
    () =>
      this.speechModels().find((model) => model.modelId === this.tts.settings().modelId) ?? null,
  );
  protected readonly speechModelLabel = computed(
    () =>
      this.tts.presets().find((preset) => preset.id === this.tts.settings().activePresetId)?.name ??
      null,
  );
  /**
   * Where the saved speed comes from, once a test has measured it.
   *
   * Nothing is said before then: an untested configuration has no finding to
   * report, and a guess here would be exactly the pretence the test exists to
   * avoid.
   */
  protected readonly paceNote = computed(() => {
    if (this.tts.settings().modelId === '' || this.tts.readiness() !== 'ready') {
      return null;
    }
    return this.tts.paceSource() === 'fixed'
      ? 'This model cannot change speaking speed.'
      : 'Speaking speed is produced by the model.';
  });
  /**
   * Where the speech configuration stands, in one value the head can render.
   *
   * `testing` and `cancelled` are not readiness — a running test proves nothing
   * yet, and a stopped one proves nothing ever — but they are two of the six
   * states a learner has to be able to tell apart, so they are resolved here
   * rather than each being inferred from a different signal at the template.
   */
  protected readonly audioStatus = computed<AudioStatus>(() => {
    if (this.tts.action() === 'testing') {
      return 'testing';
    }
    const readiness = this.tts.readiness();
    if (this.tts.testCancelled() && readiness !== 'ready') {
      return 'cancelled';
    }
    return readiness;
  });

  protected readonly audioStatusLabel = computed(
    () =>
      ({
        testing: 'Playing…',
        cancelled: 'Stopped',
        ready: 'Ready',
        untested: 'Not tested',
        stale: 'Settings changed',
        failed: 'Failed',
        'not-configured': 'No model',
      })[this.audioStatus()],
  );

  protected readonly audioStatusTitle = computed(
    () =>
      ({
        testing: 'Playing a test clip from this model.',
        cancelled: 'You stopped the preview, so this configuration is still untested.',
        ready: 'This model, voice and speed passed their preview.',
        untested: 'Preview this model before generating audio.',
        stale: 'The model, voice or speed changed since the last preview.',
        failed: 'The last preview failed.',
        'not-configured': 'Choose a speech model and a voice.',
      })[this.audioStatus()],
  );

  /**
   * The one sentence each unready state owes the learner.
   *
   * Both are inside the prose budget: one is about a request that costs money,
   * the other is about audio that has been paid for and looks lost.
   */
  protected readonly audioReadinessNote = computed(() => {
    if (!this.credential.isConfigured() || this.tts.settings().modelId === '') {
      return null;
    }
    switch (this.audioStatus()) {
      case 'untested':
        return 'Preview plays one test sentence. Audio can only be generated once it has passed.';
      case 'cancelled':
        return 'The preview was stopped, so this configuration is still untested.';
      case 'stale':
        return 'Audio saved with the previous settings is kept on this device, but it cannot be played in these ones — a story may show as having no audio until you generate it again or set the previous voice and speed back.';
      case 'testing':
      case 'ready':
      case 'failed':
      case 'not-configured':
        return null;
    }
  });

  /** The branches open on their own once a learner has set one. */
  protected readonly hasOverrides = computed(
    () => this.text.grammarPresetId() != null || this.text.translationPresetId() != null,
  );

  constructor() {
    // The saved configuration cannot be shown correctly until the catalogue is
    // known: a stored speech model has no listed voices, and a stored text
    // model no reasoning efforts, until its entry is in hand. Waiting for a
    // picker to be opened left those fields showing a fallback the learner
    // never chose, so the list is fetched as soon as a key can pay for it.
    effect(() => {
      if (this.credential.isConfigured()) {
        untracked(() => void this.loadCatalog());
      }
    });
    effect((onCleanup) => {
      const sample = this.tts.sample();
      if (sample === null) {
        this.sampleUrl.set(null);
        return;
      }
      const url = this.document.defaultView?.URL.createObjectURL(sample) ?? null;
      this.sampleUrl.set(url);
      if (url !== null) onCleanup(() => this.document.defaultView?.URL.revokeObjectURL(url));
    });
    effect(() => {
      const url = this.sampleUrl();
      const audio = this.sampleAudio()?.nativeElement;
      if (url === null || audio === undefined) return;
      audio.currentTime = 0;
      void audio.play().catch(() => undefined);
    });
  }

  protected toggleConnectionMenu(): void {
    this.connectionMenuOpen.update((open) => !open);
  }
  protected closeConnectionMenuFromOutside(event: PointerEvent): void {
    if (!this.connectionMenuOpen() || !(event.target instanceof Node)) return;
    if (this.connectionMenu()?.nativeElement.contains(event.target)) return;
    if (this.connectionButton().nativeElement.contains(event.target)) return;
    this.connectionMenuOpen.set(false);
  }
  protected onKeyInput(event: Event): void {
    this.keyDraft.set((event.target as HTMLInputElement).value);
  }
  protected async saveKey(): Promise<void> {
    const saved = await this.credential.save(this.keyDraft());
    this.keyDraft.set('');
    if (saved) {
      this.connectionMenuOpen.set(false);
      this.catalogLoaded = false;
      await this.loadCatalog();
    }
  }
  protected async removeKey(): Promise<void> {
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete OpenRouter key?',
      message: 'AI requests will stop until you connect again.',
      details: ['Your model choices and saved content stay on this device.'],
      confirmLabel: 'Delete key',
      cancelLabel: 'Keep key',
      tone: 'danger',
    });
    if (confirmed) {
      await this.credential.remove();
      this.connectionMenuOpen.set(false);
    }
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
  protected async selectSpeechModel(model: ModelCapabilities): Promise<void> {
    this.tts.setDraft({ modelId: model.modelId, voiceId: model.supportedVoices[0] ?? '' });
    await this.tts.save();
  }
  /** What the catalog says the configured model accepts, empty when unknown. */
  private speechParameters(): readonly string[] {
    return this.selectedSpeechModel()?.supportedParameters ?? [];
  }
  protected setVoice(event: Event): void {
    this.tts.setDraft({ voiceId: (event.target as HTMLInputElement).value });
    void this.tts.save();
  }
  /** Only ever reached with a speed the field has already accepted. */
  protected setSpeed(speed: number): void {
    this.tts.setDraft({ speed });
    void this.tts.save();
  }
  protected testAudio(): void {
    void this.tts.test(this.speechParameters());
  }
  protected playSample(): void {
    void this.sampleAudio()
      ?.nativeElement.play()
      .catch(() => undefined);
  }
  protected reasoningEfforts(model: ModelCapabilities | null): readonly string[] {
    return model?.reasoning?.supportedEfforts ?? ['low', 'medium', 'high'];
  }
  protected titleCase(value: string): string {
    return value.charAt(0).toLocaleUpperCase() + value.slice(1);
  }
  /** Only a configured model that no test vouches for can be retried. */
  protected retestable(readiness: ConfigurationReadiness): boolean {
    return readiness === 'untested' || readiness === 'stale' || readiness === 'failed';
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
      'not-configured': 'No model',
    }[readiness];
  }
  private modelById(modelId: string): ModelCapabilities | null {
    return this.textModels().find((model) => model.modelId === modelId) ?? null;
  }
}
