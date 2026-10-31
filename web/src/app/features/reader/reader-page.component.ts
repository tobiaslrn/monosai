import type { ElementRef, OnChanges, SimpleChanges, TemplateRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewContainerRef,
  computed,
  inject,
  input,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { ReadingAudioMaintenanceStore } from '../../application/enrichment/reading-audio-maintenance.store';
import { ReadingTextAidMaintenanceStore } from '../../application/enrichment/reading-text-aid-maintenance.store';
import { ReaderAudioStore } from '../../application/reading/reader-audio.store';
import { ReaderPreparationStore } from '../../application/reading/reader-preparation.store';
import { ReaderSelectionStore } from '../../application/reading/reader-selection.store';
import { SentenceAidsStore } from '../../application/enrichment/sentence-aids.store';
import { ReaderStore } from '../../application/reading/reader.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { readingId, type ReadingId } from '../../domain/shared/ids';
import { clampTextScale } from '../../domain/settings/settings';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopoverService } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import { ReaderContentActionsService } from './reader-content-actions.service';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import { ReaderMenuComponent } from './reader-menu.component';
import { SentencePopoverComponent } from './sentence-popover.component';
import { ReadingPlayerComponent } from './reading-player.component';
import { WordInspectorComponent } from './word-inspector.component';
import { WordPreviewComponent } from './word-preview.component';
import { NotFoundPanelComponent } from '../../shared-ui/not-found/not-found-panel.component';
import { DockedPlayerDirective } from './docked-player.directive';
import { ReaderGeometryService } from './reader-geometry.service';
import {
  ReaderParagraphWindowDirective,
  type ParagraphLayout,
} from './reader-paragraph-window.directive';
import { ReaderScrollService } from './reader-scroll.service';
import { ReaderSurfacesService } from './reader-surfaces.service';
import { ReaderWordPreviewService } from './reader-word-preview.service';

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
 * The page composes: the stores own the reading, the window, geometry, and
 * preview units beside it own every scroll, measurement, and timer, and the
 * surfaces and content-actions units own what a press and the menu command.
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
    ReaderSurfacesService,
    ReaderContentActionsService,
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
                  [rows]="actions.rows()"
                  [hasAudio]="reading.audioSummary.completed > 0 || audio.running()"
                  [savedLayers]="actions.savedTextLayers()"
                  [pending]="actions.pending()"
                  [error]="actions.error()"
                  (prepare)="actions.prepare($event)"
                  (opened)="popover.close()"
                  (stopRequested)="actions.stop($event)"
                  (deleteAudioRequested)="actions.confirmClearAudio()"
                  (clearAidRequested)="actions.confirmClearTextAid($event)"
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
            (cancelGeneration)="actions.stop('audio')"
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
                  [selectedSentenceId]="selection.sentenceId()"
                  [playingSentenceId]="audio.playback.currentSentenceId()"
                  [selectedWord]="selection.inspectedWord()"
                  [previewedWord]="wordPreview.word()"
                  (activated)="surfaces.inspect($event)"
                  (previewed)="surfaces.previewWord($event)"
                  (previewEnded)="wordPreview.end()"
                  (sentenceSelected)="surfaces.selectSentence($event)"
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
          [aids]="selection.sentenceAids()"
          [sentenceText]="surfaces.selectedSentenceText()"
          [canAnalyze]="canAnalyzeGrammar()"
          [translationModelConfigured]="hasTranslationModel()"
          [grammarModelConfigured]="hasGrammarModel()"
          [audioModelConfigured]="audio.voiceChosen()"
          [unknownWords]="surfaces.selectedUnknownWords()"
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
        <mn-word-inspector
          [grammar]="surfaces.wordGrammar()"
          (sentenceActions)="surfaces.openInspectedSentence()"
        />
      </mn-reader-popover>
    </ng-template>
  `,
  styleUrl: './reader-page.component.scss',
})
export class ReaderPageComponent implements OnChanges {
  /** Route parameter, bound by `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly store = inject(ReaderStore);
  protected readonly aids = inject(SentenceAidsStore);
  protected readonly actions = inject(ReaderContentActionsService);
  protected readonly surfaces = inject(ReaderSurfacesService);
  protected readonly selection = inject(ReaderSelectionStore);
  protected readonly audio = inject(ReaderAudioStore);
  protected readonly popover = inject(PopoverService);
  protected readonly geometry = inject(ReaderGeometryService);
  protected readonly wordPreview = inject(ReaderWordPreviewService);
  private readonly preparation = inject(ReaderPreparationStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly navigation = inject(NavigationHistoryService);

  private readonly readerBar = viewChild<ElementRef<HTMLElement>>('readerBar');
  private readonly pageTitle = viewChild<ElementRef<HTMLElement>>('pageTitle');
  private readonly contentElement = viewChild<ElementRef<HTMLElement>>('content');
  private readonly afterStory = viewChild<ElementRef<HTMLElement>>('afterStory');
  private readonly wordPopover = viewChild.required<TemplateRef<unknown>>('wordPopover');
  private readonly wordPreviewCard = viewChild.required<TemplateRef<unknown>>('wordPreviewCard');
  private readonly sentencePopover = viewChild.required<TemplateRef<unknown>>('sentencePopover');

  protected readonly preferences = this.settings.readerPreferences;
  private readonly currentReadingId = computed(() => readingId(this.id()));

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

  /**
   * A generated story was reviewed against the profile captured with it, so it
   * is never re-analysed: that would judge frozen text by a profile it was
   * never written for.
   */
  protected readonly canAnalyzeGrammar = computed(
    () => (this.store.reading()?.kind ?? 'imported') === 'imported',
  );

  protected readonly hasTranslationModel = this.preparation.hasTranslationModel;
  protected readonly hasGrammarModel = this.preparation.hasGrammarModel;

  constructor() {
    this.geometry.connect({
      bar: this.readerBar,
      title: this.pageTitle,
      content: this.contentElement,
    });
    this.surfaces.connect({
      word: this.wordPopover,
      preview: this.wordPreviewCard,
      sentence: this.sentencePopover,
      viewContainerRef: inject(ViewContainerRef),
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

  /** The route naming a reading is what opens it and resets the page's surfaces. */
  ngOnChanges(changes: SimpleChanges): void {
    if ('id' in changes) {
      const nextReadingId = this.currentReadingId();
      this.surfaces.closeAll();
      this.audio.endPlayback();
      this.audio.setReading(nextReadingId);
      void this.openReading(nextReadingId);
    }
  }

  protected skipStory(event: Event): void {
    event.preventDefault();
    this.afterStory()?.nativeElement.focus();
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

  protected backToLibrary(event: Event): void {
    event.preventDefault();
    void this.navigation.backOrNavigate('/library');
  }
}
