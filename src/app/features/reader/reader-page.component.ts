import type { ElementRef, TemplateRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewContainerRef,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { DomPortal, DomPortalOutlet } from '@angular/cdk/portal';
import { Router, RouterLink } from '@angular/router';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { AudioConfigurationService } from '../../application/enrichment/audio-configuration.service';
import { AudioJobStore } from '../../application/enrichment/audio-job.store';
import { ReadingAudioMaintenanceStore } from '../../application/enrichment/reading-audio-maintenance.store';
import { NO_AIDS, SentenceAidsStore } from '../../application/enrichment/sentence-aids.store';
import { TranslationJobStore } from '../../application/enrichment/translation-job.store';
import { ReaderStore, type ReaderSentence } from '../../application/reading/reader.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { LanguageStore } from '../../application/language/language.store';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { LibraryStore } from '../../application/reading/library.store';
import { ViewportService } from '../../core/platform/viewport.service';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import type { Reading } from '../../domain/reading/reading';
import { findingsCoveringToken, sentenceWideFindings } from '../../domain/enrichment/finding-spans';
import { readingId, type SentenceId } from '../../domain/shared/ids';
import { presentStatus } from '../../domain/reading/token-presentation';
import { clampTextScale } from '../../domain/settings/settings';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopoverService, type PopoverRef } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import { ReaderAidsComponent } from './reader-aids.component';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import { ReaderMenuComponent } from './reader-menu.component';
import type { SentenceSelection } from './paragraph-gestures.directive';
import type { SelectedWord, TokenActivation } from './reader-sentence.component';
import type { UnknownWord } from './sentence-popover.component';
import { SentencePopoverComponent } from './sentence-popover.component';
import { ReadingPlayerComponent } from './reading-player.component';
import { TranslationProgressComponent } from './translation-progress.component';
import {
  NO_WORD_GRAMMAR,
  WordInspectorComponent,
  type WordGrammarState,
} from './word-inspector.component';
import { WordPreviewComponent } from './word-preview.component';

/**
 * The word buttons, which a press reaches even while a surface is open.
 *
 * Restricted to real buttons: punctuation and whitespace carry the same class
 * but are not words, and a press on one is a press on the line.
 */
const WORD_TARGET = 'button.token';

/**
 * How much of the reading is kept between a sheet and the word it explains.
 *
 * A word butted against the sheet's edge reads as being underneath it; a line
 * of breathing room is what makes it look deliberately left visible.
 */
const SHEET_CLEARANCE = 12;

/** How long a pointer must rest on a word before its preview appears. */
const PREVIEW_DELAY_MS = 250;

/**
 * How long a smooth scroll is allowed to keep emitting events before a scroll
 * counts as the learner's again. Generous, because a smooth scroll's duration
 * is the browser's to choose and treating our own scroll as theirs would turn
 * following off after the very first advance.
 */
const SCROLL_SETTLE_MS = 1000;

/**
 * How tall the docked player currently is, published on the document root.
 *
 * The overlay a sheet is rendered into is a sibling of the reader, so this is
 * the only place both of them can read.
 */
const DOCKED_PLAYER_HEIGHT = '--mn-docked-player-height';

/**
 * The reader.
 *
 * The page is Japanese and nothing else. Every piece of English — a
 * translation, a grammar note, a dictionary entry — is in a popover the learner
 * opened deliberately, so scrolling a reading never means scrolling past
 * commentary on it.
 *
 * Opening a reading is entirely local: immutable text, stored token analyses,
 * the bundled dictionary, and locally computed status. No AI request happens on
 * open, on selecting a sentence, or when an aid is toggled.
 */
