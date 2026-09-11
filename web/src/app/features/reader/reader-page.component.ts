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
import { Router, RouterLink } from '@angular/router';
import { ReadingAudioMaintenanceStore } from '../../application/enrichment/reading-audio-maintenance.store';
import { ReadingTextAidMaintenanceStore } from '../../application/enrichment/reading-text-aid-maintenance.store';
import { ReaderAudioStore } from '../../application/reading/reader-audio.store';
import { ReaderPreparationStore } from '../../application/reading/reader-preparation.store';
import { ReaderSelectionStore } from '../../application/reading/reader-selection.store';
import { SentenceAidsStore } from '../../application/enrichment/sentence-aids.store';
import { PREPARATION_ORDER, type PreparationLayer } from '../../domain/enrichment/preparation';
import { readerContentState } from './reader-content-state';
import { ReaderStore, type ReaderSentence } from '../../application/reading/reader.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { LibraryStore } from '../../application/reading/library.store';
import { ViewportService } from '../../core/platform/viewport.service';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import {
  DEFAULT_PARAGRAPH_HEIGHT_PX,
  paragraphAtOffset,
  paragraphSpacers,
  windowContains,
} from '../../domain/reading/paragraph-window';
import { findingsCoveringToken, sentenceWideFindings } from '../../domain/enrichment/finding-spans';
import { readingId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import { presentStatus } from '../../domain/reading/token-presentation';
import { clampTextScale } from '../../domain/settings/settings';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopoverService, type PopoverRef } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import { ReaderMenuComponent } from './reader-menu.component';
import type { SentenceSelection } from './paragraph-gestures.directive';
import type { SelectedWord, TokenActivation } from './reader-sentence.component';
import type { UnknownWord } from './sentence-popover.component';
import { SentencePopoverComponent } from './sentence-popover.component';
import { ReadingPlayerComponent } from './reading-player.component';
import {
  NO_WORD_GRAMMAR,
  WordInspectorComponent,
  type WordGrammarState,
} from './word-inspector.component';
import { WordPreviewComponent } from './word-preview.component';
import { NotFoundPanelComponent } from '../../shared-ui/not-found/not-found-panel.component';

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
    ReaderParagraphComponent,
    ReaderMenuComponent,
    ReaderPopoverComponent,
    ReadingPlayerComponent,
    SentencePopoverComponent,
    WordInspectorComponent,
    WordPreviewComponent,
    NotFoundPanelComponent,
  ],
  providers: [
    ReaderStore,
    WordInspectorStore,
    SentenceAidsStore,
    ReadingAudioMaintenanceStore,
    ReadingTextAidMaintenanceStore,
    ReaderAudioStore,
    ReaderPreparationStore,
    ReaderSelectionStore,
  ],
  template: `
    <div
      class="reader"
      [class.has-audio-player]="audio.playerOpen()"
      [style.--reader-scale]="textScale()"
      [style.--sheet-scroll-reserve]="sheetScrollReserve()"
    >
      <header #readerBar class="bar">
        <div class="bar-row">
          <a
            class="mn-icon-button back"
            routerLink="/library"
            aria-label="Back to library"
            (click)="backToLibrary($event)"
          >
            <mn-icon name="back" />
          </a>
          <h1 [attr.lang]="store.status() === 'ready' ? 'ja' : 'en'">{{ readerHeading() }}</h1>
          @if (store.status() === 'ready') {
            <div class="bar-actions">
              <!--
                Always here for a loaded reading, whether or not it has any
                audio. The player behind it owns every audio state there is.
              -->
              <button
                type="button"
                class="mn-icon-button audio-button"
                [class.is-busy]="audio.running()"
                [class.is-playing]="audio.playback.isActive()"
                [attr.aria-expanded]="audio.playerOpen()"
                aria-controls="reading-audio-player"
                [attr.aria-label]="audio.buttonLabel()"
                (click)="toggleAudioPlayer()"
              >
                <mn-icon name="audio" />
              </button>
              @if (store.reading(); as reading) {
                <mn-reader-menu
                  [rows]="contentRows()"
                  [hasAudio]="reading.audioSummary.completed > 0 || audio.running()"
                  [savedLayers]="savedTextLayers()"
                  [pending]="contentPending()"
                  [error]="contentError()"
                  (prepare)="prepareContent($event)"
                  (opened)="popover.close()"
                  (stopRequested)="stopContent($event)"
                  (deleteAudioRequested)="confirmClearReadingAudio()"
                  (clearAidRequested)="confirmClearTextAid($event)"
                />
              }
            </div>
          }
        </div>

        @if (store.status() === 'ready') {
          @if (audio.maintenanceState() === 'cleared') {
            <p class="audio-maintenance-message mn-hint" role="status">
              Audio deleted. You can generate it again from scratch.
            </p>
          } @else if (audio.maintenanceError(); as error) {
            <p class="audio-maintenance-message mn-notice mn-notice--error" role="alert">
              Deleting audio failed: {{ error.message }}
            </p>
          }
        }
      </header>

      @if (audio.playerOpen() && store.status() === 'ready') {
        <div
          #audioPlayerShell
          id="reading-audio-player"
          class="audio-player-shell"
          role="region"
          aria-label="Story audio"
        >
          <mn-reading-player
            [progress]="audio.progress()"
            [selectedSentenceId]="audio.playerSentenceId()"
            [modelConfigured]="audio.hasModel()"
            (generate)="audio.start()"
            (retryGeneration)="audio.retry()"
            (cancelGeneration)="cancelAudioJob()"
            (dismissGeneration)="audio.dismiss()"
          />
        </div>
      }

      <div class="content" #content>
        @switch (store.status()) {
          @case ('loading') {
            <p class="mn-hint" role="status">Opening…</p>
          }
          @case ('not-found') {
            <mn-not-found-panel
              heading="This story is no longer here"
              [explanation]="[
                'It may have been deleted. Nothing else in your library was affected.',
              ]"
            />
          }
          @case ('failed') {
            <section class="mn-card" role="alert">
              <h2>This story could not be opened</h2>
              <p class="mn-hint">{{ store.lastError()?.message }}</p>
              <p class="mn-hint">Your saved text was not changed.</p>
              <button type="button" class="mn-button" (click)="reload()">Try again</button>
            </section>
          }
          @case ('ready') {
            <a class="mn-skip-link" href="#mn-after-story" (click)="skipStory($event)"
              >Skip past story</a
            >
            <p class="mn-visually-hidden" id="mn-word-keyboard-help">
              Use Left and Right arrows to move between words. Enter opens word details.
            </p>
            <article class="text" aria-describedby="mn-word-keyboard-help">
              <div
                class="virtual-spacer"
                aria-hidden="true"
                data-virtual-spacer="before"
                [style.height.px]="spacers().before"
              ></div>
              @for (paragraph of store.paragraphs(); track paragraph.paragraph.id) {
                <mn-reader-paragraph
                  [entry]="paragraph"
                  [aids]="aids.aids()"
                  [furigana]="preferences().furigana"
                  [tokenSpacing]="preferences().tokenSpacing"
                  [markers]="preferences().warningMarkers"
                  [selectedSentenceId]="selectedSentenceId()"
                  [playingSentenceId]="audio.playback.currentSentenceId()"
                  [selectedWord]="selectedWord()"
                  [previewedWord]="previewedWord()"
                  (activated)="inspect($event)"
                  (previewed)="previewWord($event)"
                  (previewEnded)="endPreview()"
                  (sentenceSelected)="selectSentence($event)"
                />
              }
              <div
                class="virtual-spacer"
                aria-hidden="true"
                data-virtual-spacer="after"
                [style.height.px]="spacers().after"
              ></div>
            </article>
            <a
              id="mn-after-story"
              class="mn-button"
              routerLink="/library"
              (click)="backToLibrary($event)"
              >Go to library</a
            >

            @if (store.hasMoreBelow()) {
              <p class="mn-hint" role="status">
                {{ store.loadingMore() ? 'Loading more…' : '' }}
              </p>
            }
          }
        }
      </div>
    </div>

    <ng-template #sentencePopover>
      <mn-reader-popover label="Sentence details" (closed)="popover.close()">
        <mn-sentence-popover
          [aids]="selectedSentenceAids()"
          [sentenceText]="selectedSentenceText()"
          [canAnalyze]="canAnalyzeGrammar()"
          [translationModelConfigured]="hasTranslationModel()"
          [grammarModelConfigured]="hasGrammarModel()"
          [audioModelConfigured]="audio.voiceChosen()"
          [unknownWords]="selectedUnknownWords()"
          (translate)="selection.translateSentence()"
          (analyzeGrammar)="selection.analyzeSentence()"
          (generateAudio)="selection.synthesizeSentence()"
          (playAudio)="selection.playSentence()"
        />
      </mn-reader-popover>
    </ng-template>

    <ng-template #wordPreview>
      <mn-word-preview />
    </ng-template>

    <ng-template #wordPopover>
      <mn-reader-popover label="Word details" (closed)="popover.close()">
        <mn-word-inspector [grammar]="wordGrammar()" (sentenceActions)="openInspectedSentence()" />
      </mn-reader-popover>
    </ng-template>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

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
      --reader-paragraph-gap: clamp(1.75rem, calc(2.25rem * var(--reader-scale)), 6rem);

      display: grid;
      grid-template-rows: auto 1fr;
      grid-template-areas: 'bar' 'content';
      gap: var(--space-4);
      max-width: var(--reader-measure);
      margin-inline: auto;
    }

    /*
     * Clearance for the floating player, so the last line of a reading is never
     * parked permanently underneath it. Its published height rather than an
     * estimate of it, with a fallback for the frame before the first
     * measurement lands.
     */
    .reader.has-audio-player {
      padding-bottom: calc(
        var(--mn-docked-player-height, 7rem) + var(--space-4) + var(--sheet-scroll-reserve, 0px)
      );
    }

    /*
     * Temporary room below the last line, so a sheet opened over the end of a
     * reading still has somewhere to scroll the pressed line to. Zero at every
     * other moment: it is scaffolding for one gesture, not layout.
     */
    .reader:not(.has-audio-player) {
      padding-bottom: var(--sheet-scroll-reserve, 0px);
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
      isolation: isolate;
      /*
       * A grid item is sized by its content unless it is allowed to shrink, and
       * a long title would otherwise stretch the whole reader past its measure
       * and push the actions off the screen.
       */
      min-width: 0;
      padding-block: var(--space-2);
      background: var(--surface-canvas);
    }

    /*
     * The reader is measured, but its sticky furniture must still cover the
     * full viewport while text scrolls beneath it. Keep the backdrop in the
     * reader's own canvas token so it stays opaque in both themes.
     *
     * Its lower edge is what separates the bar from the reading. It fades in
     * once the text has started to pass beneath it, and is simply always there
     * where scroll-driven animation is not supported.
     */
    .bar::before {
      position: absolute;
      z-index: -1;
      inset-block: 0;
      inset-inline: -100vw;
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-canvas);
      content: '';
      pointer-events: none;
    }

    @supports (animation-timeline: scroll()) {
      .bar::before {
        animation: mn-bar-edge linear both;
        animation-timeline: scroll(root);
        animation-range: 0 var(--space-4);
      }
    }

    .bar-row {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-width: 0;
    }

    /* Glyphs, not hit areas, line up with the reading's edges. */
    .bar-row > .back {
      margin-inline-start: calc(-1 * var(--space-2));
    }

    h1 {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      font-size: var(--text-page-title);
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .bar-actions {
      display: flex;
      flex: none;
      gap: var(--space-1);
      align-items: center;
      margin-inline-end: calc(-1 * var(--space-2));
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
      padding: var(--space-4);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sheet);
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
    @media (max-width: breakpoints.$wide-max) {
      .audio-player-shell {
        right: 0;
        bottom: 0;
        left: 0;
        width: 100%;
        padding: var(--space-4) var(--space-4) calc(var(--space-4) + env(safe-area-inset-bottom));
        border-inline: 0;
        border-block-end: 0;
        border-radius: var(--radius-sheet) var(--radius-sheet) 0 0;
        transform: none;
      }
    }

    @media (max-width: breakpoints.$narrow-max) {
      h1 {
        display: -webkit-box;
        white-space: normal;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
      }
    }

    /* Room for the ruby above the first line of the reading. */
    .text {
      max-width: var(--reader-measure);
      padding-top: var(--space-4);
    }

    .virtual-spacer {
      width: 1px;
      max-width: 100%;
      pointer-events: none;
    }
  `,
})
export class ReaderPageComponent {
  /** Route parameter, bound by `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly store = inject(ReaderStore);
  protected readonly aids = inject(SentenceAidsStore);
  protected readonly preparation = inject(ReaderPreparationStore);
  private readonly textAidMaintenance = inject(ReadingTextAidMaintenanceStore);
  protected readonly contentPending = computed(
    () => this.textAidMaintenance.pending() ?? this.preparation.pending(),
  );
  protected readonly contentError = computed(
    () => this.textAidMaintenance.error()?.message ?? this.preparation.lastError(),
  );
  /** The only part of preparation that is about this page: what a menu draws. */
  protected readonly contentRows = computed(() => {
    const reading = this.store.reading();
    return reading === null
      ? []
      : PREPARATION_ORDER.map((layer) =>
          readerContentState(
            reading,
            layer,
            this.preparation.progressFor(reading.id, layer),
            this.preparation.readiness(layer),
            this.preparation.online(),
          ),
        );
  });
  protected readonly savedTextLayers = computed<readonly PreparationLayer[]>(() => {
    const reading = this.store.reading();
    if (reading === null) return [];
    return [
      ...(reading.translationSummary.completed > 0 ? (['english'] as const) : []),
      ...(reading.grammarSummary.state === 'partial' || reading.grammarSummary.state === 'complete'
        ? (['grammar'] as const)
        : []),
    ];
  });
  protected readonly audio = inject(ReaderAudioStore);
  protected readonly viewport = inject(ViewportService);
  protected readonly inspector = inject(WordInspectorStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly library = inject(LibraryStore);
  protected readonly popover = inject(PopoverService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly navigation = inject(NavigationHistoryService);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly audioPlayerShell = viewChild<ElementRef<HTMLElement>>('audioPlayerShell');
  private readonly readerBar = viewChild<ElementRef<HTMLElement>>('readerBar');
  private readonly wordPopover = viewChild.required<TemplateRef<unknown>>('wordPopover');
  private readonly wordPreview = viewChild.required<TemplateRef<unknown>>('wordPreview');
  private readonly sentencePopover = viewChild.required<TemplateRef<unknown>>('sentencePopover');
  private readonly estimatedParagraphHeightSignal = signal(DEFAULT_PARAGRAPH_HEIGHT_PX);
  private readonly measuredParagraphHeightsSignal = signal<ReadonlyMap<number, number>>(new Map());
  protected readonly spacers = computed(() =>
    paragraphSpacers(
      this.store.window(),
      this.store.totalParagraphs(),
      this.estimatedParagraphHeightSignal(),
      this.measuredParagraphHeightsSignal(),
    ),
  );

  protected readonly selection = inject(ReaderSelectionStore);
  private inspectedActivation: TokenActivation | null = null;
  /** The open sentence, tinted so its anchored details stay related to it. */
  protected readonly selectedSentenceId = this.selection.sentenceId;

  protected readonly preferences = this.settings.readerPreferences;
  private readonly currentReadingId = computed(() => readingId(this.id()));
  protected readonly translationProgress = this.preparation.translationProgress;

  /** Clamped here too: a stored row is external data like any other. */
  protected readonly textScale = computed(() => clampTextScale(this.preferences().textScale));

  protected readonly readerHeading = computed(() => {
    switch (this.store.status()) {
      case 'loading':
        return 'Opening story…';
      case 'not-found':
      case 'failed':
        return 'Story unavailable';
      case 'ready':
        return this.store.reading()?.title ?? 'Reading';
      case 'idle':
        return 'Reading';
    }
  });

  protected readonly selectedWord = this.selection.inspectedWord;

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

  protected readonly selectedSentenceAids = this.selection.sentenceAids;

  protected readonly selectedSentenceText = computed(() => {
    const sentenceId = this.selection.sentenceId();
    return sentenceId === null
      ? ''
      : (this.sentencesById().get(sentenceId)?.sentence.japaneseText ?? '');
  });

  /**
   * The words in the open sentence the learner's vocabulary does not cover —
   * the same ones the page underlines, said in words.
   *
   * De-duplicated by surface, because a sentence repeating a word it does not
   * know says nothing more the second time.
   */
  protected readonly selectedUnknownWords = computed<readonly UnknownWord[]>(() => {
    const sentenceId = this.selection.sentenceId();
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
    const aids = this.selection.inspectedSentenceAids();
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
  protected readonly canAnalyzeGrammar = computed(
    () => (this.store.reading()?.kind ?? 'imported') === 'imported',
  );

  protected skipStory(event: Event): void {
    event.preventDefault();
    document.getElementById('mn-after-story')?.focus();
  }

  protected readonly hasTranslationModel = this.preparation.hasTranslationModel;
  protected readonly hasGrammarModel = this.preparation.hasGrammarModel;

  private scrollWindowFrame: number | null = null;
  private lastScrollY = window.scrollY;
  private lastScrollDirection: 'backward' | 'forward' | null = null;
  private measuredLayoutKey = '';
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
  private sheetAnchor: HTMLElement | null = null;
  /** Where the press landed, so a wrapped sentence clears the pressed line. */
  private sheetAnchorY: number | null = null;
  private sheetClearanceCheck: (() => void) | null = null;
  private sheetClearanceFrame: number | null = null;
  private sheetScrollFrame: number | null = null;
  private readonly sheetReserveSignal = signal(0);
  protected readonly sheetScrollReserve = computed(() => `${String(this.sheetReserveSignal())}px`);
  private previewRef: PopoverRef | null = null;

  constructor() {
    effect(() => {
      const nextReadingId = readingId(this.id());
      // Untracked, like every store call below it. An effect tracks the signals
      // its body reads, including the ones read inside the calls it makes, and
      // these stores read state they then rewrite — so a tracked call makes the
      // effect its own trigger and it never stops running.
      untracked(() => {
        this.closeReaderSurfaces();
        this.audio.setReading(nextReadingId);
        void this.openReading(nextReadingId);
      });
    });

    effect(() => {
      // Measurements survive unmounting, so spacer estimates become exact for
      // every paragraph the learner has passed.
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
      requestAnimationFrame(() => {
        this.measureMountedParagraphs();
      });
    });

    effect(() => {
      const layoutKey = `${String(this.textScale())}:${String(this.preferences().furigana)}`;
      this.store.paragraphs();
      untracked(() => {
        if (layoutKey !== this.measuredLayoutKey) {
          this.measuredLayoutKey = layoutKey;
          this.measuredParagraphHeightsSignal.set(new Map());
          this.estimatedParagraphHeightSignal.set(DEFAULT_PARAGRAPH_HEIGHT_PX * this.textScale());
        }
        requestAnimationFrame(() => {
          this.measureMountedParagraphs();
        });
      });
    });

    effect(() => {
      // A job writes rows this page is displaying, so its progress is what
      // tells the reader to re-read them. Re-reading the reading row also
      // refreshes the summaries the menu counts, and that in turn re-runs the
      // aid load above for the mounted window.
      if (this.translationProgress().kind !== 'idle') {
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
      this.audio.progress();
      this.audio.tts.settings();
      if (reading !== null) {
        untracked(() => {
          void this.audio.playback.prepare(reading);
        });
      }
    });

    effect(() => {
      // The audio job writes rows the menu counts, exactly as translation does.
      if (this.audio.progress().kind !== 'idle') {
        untracked(() => {
          void this.store.refreshSummaries();
        });
      }
    });

    effect(() => {
      if (this.preparation.grammarRunning()) {
        untracked(() => {
          void this.store.refreshSummaries();
        });
      }
    });

    effect(() => {
      // A session at the frontier is waiting for a clip the run is about to
      // store. Once the run has failed or been cancelled that clip is never
      // coming, and only the reader knows: the playback store has no business
      // watching a generation job, so the word is passed from here.
      //
      // Told whether or not a wait is showing, because a continuous session
      // holds inside its own resource: that resource has to be sealed for the
      // element to reach the end of what was made rather than stall at it.
      // The wait is still watched too — one sentence at a time can start one
      // *after* the run has stopped, and a release that only fired on the job's
      // own transition would leave it waiting for something already called off.
      const kind = this.audio.progress().kind;
      this.audio.playback.status();
      if (kind === 'failed' || kind === 'cancelled') {
        untracked(() => {
          this.audio.playback.stopExpectingClips();
        });
      }
    });

    effect(() => {
      // Follow the sentence being read, but only into view and only while the
      // learner has not scrolled away themselves.
      const navigation = this.audio.playback.explicitNavigation();
      if (navigation !== this.lastNavigation) {
        this.lastNavigation = navigation;
        this.followPlayback = true;
      }
      const sentenceId = this.audio.playback.currentSentenceId();
      if (sentenceId !== null && this.followPlayback) {
        queueMicrotask(() => {
          this.revealSentence(sentenceId);
        });
      }
    });

    effect(() => {
      if (!this.audio.playerOpen()) {
        return;
      }
      // The conditional wrapper is rendered immediately after the header, so
      // its fixed visual position does not leave it after every token in the
      // keyboard order. It still publishes its measured height for sheets.
      this.audioPlayerShell();
      queueMicrotask(() => {
        const shell = this.audioPlayerShell()?.nativeElement;
        if (this.audio.playerOpen() && shell !== undefined) {
          this.trackPlayerHeight(shell);
        }
      });
    });

    const suppressFollow = (): void => {
      // Only a scroll the learner made themselves counts. The programmatic one
      // in `revealSentence` sets its own guard, so following never switches
      // itself off.
      if (!this.scrollingProgrammatically) {
        this.followPlayback = false;
        this.stopFollowingSheetAnchor();
        if (window.scrollY > this.lastScrollY + 1) {
          this.lastScrollDirection = 'forward';
        } else if (window.scrollY < this.lastScrollY - 1) {
          this.lastScrollDirection = 'backward';
        }
      }
      this.lastScrollY = window.scrollY;
      this.scheduleWindowForScroll();
    };
    const remeasureSheet = (): void => {
      this.rearmSheetClearance();
    };
    window.addEventListener('scroll', suppressFollow, { passive: true });
    window.addEventListener('wheel', suppressFollow, { passive: true });
    window.addEventListener('touchmove', suppressFollow, { passive: true });
    window.addEventListener('resize', remeasureSheet, { passive: true });
    const navigateEdge = (event: KeyboardEvent): void => {
      if (
        (event.key !== 'Home' && event.key !== 'End') ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      ) {
        return;
      }
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement ||
        (event.target instanceof HTMLElement && event.target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      void this.moveToDocumentEdge(event.key === 'End' ? 'end' : 'start');
    };
    window.addEventListener('keydown', navigateEdge);

    inject(DestroyRef).onDestroy(() => {
      // Leaving the reading ends the session that was reading it aloud. The
      // player is the only surface with a transport, and it lives here, so
      // playback that outlived this route was a sound with no control anywhere
      // in the application (ADR 0041). Being backgrounded is a different thing
      // and stops nothing: the reader is still open, and the media notification
      // is the control there.
      this.audio.playback.stop();
      this.endPreview();
      this.releaseSheetClearance();
      this.popover.close();
      this.releasePlayerHeight();
      window.removeEventListener('scroll', suppressFollow);
      window.removeEventListener('wheel', suppressFollow);
      window.removeEventListener('touchmove', suppressFollow);
      window.removeEventListener('resize', remeasureSheet);
      window.removeEventListener('keydown', navigateEdge);
      if (this.scrollWindowFrame !== null) {
        cancelAnimationFrame(this.scrollWindowFrame);
      }
      this.preparation.leftReader();
      this.store.close();
    });
  }

  protected reload(): void {
    void this.openReading(this.currentReadingId());
  }

  /**
   * Opening a reader is one of the four moments that create preparation work
   * (ADR 0047): whatever this reading declares and has never been given is
   * queued, and the lane works it — this reading first, because it is the one
   * being read.
   */
  private async openReading(id: ReadingId): Promise<void> {
    await this.store.open(id);
    const reading = this.store.reading();
    if (this.currentReadingId() !== id || this.store.status() !== 'ready' || reading === null) {
      return;
    }
    await this.preparation.openedReading(id);
  }

  /** An explicit request fills the missing content with the current settings. */
  protected prepareContent(layer: PreparationLayer): void {
    const row = this.contentRows().find((entry) => entry.layer === layer);
    if (row?.action !== 'prepare' || row.disabled) return;
    if (layer === 'audio') this.audio.acknowledgeMaintenance();
    this.preparation.prepare(layer);
  }

  protected async stopContent(layer: PreparationLayer): Promise<void> {
    await this.preparation.stop(layer);
  }

  protected cancelAudioJob(): void {
    void this.stopContent('audio');
  }

  /** Confirms the destructive reading-level action selected from the More menu. */
  protected async confirmClearReadingAudio(): Promise<void> {
    const reading = this.store.reading();
    if (reading === null || this.audio.clearing()) {
      return;
    }
    const confirmed = await openConfirmDialog(this.dialog, {
      title: 'Delete audio for this story?',
      message: 'This permanently deletes every generated audio clip for this reading.',
      details: ['The story, translations, and grammar results stay saved.'],
      footnote: 'You can generate the audio again from scratch.',
      confirmLabel: 'Delete audio',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (confirmed) {
      await this.audio.clear(reading);
    }
  }

  protected async confirmClearTextAid(layer: 'english' | 'grammar'): Promise<void> {
    if (this.textAidMaintenance.pending() !== null) return;
    const grammar = layer === 'grammar';
    const noun = grammar ? 'grammar notes' : 'translation';
    const confirmed = await openConfirmDialog(this.dialog, {
      title: `Clear ${noun} for this reading?`,
      message: `This permanently deletes the saved ${noun} for this reading.`,
      details: ['The Japanese text and its other reading aids stay saved.'],
      footnote: `You can prepare ${grammar ? 'the notes' : 'a translation'} again from scratch.`,
      confirmLabel: grammar ? 'Clear grammar notes' : 'Clear translation',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
    if (confirmed) await this.textAidMaintenance.clear(layer);
  }

  /** Shows or hides the independent floating player, releasing its docked height. */
  protected toggleAudioPlayer(): void {
    if (this.audio.playerOpen()) {
      this.releasePlayerHeight();
      this.audio.closePlayer();
      return;
    }
    this.audio.openPlayer(this.selection.sentenceId());
  }

  /** Clears every surface whose content belongs to the current reading. */
  private closeReaderSurfaces(): void {
    this.endPreview();
    this.releaseSheetClearance();
    this.popover.close();
    this.releasePlayerHeight();
    this.audio.endPlayback();
    this.selection.clearSentence();
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
      this.scheduleSheetClearanceCheck();
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
    this.scheduleSheetClearanceCheck();
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
    if (this.selection.sentenceId() === sentence.sentence.id) {
      if (selection.modality === 'touch') {
        // Holding the same line again is a reader confirming where they are,
        // not asking for the sheet in front of them to disappear. A finger
        // dismisses by tapping the page, which is one short gesture rather
        // than half a second of holding still.
        return;
      }
      // A mouse click on the open sentence puts it away, as a click on the
      // open word does.
      this.popover.close();
      return;
    }
    this.endPreview();
    this.openSentence(
      sentence.sentence.id,
      this.sentenceElement(sentence.sentence.id) ?? { x: selection.x, y: selection.y },
      undefined,
      selection.y,
    );
  }

  private openSentence(
    sentenceId: SentenceId,
    origin: { x: number; y: number } | HTMLElement,
    returnFocusTo?: HTMLElement | null,
    pressedAtY?: number,
  ): void {
    // For the same reason as a word: the closing surface clears the selection,
    // so whatever is open goes first and the new sentence is set after it.
    // Without returning focus, because another surface is opening in its place.
    this.popover.close(false);
    this.selection.selectSentence(sentenceId);
    this.popover.open({
      origin,
      template: this.sentencePopover(),
      viewContainerRef: this.viewContainerRef,
      returnFocusTo: returnFocusTo ?? this.sentenceElement(sentenceId),
      closeOnScroll: true,
      preferredVerticalPlacement: this.sentencePlacement(origin),
      // A press on a word is about that word, whatever is open at the time.
      retargetSelector: WORD_TARGET,
      onClosed: () => {
        this.releaseSheetClearance();
        this.selection.clearSentence();
      },
    });
    this.keepClearOfSheet(
      origin instanceof HTMLElement ? origin : this.sentenceElement(sentenceId),
      pressedAtY,
    );
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
      if (activation.modality === 'touch' || (activation.clickCount ?? 1) > 1) {
        // Touch: tapping the word already open changes nothing. A finger is
        // imprecise and a reader often lands on the same word twice on the way
        // to reading about it; taking the sheet away underneath them was the
        // single most confusing thing a tap could do. The rest of a mouse
        // double-click belongs to the intent that opened the lookup.
        return;
      }
      // A mouse click on the open word puts it away. Reopening it would replay
      // the card's entrance over the same word and leave a reader who meant to
      // dismiss it exactly where they started.
      this.popover.close();
      return;
    }
    this.endPreview();
    // Before the new word is set, because closing the surface over the old one
    // clears the selection, and a close that ran afterwards would clear this.
    // Focus is not returned: the next surface is already on its way.
    this.popover.close(false);
    this.inspectedActivation = activation;
    this.selection.openWord({
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
        this.inspectedActivation = null;
        this.selection.closeWord();
      },
    });
    this.keepClearOfSheet(activation.origin);
  }

  /** Keyboard route from a focused word to every action on its sentence. */
  protected openInspectedSentence(): void {
    const activation = this.inspectedActivation;
    if (activation === null) {
      return;
    }
    this.openSentence(
      activation.sentence.sentence.id,
      this.sentenceElement(activation.sentence.sentence.id) ?? activation.origin,
      activation.origin,
    );
  }

  private sentenceElement(sentenceId: SentenceId): HTMLElement | null {
    return document.querySelector<HTMLElement>(`[data-sentence-id="${CSS.escape(sentenceId)}"]`);
  }

  private sentencePlacement(origin: { x: number; y: number } | HTMLElement): 'above' | 'below' {
    const y = origin instanceof HTMLElement ? origin.getBoundingClientRect().top : origin.y;
    return y < window.innerHeight / 2 ? 'above' : 'below';
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
  private keepClearOfSheet(anchor: HTMLElement | null, pressedAtY?: number): void {
    this.releaseSheetClearance();
    this.sheetAnchor = anchor;
    this.sheetAnchorY = pressedAtY ?? null;
    this.armSheetClearance();
  }

  private armSheetClearance(): void {
    const anchor = this.sheetAnchor;
    if (anchor === null || !this.viewport.isMobile()) {
      return;
    }
    // After the frame the sheet is laid out in: it is the sheet's own top edge
    // that has to be cleared, and it has none until it has been rendered.
    this.sheetClearanceFrame = requestAnimationFrame(() => {
      this.sheetClearanceFrame = null;
      if (this.sheetAnchor !== anchor || !this.viewport.isMobile()) {
        return;
      }
      const sheet = document.querySelector<HTMLElement>('.mn-popover-pane.is-sheet');
      if (sheet === null) {
        return;
      }
      // A sentence can wrap across half a screen, and only the line that was
      // actually pressed has to stay visible. Held as an index rather than a
      // coordinate, so it survives the scrolling this is about to do.
      const line = lineIndexAt(anchor, this.sheetAnchorY);
      let scrolled = false;
      let target = window.scrollY;
      const clear = (): void => {
        const overlap =
          lineBottom(anchor, line) - sheet.getBoundingClientRect().top + SHEET_CLEARANCE;
        // Resolved to a position rather than a distance, so a measurement taken
        // while a smooth scroll is still running does not ask for the same
        // distance twice.
        const wanted = window.scrollY + overlap;
        if (overlap <= 0 || wanted <= target + 1) {
          return;
        }
        target = wanted;
        // At the end of a reading there is nothing left to scroll into, so the
        // room the pressed line needs is reserved temporarily and handed back
        // when the sheet closes.
        const reachable =
          document.documentElement.scrollHeight - window.innerHeight - this.sheetReserveSignal();
        this.sheetReserveSignal.set(Math.max(0, Math.ceil(target - reachable)));
        const behavior = scrolled || this.viewport.prefersReducedMotion() ? 'auto' : 'smooth';
        scrolled = true;
        // After the reserve has been laid out: scrolling to a position the
        // document does not have yet simply lands short of it.
        this.sheetScrollFrame = requestAnimationFrame(() => {
          this.sheetScrollFrame = null;
          this.scrollingProgrammatically = true;
          // The first move is the one the reader sees answer their press. A
          // correction after the sheet has grown is not a second journey.
          window.scrollTo({ top: target, behavior });
          setTimeout(() => {
            this.scrollingProgrammatically = false;
          }, SCROLL_SETTLE_MS);
        });
      };
      this.sheetClearanceCheck = clear;
      // A sheet is as tall as what it has to say, and it has nothing to say
      // until a lookup or a stored translation has arrived: measuring only once
      // would clear an edge the sheet is about to grow past. The observer
      // reports the first size as well, so this is also the initial check.
      this.sheetClearance = new ResizeObserver(clear);
      this.sheetClearance.observe(sheet);
      const player = this.audioPlayerShell()?.nativeElement;
      if (player !== undefined) {
        this.sheetClearance.observe(player);
      }
    });
  }

  private releaseSheetClearance(): void {
    this.clearSheetClearanceObserver();
    this.sheetAnchor = null;
    this.sheetAnchorY = null;
  }

  /**
   * Stops correcting the scroll position once the reader has moved it.
   *
   * The sheet stays exactly where it is; only the correction ends. Left armed,
   * a reader who scrolled back a paragraph with a sheet open was pulled
   * forwards again to the line they had pressed, over and over.
   */
  private stopFollowingSheetAnchor(): void {
    if (this.sheetAnchor !== null) {
      this.releaseSheetClearance();
    }
  }

  private rearmSheetClearance(): void {
    if (this.sheetAnchor === null) {
      return;
    }
    this.clearSheetClearanceObserver();
    this.armSheetClearance();
  }

  private clearSheetClearanceObserver(): void {
    if (this.sheetClearanceFrame !== null) {
      cancelAnimationFrame(this.sheetClearanceFrame);
      this.sheetClearanceFrame = null;
    }
    if (this.sheetScrollFrame !== null) {
      cancelAnimationFrame(this.sheetScrollFrame);
      this.sheetScrollFrame = null;
    }
    this.sheetReserveSignal.set(0);
    this.sheetClearance?.disconnect();
    this.sheetClearance = null;
    this.sheetClearanceCheck = null;
  }

  /** Re-measures the shared sheet/player boundary after layout settles. */
  private scheduleSheetClearanceCheck(): void {
    if (this.sheetClearanceCheck === null || this.sheetClearanceFrame !== null) {
      return;
    }
    this.sheetClearanceFrame = requestAnimationFrame(() => {
      this.sheetClearanceFrame = null;
      this.sheetClearanceCheck?.();
    });
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
    if (this.selection.anythingOpen()) {
      return;
    }
    this.previewedWordSignal.set({
      sentenceId: activation.sentence.sentence.id,
      tokenId: activation.token.id,
    });
    this.cancelPreviewTimer();
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      this.selection.previewWord(activation.word);
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
    this.selection.clearPreview();
  }

  private cancelPreviewTimer(): void {
    if (this.previewTimer !== null) {
      clearTimeout(this.previewTimer);
      this.previewTimer = null;
    }
  }

  protected backToLibrary(event: Event): void {
    event.preventDefault();
    void this.navigation.backOrNavigate('/library');
  }

  /**
   * What is left of the viewport once the reader's own furniture is subtracted.
   *
   * The sticky header and the docked player are both opaque and both fixed, so
   * the part of the window a sentence can actually be read in is the band
   * between them. Measured rather than assumed: the header grows with a long
   * title on a narrow screen, and the player is docked flush on a phone and
   * floating clear of the edge on a desktop.
   */
  private readableBand(): { readonly top: number; readonly bottom: number } {
    const bar = this.readerBar()?.nativeElement.getBoundingClientRect();
    const player = this.audio.playerOpen()
      ? this.audioPlayerShell()?.nativeElement.getBoundingClientRect()
      : undefined;
    return {
      top: Math.max(0, bar?.bottom ?? 0),
      bottom: Math.min(window.innerHeight, player?.top ?? window.innerHeight),
    };
  }

  /**
   * Brings the sentence being read into view, and only if it is not already.
   *
   * Scrolling a sentence that is already on screen would jerk the page on every
   * advance, which is exactly the behaviour that makes a follow-along player
   * unusable. A sentence outside the mounted window has no element yet and is
   * simply left alone.
   *
   * "On screen" is the band between the header and the player, not the window.
   * Measured against the window, a sentence sitting behind the docked player
   * counted as visible and was never scrolled to — so following a reading
   * downwards stopped at the first sentence to reach the player and left the
   * learner watching a sentence they could not see.
   */
  private revealSentence(sentenceId: SentenceId): void {
    const element = document.querySelector<HTMLElement>(
      `[data-sentence-id="${CSS.escape(sentenceId)}"]`,
    );
    if (element === null) {
      return;
    }
    const box = element.getBoundingClientRect();
    const band = this.readableBand();
    if (box.top >= band.top && box.bottom <= band.bottom) {
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

  private measureMountedParagraphs(): void {
    const content = this.content()?.nativeElement;
    if (content === undefined) {
      return;
    }
    const next = new Map(this.measuredParagraphHeightsSignal());
    const measured: number[] = [];
    for (const paragraph of content.querySelectorAll<HTMLElement>('mn-reader-paragraph p')) {
      const position = Number(paragraph.dataset['paragraphPosition']);
      const margin = Number.parseFloat(getComputedStyle(paragraph).marginBottom) || 0;
      const height = paragraph.getBoundingClientRect().height + margin;
      if (Number.isFinite(position) && height > 0) {
        next.set(position, height);
        measured.push(height);
      }
    }
    if (measured.length === 0) {
      return;
    }
    this.measuredParagraphHeightsSignal.set(next);
    if (next.size === measured.length) {
      this.estimatedParagraphHeightSignal.set(
        measured.reduce((total, height) => total + height, 0) / measured.length,
      );
    }
    this.scheduleWindowForScroll();
  }

  private scheduleWindowForScroll(): void {
    if (this.scrollWindowFrame !== null || this.store.status() !== 'ready') {
      return;
    }
    this.scrollWindowFrame = requestAnimationFrame(() => {
      this.scrollWindowFrame = null;
      const content = this.content()?.nativeElement;
      if (content === undefined) {
        return;
      }
      const documentTop = content.getBoundingClientRect().top + window.scrollY;
      const offset = window.scrollY + window.innerHeight / 2 - documentTop;
      const position = paragraphAtOffset(
        offset,
        this.store.totalParagraphs(),
        this.estimatedParagraphHeightSignal(),
        this.measuredParagraphHeightsSignal(),
      );
      if (
        (this.lastScrollDirection === 'forward' && position < this.store.window().first) ||
        (this.lastScrollDirection === 'backward' &&
          position >= this.store.window().first + this.store.window().count)
      ) {
        return;
      }
      if (!windowContains(this.store.window(), position)) {
        void this.store.moveTo(position);
      }
    });
  }

  private async moveToDocumentEdge(edge: 'start' | 'end'): Promise<void> {
    const position = edge === 'start' ? 0 : Math.max(0, this.store.totalParagraphs() - 1);
    await this.store.moveTo(position);
    requestAnimationFrame(() => {
      this.scrollingProgrammatically = true;
      window.scrollTo({ top: edge === 'start' ? 0 : document.documentElement.scrollHeight });
      requestAnimationFrame(() => {
        this.scrollingProgrammatically = false;
      });
    });
  }
}

/** Which line box of a wrapped element a press landed in, or -1 for none. */
function lineIndexAt(element: HTMLElement, pressedAtY: number | null): number {
  const rects = [...element.getClientRects()];
  if (pressedAtY === null || rects.length < 2) {
    return -1;
  }
  return rects.findIndex((rect) => pressedAtY >= rect.top && pressedAtY <= rect.bottom);
}

/** The bottom of that line, or of the whole element when no one line applies. */
function lineBottom(element: HTMLElement, line: number): number {
  const rect = line >= 0 ? element.getClientRects()[line] : undefined;
  return rect?.bottom ?? element.getBoundingClientRect().bottom;
}
