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
import { LibraryStore } from '../../application/reading/library.store';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import { findingsCoveringToken } from '../../domain/enrichment/finding-spans';
import { readingId } from '../../domain/shared/ids';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PopoverService, type PopoverRef } from '../../shared-ui/popover/popover.service';
import { ReaderPopoverComponent } from '../../shared-ui/popover/reader-popover.component';
import { ReaderAidsComponent } from './reader-aids.component';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import { ReadingStatusPanelComponent } from './reading-status-panel.component';
import type { SentenceMenuRequest, TokenActivation } from './reader-sentence.component';
import {
  SentenceMenuComponent,
  sentenceMenuActions,
  type SentenceMenuActionId,
} from './sentence-menu.component';
import { SentenceDetailsComponent } from './sentence-details.component';
import { WordInspectorComponent } from './word-inspector.component';
import { WordPreviewComponent } from './word-preview.component';

/** How long a pointer must rest on a word before its preview appears. */
const PREVIEW_DELAY_MS = 250;

/**
 * The reader.
 *
 * Opening a reading is entirely local: immutable text, stored token analyses,
 * the bundled dictionary, and locally computed status. No AI request happens on
 * open or when an aid is toggled.
 */
@Component({
  selector: 'mn-reader-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    IconComponent,
    ReaderAidsComponent,
    ReaderParagraphComponent,
    ReaderPopoverComponent,
    ReadingStatusPanelComponent,
    SentenceDetailsComponent,
    SentenceMenuComponent,
    WordInspectorComponent,
    WordPreviewComponent,
  ],
  providers: [ReaderStore, WordInspectorStore, SentenceAidsStore],
  template: `
    <div class="reader">
      <header class="bar">
        <a class="icon-button" routerLink="/library" aria-label="Back to library">
          <mn-icon name="back" />
        </a>
        <h1>{{ store.reading()?.title }}</h1>
        <div class="bar-actions">
          <span class="progress" aria-live="off">{{ store.percentRead() }}%</span>
          <mn-reader-aids />
          @if (store.reading()) {
            <button
              type="button"
              class="icon-button"
              aria-label="Delete this reading"
              (click)="confirmDelete()"
            >
              <mn-icon name="delete" />
            </button>
          }
        </div>
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

            @if (store.reading(); as reading) {
              <mn-reading-status-panel
                [reading]="reading"
                [progress]="translationJob.progress()"
                (started)="startWholeReadingTranslation()"
                (cancelled)="translationJob.cancel()"
                (retried)="retryWholeReadingTranslation()"
              />
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
                  [markers]="preferences().statusMarkers"
                  [currentSentenceId]="currentSentenceId()"
                  [selectedTokenId]="selectedTokenId()"
                  (activated)="inspect($event)"
                  (previewed)="previewWord($event)"
                  (previewEnded)="endPreview()"
                  (menuRequested)="openSentenceMenu($event)"
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

    <ng-template #sentenceMenu>
      <mn-reader-popover label="Sentence actions">
        <mn-sentence-menu [actions]="menuActions()" (chosen)="runSentenceAction($event)" />
      </mn-reader-popover>
    </ng-template>

    <ng-template #sentenceDetails>
      <mn-reader-popover label="Sentence details">
        <mn-sentence-details [aids]="menuAids()" />
      </mn-reader-popover>
    </ng-template>

    <ng-template #wordPreview>
      <mn-word-preview />
    </ng-template>

    <ng-template #wordPopover>
      <mn-reader-popover label="Word details">
        <mn-word-inspector [grammarFindings]="selectedWordFindings()" (closed)="closeInspector()" />
      </mn-reader-popover>
    </ng-template>
  `,
  styles: `
    /*
     * One column at every width. Word details float over the text rather than
     * taking a column of their own, so the reading measure never changes when
     * a word is opened (ADR 0022).
     */
    .reader {
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
      display: flex;
      grid-area: bar;
      gap: var(--space-2);
      align-items: center;
      padding-block: var(--space-2);
      border-bottom: 1px solid var(--border-subtle);
      background: var(--surface-canvas);
    }

    .content {
      position: relative;
      z-index: 0;
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

    .progress {
      color: var(--text-secondary);
      font-size: var(--text-sm);
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
      grid-area: content;
      min-width: 0;
    }

    /* Room for the ruby above the first line of the reading. */
    .text {
      padding-top: var(--space-2);
    }

    .text {
      max-width: var(--reader-measure);
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
  private readonly popover = inject(PopoverService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly viewContainerRef = inject(ViewContainerRef);

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly wordPopover = viewChild.required<TemplateRef<unknown>>('wordPopover');
  private readonly wordPreview = viewChild.required<TemplateRef<unknown>>('wordPreview');
  private readonly sentenceMenu = viewChild.required<TemplateRef<unknown>>('sentenceMenu');
  private readonly sentenceDetails = viewChild.required<TemplateRef<unknown>>('sentenceDetails');
  private readonly topSentinel = viewChild<ElementRef<HTMLElement>>('topSentinel');
  private readonly bottomSentinel = viewChild<ElementRef<HTMLElement>>('bottomSentinel');

  private readonly menuRequestSignal = signal<SentenceMenuRequest | null>(null);
  private readonly currentSentenceIdSignal = signal<string | null>(null);
  protected readonly currentSentenceId = this.currentSentenceIdSignal.asReadonly();

  protected readonly preferences = this.settings.readerPreferences;

  protected readonly selectedTokenId = computed(() => this.inspector.selected()?.token.id ?? null);

  /** The aids of the sentence whose menu or details are open. */
  protected readonly menuAids = computed(() => {
    const request = this.menuRequestSignal();
    return request === null
      ? NO_AIDS
      : (this.aids.aids().get(request.sentence.sentence.id) ?? NO_AIDS);
  });

  protected readonly menuActions = computed(() => {
    const request = this.menuRequestSignal();
    const kind = this.store.reading()?.kind ?? 'imported';
    return request === null ? [] : sentenceMenuActions(this.menuAids(), kind);
  });

  /** Item 6 of the inspector's content order, from what is already stored. */
  protected readonly selectedWordFindings = computed(() => {
    const selected = this.inspector.selected();
    if (selected === null) {
      return [];
    }
    const grammar = this.aids.aids().get(selected.sentence.id)?.grammar ?? null;
    return grammar === null ? [] : findingsCoveringToken(grammar.findings, selected.token);
  });

  private edgeObserver: IntersectionObserver | null = null;
  private sentenceObserver: IntersectionObserver | null = null;
  private previewTimer: ReturnType<typeof setTimeout> | null = null;
  private previewRef: PopoverRef | null = null;

  constructor() {
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
      // refreshes the summaries the status panel counts, and that in turn
      // re-runs the aid load above for the mounted window.
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
      onClosed: () => {
        this.inspector.close();
      },
    });
  }

  protected closeInspector(): void {
    this.popover.close();
  }

  /**
   * Opens the sentence menu where it was asked for: at the pointer for a
   * whitespace click or a long press, and at the focus-revealed control when
   * the keyboard asked.
   */
  protected openSentenceMenu(request: SentenceMenuRequest): void {
    this.endPreview();
    this.menuRequestSignal.set(request);
    this.popover.open({
      origin: request.origin,
      template: this.sentenceMenu(),
      viewContainerRef: this.viewContainerRef,
      returnFocusTo: request.returnFocusTo,
      onClosed: () => {
        this.menuRequestSignal.set(null);
      },
    });
  }

  /**
   * Runs one menu entry.
   *
   * Every entry that costs a request is an explicit choice made here and
   * nowhere else: nothing in the reader translates or analyses on its own.
   */
  protected runSentenceAction(action: SentenceMenuActionId): void {
    const request = this.menuRequestSignal();
    if (request === null) {
      return;
    }
    const sentenceId = request.sentence.sentence.id;

    switch (action) {
      case 'toggle-translation':
        this.aids.toggleTranslation(sentenceId);
        this.popover.close();
        return;
      case 'translate':
        void this.aids.translateSentence(sentenceId).then(() => this.store.refreshSummaries());
        this.popover.close();
        return;
      case 'analyze-grammar':
        void this.aids.analyzeGrammar(sentenceId).then(() => this.store.refreshSummaries());
        this.popover.close();
        return;
      case 'details':
        this.showSentenceDetails(request);
        return;
    }
  }

  /** Swaps the menu for its details, keeping one floating surface open. */
  private showSentenceDetails(request: SentenceMenuRequest): void {
    // Opening dismisses the menu, and that dismissal clears the sentence the
    // details are about, so the sentence is restored afterwards.
    this.popover.open({
      origin: request.origin,
      template: this.sentenceDetails(),
      viewContainerRef: this.viewContainerRef,
      returnFocusTo: request.returnFocusTo,
      onClosed: () => {
        this.menuRequestSignal.set(null);
      },
    });
    this.menuRequestSignal.set(request);
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
    if (this.inspector.isOpen()) {
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
   * survives re-rendering, a changed window, and a later migration.
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
          this.currentSentenceIdSignal.set(primary.sentence.id);
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
