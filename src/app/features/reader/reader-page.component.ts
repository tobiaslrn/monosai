import type { ElementRef } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Injector,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router, RouterLink } from '@angular/router';
import { ReaderStore, type ReaderSentence } from '../../application/reading/reader.store';
import { WordInspectorStore } from '../../application/reading/word-inspector.store';
import { AppSettingsStore } from '../../application/settings/app-settings.store';
import { LibraryStore } from '../../application/reading/library.store';
import { describeDeletion } from '../../domain/reading/deletion-plan';
import { readingId } from '../../domain/shared/ids';
import { ViewportService } from '../../core/platform/viewport.service';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ReaderAidsComponent } from './reader-aids.component';
import { ReaderParagraphComponent } from './reader-paragraph.component';
import type { TokenActivation } from './reader-sentence.component';
import { WordInspectorComponent } from './word-inspector.component';
import { WordInspectorSheetComponent } from './word-inspector-sheet.component';

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
    WordInspectorComponent,
  ],
  providers: [ReaderStore, WordInspectorStore],
  template: `
    <div class="reader" [class.has-inspector]="showSidePanel()">
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

            @if (store.hasMoreAbove()) {
              <div class="sentinel" #topSentinel aria-hidden="true"></div>
            }

            <article class="text">
              @for (paragraph of store.paragraphs(); track paragraph.paragraph.id) {
                <mn-reader-paragraph
                  [entry]="paragraph"
                  [furigana]="preferences().furigana"
                  [tokenSpacing]="preferences().tokenSpacing"
                  [markers]="preferences().statusMarkers"
                  [currentSentenceId]="currentSentenceId()"
                  [selectedTokenId]="selectedTokenId()"
                  (activated)="inspect($event)"
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

      @if (showSidePanel()) {
        <aside class="inspector-panel" aria-label="Word details">
          <mn-word-inspector (closed)="closeInspector()" />
        </aside>
      }
    </div>
  `,
  styles: `
    .reader {
      display: grid;
      /*
       * The areas must be named in both layouts. Placing children into areas
       * that only exist in the inspector layout leaves the header and the text
       * stacked in one cell, where the header covers the first line.
       */
      grid-template-rows: auto 1fr;
      grid-template-areas: 'bar' 'content';
      gap: var(--space-4);
      max-width: var(--layout-measure);
      margin-inline: auto;
    }

    .reader.has-inspector {
      grid-template-columns: minmax(0, 1fr) minmax(20rem, 23rem);
      grid-template-areas: 'bar bar' 'content inspector';
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

    .inspector-panel {
      position: sticky;
      top: var(--space-4);
      grid-area: inspector;
      align-self: start;
      max-height: calc(100dvh - 2 * var(--space-4));
      padding: var(--space-4);
      overflow-y: auto;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
    }
  `,
})
export class ReaderPageComponent {
  /** Route parameter, bound by `withComponentInputBinding`. */
  readonly id = input.required<string>();

  protected readonly store = inject(ReaderStore);
  protected readonly inspector = inject(WordInspectorStore);
  private readonly settings = inject(AppSettingsStore);
  private readonly library = inject(LibraryStore);
  private readonly viewport = inject(ViewportService);
  private readonly dialog = inject(Dialog);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);

  private readonly content = viewChild<ElementRef<HTMLElement>>('content');
  private readonly topSentinel = viewChild<ElementRef<HTMLElement>>('topSentinel');
  private readonly bottomSentinel = viewChild<ElementRef<HTMLElement>>('bottomSentinel');

  private readonly currentSentenceIdSignal = signal<string | null>(null);
  protected readonly currentSentenceId = this.currentSentenceIdSignal.asReadonly();

  protected readonly preferences = this.settings.readerPreferences;

  protected readonly selectedTokenId = computed(() => this.inspector.selected()?.token.id ?? null);

  protected readonly showSidePanel = computed(
    () => this.viewport.isDesktop() && this.inspector.isOpen(),
  );

  private edgeObserver: IntersectionObserver | null = null;
  private sentenceObserver: IntersectionObserver | null = null;

  constructor() {
    effect(() => {
      void this.store.open(readingId(this.id()));
    });

    effect(() => {
      // Re-registered whenever the mounted window changes, because the observed
      // sentinels and sentences are replaced with it.
      this.store.paragraphs();
      queueMicrotask(() => {
        this.observeEdges();
        this.observeSentences();
      });
    });

    const flushOnHide = (): void => {
      if (document.visibilityState === 'hidden') {
        void this.store.flushProgress();
      }
    };
    document.addEventListener('visibilitychange', flushOnHide);

    inject(DestroyRef).onDestroy(() => {
      document.removeEventListener('visibilitychange', flushOnHide);
      this.edgeObserver?.disconnect();
      this.sentenceObserver?.disconnect();
      void this.store.close();
    });
  }

  protected reload(): void {
    void this.store.open(readingId(this.id()));
  }

  /** Opens word details, as a side panel on desktop and a sheet on mobile. */
  protected inspect(activation: TokenActivation): void {
    void this.inspector.inspect({
      token: activation.token,
      sentence: activation.sentence.sentence,
      status: activation.sentence.statuses?.get(activation.token.id) ?? null,
    });

    if (!this.viewport.isDesktop()) {
      const ref = this.dialog.open<void>(WordInspectorSheetComponent, {
        injector: this.injector,
        ariaLabelledBy: 'mn-word-sheet-title',
        panelClass: 'mn-sheet-panel',
        hasBackdrop: true,
      });
      ref.closed.subscribe(() => {
        this.inspector.close();
      });
    }
  }

  protected closeInspector(): void {
    this.inspector.close();
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