@Component({
  selector: 'mn-reader-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    ReaderAidsComponent,
    ReaderParagraphComponent,
    ReaderMenuComponent,
    ReaderPopoverComponent,
    ReadingPlayerComponent,
    SentencePopoverComponent,
    TranslationProgressComponent,
    WordInspectorComponent,
    WordPreviewComponent,
  ],
  providers: [ReaderStore, WordInspectorStore, SentenceAidsStore, ReadingAudioMaintenanceStore],
  template: `
    <div
      class="reader"
      [class.has-audio-player]="audioPlayerOpen()"
      [style.--reader-scale]="textScale()"
    >
      <header class="bar">
        <div class="bar-row">
          <a class="mn-icon-button" routerLink="/library" aria-label="Back to library">
            <mn-icon name="back" />
          </a>
          <h1>{{ readerHeading() }}</h1>
          @if (store.status() === 'ready') {
            <div class="bar-actions">
              <mn-reader-aids />
              <!--
                Always here for a loaded reading, whether or not it has any
                audio. The player behind it owns every audio state there is.
              -->
              <button
                type="button"
                class="mn-icon-button audio-button"
                [class.is-busy]="audioJob.isRunning()"
                [class.is-playing]="playback.isActive()"
                [attr.aria-expanded]="audioPlayerOpen()"
                aria-controls="reading-audio-player"
                [attr.aria-label]="audioButtonLabel()"
                (click)="toggleAudioPlayer()"
              >
                <mn-icon name="audio" />
              </button>
              @if (store.reading(); as reading) {
                <mn-reader-menu
                  [reading]="reading"
                  [isRunning]="translationJob.progress().kind === 'running'"
                  [audioRunning]="audioJob.isRunning()"
                  (translateAll)="startWholeReadingTranslation()"
                  (cancelled)="translationJob.cancel()"
                  (deleteAudioRequested)="confirmClearReadingAudio()"
                  (deleteRequested)="confirmDelete()"
                />
              }
            </div>
          }
        </div>

        <!--
          A running job belongs with the header rather than over the text, and
          it takes none of the page while nothing is running.
        -->
        @if (store.status() === 'ready') {
          <mn-translation-progress
            [progress]="translationJob.progress()"
            (cancelled)="translationJob.cancel()"
            (retried)="retryWholeReadingTranslation()"
            (dismissed)="translationJob.acknowledge()"
          />
          @if (readingAudioMaintenance.state() === 'cleared') {
            <p class="audio-maintenance-message mn-hint" role="status">
              Audio deleted. You can generate it again from scratch.
            </p>
          } @else if (readingAudioMaintenance.error(); as error) {
            <p class="audio-maintenance-message mn-error" role="alert">
              Deleting audio failed: {{ error.message }}
            </p>
          }
        }
      </header>

      <main class="content" #content>
        @switch (store.status()) {
          @case ('loading') {
            <p class="mn-hint" role="status">Opening…</p>
          }
          @case ('not-found') {
            <section class="mn-panel" role="alert">
              <h2>This reading is no longer here</h2>
              <p class="mn-hint">It may have been deleted. Nothing else was affected.</p>
              <a class="mn-button" routerLink="/library">Back to library</a>
            </section>
          }
          @case ('failed') {
            <section class="mn-panel" role="alert">
              <h2>This reading could not be opened</h2>
              <p class="mn-hint">{{ store.lastError()?.message }}</p>
              <p class="mn-hint">Your saved text was not changed.</p>
              <button type="button" class="mn-button" (click)="reload()">Try again</button>
            </section>
          }
          @case ('ready') {
            @if (store.hasMoreAbove()) {
              <div class="sentinel" #topSentinel aria-hidden="true"></div>
            }

            <article class="text">
              @for (paragraph of store.paragraphs(); track paragraph.paragraph.id) {
                <mn-reader-paragraph
                  [entry]="paragraph"
                  [aids]="aids.aids()"
                  [furigana]="preferences().furigana"
                  [tokenSpacing]="preferences().tokenSpacing"
                  [markers]="preferences().warningMarkers"
                  [selectedSentenceId]="selectedSentenceId()"
                  [playingSentenceId]="playback.currentSentenceId()"
                  [selectedWord]="selectedWord()"
                  [previewedWord]="previewedWord()"
                  (activated)="inspect($event)"
                  (previewed)="previewWord($event)"
                  (previewEnded)="endPreview()"
                  (sentenceSelected)="selectSentence($event)"
                />
              }
            </article>

            @if (store.hasMoreBelow()) {
              <div class="sentinel" #bottomSentinel aria-hidden="true"></div>
              <p class="mn-hint" role="status">
                {{ store.loadingMore() ? 'Loading more…' : '' }}
              </p>
            }
          }
        }
      </main>
    </div>

    @if (audioPlayerOpen() && store.status() === 'ready') {
      <div
        #audioPlayerShell
        id="reading-audio-player"
        class="audio-player-shell"
        role="region"
        aria-label="Reading audio"
      >
        <mn-reading-player
          [progress]="audioJob.progress()"
          [selectedSentenceId]="audioPlayerSentenceId()"
          [modelConfigured]="hasAudioModel()"
          (generate)="startWholeReadingAudio()"
          (cancelGeneration)="audioJob.cancel()"
          (retryGeneration)="retryWholeReadingAudio()"
          (dismissJob)="audioJob.acknowledge()"
        />
      </div>
    }

    <ng-template #sentencePopover>
      <mn-reader-popover label="Sentence details" (closed)="popover.close()">
        <mn-sentence-popover
          [aids]="selectedSentenceAids()"
          [canAnalyze]="canAnalyzeGrammar()"
          [translationModelConfigured]="hasTranslationModel()"
          [grammarModelConfigured]="hasGrammarModel()"
          [unknownWords]="selectedUnknownWords()"
          (translate)="translateSelectedSentence()"
          (analyzeGrammar)="analyzeSelectedSentence()"
          (generateAudio)="synthesizeSelectedSentence()"
          (playAudio)="playSelectedSentence()"
        />
      </mn-reader-popover>
    </ng-template>

    <ng-template #wordPreview>
      <mn-word-preview />
    </ng-template>

    <ng-template #wordPopover>
      <mn-reader-popover label="Word details" (closed)="popover.close()">
        <mn-word-inspector [grammar]="wordGrammar()" (closed)="closeInspector()" />
      </mn-reader-popover>
    </ng-template>
  `,
  styles: `
    /*
     * One column at every width. Word and sentence details float over the text
     * rather than taking a column of their own, so the reading measure never
     * changes when something is opened (ADR 0022).
     */
    /*
     * Reading size is a learner setting, and vertical space follows it: the
     * gaps a sentence is pressed in have to grow with the glyphs. Both are
     * bounded, so the largest scale stays a page of prose rather than one
     * sentence a screen.
     */
    .reader {
      --reader-font-size: calc(var(--reader-base-font-size) * var(--reader-scale));
      --reader-line-height-plain: clamp(1.75, calc(2.1 - (var(--reader-scale) - 1) * 0.25), 2.3);
      /*
       * Deliberately loose. The leading is not only room for ruby: it is the
       * whitespace a sentence is pressed in, and at an ordinary leading almost
       * every pixel of a line is a glyph, which left the sentence unreachable.
       * The ratio eases off as the text grows, because the gap that matters is
       * the one in pixels and large text already has it.
       */
      --reader-line-height-ruby: clamp(2.05, calc(2.6 - (var(--reader-scale) - 1) * 0.35), 2.8);
      --reader-paragraph-gap: clamp(28px, calc(36px * var(--reader-scale)), 96px);

      display: grid;
      grid-template-rows: auto 1fr;
      grid-template-areas: 'bar' 'content';
      gap: var(--space-4);
      max-width: var(--reader-measure);
      margin-inline: auto;
    }

    /*
     * Clearance for the floating player, so the last line of a reading is never
     * parked permanently underneath it. Sized for the player's ordinary height
     * rather than its bounded maximum: at the maximum it reserved a third of a
     * phone screen of blank page under every reading.
     */
    .reader.has-audio-player {
      padding-bottom: calc(11rem + var(--space-4) + env(safe-area-inset-bottom));
    }

    /*
     * Sticky, opaque, and above the text: ruby annotations overflow above their
     * line, and without its own stacking context they would sit over the header
     * and swallow clicks meant for Back or Aids.
     */
    .bar {
      position: sticky;
      top: 0;
      z-index: 1001;
      grid-area: bar;
      /*
       * A grid item is sized by its content unless it is allowed to shrink, and
       * a long title would otherwise stretch the whole reader past its measure
       * and push the actions off the screen.
       */
      min-width: 0;
      padding-block: var(--space-2);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-canvas);
    }

    .bar-row {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-width: 0;
    }

    h1 {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-size: var(--text-lg);
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .bar-actions {
      display: flex;
      flex: none;
      gap: var(--space-2);
      align-items: center;
    }

    .audio-maintenance-message {
      margin: var(--space-2) 0 0 calc(var(--touch-target) + var(--space-2));
      font-size: var(--text-sm);
    }

    .audio-button.is-playing {
      border-color: transparent;
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    /* A job is running behind a closed player; the button is the only sign of it. */
    .audio-button.is-busy {
      color: var(--action-primary);
      animation: audio-pulse 1.6s ease-in-out infinite;
    }

    @keyframes audio-pulse {
      50% {
        opacity: 0.5;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .audio-button.is-busy {
        animation: none;
      }
    }

    .content {
      position: relative;
      z-index: 0;
      grid-area: content;
      min-width: 0;
    }

    .audio-player-shell {
      position: fixed;
      z-index: 1002;
      right: 0;
      bottom: calc(var(--space-4) + env(safe-area-inset-bottom));
      left: 50%;
      box-sizing: border-box;
      width: min(34rem, calc(100vw - 2 * var(--space-4)));
      max-height: min(20rem, calc(100dvh - 2 * var(--space-4) - env(safe-area-inset-bottom)));
      padding: var(--space-4);
      overflow-y: auto;
      overscroll-behavior: contain;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
      transform: translateX(-50%);
    }

    /*
     * On a phone the transport docks to the bottom edge instead of floating
     * clear of it. An inset card there wasted both margins on a screen that has
     * none to spare, and left the controls hovering over the text they are
     * about; docked, the reading ends where the player begins.
     */
    @media (max-width: 600px) {
      .audio-player-shell {
        right: 0;
        bottom: 0;
        left: 0;
        width: 100%;
        max-height: 60dvh;
        padding: var(--space-3) var(--space-4) calc(var(--space-3) + env(safe-area-inset-bottom));
        border-inline: 0;
        border-block-end: 0;
        border-radius: var(--radius-card) var(--radius-card) 0 0;
        transform: none;
      }
    }

    /* Room for the ruby above the first line of the reading. */
    .text {
      max-width: var(--reader-measure);
      padding-top: var(--space-2);
    }

    .sentinel {
      height: 1px;
    }
  `,
})
export class ReaderPageComponent {
  /** Route parameter, bound by `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly store = inject(ReaderStore);
  protected readonly aids = inject(SentenceAidsStore);
  protected readonly translationJob = inject(TranslationJobStore);
  protected readonly audioJob = inject(AudioJobStore);
  protected readonly playback = inject(AudioPlaybackStore);
  protected readonly readingAudioMaintenance = inject(ReadingAudioMaintenanceStore);
  protected readonly viewport = inject(ViewportService);
  protected readonly inspector = inject(WordInspectorStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly library = inject(LibraryStore);
  private readonly textModel = inject(TextModelStore);
  private readonly tts = inject(TtsStore);
  private readonly audioConfig = inject(AudioConfigurationService);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly language = inject(LanguageStore);
  protected readonly popover = inject(PopoverService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly viewContainerRef = inject(ViewContainerRef);
  private readonly audioPlayerOutlet = new DomPortalOutlet(document.body);
  private audioPlayerPortal: DomPortal<HTMLElement> | null = null;

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly audioPlayerShell = viewChild<ElementRef<HTMLElement>>('audioPlayerShell');
  private readonly wordPopover = viewChild.required<TemplateRef<unknown>>('wordPopover');
  private readonly wordPreview = viewChild.required<TemplateRef<unknown>>('wordPreview');
  private readonly sentencePopover = viewChild.required<TemplateRef<unknown>>('sentencePopover');
  private readonly topSentinel = viewChild<ElementRef<HTMLElement>>('topSentinel');
  private readonly bottomSentinel = viewChild<ElementRef<HTMLElement>>('bottomSentinel');

  private readonly selectedSentenceIdSignal = signal<SentenceId | null>(null);
  /** The open sentence, tinted so its anchored details stay related to it. */
  protected readonly selectedSentenceId = this.selectedSentenceIdSignal.asReadonly();

