import { Injectable, computed, inject, signal } from '@angular/core';
import type { LanguageError } from '../../domain/language/language-error';
import type { SentenceTokens } from '../../domain/language/language-runtime';
import {
  extendWindow,
  windowAround,
  type ParagraphWindowState,
  type WindowDirection,
} from '../../domain/reading/paragraph-window';
import type { ReadingProgress } from '../../domain/reading/progress';
import {
  clampPosition,
  progressPercent,
  READING_START,
  resolveResumeTarget,
  type ResumeTarget,
} from '../../domain/reading/reading-position';
import type { Reading } from '../../domain/reading/reading';
import type { Paragraph, Sentence } from '../../domain/reading/text-hierarchy';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import type { ParagraphId, ReadingId, SentenceId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import { CLOCK, READING_REPOSITORY } from '../shared/repository-tokens';
import {
  VocabularyClassificationService,
  VOCABULARY_NOT_CONFIGURED,
  type VocabularyStatus,
} from './vocabulary-classification.service';

/** How long the reader waits before persisting a new position. */
export const PROGRESS_DEBOUNCE_MS = 1_500;

export type ReaderStatus = 'idle' | 'loading' | 'ready' | 'not-found' | 'failed';

/** One sentence with everything the reader needs to render it. */
export interface ReaderSentence {
  readonly sentence: Sentence;
  readonly tokens: readonly Token[];
  /** Absent while vocabulary is not configured. */
  readonly statuses: ReadonlyMap<string, TokenStatusAssignment> | null;
}

export interface ReaderParagraph {
  readonly paragraph: Paragraph;
  readonly sentences: readonly ReaderSentence[];
}

/**
 * Reader state for one reading.
 *
 * The store deliberately holds only the mounted paragraph window. A 50,000
 * character import is loaded a few paragraphs at a time, so opening it reads a
 * bounded amount of data and mounts a bounded amount of DOM.
 */
@Injectable()
export class ReaderStore {
  private readonly readings = inject(READING_REPOSITORY);
  private readonly classification = inject(VocabularyClassificationService);
  private readonly clock = inject(CLOCK);

  private readonly readingSignal = signal<Reading | null>(null);
  private readonly statusSignal = signal<ReaderStatus>('idle');
  private readonly paragraphsSignal = signal<readonly ReaderParagraph[]>([]);
  private readonly windowSignal = signal<ParagraphWindowState>({ first: 0, count: 0 });
  private readonly totalParagraphsSignal = signal(0);
  private readonly vocabularySignal = signal<VocabularyStatus>(VOCABULARY_NOT_CONFIGURED);
  private readonly positionSignal = signal(0);
  private readonly resumeSignal = signal<ResumeTarget>(READING_START);
  private readonly errorSignal = signal<StorageError | null>(null);
  private readonly languageErrorSignal = signal<LanguageError | null>(null);
  private readonly loadingMoreSignal = signal(false);

  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingProgress: ReadingProgress | null = null;

  readonly reading = this.readingSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly paragraphs = this.paragraphsSignal.asReadonly();
  readonly window = this.windowSignal.asReadonly();
  readonly totalParagraphs = this.totalParagraphsSignal.asReadonly();
  readonly vocabulary = this.vocabularySignal.asReadonly();
  readonly resumeTarget = this.resumeSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();
  readonly languageError = this.languageErrorSignal.asReadonly();
  readonly loadingMore = this.loadingMoreSignal.asReadonly();
  readonly positionInReading = this.positionSignal.asReadonly();

  readonly percentRead = computed(() =>
    progressPercent(this.positionSignal(), this.readingSignal()?.sentenceCount ?? 0),
  );

  readonly hasMoreBelow = computed(() => {
    const window = this.windowSignal();
    return window.first + window.count < this.totalParagraphsSignal();
  });

  readonly hasMoreAbove = computed(() => this.windowSignal().first > 0);

  /** True when vocabulary markers cannot be shown because Anki is not set up. */
  /**
   * True only when there genuinely is no vocabulary to classify against.
   *
   * A classification failure also leaves the status unset, but telling the
   * learner their Anki vocabulary is not set up when it is would send them to
   * fix something that is not broken.
   */
  readonly vocabularyNotConfigured = computed(
    () => this.vocabularySignal().kind === 'not-configured' && this.languageErrorSignal() === null,
  );

  /**
   * Opens a reading at its saved position.
   *
   * Nothing here reaches the network or an AI provider: opening a reading is a
   * local read of immutable text plus locally computed status.
   */
  async open(id: ReadingId): Promise<void> {
    this.statusSignal.set('loading');
    this.errorSignal.set(null);
    this.languageErrorSignal.set(null);

    const reading = await this.readings.getReading(id);
    if (!reading.ok) {
      this.fail(reading.error);
      return;
    }
    if (reading.value === null) {
      this.statusSignal.set('not-found');
      return;
    }
    this.readingSignal.set(reading.value);
    // Opening is recorded before the text loads, so Continue reading points at
    // this reading as soon as it is opened rather than once it finished
    // rendering.
    await this.readings.markOpened(id, this.clock.now());

    const paragraphCount = await this.readings.countParagraphs(id);
    if (!paragraphCount.ok) {
      this.fail(paragraphCount.error);
      return;
    }
    this.totalParagraphsSignal.set(paragraphCount.value);

    const progress = await this.readings.getProgress(id);
    if (!progress.ok) {
      this.fail(progress.error);
      return;
    }

    const resume = await this.resolveResume(id, progress.value, reading.value.sentenceCount);
    if (resume === null) {
      return;
    }
    this.resumeSignal.set(resume);
    this.positionSignal.set(
      clampPosition(progress.value?.positionInReading ?? 0, reading.value.sentenceCount),
    );

    const window = windowAround(resume.paragraphPosition, paragraphCount.value);
    const loaded = await this.loadWindow(id, window);
    if (!loaded) {
      return;
    }

    this.statusSignal.set('ready');
  }

  /**
   * Re-reads the reading row after an aid was written.
   *
   * The denormalized summaries are refreshed inside the write's own
   * transaction, so the only stale copy afterwards is the one held here.
   * Re-reading rather than adjusting a counter locally keeps the database the
   * single source of what is actually stored.
   */
  async refreshSummaries(): Promise<void> {
    const current = this.readingSignal();
    if (current === null) {
      return;
    }
    const reading = await this.readings.getReading(current.id);
    if (reading.ok && reading.value !== null) {
      this.readingSignal.set(reading.value);
    }
  }

  /** Mounts more paragraphs when the learner reaches an edge of the window. */
  async extend(direction: WindowDirection): Promise<void> {
    const reading = this.readingSignal();
    if (reading === null || this.loadingMoreSignal()) {
      return;
    }
    const next = extendWindow(this.windowSignal(), direction, this.totalParagraphsSignal());
    if (next === this.windowSignal()) {
      return;
    }

    this.loadingMoreSignal.set(true);
    await this.loadWindow(reading.id, next);
    this.loadingMoreSignal.set(false);
  }

  /**
   * Records the sentence that has become the primary one in the viewport.
   *
   * Writes are debounced: scrolling through a long reading must not produce a
   * storage write per sentence.
   */
  reportPosition(sentence: Sentence): void {
    const reading = this.readingSignal();
    if (reading === null || sentence.positionInReading === this.positionSignal()) {
      return;
    }
    this.positionSignal.set(sentence.positionInReading);

    const now = this.clock.now();
    this.pendingProgress = {
      readingId: reading.id,
      paragraphId: sentence.paragraphId,
      sentenceId: sentence.id,
      positionInReading: sentence.positionInReading,
      lastOpenedAt: now,
      updatedAt: now,
    };

    if (this.progressTimer !== null) {
      clearTimeout(this.progressTimer);
    }
    this.progressTimer = setTimeout(() => {
      void this.flushProgress();
    }, PROGRESS_DEBOUNCE_MS);
  }

  /** Persists any pending position. Called on route exit and page hide. */
  async flushProgress(): Promise<void> {
    if (this.progressTimer !== null) {
      clearTimeout(this.progressTimer);
      this.progressTimer = null;
    }
    const pending = this.pendingProgress;
    if (pending === null) {
      return;
    }
    this.pendingProgress = null;
    const saved = await this.readings.saveProgress(pending);
    if (!saved.ok) {
      this.errorSignal.set(saved.error);
    }
  }

  /** Releases the reading and any unsaved position. */
  async close(): Promise<void> {
    await this.flushProgress();
    this.readingSignal.set(null);
    this.paragraphsSignal.set([]);
    this.windowSignal.set({ first: 0, count: 0 });
    this.statusSignal.set('idle');
  }

  private async resolveResume(
    id: ReadingId,
    progress: ReadingProgress | null,
    sentenceCount: number,
  ): Promise<ResumeTarget | null> {
    if (progress === null) {
      return READING_START;
    }
    const located = await this.readings.locateSentence(
      id,
      clampPosition(progress.positionInReading, sentenceCount),
    );
    if (!located.ok) {
      this.fail(located.error);
      return null;
    }
    return resolveResumeTarget(progress, located.value);
  }

  /** Loads one window of text, its token analyses, and its vocabulary status. */
  private async loadWindow(id: ReadingId, window: ParagraphWindowState): Promise<boolean> {
    const graph = await this.readings.loadGraph(id, {
      firstParagraphPosition: window.first,
      paragraphCount: window.count,
    });
    if (!graph.ok) {
      this.fail(graph.error);
      return false;
    }

    const sentenceIds = graph.value.sentences.map((sentence) => sentence.id);
    const analyses = await this.readings.loadTokenAnalyses(sentenceIds);
    if (!analyses.ok) {
      this.fail(analyses.error);
      return false;
    }

    const tokensBySentence = new Map<SentenceId, readonly Token[]>();
    for (const analysis of analyses.value) {
      tokensBySentence.set(analysis.sentenceId, analysis.tokens);
    }

    const forClassification: SentenceTokens[] = graph.value.sentences.map((sentence) => ({
      sentenceId: sentence.id,
      tokens: tokensBySentence.get(sentence.id) ?? [],
    }));
    const vocabulary = await this.classification.classify(forClassification);
    if (vocabulary.ok) {
      this.vocabularySignal.set(vocabulary.value);
      this.languageErrorSignal.set(null);
    } else {
      // Markers are an aid, not the reading: a classification failure leaves the
      // text readable and reports why status is missing.
      this.vocabularySignal.set(VOCABULARY_NOT_CONFIGURED);
      this.languageErrorSignal.set(vocabulary.error);
    }

    this.windowSignal.set(window);
    this.paragraphsSignal.set(
      this.assemble(graph.value.paragraphs, graph.value.sentences, tokensBySentence),
    );
    return true;
  }

  private assemble(
    paragraphs: readonly Paragraph[],
    sentences: readonly Sentence[],
    tokensBySentence: ReadonlyMap<SentenceId, readonly Token[]>,
  ): readonly ReaderParagraph[] {
    const status = this.vocabularySignal();
    const byParagraph = new Map<ParagraphId, Sentence[]>();
    for (const sentence of sentences) {
      const bucket = byParagraph.get(sentence.paragraphId);
      if (bucket === undefined) {
        byParagraph.set(sentence.paragraphId, [sentence]);
      } else {
        bucket.push(sentence);
      }
    }

    return paragraphs.map((paragraph) => ({
      paragraph,
      sentences: (byParagraph.get(paragraph.id) ?? [])
        .slice()
        .sort((left, right) => left.positionInParagraph - right.positionInParagraph)
        .map((sentence) => ({
          sentence,
          tokens: tokensBySentence.get(sentence.id) ?? [],
          statuses:
            status.kind === 'classified'
              ? indexStatuses(status.statusesBySentence.get(sentence.id) ?? [])
              : null,
        })),
    }));
  }

  private fail(error: StorageError): void {
    this.errorSignal.set(error);
    this.statusSignal.set('failed');
  }
}

function indexStatuses(
  statuses: readonly TokenStatusAssignment[],
): ReadonlyMap<string, TokenStatusAssignment> {
  const byToken = new Map<string, TokenStatusAssignment>();
  for (const status of statuses) {
    byToken.set(status.tokenId, status);
  }
  return byToken;
}
