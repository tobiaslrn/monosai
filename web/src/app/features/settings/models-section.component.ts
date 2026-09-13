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
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { SettingsSectionComponent } from '../../shared-ui/settings-section/settings-section.component';
import { ModelPickerComponent } from './model-picker.component';
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
  imports: [
    FormsModule,
    IconComponent,
    ModelPickerComponent,
    SettingsSectionComponent,
    TokenBudgetFieldComponent,
  ],
  host: {
    '(document:pointerdown)': 'closeConnectionMenuFromOutside($event)',
    '(document:keydown.escape)': 'connectionMenuOpen.set(false)',
  },
  template: `
    <mn-settings-section heading="AI">
      <div class="mn-card mn-card--flush mn-settings-card mn-settings-card--overlay">
        <div class="connection">
          <button
            #connectionButton
            type="button"
            class="mn-settings-row mn-settings-row--interactive"
            data-testid="connect-openrouter"
            [attr.aria-expanded]="connectionMenuOpen()"
            aria-haspopup="dialog"
            (click)="toggleConnectionMenu()"
          >
            <span class="mn-settings-row__label">
              <span class="mn-settings-row__title">OpenRouter key</span>
            </span>
            <span class="mn-settings-row__end">
              <span
                class="mn-status-pill"
                [class.mn-status-pill--success]="connectionLabel() === 'Connected'"
                [class.mn-status-pill--danger]="connectionLabel() === 'Needs attention'"
                >{{ connectionLabel() }}</span
              >
              <mn-icon class="mn-settings-chevron" name="chevron-right" [size]="18" />
            </span>
          </button>
          @if (connectionMenuOpen()) {
            <div
              #connectionMenu
              class="connection-menu"
              role="dialog"
              aria-label="OpenRouter connection"
            >
              <!--
                What OpenRouter is and where a key comes from, on the one screen
                a first-run blocker sends people to. Money and an external
                account are at stake, which is what standing prose is for.
              -->
              <p class="mn-hint">
                OpenRouter is the one service Monosai sends text to. It bills your account per
                request; Monosai stores the key on this device only.
              </p>
              <a
                class="mn-hint"
                href="https://openrouter.ai/settings/keys"
                target="_blank"
                rel="noopener noreferrer"
                >Get a key on openrouter.ai</a
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
              <div class="connection-actions mn-actions">
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

        <!--
        Every control below needs a key. Drawn disabled before one existed,
        they read as values nobody had chosen; the connection comes first.
      -->
        @if (credential.isConfigured()) {
          <section
            class="node mn-settings-group"
            aria-labelledby="mn-text-model-label"
            data-capability="text"
            [attr.data-readiness]="text.readiness()"
          >
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

            <div class="mn-settings-row">
              <div class="mn-settings-row__label">
                <span class="mn-settings-row__title">Model</span>
              </div>
              <div class="mn-settings-row__end">
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
                  (opened)="loadCatalog()"
                  (modelSelected)="selectStoryModel($event)"
                  (favoriteToggled)="text.toggleFavorite($event)"
                />
              </div>
            </div>

            <div class="mn-settings-row">
              <div class="mn-settings-row__label">
                <span class="mn-settings-row__title" id="mn-text-reasoning-label">Reasoning</span>
              </div>
              <div class="mn-settings-row__end">
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
              </div>
            </div>

            <div class="mn-settings-row">
              <div class="mn-settings-row__label">
                <span class="mn-settings-row__title" id="mn-text-limit-label">Token limit</span>
              </div>
              <div class="mn-settings-row__end">
                <mn-token-budget-field
                  testId="story-token-budget-input"
                  labelledBy="mn-text-limit-label"
                  [value]="text.settings().storyTokenBudget"
                  [disabled]="!credential.isConfigured()"
                  (committed)="saveStoryBudget($event)"
                />
              </div>
            </div>

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
                      text.routePreset(task.id) === null
                        ? 'inherited'
                        : text.routeReadiness(task.id)
                    "
                  >
                    <div class="mn-settings-row">
                      <div class="mn-settings-row__label">
                        <span class="mn-settings-row__title" [id]="'mn-' + task.id + '-label'">
                          {{ task.label }}
                        </span>
                      </div>
                      <div class="mn-settings-row__end">
                        @if (
                          text.routePreset(task.id) !== null &&
                          retestable(text.routeReadiness(task.id))
                        ) {
                          <button
                            type="button"
                            class="mn-button mn-button--ghost"
                            data-testid="test-text-model"
                            [disabled]="text.action() !== 'idle'"
                            (click)="text.testTask(task.id)"
                          >
                            {{
                              statusLabel(text.routeReadiness(task.id), text.action() === 'testing')
                            }}
                          </button>
                        } @else if (
                          text.routePreset(task.id) !== null &&
                          text.routeReadiness(task.id) === 'ready'
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
                          (opened)="loadCatalog()"
                          (fallbackSelected)="clearTaskModel(task.id)"
                          (modelSelected)="selectTaskModel(task.id, $event)"
                          (favoriteToggled)="text.toggleFavorite($event)"
                        />
                      </div>
                    </div>

                    @if (text.routePreset(task.id) !== null) {
                      <div class="mn-settings-subrows">
                        <div class="mn-settings-row">
                          <div class="mn-settings-row__label">
                            <span
                              class="mn-settings-row__title"
                              [id]="'mn-' + task.id + '-reasoning-label'"
                            >
                              Reasoning
                            </span>
                          </div>
                          <div class="mn-settings-row__end">
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
                          </div>
                        </div>
                        <div class="mn-settings-row">
                          <div class="mn-settings-row__label">
                            <span class="mn-settings-row__title" [id]="'mn-' + task.id + '-limit'">
                              Token limit
                            </span>
                          </div>
                          <div class="mn-settings-row__end">
                            <mn-token-budget-field
                              [labelledBy]="'mn-' + task.id + '-limit'"
                              [value]="text.routeTokenBudget(task.id)"
                              (committed)="setTaskBudget(task.id, $event)"
                            />
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </details>
          </section>

          <section
            class="node mn-settings-group"
            aria-labelledby="mn-audio-model-label"
            data-capability="audio"
            [attr.data-readiness]="tts.readiness()"
          >
            <div class="mn-settings-group__header">
              <h3 class="mn-group-title" id="mn-audio-model-label">Voice</h3>
              <div class="head-status mn-actions">
                <span
                  class="mn-status-pill"
                  [class.mn-status-pill--success]="tts.readiness() === 'ready'"
                  [class.mn-status-pill--danger]="audioStatus() === 'failed'"
                  data-testid="audio-readiness"
                  [title]="audioStatusTitle()"
                  >{{ audioStatusLabel() }}</span
                >
                @if (tts.action() === 'testing') {
                  <button
                    type="button"
                    class="mn-button mn-button--ghost"
                    data-testid="cancel-tts-test"
                    (click)="tts.cancelTest()"
                  >
                    Stop
                  </button>
                } @else {
                  <button
                    type="button"
                    class="mn-button mn-button--ghost"
                    data-testid="test-tts"
                    [disabled]="tts.draft().modelId === '' || tts.draft().voiceId === ''"
                    (click)="testAudio()"
                  >
                    Preview
                  </button>
                }
              </div>
            </div>

            <div class="mn-settings-row">
              <div class="mn-settings-row__label">
                <span class="mn-settings-row__title">Model</span>
              </div>
              <div class="mn-settings-row__end">
                <mn-model-picker
                  [compact]="true"
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
              </div>
            </div>

            <div class="mn-settings-row">
              <div class="mn-settings-row__label">
                <span class="mn-settings-row__title" id="mn-voice-label">Voice ID</span>
              </div>
              <div class="mn-settings-row__end">
                @if (selectedSpeechModel()?.supportedVoices?.length) {
                  <select
                    class="mn-control"
                    aria-label="Voice"
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
                    aria-label="Voice"
                    aria-labelledby="mn-voice-label"
                    placeholder="Default"
                    [disabled]="!credential.isConfigured()"
                    [value]="tts.draft().voiceId"
                    (change)="setVoice($event)"
                  />
                }
              </div>
            </div>

            @if (tts.acceptsDirection()) {
              <div class="mn-settings-row">
                <div class="mn-settings-row__label">
                  <span class="mn-settings-row__title" id="mn-style-label">Speaking style</span>
                </div>
                <div class="mn-settings-row__end">
                  <select
                    class="mn-control"
                    data-testid="tts-style-select"
                    aria-labelledby="mn-style-label"
                    [disabled]="!credential.isConfigured()"
                    [ngModel]="tts.draft().speechStyle"
                    (change)="setSpeechStyle($event)"
                  >
                    <option value="natural">Natural</option>
                    <option value="clear">Clear</option>
                    <option value="very-clear">Very clear</option>
                  </select>
                </div>
              </div>
            }

            <div class="mn-settings-row">
              <div class="mn-settings-row__label">
                <span class="mn-settings-row__title" id="mn-pace-label">Pace</span>
              </div>
              <div class="mn-settings-row__end">
                <select
                  class="mn-control"
                  data-testid="tts-pace-select"
                  aria-labelledby="mn-pace-label"
                  [disabled]="!credential.isConfigured()"
                  [ngModel]="tts.draft().speechPace"
                  (change)="setSpeechPace($event)"
                >
                  <option value="natural">Natural</option>
                  <option value="slow">Slow</option>
                  <option value="very-slow">Very slow</option>
                </select>
              </div>
            </div>

            @if (audioReadinessNote(); as note) {
              <p class="mn-settings-feedback" data-testid="audio-readiness-note">{{ note }}</p>
            }

            <!-- The preview is heard, not operated: it starts itself and leaves no player behind. -->
            @if (sampleUrl(); as url) {
              <audio
                #sampleAudio
                class="mn-visually-hidden"
                preload="auto"
                [src]="url"
                (canplay)="playRequestedSample()"
              ></audio>
            }
          </section>
        }

        @if (text.testFailure(); as failure) {
          <p class="mn-notice mn-notice--error mn-settings-notice" role="alert">
            {{ failure.message }}
          </p>
        }
        @if (tts.testFailure(); as failure) {
          <p class="mn-notice mn-notice--error mn-settings-notice" role="alert">
            {{ failure.message }}
          </p>
        }
      </div>
    </mn-settings-section>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    h3,
    p {
      margin: 0;
    }
    .connection {
      position: relative;
      min-width: 0;
    }
    .connection > .mn-settings-row {
      position: relative;
    }
    .connection-menu {
      position: absolute;
      z-index: 30;
      inset: calc(100% + var(--space-1)) var(--space-4) auto;
      display: grid;
      gap: var(--space-3);
      width: min(23rem, calc(100% - 2 * var(--space-4)));
      padding: var(--space-3);
      border: 1px solid var(--border-strong);
      border-radius: var(--radius-control);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }
    .connection-actions {
      justify-content: flex-end;
    }
    .head-status {
      flex: 0 1 auto;
      justify-content: flex-end;
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

    @media (max-width: breakpoints.$narrow-max) {
      .connection-menu {
        position: static;
        width: auto;
        margin: 0 var(--space-3) var(--space-2);
        box-shadow: none;
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
  protected readonly connectionLabel = computed(() => {
    if (!this.credential.isConfigured()) return 'Not connected';
    if (this.text.readiness() === 'failed' || this.tts.readiness() === 'failed')
      return 'Needs attention';
    return this.text.readiness() === 'ready' || this.tts.readiness() === 'ready'
      ? 'Connected'
      : 'Key saved';
  });
  protected readonly connectionMenuOpen = signal(false);
  protected readonly branchesOpen = signal(false);
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
  /** A sample already present when Settings opens is display-only. */
  private sampleEffectInitialized = false;
  private readonly samplePlaybackRequested = signal(false);
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
    () => this.speechModels().find((model) => model.modelId === this.tts.draft().modelId) ?? null,
  );
  protected readonly speechModelLabel = computed(
    () =>
      this.tts.presets().find((preset) => preset.id === this.tts.settings().activePresetId)?.name ??
      null,
  );
  protected readonly taskModelsSummary = computed(() =>
    this.textTasks.some((task) => this.text.routePreset(task.id) !== null)
      ? 'Custom models'
      : 'Same model',
  );
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
        'no-credential': 'No key',
        incomplete: 'No model',
      })[this.audioStatus()],
  );

  protected readonly audioStatusTitle = computed(
    () =>
      ({
        testing: 'Playing a test clip from this model.',
        cancelled: 'You stopped the preview, so this configuration is still untested.',
        ready: 'This model, voice, style and pace passed their preview.',
        untested: 'Preview this model before generating audio.',
        stale: 'The model, voice, style or pace changed since the last preview.',
        failed: 'The last preview failed.',
        'no-credential': 'Add an OpenRouter key.',
        incomplete: 'Choose a speech model and a voice.',
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
        return 'Existing audio uses different settings. Generate it again or restore the previous settings.';
      case 'testing':
      case 'ready':
      case 'failed':
      case 'no-credential':
      case 'incomplete':
        return null;
    }
  });

  /** The branches open on their own once a learner has set one. */
  protected readonly hasOverrides = computed(
    () => this.text.grammarPresetId() != null || this.text.translationPresetId() != null,
  );

  constructor() {
    effect(() => {
      const parameters = this.selectedSpeechModel()?.supportedParameters ?? [];
      untracked(() => {
        this.tts.setCatalogParameters(parameters);
      });
    });
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
        this.samplePlaybackRequested.set(false);
        this.sampleEffectInitialized = true;
        return;
      }
      const url = this.document.defaultView?.URL.createObjectURL(sample) ?? null;
      this.sampleUrl.set(url);
      this.samplePlaybackRequested.set(this.sampleEffectInitialized);
      this.sampleEffectInitialized = true;
      if (url !== null) onCleanup(() => this.document.defaultView?.URL.revokeObjectURL(url));
    });
  }

  protected playRequestedSample(): void {
    if (!this.samplePlaybackRequested()) return;
    this.samplePlaybackRequested.set(false);
    this.playSample();
  }

  protected toggleConnectionMenu(): void {
    this.connectionMenuOpen.update((open) => !open);
  }

  protected setBranchesOpen(event: Event): void {
    this.branchesOpen.set((event.target as HTMLDetailsElement).open);
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
  protected setSpeechStyle(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== 'natural' && value !== 'clear' && value !== 'very-clear') {
      return;
    }
    this.tts.setDraft({ speechStyle: value });
    void this.tts.save();
  }
  protected setSpeechPace(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    if (value !== 'natural' && value !== 'slow' && value !== 'very-slow') {
      return;
    }
    this.tts.setDraft({ speechPace: value });
    void this.tts.save();
  }
  protected testAudio(): void {
    void this.tts.test(this.speechParameters());
  }
  protected playSample(): void {
    const audio = this.sampleAudio()?.nativeElement;
    if (audio === undefined) return;
    audio.preservesPitch = true;
    audio.playbackRate = 1;
    audio.defaultPlaybackRate = 1;
    void audio.play().catch(() => undefined);
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