  protected readonly preferences = this.settings.readerPreferences;

  /** Clamped here too: a stored row is external data like any other. */
  protected readonly textScale = computed(() => clampTextScale(this.preferences().textScale));

  protected readonly readerHeading = computed(() => {
    switch (this.store.status()) {
      case 'loading':
        return 'Opening reading…';
      case 'not-found':
      case 'failed':
        return 'Reading unavailable';
      case 'ready':
        return this.store.reading()?.title ?? 'Reading';
      case 'idle':
        return 'Reading';
    }
  });

  protected readonly selectedWord = computed<SelectedWord | null>(() => {
    const selected = this.inspector.selected();
    return selected === null
      ? null
      : { sentenceId: selected.sentence.id, tokenId: selected.token.id };
  });

  /** The whole word currently under the pointer or keyboard focus. */
  private readonly previewedWordSignal = signal<SelectedWord | null>(null);
  protected readonly previewedWord = this.previewedWordSignal.asReadonly();

  /** Every mounted sentence by id, for resolving what a press selected. */
  private readonly sentencesById = computed(() => {
    const byId = new Map<string, ReaderSentence>();
    for (const paragraph of this.store.paragraphs()) {
      for (const sentence of paragraph.sentences) {
        byId.set(sentence.sentence.id, sentence);
      }
    }
    return byId;
  });

