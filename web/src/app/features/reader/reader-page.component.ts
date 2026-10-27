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
  untracked,
  viewChild,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
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
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { findingsCoveringToken, sentenceWideFindings } from '../../domain/enrichment/finding-spans';
import { readingId, type ReadingId, type SentenceId } from '../../domain/shared/ids';
import { presentStatus } from '../../domain/reading/token-presentation';
import { clampTextScale } from '../../domain/settings/settings';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import { ReaderMenuComponent } from './reader-menu.component';
import type { SentenceSelection } from './paragraph-gestures.directive';
import type { TokenActivation } from './reader-sentence.component';
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
import { DockedPlayerDirective } from './docked-player.directive';
import { ReaderGeometryService } from './reader-geometry.service';
import {
  ReaderParagraphWindowDirective,
  type ParagraphLayout,
} from './reader-paragraph-window.directive';
import { ReaderScrollService } from './reader-scroll.service';
import { ReaderWordPreviewService } from './reader-word-preview.service';

/**
 * The word buttons, which a press reaches even while a surface is open.
 *
 * Restricted to real buttons: punctuation and whitespace carry the same class
 * but are not words, and a press on one is a press on the line.
 */
const WORD_TARGET = 'button.token';

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
 *
 * The page composes: the stores own the reading, and the window, geometry,
 * and preview units beside it own every scroll, measurement, and timer.
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
    DockedPlayerDirective,
    ReaderParagraphWindowDirective,
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
    ReaderScrollService,
    ReaderGeometryService,
    ReaderWordPreviewService,
  ],
  template: `
    <div
      class="reader"
      [class.has-audio-player]="audio.playerOpen()"
      [style.--reader-scale]="textScale()"
      [style.--sheet-scroll-reserve]="geometry.sheetScrollReserve()"
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
          <!--
            A visual echo of the page heading below, shown once that heading has
            scrolled beneath the bar. The heading stays the one real title.
          -->
          <p
            class="bar-title"
            aria-hidden="true"
            [class.is-shown]="geometry.titleTucked()"
            [attr.lang]="store.status() === 'ready' ? 'ja' : 'en'"
          >
            {{ readerHeading() }}
          </p>
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
                [class.mn-icon-button--primary]="audio.playback.isActive()"
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

      <h1 #pageTitle class="title" [attr.lang]="store.status() === 'ready' ? 'ja' : 'en'">
        {{ readerHeading() }}
      </h1>

      @if (audio.playerOpen() && store.status() === 'ready') {
        <div
          mnDockedPlayer
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

      <div
        #content
        #paragraphWindow="paragraphWindow"
        class="content"
        [mnReaderParagraphWindow]="paragraphLayout()"
      >
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
                [style.height.px]="paragraphWindow.spacers().before"
              ></div>
              @for (paragraph of store.paragraphs(); track paragraph.paragraph.id) {
                <mn-reader-paragraph
                  [entry]="paragraph"
                  [aids]="aids.aids()"
                  [furigana]="preferences().furigana"
                  [tokenSpacing]="preferences().tokenSpacing"
                  [sentencePerLine]="preferences().sentencePerLine"
                  [markers]="preferences().warningMarkers"
                  [selectedSentenceId]="selectedSentenceId()"
                  [playingSentenceId]="audio.playback.currentSentenceId()"
                  [selectedWord]="selectedWord()"
                  [previewedWord]="wordPreview.word()"
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
                [style.height.px]="paragraphWindow.spacers().after"
              ></div>
            </article>
            <a
              #afterStory
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

    <ng-template #wordPreviewCard>
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
      grid-template-rows: auto auto 1fr;
      grid-template-areas: 'bar' 'title' 'content';
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
     * Its lower edge is what separates the bar from the reading. Unlike a page
     * header's, it is always drawn: the reading starts directly beneath the bar
     * in type as large as the title, so without the edge the two run together.
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

    .bar-row {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      min-width: 0;
    }

    /*
     * Glyphs, not hit areas, line up with the reading's edges. The title tucks
     * into Back's inset too, so the arrow and the title read as one unit.
     */
    .bar-row > .back {
      margin-inline: calc(-1 * var(--space-2));
    }

    /*
     * The story's whole name, above the reading and wrapping as far as it
     * needs to. It scrolls away with the text and hands over to the bar.
     */
    .title {
      grid-area: title;
      min-width: 0;
      margin: 0;
      font-size: var(--text-page-title);
      line-height: var(--leading-snug);
      overflow-wrap: anywhere;
    }

    /*
     * One line in the bar, present only once the heading has gone beneath it.
     * It keeps its space while hidden, so the actions never shift.
     */
    .bar-title {
      flex: 1;
      min-width: 0;
      margin: 0;
      overflow: hidden;
      font-size: var(--text-xl);
      font-weight: var(--weight-bold);
      white-space: nowrap;
      text-overflow: ellipsis;
      opacity: 0;
      transform: translateY(var(--space-1));
      visibility: hidden;
      transition:
        opacity var(--motion-fast) var(--ease-standard),
        transform var(--motion-fast) var(--ease-standard),
        visibility 0s linear var(--motion-fast);
    }

    .bar-title.is-shown {
      opacity: 1;
      transform: none;
      visibility: visible;
      transition-delay: 0s;
    }

    @media (prefers-reduced-motion: reduce) {
      .bar-title {
        transform: none;
        transition: none;
      }
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

    /*
     * Playing is the shared primary fill, drawn at the bar's own touch target
     * rather than the player's large circle.
     */
    .audio-button {
      --icon-button-primary-size: var(--touch-target);
    }

    /* A job is running behind a closed player; the button is the only sign of it. */
    .audio-button.is-busy:not(.is-playing) {
      color: var(--action-primary);
    }

    .audio-button.is-busy {
      animation: audio-pulse var(--motion-breathe) var(--ease-ambient) infinite;
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
  protected readonly inspector = inject(WordInspectorStore);
  private readonly settings = inject(AppSettingsStore);
  protected readonly popover = inject(PopoverService);
  protected readonly geometry = inject(ReaderGeometryService);
  protected readonly wordPreview = inject(ReaderWordPreviewService);
  private readonly dialog = inject(Dialog);
  private readonly navigation = inject(NavigationHistoryService);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private readonly readerBar = viewChild<ElementRef<HTMLElement>>('readerBar');
  private readonly pageTitle = viewChild<ElementRef<HTMLElement>>('pageTitle');
  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly afterStory = viewChild<ElementRef<HTMLElement>>('afterStory');
  private readonly wordPopover = viewChild.required<TemplateRef<unknown>>('wordPopover');
  private readonly wordPreviewCard = viewChild.required<TemplateRef<unknown>>('wordPreviewCard');
  private readonly sentencePopover = viewChild.required<TemplateRef<unknown>>('sentencePopover');

  protected readonly selection = inject(ReaderSelectionStore);
  private inspectedActivation: TokenActivation | null = null;
  /** The open sentence, tinted so its anchored details stay related to it. */
  protected readonly selectedSentenceId = this.selection.sentenceId;

  protected readonly preferences = this.settings.readerPreferences;
  private readonly currentReadingId = computed(() => readingId(this.id()));
  protected readonly translationProgress = this.preparation.translationProgress;

  /** Clamped here too: a stored row is external data like any other. */
  protected readonly textScale = computed(() => clampTextScale(this.preferences().textScale));

  /** Every preference that changes how tall a paragraph is laid out. */
  protected readonly paragraphLayout = computed<ParagraphLayout>(() => {
    const scale = this.textScale();
    const { furigana, sentencePerLine } = this.preferences();
    return { key: `${String(scale)}:${String(furigana)}:${String(sentencePerLine)}`, scale };
  });

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
    this.afterStory()?.nativeElement.focus();
  }

  protected readonly hasTranslationModel = this.preparation.hasTranslationModel;
  protected readonly hasGrammarModel = this.preparation.hasGrammarModel;

  constructor() {
    this.geometry.connect({ bar: this.readerBar, title: this.pageTitle, content: this.content });

    // An effect because the route input is the only trigger there is: opening is
    // a one-off command that starts a load and resets the page's surfaces, not
    // a read to derive.
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

    // An effect because the trigger is three job stores' progress and the
    // response is a command on the reader's store; no one store owns both.
    effect(() => {
      // Translation, audio, and grammar jobs all write rows this page is
      // displaying, so a step by any of them is what tells the reader to
      // re-read them. Each job's progress is read whole, because every step it
      // takes is a reason to re-read, not only its start and end; one effect,
      // so steps from two jobs in the same tick are one re-read, not two.
      // Re-reading the reading row also refreshes the summaries the menu
      // counts, and that in turn re-reads the aids for the mounted window.
      const translating = this.translationProgress().kind !== 'idle';
      const voicing = this.audio.progress().kind !== 'idle';
      const analysing = this.preparation.grammarRunning();
      if (translating || voicing || analysing) {
        // `refreshSummaries` reads the reading row it is about to replace, and
        // replaces it with a fresh object. Tracked, that re-ran this effect,
        // which refreshed again — an unbounded loop of reads behind a screen
        // that looked idle.
        untracked(() => {
          void this.store.refreshSummaries();
        });
      }
    });

    // An effect because playback is application-wide and outlives this page, so
    // it cannot watch this reader's reading and job; the page tells it.
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

    // An effect because whether a run is still coming belongs to the reader, not
    // to playback, and releasing a wait is a command.
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

    inject(DestroyRef).onDestroy(() => {
      // Leaving the reading ends the session that was reading it aloud. The
      // player is the only surface with a transport, and it lives here, so
      // playback that outlived this route was a sound with no control anywhere
      // in the application (ADR 0041). Being backgrounded is a different thing
      // and stops nothing: the reader is still open, and the media notification
      // is the control there.
      this.audio.playback.stop();
      this.popover.close();
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

  /**
   * Shows or hides the independent floating player. Its docked height goes
   * with its shell, which `mnDockedPlayer` measures for as long as it exists.
   */
  protected toggleAudioPlayer(): void {
    if (this.audio.playerOpen()) {
      this.audio.closePlayer();
      return;
    }
    this.audio.openPlayer(this.selection.sentenceId());
  }

  /** Clears every surface whose content belongs to the current reading. */
  private closeReaderSurfaces(): void {
    this.wordPreview.end();
    this.geometry.releaseSheet();
    this.popover.close();
    this.audio.endPlayback();
    this.selection.clearSentence();
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
    this.wordPreview.end();
    this.openSentence(
      sentence.sentence.id,
      this.geometry.sentenceElement(sentence.sentence.id) ?? { x: selection.x, y: selection.y },
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
    const surface = this.popover.open({
      origin,
      template: this.sentencePopover(),
      viewContainerRef: this.viewContainerRef,
      returnFocusTo: returnFocusTo ?? this.geometry.sentenceElement(sentenceId),
      closeOnScroll: true,
      preferredVerticalPlacement: this.geometry.placementFor(origin),
      // A press on a word is about that word, whatever is open at the time.
      retargetSelector: WORD_TARGET,
      onClosed: () => {
        this.geometry.releaseSheet();
        this.selection.clearSentence();
      },
    });
    this.geometry.keepClearOfSheet(
      origin instanceof HTMLElement ? origin : this.geometry.sentenceElement(sentenceId),
      surface,
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
    this.wordPreview.end();
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

    const surface = this.popover.open({
      origin: activation.origin,
      template: this.wordPopover(),
      viewContainerRef: this.viewContainerRef,
      returnFocusTo: activation.origin,
      closeOnScroll: true,
      // Moving on to the next word is one press, not one to put this card away
      // and a second to open the next.
      retargetSelector: WORD_TARGET,
      onClosed: () => {
        this.geometry.releaseSheet();
        this.inspectedActivation = null;
        this.selection.closeWord();
      },
    });
    this.geometry.keepClearOfSheet(activation.origin, surface);
  }

  /** Keyboard route from a focused word to every action on its sentence. */
  protected openInspectedSentence(): void {
    const activation = this.inspectedActivation;
    if (activation === null) {
      return;
    }
    this.openSentence(
      activation.sentence.sentence.id,
      this.geometry.sentenceElement(activation.sentence.sentence.id) ?? activation.origin,
      activation.origin,
    );
  }

  protected previewWord(activation: TokenActivation): void {
    this.wordPreview.show(activation, this.wordPreviewCard(), this.viewContainerRef);
  }

  protected endPreview(): void {
    this.wordPreview.end();
  }

  protected backToLibrary(event: Event): void {
    event.preventDefault();
    void this.navigation.backOrNavigate('/library');
  }
}
