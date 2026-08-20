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
  viewChild,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router, RouterLink } from '@angular/router';
import { NO_AIDS, SentenceAidsStore } from '../../application/enrichment/sentence-aids.store';
import { TranslationJobStore } from '../../application/enrichment/translation-job.store';
import { ReaderStore, type ReaderSentence } from '../../application/reading/reader.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { CredentialStore } from '../../application/settings/credential.store';
import { LanguageStore } from '../../application/language/language.store';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { LibraryStore } from '../../application/reading/library.store';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import { findingsCoveringToken, sentenceWideFindings } from '../../domain/enrichment/finding-spans';
import { readingId, type SentenceId } from '../../domain/shared/ids';
import { presentStatus } from '../../domain/reading/token-presentation';
import { clampTextScale } from '../../domain/settings/settings';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopoverService, type PopoverRef } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import { ReaderAidsComponent } from './reader-aids.component';
import { ReaderMenuComponent } from './reader-menu.component';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import type { SentenceSelection } from './paragraph-gestures.directive';
import type { SelectedWord, TokenActivation } from './reader-sentence.component';
import type { UnknownWord } from './sentence-popover.component';
import { SentencePopoverComponent } from './sentence-popover.component';
import { TranslationProgressComponent } from './translation-progress.component';
import {
  NO_WORD_GRAMMAR,
  WordInspectorComponent,
  type WordGrammarState,
} from './word-inspector.component';
import { WordPreviewComponent } from './word-preview.component';