  protected readonly selectedSentenceAids = computed(() => {
    const sentenceId = this.selectedSentenceIdSignal();
    return sentenceId === null ? NO_AIDS : (this.aids.aids().get(sentenceId) ?? NO_AIDS);
  });

  /**
   * The words in the open sentence the learner's vocabulary does not cover —
   * the same ones the page underlines, said in words.
   *
   * De-duplicated by surface, because a sentence repeating a word it does not
   * know says nothing more the second time.
   */
  protected readonly selectedUnknownWords = computed<readonly UnknownWord[]>(() => {
    const sentenceId = this.selectedSentenceIdSignal();
    const sentence = sentenceId === null ? undefined : this.sentencesById().get(sentenceId);
    const statuses = sentence?.statuses;
    if (sentence === undefined || statuses === null || statuses === undefined) {
      return [];
    }
    const words: UnknownWord[] = [];
    const seen = new Set<string>();
    for (const token of sentence.tokens) {
      const status = statuses.get(token.id);
      if (status === undefined || seen.has(token.surface)) {
        continue;
      }
      const presentation = presentStatus(status.validation);
      if (presentation.marker === 'warning-vocabulary') {
        seen.add(token.surface);
        words.push({ surface: token.surface, label: presentation.label });
      }
    }
    return words;
  });

  /**
   * The grammar around the open word.
   *
   * Findings are filtered to the ones whose span covers this word, so a note
   * about a pattern elsewhere in the sentence is not attached to a word it says
   * nothing about.
   */
  protected readonly wordGrammar = computed<WordGrammarState>(() => {
    const selected = this.inspector.selected();
    if (selected === null) {
      return NO_WORD_GRAMMAR;
    }
    const aids = this.aids.aids().get(selected.sentence.id) ?? NO_AIDS;
    const grammar = aids.grammar;
    return {
      findings: grammar === null ? [] : findingsCoveringToken(grammar.findings, selected.token),
      sentenceFindings: grammar === null ? [] : sentenceWideFindings(grammar.findings),
      analyzed: grammar !== null,
      stale: aids.grammarStale,
    };
  });

  /**
   * A generated story was reviewed against the profile captured with it, so it
   * is never re-analysed: that would judge frozen text by a profile it was
   * never written for.
   */
  private readonly audioPlayerOpenSignal = signal(false);
  protected readonly audioPlayerOpen = this.audioPlayerOpenSignal.asReadonly();

  /**
   * The sentence that was selected when the audio player was opened. The
   * player is independent from sentence and word popovers, so the selection
   * remains visible while this captured value powers Start from this sentence.
   */
  private readonly audioPlayerSentenceIdSignal = signal<SentenceId | null>(null);
  protected readonly audioPlayerSentenceId = this.audioPlayerSentenceIdSignal.asReadonly();
  /**
   * Whether generation would be refused for want of a configuration.
   *
   * Resolved through the same service the job itself gates on rather than
   * through saved presets: a tested model and voice with no preset saved is an
   * ordinary state, and it was being offered "Set up audio model" beside a
   * Generate button that worked perfectly.
   */
  protected readonly hasAudioModel = computed(() => this.audioConfig.resolve('tts-synthesis').ok);

  /**
   * The audio button says its state out loud, because its icon never changes.
   *
   * Playback is named before generation, not after it: the two now run at the
   * same time, and what the learner is hearing is the more useful of the two to
   * be told about.
   */
  protected readonly audioButtonLabel = computed(() => {
    switch (this.playback.status()) {
      case 'playing':
        return 'Audio, playing';
      case 'paused':
        return 'Audio, paused';
      case 'waiting':
        return 'Audio, waiting for the next sentence';
      case 'stepped':
        return 'Audio, ready for the next sentence';
      case 'ended':
        return 'Audio, finished';
      default:
        break;
    }
    if (this.audioJob.isRunning()) {
      return 'Audio, being generated';
    }
    return this.playback.hasPlayableAudio() ? 'Audio, ready' : 'Audio';
  });

  protected readonly canAnalyzeGrammar = computed(
    () => (this.store.reading()?.kind ?? 'imported') === 'imported',
  );

  protected readonly hasTranslationModel = computed(
    () => this.textModel.configForTask('translation') !== null,
  );

  protected readonly hasGrammarModel = computed(
    () => this.textModel.configForTask('grammar') !== null,
  );

  private edgeObserver: IntersectionObserver | null = null;
  /** Keeps the docked sheet clear of the docked player as the player resizes. */
  private playerResizeObserver: ResizeObserver | null = null;
  /**
   * Whether playback may scroll the page to the sentence it has reached.
   *
   * A scroll the learner made themselves turns this off - they have said where
   * they want to look - and only an explicit Play, Next, or Previous turns it
   * back on (`ai-pipelines.md` section 11).
   */
  private followPlayback = true;
  /** True while our own `scrollIntoView` is emitting scroll events. */
  private scrollingProgrammatically = false;
  /** The navigation count the follow state was last reconciled against. */
  private lastNavigation = 0;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  /** Watches an open sheet, so a growing one never covers its own subject. */
  private sheetClearance: ResizeObserver | null = null;
  private previewRef: PopoverRef | null = null;

  constructor() {
    // Model and credential settings are ready from bootstrap. The remaining
    // local state below is specific to the reader route.
    void this.grammarProfile.load();
    // The bundle the live grammar profile is resolved against. Already started
    // at bootstrap; asking again is idempotent and keeps a reading opened
    // straight after startup from showing an unresolved profile.
    void this.language.initialize();

    effect(() => {
      const nextReadingId = readingId(this.id());
      // Untracked, like every store call below it. An effect tracks the signals
      // its body reads, including the ones read inside the calls it makes, and
      // these stores read state they then rewrite — so a tracked call makes the
      // effect its own trigger and it never stops running.
      untracked(() => {
        this.closeReaderSurfaces();
        void this.store.open(nextReadingId);
      });
    });

    effect(() => {
      // Re-registered whenever the mounted window changes, because the observed
      // sentinels and sentences are replaced with it.
      const paragraphs = this.store.paragraphs();
      const reading = this.store.reading();
      if (reading !== null) {
        // A local read of the stored aids for exactly the sentences now
        // mounted. Nothing here reaches a provider: a missing aid is fetched
        // only when the learner asks for it.
        untracked(() => {
          void this.aids.load(
            reading,
            paragraphs.flatMap((paragraph) =>
              paragraph.sentences.map((sentence) => sentence.sentence),
            ),
          );
        });
      }
      queueMicrotask(() => {
        this.observeEdges();
      });
    });

    effect(() => {
      // A job writes rows this page is displaying, so its progress is what
      // tells the reader to re-read them. Re-reading the reading row also
      // refreshes the summaries the menu counts, and that in turn re-runs the
      // aid load above for the mounted window.
      if (this.translationJob.progress().kind !== 'idle') {
        // `refreshSummaries` reads the reading row it is about to replace, and
        // replaces it with a fresh object. Tracked, that re-ran this effect,
        // which refreshed again — an unbounded loop of reads behind a screen
        // that looked idle.
        untracked(() => {
          void this.store.refreshSummaries();
        });
      }
    });

    effect(() => {
      // Which clips exist, re-read whenever the reading changes and whenever
      // the audio job has written more. Two local reads: the player appears
      // because clips exist, never because a run started. The re-read is also
      // what lets a session waiting at the frontier read on, since the clip it
      // is waiting for becomes available here (ADR 0034).
      const reading = this.store.reading();
      this.audioJob.progress();
      this.tts.settings();
      if (reading !== null) {
        untracked(() => {
          void this.playback.prepare(reading);
        });
      }
    });

    effect(() => {
      // The audio job writes rows the menu counts, exactly as translation does.
      if (this.audioJob.progress().kind !== 'idle') {
        untracked(() => {
          void this.store.refreshSummaries();
        });
      }
    });

    effect(() => {
      // A session waiting at the frontier is waiting for a clip the run is
      // about to store. Once the run has failed or been cancelled that clip is
      // never coming, and only the reader knows: the playback store has no
      // business watching a generation job, so the release is made from here.
      //
      // The wait itself is watched, not only the job: one sentence at a time
      // can start a wait *after* the run has stopped, and a release that only
      // fired on the job's own transition would leave that one waiting for
      // something that had already been called off.
      const kind = this.audioJob.progress().kind;
      const waiting = this.playback.status() === 'waiting';
      if (waiting && (kind === 'failed' || kind === 'cancelled')) {
        untracked(() => {
          this.playback.abandonWaiting();
        });
      }
    });

    effect(() => {
      // Follow the sentence being read, but only into view and only while the
      // learner has not scrolled away themselves.
      const navigation = this.playback.explicitNavigation();
      if (navigation !== this.lastNavigation) {
        this.lastNavigation = navigation;
        this.followPlayback = true;
      }
      const sentenceId = this.playback.currentSentenceId();
      if (sentenceId !== null && this.followPlayback) {
        queueMicrotask(() => {
          this.revealSentence(sentenceId);
        });
      }
    });

    effect(() => {
      if (!this.audioPlayerOpenSignal()) {
        return;
      }
      // The conditional wrapper is rendered in this view, then moved into the
      // body after the CDK overlay container. That keeps the regular fixed
      // surface above a reader popover pane without making the player an
      // overlay or changing the popover service's ownership.
      this.audioPlayerShell();
      queueMicrotask(() => {
        this.attachAudioPlayerShell();
      });
    });

    const suppressFollow = (): void => {
      // Only a scroll the learner made themselves counts. The programmatic one
      // in `revealSentence` sets its own guard, so following never switches
      // itself off.
      if (!this.scrollingProgrammatically) {
        this.followPlayback = false;
      }
    };
    window.addEventListener('scroll', suppressFollow, { passive: true });
    window.addEventListener('wheel', suppressFollow, { passive: true });
    window.addEventListener('touchmove', suppressFollow, { passive: true });

    inject(DestroyRef).onDestroy(() => {
      this.endPreview();
      this.releaseSheetClearance();
      this.popover.close();
      this.releasePlayerHeight();
      if (this.audioPlayerOutlet.hasAttached()) {
        this.audioPlayerOutlet.detach();
      }
      window.removeEventListener('scroll', suppressFollow);
      window.removeEventListener('wheel', suppressFollow);
      window.removeEventListener('touchmove', suppressFollow);
      this.edgeObserver?.disconnect();
      this.store.close();
    });
  }