/** How long a pointer must rest on a word before its preview appears. */
const PREVIEW_DELAY_MS = 250;

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
    ReaderMenuComponent,
    ReaderParagraphComponent,
    ReaderPopoverComponent,
    SentencePopoverComponent,
    TranslationProgressComponent,
    WordInspectorComponent,
    WordPreviewComponent,
  ],
  providers: [ReaderStore, WordInspectorStore, SentenceAidsStore],
  template: `
    <div class="reader" [style.--reader-scale]="textScale()">
      <header class="bar">
        <div class="bar-row">
          <a class="icon-button" routerLink="/library" aria-label="Back to library">
            <mn-icon name="back" />
          </a>
          <h1>{{ store.reading()?.title }}</h1>
          <div class="bar-actions">
            <mn-reader-aids />
            @if (store.reading(); as reading) {
              <mn-reader-menu
                [reading]="reading"
                [isRunning]="translationJob.isRunning()"
                (translateAll)="startWholeReadingTranslation()"
                (cancelled)="translationJob.cancel()"
                (deleteRequested)="confirmDelete()"
              />
            }
          </div>
        </div>

        <!--
          A running job belongs with the header rather than over the text, and
          it takes none of the page while nothing is running.
        -->
        <mn-translation-progress
          [progress]="translationJob.progress()"
          (cancelled)="translationJob.cancel()"
          (retried)="retryWholeReadingTranslation()"
          (dismissed)="translationJob.acknowledge()"
        />
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
            @if (store.resumeTarget().basis === 'nearest') {
              <p class="notice" role="status">
                The sentence you stopped at has changed, so reading resumed at the nearest one.
              </p>
            }

            @if (store.vocabularyNotConfigured()) {
              <p class="notice">
                Vocabulary markers are off because no reviewed Anki vocabulary is set up. Reading,
                furigana, and word lookup all work without it.
              </p>
            }

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
                  [selectedWord]="selectedWord()"
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

    <ng-template #sentencePopover>
      <mn-reader-popover label="Sentence details">
        <mn-sentence-popover
          [aids]="selectedSentenceAids()"
          [canAnalyze]="canAnalyzeGrammar()"
          [unknownWords]="selectedUnknownWords()"
          (translate)="translateSelectedSentence()"
          (analyzeGrammar)="analyzeSelectedSentence()"
        />
      </mn-reader-popover>
    </ng-template>

    <ng-template #wordPreview>
      <mn-word-preview />
    </ng-template>

    <ng-template #wordPopover>
      <mn-reader-popover label="Word details">
        <mn-word-inspector
          [grammar]="wordGrammar()"
          (sentenceRequested)="openSentenceFromWord()"
          (closed)="closeInspector()"
        />
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
     * Sticky, opaque, and above the text: ruby annotations overflow above their
     * line, and without its own stacking context they would sit over the header
     * and swallow clicks meant for Back or Aids.
     */
    .bar {
      position: sticky;
      top: 0;
      z-index: 4;
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

    .icon-button {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--touch-target);
      height: var(--touch-target);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      color: var(--text-primary);
      cursor: pointer;
    }

    .content {
      position: relative;
      z-index: 0;
      grid-area: content;
      min-width: 0;
    }

    /* Room for the ruby above the first line of the reading. */
    .text {
      max-width: var(--reader-measure);
      padding-top: var(--space-2);
    }

    .notice {
      max-width: var(--reader-measure);
      margin: 0 0 var(--space-4);
      padding: var(--space-3);
      border-radius: var(--radius-control);
      background: var(--surface-sunken);
      color: var(--text-secondary);
      font-size: var(--text-sm);
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
  protected readonly inspector = inject(WordInspectorStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly library = inject(LibraryStore);
  private readonly credential = inject(CredentialStore);
  private readonly textModel = inject(TextModelStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly language = inject(LanguageStore);
  private readonly popover = inject(PopoverService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly wordPopover = viewChild.required<TemplateRef<unknown>>('wordPopover');
  private readonly wordPreview = viewChild.required<TemplateRef<unknown>>('wordPreview');
  private readonly sentencePopover = viewChild.required<TemplateRef<unknown>>('sentencePopover');
  private readonly topSentinel = viewChild<ElementRef<HTMLElement>>('topSentinel');
  private readonly bottomSentinel = viewChild<ElementRef<HTMLElement>>('bottomSentinel');

  private readonly selectedSentenceIdSignal = signal<SentenceId | null>(null);
  /** The open sentence, tinted so a docked sheet is not orphaned from it. */
  protected readonly selectedSentenceId = this.selectedSentenceIdSignal.asReadonly();

  protected readonly preferences = this.settings.readerPreferences;

  /** Clamped here too: a stored row is external data like any other. */
  protected readonly textScale = computed(() => clampTextScale(this.preferences().textScale));

  protected readonly selectedWord = computed<SelectedWord | null>(() => {
    const selected = this.inspector.selected();
    return selected === null
      ? null
      : { sentenceId: selected.sentence.id, tokenId: selected.token.id };
  });

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
  protected readonly canAnalyzeGrammar = computed(
    () => (this.store.reading()?.kind ?? 'imported') === 'imported',
  );

  private edgeObserver: IntersectionObserver | null = null;
  private sentenceObserver: IntersectionObserver | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private previewRef: PopoverRef | null = null;

  constructor() {
    // What a sentence action needs before it can key or send anything. Loading
    // is a local read of stored settings; none of it contacts a provider, and
    // no aid is requested as a result.
    void this.credential.load();
    void this.textModel.load();
    void this.grammarProfile.load();
    // The bundle the live grammar profile is resolved against. Already started
    // at bootstrap; asking again is idempotent and keeps a reading opened
    // straight after startup from showing an unresolved profile.
    void this.language.initialize();

    effect(() => {
      void this.store.open(readingId(this.id()));
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
        void this.aids.load(
          reading,
          paragraphs.flatMap((paragraph) =>
            paragraph.sentences.map((sentence) => sentence.sentence),
          ),
        );
      }
      queueMicrotask(() => {
        this.observeEdges();
        this.observeSentences();
      });
    });

    effect(() => {
      // A job writes rows this page is displaying, so its progress is what
      // tells the reader to re-read them. Re-reading the reading row also
      // refreshes the summaries the menu counts, and that in turn re-runs the
      // aid load above for the mounted window.
      if (this.translationJob.progress().kind !== 'idle') {
        void this.store.refreshSummaries();
      }
    });

    const flushOnHide = (): void => {
      if (document.visibilityState === 'hidden') {
        void this.store.flushProgress();
      }
    };
    document.addEventListener('visibilitychange', flushOnHide);

    inject(DestroyRef).onDestroy(() => {
      this.endPreview();
      this.popover.close();
      document.removeEventListener('visibilitychange', flushOnHide);
      this.edgeObserver?.disconnect();
      this.sentenceObserver?.disconnect();
      void this.store.close();
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
    this.endPreview();
    this.openSentence(sentence.sentence.id, { x: selection.x, y: selection.y });
  }

  /**
   * The route to a sentence that does not need a pointer.
   *
   * Selecting a sentence is a press on its whitespace, which a keyboard cannot
   * aim; the words are already focus stops, so a reader arrives at the sentence
   * through the word they stopped at.
   */
  protected openSentenceFromWord(): void {
    const selected = this.inspector.selected();
    if (selected === null) {
      return;
    }
    const origin = document.querySelector<HTMLElement>(
      `[data-sentence-id="${CSS.escape(selected.sentence.id)}"]`,
    );
    this.openSentence(
      selected.sentence.id,
      origin ?? this.content()?.nativeElement ?? document.body,
    );
  }

  private openSentence(
    sentenceId: SentenceId,
    origin: { x: number; y: number } | HTMLElement,
  ): void {
    this.selectedSentenceIdSignal.set(sentenceId);
    this.popover.open({
      origin,
      template: this.sentencePopover(),
      viewContainerRef: this.viewContainerRef,
      closeOnScroll: true,
      onClosed: () => {
        this.selectedSentenceIdSignal.set(null);
      },
    });
  }

  protected translateSelectedSentence(): void {
    const sentenceId = this.selectedSentenceIdSignal();
    if (sentenceId === null) {
      return;
    }
    void this.aids.translateSentence(sentenceId).then(() => this.store.refreshSummaries());
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
    void this.inspector.inspect({
      token: activation.token,
      sentence: activation.sentence.sentence,
      status: activation.sentence.statuses?.get(activation.token.id) ?? null,
    });

    this.popover.open({
      origin: activation.origin,
      template: this.wordPopover(),
      viewContainerRef: this.viewContainerRef,
      returnFocusTo: activation.origin,
      closeOnScroll: true,
      onClosed: () => {
        this.inspector.close();
      },
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
    if (this.inspector.isOpen() || this.selectedSentenceIdSignal() !== null) {
      return;
    }
    this.cancelPreviewTimer();
    this.previewTimer = setTimeout(() => {
      this.previewTimer = null;
      void this.inspector.previewWord(activation.token);
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
      await this.router.navigate(['/library']);
    }
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

  /**
   * Tracks the primary viewport sentence.
   *
   * Progress follows stable sentence identity rather than a scroll offset, so it
   * survives re-rendering, a changed window, and a later migration. Nothing is
   * drawn for it: where a reader stopped is the library's business, not an
   * annotation on the text.
   */
  private observeSentences(): void {
    this.sentenceObserver?.disconnect();
    const root = this.content()?.nativeElement;
    if (!root) {
      return;
    }

    const byElement = new Map<Element, ReaderSentence>();
    for (const paragraph of this.store.paragraphs()) {
      for (const sentence of paragraph.sentences) {
        const element = root.querySelector(
          `[data-sentence-id="${CSS.escape(sentence.sentence.id)}"]`,
        );
        if (element) {
          byElement.set(element, sentence);
        }
      }
    }
    if (byElement.size === 0) {
      return;
    }

    const visible = new Set<Element>();
    this.sentenceObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target);
          } else {
            visible.delete(entry.target);
          }
        }
        const primary = [...visible]
          .map((element) => byElement.get(element))
          .filter((sentence): sentence is ReaderSentence => sentence !== undefined)
          .sort((left, right) => left.sentence.positionInReading - right.sentence.positionInReading)
          .at(0);
        if (primary !== undefined) {
          this.store.reportPosition(primary.sentence);
        }
      },
      { threshold: 0.1 },
    );
    for (const element of byElement.keys()) {
      this.sentenceObserver.observe(element);
    }
  }
}