  protected reload(): void {
    void this.store.open(readingId(this.id()));
  }

  /**
   * Translates everything in the reading that has no current translation.
   *
   * The only whole-reading request in the reader, and it starts here and
   * nowhere else. Opening a reading resumes nothing on its own.
   */
  protected startWholeReadingTranslation(): void {
    void this.translationJob.start(readingId(this.id()));
  }

  protected retryWholeReadingTranslation(): void {
    void this.translationJob.retry(readingId(this.id()));
  }

  /**
   * Reads aloud everything in the reading that has no clip for the current
   * voice. The only whole-reading audio request, and it starts here.
   */
  protected startWholeReadingAudio(): void {
    this.readingAudioMaintenance.acknowledge();
    void this.audioJob.start(readingId(this.id()));
  }

  protected retryWholeReadingAudio(): void {
    this.readingAudioMaintenance.acknowledge();
    void this.audioJob.retry(readingId(this.id()));
  }

  /** Confirms the destructive reading-level action selected from the More menu. */
  protected async confirmClearReadingAudio(): Promise<void> {
    const reading = this.store.reading();
    if (reading === null || this.readingAudioMaintenance.state() === 'clearing') {
      return;
    }
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete audio for this reading?',
      message: 'This permanently deletes every generated audio clip for this reading.',
      details: ['The reading, translations, and grammar results stay saved.'],
      footnote: 'You can generate the audio again from scratch.',
      confirmLabel: 'Delete audio',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (confirmed) {
      await this.clearReadingAudioFromStorage(reading);
    }
  }

  /** Deletes only this reading's clips and jobs, then refreshes every local view. */
  private async clearReadingAudioFromStorage(reading: Reading): Promise<void> {
    await this.readingAudioMaintenance.clear(reading);
    this.audioJob.acknowledge();
    await this.store.refreshSummaries();
  }

  /**
   * Toggles the independent floating player. Both directions are local and
   * silent: opening loads nothing, closing stops neither playback nor a
   * generation run. Playback is application-wide and outlives this card.
   */
  protected toggleAudioPlayer(): void {
    if (
      this.store.status() !== 'ready' ||
      !this.store.paragraphs().some((paragraph) => paragraph.sentences.length > 0)
    ) {
      return;
    }
    if (this.audioPlayerOpenSignal()) {
      if (this.audioPlayerOutlet.hasAttached()) {
        this.audioPlayerOutlet.detach();
      }
      this.audioPlayerPortal = null;
      this.releasePlayerHeight();
      // Deliberately not a stop. Hiding the card to read the text underneath is
      // not "stop reading to me", and the transport has its own Stop now; the
      // header button keeps saying that a reading is playing, and reopening
      // lands back on the live session.
      this.audioPlayerSentenceIdSignal.set(null);
      this.audioPlayerOpenSignal.set(false);
      return;
    }
    this.audioPlayerSentenceIdSignal.set(this.selectedSentenceIdSignal());
    this.audioPlayerOpenSignal.set(true);
  }

  /** Clears every surface whose content belongs to the current reading. */
  private closeReaderSurfaces(): void {
    this.endPreview();
    this.releaseSheetClearance();
    this.popover.close();
    if (this.audioPlayerOutlet.hasAttached()) {
      this.audioPlayerOutlet.detach();
    }
    this.audioPlayerPortal = null;
    this.releasePlayerHeight();
    this.playback.stop();
    this.audioPlayerSentenceIdSignal.set(null);
    this.audioPlayerOpenSignal.set(false);
    this.selectedSentenceIdSignal.set(null);
  }

  private attachAudioPlayerShell(): void {
    const shell = this.audioPlayerShell()?.nativeElement;
    if (
      !this.audioPlayerOpenSignal() ||
      shell === undefined ||
      this.audioPlayerOutlet.hasAttached()
    ) {
      return;
    }
    this.audioPlayerPortal = new DomPortal(shell);
    this.audioPlayerOutlet.attach(this.audioPlayerPortal);
    this.trackPlayerHeight(shell);
  }

  /**
   * Publishes how tall the player is, for anything else docked to the bottom.
   *
   * On a phone both the player and a details sheet dock to the bottom edge, and
   * the sheet has no other way to know what it is landing on. Measured rather
   * than assumed, because the player is a transport in one state and a
   * generation panel in another.
   */
  private trackPlayerHeight(shell: HTMLElement): void {
    this.playerResizeObserver?.disconnect();
    const publish = (): void => {
      document.documentElement.style.setProperty(
        DOCKED_PLAYER_HEIGHT,
        `${String(Math.round(shell.getBoundingClientRect().height))}px`,
      );
    };
    publish();
    this.playerResizeObserver = new ResizeObserver(publish);
    this.playerResizeObserver.observe(shell);
  }

  /** Gives the bottom edge back once the player is gone. */
  private releasePlayerHeight(): void {
    this.playerResizeObserver?.disconnect();
    this.playerResizeObserver = null;
    document.documentElement.style.removeProperty(DOCKED_PLAYER_HEIGHT);
  }

  /**
   * Opens a sentence where it was pressed.
   *
   * Opening costs nothing: the popover shows the stored translation, or the
   * button that would fetch one. A stray press on a line is free.
   */
  protected selectSentence(selection: SentenceSelection): void {
    const sentence = this.sentencesById().get(selection.sentenceId);
    if (sentence === undefined) {
      return;
    }
    if (this.selectedSentenceIdSignal() === sentence.sentence.id) {
      // The same gesture on the same sentence, for the same reason as a word.
      this.popover.close();
      return;
    }
    this.endPreview();
    this.openSentence(sentence.sentence.id, { x: selection.x, y: selection.y });
  }

  private openSentence(
    sentenceId: SentenceId,
    origin: { x: number; y: number } | HTMLElement,
  ): void {
    // For the same reason as a word: the closing surface clears the selection,
    // so whatever is open goes first and the new sentence is set after it.
    this.popover.close();
    this.selectedSentenceIdSignal.set(sentenceId);
    this.popover.open({
      origin,
      template: this.sentencePopover(),
      viewContainerRef: this.viewContainerRef,
      closeOnScroll: true,
      // A press on a word is about that word, whatever is open at the time.
      retargetSelector: WORD_TARGET,
      onClosed: () => {
        this.releaseSheetClearance();
        this.selectedSentenceIdSignal.set(null);
      },
    });
    this.keepClearOfSheet(
      origin instanceof HTMLElement
        ? origin
        : document.querySelector<HTMLElement>(`[data-sentence-id="${CSS.escape(sentenceId)}"]`),
    );
  }

  protected translateSelectedSentence(): void {
    const sentenceId = this.selectedSentenceIdSignal();
    if (sentenceId === null) {
      return;
    }
    void this.aids.translateSentence(sentenceId).then(() => this.store.refreshSummaries());
  }

  /**
   * Synthesizes the open sentence, because it was asked for.
   *
   * Producing a clip never plays it: the popover then offers Play, which is a
   * second explicit action.
   */
  protected synthesizeSelectedSentence(): void {
    const sentenceId = this.selectedSentenceIdSignal();
    if (sentenceId === null) {
      return;
    }
    void this.aids.synthesizeSentence(sentenceId).then(async () => {
      await this.store.refreshSummaries();
      const reading = this.store.reading();
      if (reading !== null) {
        await this.playback.prepare(reading);
      }
    });
  }

  /** Plays the open sentence and stops at its end. */
  protected playSelectedSentence(): void {
    const sentenceId = this.selectedSentenceIdSignal();
    if (sentenceId !== null) {
      void this.playback.playSentence(sentenceId);
    }
  }

  /** Analyses the open sentence, because it was asked for. */
  protected analyzeSelectedSentence(): void {
    const sentenceId = this.selectedSentenceIdSignal();
    if (sentenceId === null) {
      return;
    }
    void this.aids.analyzeGrammar(sentenceId).then(() => this.store.refreshSummaries());
  }

  /**
   * Pins word details in a popover anchored to the word itself.
   *
   * Everything shown is local, so this stays a lookup in the bundled dictionary
   * and never a request. Focus returns to the token when the popover closes.
   */
  protected inspect(activation: TokenActivation): void {
    const open = this.inspector.selected();
    if (
      open !== null &&
      open.sentence.id === activation.sentence.sentence.id &&
      open.token.id === activation.token.id
    ) {
      // Pressing the open word again puts it away. Reopening it would replay
      // the sheet's entrance over the same word and leave a reader who meant
      // to dismiss it exactly where they started.
      this.popover.close();
      return;
    }
    this.endPreview();
    // Before the new word is set, because closing the surface over the old one
    // clears the selection, and a close that ran afterwards would clear this.
    this.popover.close();
    void this.inspector.inspect({
      token: activation.token,
      word: activation.word,
      sentence: activation.sentence.sentence,
      status: activation.sentence.statuses?.get(activation.token.id) ?? null,
    });

    this.popover.open({
      origin: activation.origin,
      template: this.wordPopover(),
      viewContainerRef: this.viewContainerRef,
      returnFocusTo: activation.origin,
      closeOnScroll: true,
      // Moving on to the next word is one press, not one to put this card away
      // and a second to open the next.
      retargetSelector: WORD_TARGET,
      onClosed: () => {
        this.releaseSheetClearance();
        this.inspector.close();
      },
    });
    this.keepClearOfSheet(activation.origin);
  }

  /**
   * Scrolls the word or line a sheet is about back into what is left of the
   * page.
   *
   * A sheet docks over the bottom of the screen, so on a phone the press that
   * opened it is as often as not underneath it — details about a word the
   * reader can no longer see, in a sentence they can no longer read. Nothing
   * happens on a desktop, where the card is anchored beside its word, or when
   * the subject is already clear of the sheet.
   */
  private keepClearOfSheet(anchor: HTMLElement | null): void {
    this.releaseSheetClearance();
    if (anchor === null || !this.viewport.isMobile()) {
      return;
    }
    // After the frame the sheet is laid out in: it is the sheet's own top edge
    // that has to be cleared, and it has none until it has been rendered.
    requestAnimationFrame(() => {
      const sheet = document.querySelector<HTMLElement>('.mn-popover-pane.is-sheet');
      if (sheet === null) {
        return;
      }
      let scrolled = false;
      let target = window.scrollY;
      const clear = (): void => {
        const overlap =
          anchor.getBoundingClientRect().bottom -
          sheet.getBoundingClientRect().top +
          SHEET_CLEARANCE;
        // Resolved to a position rather than a distance, so a measurement taken
        // while a smooth scroll is still running does not ask for the same
        // distance twice.
        const wanted = window.scrollY + overlap;
        if (overlap <= 0 || wanted <= target + 1) {
          return;
        }
        target = wanted;
        this.scrollingProgrammatically = true;
        window.scrollTo({
          top: target,
          // The first move is the one the reader sees answer their press. A
          // correction after the sheet has grown is not a second journey.
          behavior: scrolled || this.viewport.prefersReducedMotion() ? 'auto' : 'smooth',
        });
        scrolled = true;
        setTimeout(() => {
          this.scrollingProgrammatically = false;
        }, SCROLL_SETTLE_MS);
      };
      // A sheet is as tall as what it has to say, and it has nothing to say
      // until a lookup or a stored translation has arrived: measuring only once
      // would clear an edge the sheet is about to grow past. The observer
      // reports the first size as well, so this is also the initial check.
      this.sheetClearance = new ResizeObserver(clear);
      this.sheetClearance.observe(sheet);
    });
  }

  private releaseSheetClearance(): void {
    this.sheetClearance?.disconnect();
    this.sheetClearance = null;
  }

  protected closeInspector(): void {
    this.popover.close();
  }

  /**
   * Shows the concise hover preview, after a pause so that sweeping the pointer
   * across a line does not flash a card per word.
   *
   * Suppressed while a word is pinned: the preview and the pinned card share
   * one floating surface, and a hover must never dismiss what the learner
   * deliberately opened.
   */
  protected previewWord(activation: TokenActivation): void {
    if (this.inspector.isOpen() || this.selectedSentenceIdSignal() !== null) {
      return;
    }
    this.previewedWordSignal.set({
      sentenceId: activation.sentence.sentence.id,
      tokenId: activation.token.id,
    });
    this.cancelPreviewTimer();
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      void this.inspector.previewWord(activation.word);
      this.previewRef = this.popover.open({
        origin: activation.origin,
        template: this.wordPreview(),
        viewContainerRef: this.viewContainerRef,
        modal: false,
        onClosed: () => {
          this.previewRef = null;
        },
      });
    }, PREVIEW_DELAY_MS);
  }

  protected endPreview(): void {
    this.cancelPreviewTimer();
    this.previewedWordSignal.set(null);
    this.previewRef?.close();
    this.previewRef = null;
    this.inspector.clearPreview();
  }

  private cancelPreviewTimer(): void {
    if (this.previewTimer !== null) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
  }

  protected async confirmDelete(): Promise<void> {
    const reading = this.store.reading();
    if (reading === null) {
      return;
    }
    const plan = describeDeletion(reading);
    const confirmed = await openConfirmDialog(this.dialog, {
      title: `Delete ${plan.title}?`,
      message: 'This cannot be undone. It permanently removes:',
      details: plan.removes,
      footnote: `${plan.preserves.join(', ')} are not affected.`,
      confirmLabel: 'Delete permanently',
      cancelLabel: 'Keep it',
      tone: 'danger',
    });
    if (confirmed && (await this.library.delete(reading.id))) {
      // Before navigating: a deleted reading must not go on being read aloud.
      this.playback.readingDeleted(reading.id);
      await this.router.navigate(['/library']);
    }
  }

  /**
   * Brings the sentence being read into view, and only if it is not already.
   *
   * Scrolling a sentence that is already on screen would jerk the page on every
   * advance, which is exactly the behaviour that makes a follow-along player
   * unusable. A sentence outside the mounted window has no element yet and is
   * simply left alone.
   */
  private revealSentence(sentenceId: SentenceId): void {
    const element = document.querySelector<HTMLElement>(
      `[data-sentence-id="${CSS.escape(sentenceId)}"]`,
    );
    if (element === null) {
      return;
    }
    const box = element.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) {
      return;
    }
    this.scrollingProgrammatically = true;
    element.scrollIntoView({
      block: 'center',
      behavior: this.viewport.prefersReducedMotion() ? 'auto' : 'smooth',
    });
    // Released after the scroll has settled, so the events it emits are not
    // mistaken for the learner scrolling away from the player.
    setTimeout(() => {
      this.scrollingProgrammatically = false;
    }, SCROLL_SETTLE_MS);
  }

  /** Extends the mounted window when a sentinel at either edge scrolls in. */
  private observeEdges(): void {
    this.edgeObserver?.disconnect();
    const top = this.topSentinel()?.nativeElement;
    const bottom = this.bottomSentinel()?.nativeElement;
    if (!top && !bottom) {
      return;
    }

    this.edgeObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) {
            continue;
          }
          void this.store.extend(entry.target === top ? 'backward' : 'forward');
        }
      },
      { rootMargin: '400px' },
    );
    if (top) {
      this.edgeObserver.observe(top);
    }
    if (bottom) {
      this.edgeObserver.observe(bottom);
    }
  }
}
