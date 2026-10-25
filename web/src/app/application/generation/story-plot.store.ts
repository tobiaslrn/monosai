import { Injectable, computed, inject, signal } from '@angular/core';
import { aiError, type AiError } from '../../domain/ai/ai-error';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import {
  PLOT_COUNT,
  reframePlot,
  rollPlotFrames,
  storyDirectionRecord,
  type StoryDirection,
} from '../../domain/ai/story-direction';
import { STORY_AXES } from '../../domain/ai/story-direction-options';
import {
  MAX_PLOT_LENGTH,
  PLOT_FOCUS_WORD_LIMIT,
  PLOT_VOCABULARY_SAMPLE_SIZE,
  RECENT_STORY_COUNT,
  isEditedPlot,
  type PlotCard,
  type RecentStory,
} from '../../domain/ai/story-plot';
import { countCodePoints, type ChosenPlot } from '../../domain/ai/story-request';
import type { StorageError } from '../../domain/storage/storage-error';
import { AppSettingsStore } from '../settings/app-settings.store';
import { TextModelStore } from '../settings/text-model.store';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import {
  RANDOM_SOURCE,
  READING_REPOSITORY,
  VOCABULARY_REPOSITORY,
} from '../shared/repository-tokens';
import { VocabularyPreparationService } from './vocabulary-preparation.service';

export type PlotDraftStatus = 'idle' | 'drafting' | 'ready' | 'failed';

export type PlotFailure = AiError | StorageError;

/** Why the picked plot cannot be sent as it stands, or null when it can. */
export type PlotIssue = 'empty' | 'too-long';

/**
 * The plots on offer on the Plot step, and the one the learner picked.
 *
 * Root-provided for the same reason as the draft: a prerequisite link leaves
 * the Generate screen, and plots that were paid for must still be there when
 * the learner comes back. Nothing here is persisted.
 *
 * A plot the learner edited is their own text and is never discarded: a new
 * draft keeps it in its place, rolls only the other cards, and tells the model
 * to stay clear of it. See ADR 0080.
 */
@Injectable({ providedIn: 'root' })
export class StoryPlotStore {
  private readonly provider = inject(TEXT_GENERATION_PROVIDER);
  private readonly textModel = inject(TextModelStore);
  private readonly appSettings = inject(AppSettingsStore);
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly readings = inject(READING_REPOSITORY);
  private readonly preparation = inject(VocabularyPreparationService);
  private readonly random = inject(RANDOM_SOURCE);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly cardsSignal = signal<readonly PlotCard[]>([]);
  private readonly selectedSignal = signal(0);
  private readonly statusSignal = signal<PlotDraftStatus>('idle');
  private readonly failureSignal = signal<PlotFailure | null>(null);

  /** What the cards on offer were drafted for; a different basis drafts again. */
  private basis: string | null = null;
  private controller: AbortController | null = null;
  /** Cards that were sent as stories, dropped the next time the step drafts. */
  private readonly spent = new Set<PlotCard>();
  private cardCount = 0;

  readonly cards = this.cardsSignal.asReadonly();
  readonly selectedIndex = this.selectedSignal.asReadonly();
  readonly status = this.statusSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();

  readonly isDrafting = computed(() => this.statusSignal() === 'drafting');
  readonly selected = computed(() => this.cardsSignal().at(this.selectedSignal()) ?? null);

  /** How many cards the current draft is writing, for the waiting line. */
  readonly draftingCount = computed(() =>
    this.isDrafting()
      ? Math.max(PLOT_COUNT, this.cardsSignal().length) -
        this.cardsSignal().filter((card) => isEditedPlot(card)).length
      : 0,
  );

  /** Regenerate has something to rewrite: at least one card is not the learner's. */
  readonly canRegenerate = computed(
    () =>
      !this.isDrafting() &&
      (this.cardsSignal().length < PLOT_COUNT ||
        this.cardsSignal().some((card) => !isEditedPlot(card))),
  );

  readonly selectedIssue = computed<PlotIssue | null>(() => {
    const card = this.selected();
    if (card === null || card.text.trim() === '') {
      return 'empty';
    }
    return countCodePoints(card.text.trim()) > MAX_PLOT_LENGTH ? 'too-long' : null;
  });

  /**
   * Whether the picked plot can become a premise right now.
   *
   * A failed regenerate leaves the earlier plots on offer, and they are still
   * good plots; only an open request or an unusable pick stops the story.
   */
  readonly isReady = computed(
    () => !this.isDrafting() && this.selected() !== null && this.selectedIssue() === null,
  );

  /**
   * Drafts plots for this direction, unless the cards on offer were drafted for
   * exactly it. Returning to the step after looking at the words costs nothing;
   * changing a choice drafts again and keeps every edited plot.
   */
  async prepare(direction: StoryDirection, notes: string): Promise<void> {
    if (this.spent.size > 0) {
      // A plot that became a story goes; any other plot the learner edited is
      // still theirs and stays on offer.
      const spent = new Set(this.spent);
      this.spent.clear();
      this.basis = null;
      this.keepCards((card) => !spent.has(card) && isEditedPlot(card));
    }
    const basis = this.basisFor(direction, notes);
    if (
      basis === this.basis &&
      this.statusSignal() !== 'failed' &&
      this.statusSignal() !== 'idle'
    ) {
      return;
    }
    if (basis !== this.basis) {
      // An edited plot survives a change of direction, told what was chosen now.
      this.keepCards((card) => isEditedPlot(card));
      this.cardsSignal.update((cards) =>
        cards.map((card) => ({ ...card, frame: reframePlot(card.frame, direction) })),
      );
    }
    await this.draft(direction, notes, basis);
  }

  /** Rewrites every card the learner has not edited, with freshly rolled frames. */
  async regenerate(direction: StoryDirection, notes: string): Promise<void> {
    if (!this.canRegenerate()) {
      return;
    }
    await this.draft(direction, notes, this.basisFor(direction, notes));
  }

  select(index: number): void {
    if (index >= 0 && index < this.cardsSignal().length) {
      this.selectedSignal.set(index);
    }
  }

  edit(index: number, text: string): void {
    this.cardsSignal.update((cards) =>
      cards.map((card, position) => (position === index ? { ...card, text } : card)),
    );
  }

  /** The picked plot as a generation input, or null while there is none to send. */
  chosenPlot(
    direction: StoryDirection,
  ): { readonly premise: string; readonly plot: ChosenPlot } | null {
    const card = this.selected();
    if (card === null || !this.isReady()) {
      return null;
    }
    const premise = card.text.trim();
    return {
      premise,
      plot: {
        frame: card.frame,
        record: storyDirectionRecord(direction, card.frame, premise, card.draftedText),
      },
    };
  }

  /**
   * The picked plot was sent to be written. It stays on screen until the step
   * next drafts, and a run that writes nothing hands it back with `restore`.
   */
  spend(): void {
    const card = this.selected();
    if (card !== null) {
      this.spent.add(card);
    }
  }

  /**
   * A run wrote nothing, so the plot it was given is on offer again, picked.
   *
   * The plot comes from the run rather than from this store, because the
   * learner may have drafted again since, or started another story, before
   * this one failed. Nothing else on offer is dropped to make room for it.
   */
  restore(plot: ChosenPlot, direction: StoryDirection, notes: string): void {
    const text = plot.record.plotEn;
    for (const card of this.spent) {
      if (card.text.trim() === text) {
        this.spent.delete(card);
      }
    }
    const cards = this.cardsSignal();
    let index = cards.findIndex((card) => card.text.trim() === text);
    if (index < 0) {
      const restored: PlotCard = {
        id: this.newCardId(),
        frame: plot.frame,
        text,
        draftedText: plot.record.draftedPlotEn ?? text,
      };
      let replaceable = -1;
      cards.forEach((card, position) => {
        if (!isEditedPlot(card) && !this.spent.has(card)) {
          replaceable = position;
        }
      });
      index = cards.length < PLOT_COUNT || replaceable < 0 ? cards.length : replaceable;
      const next = [...cards];
      next.splice(index, index < cards.length ? 1 : 0, restored);
      this.cardsSignal.set(next);
      this.basis = this.basisFor(direction, notes);
    }
    this.selectedSignal.set(index);
    if (!this.isDrafting()) {
      this.statusSignal.set('ready');
      this.failureSignal.set(null);
    }
  }

  /** Forgets every plot. */
  clear(): void {
    this.controller?.abort();
    this.controller = null;
    this.spent.clear();
    this.basis = null;
    this.cardsSignal.set([]);
    this.selectedSignal.set(0);
    this.statusSignal.set('idle');
    this.failureSignal.set(null);
  }

  /** Keeps the cards that pass, and the pick on the same card when it is kept. */
  private keepCards(keep: (card: PlotCard) => boolean): void {
    const picked = this.selected();
    const kept = this.cardsSignal().filter(keep);
    this.cardsSignal.set(kept);
    this.selectedSignal.set(Math.max(0, picked === null ? 0 : kept.indexOf(picked)));
  }

  private basisFor(direction: StoryDirection, notes: string): string {
    return JSON.stringify([
      STORY_AXES.map((axis) => direction.selected[axis]),
      notes.trim(),
      this.appSettings.ankiWordPriorityMode(),
      this.appSettings.recentFocusSize(),
    ]);
  }

  private async draft(direction: StoryDirection, notes: string, basis: string): Promise<void> {
    this.controller?.abort();
    const controller = new AbortController();
    this.controller = controller;
    const signal = controller.signal;
    const current = (): boolean => this.controller === controller && !signal.aborted;

    this.basis = basis;
    this.statusSignal.set('drafting');
    this.failureSignal.set(null);

    // Captured before the first await, so a setting changed while the request
    // is open changes the next draft rather than this one.
    const config = this.textModel.configForTask('text');
    const mode = this.appSettings.ankiWordPriorityMode();
    const focusSize = this.appSettings.recentFocusSize();
    const existing = this.cardsSignal();
    // A plot handed back by a run that wrote nothing can be a fourth card; it
    // keeps its slot like any other.
    const kept = Array.from({ length: Math.max(PLOT_COUNT, existing.length) }, (_slot, index) => {
      const card = existing.at(index);
      return card !== undefined && isEditedPlot(card) ? card : null;
    });

    if (kept.every((card) => card !== null)) {
      // Every plot is the learner's: there is nothing to ask for.
      this.statusSignal.set('ready');
      this.controller = null;
      return;
    }

    if (config === null) {
      this.fail(
        aiError('capability-unsupported', 'story-plots', 'No tested text model is available.', {
          detail: { capability: 'structured-output' },
        }),
      );
      return;
    }

    const snapshot = await this.vocabulary.getActiveSnapshot();
    if (!current()) return;
    if (!snapshot.ok) {
      this.fail(snapshot.error);
      return;
    }
    if (snapshot.value === null) {
      this.fail(
        aiError('unknown', 'story-plots', 'There is no active vocabulary snapshot.', {
          detail: { issueCode: 'no-snapshot' },
        }),
      );
      return;
    }

    const prepared = await this.preparation.prepare(snapshot.value.id, 'micro', mode, focusSize);
    if (!current()) return;
    if (!prepared.ok) {
      this.fail(prepared.error);
      return;
    }

    const recent = await this.readings.listLibraryPage({
      filter: 'generated',
      limit: RECENT_STORY_COUNT,
    });
    if (!current()) return;
    if (!recent.ok) {
      this.fail(recent.error);
      return;
    }
    const recentStories: RecentStory[] = recent.value.items.flatMap((reading) =>
      reading.kind === 'generated' ? [{ titleJa: reading.title, premise: reading.premise }] : [],
    );

    const frames = rollPlotFrames(
      direction,
      this.random,
      kept.map((card) => card?.frame ?? null),
    );
    const writing = kept.flatMap((card, index) => (card === null ? [index] : []));
    const keptPlots = kept.flatMap((card) => (card === null ? [] : [card.text.trim()]));
    const trimmedNotes = notes.trim();

    const drafted = await this.provider.draftPlots(
      {
        frames: writing.map((index) => frames[index]),
        keptPlots,
        recentStories,
        focusVocabulary: prepared.value.focusVocabulary
          .slice(0, PLOT_FOCUS_WORD_LIMIT)
          .map((word) => word.expression),
        vocabularySample: prepared.value.suggestedVocabulary.slice(0, PLOT_VOCABULARY_SAMPLE_SIZE),
        ...(trimmedNotes === '' ? {} : { learnerNotes: trimmedNotes }),
        promptVersion: PROMPT_VERSIONS.plots,
      },
      config,
      signal,
    );
    if (!current()) return;
    if (!drafted.ok) {
      this.fail(drafted.error);
      return;
    }

    const texts = [...drafted.value];
    this.cardsSignal.set(
      kept.map((card, index) => {
        if (card !== null) {
          return card;
        }
        const text = texts.shift() ?? '';
        return { id: this.newCardId(), frame: frames[index], text, draftedText: text };
      }),
    );
    this.selectedSignal.update((index) => Math.min(index, kept.length - 1));
    this.statusSignal.set('ready');
    this.controller = null;
  }

  private newCardId(): string {
    this.cardCount += 1;
    return `plot-${String(this.cardCount)}`;
  }

  private fail(error: PlotFailure): void {
    this.controller = null;
    this.logger.error('job.failed', {
      kind: 'plots',
      errorDomain: error.domain,
      errorCode: error.code,
    });
    this.failureSignal.set(error);
    this.statusSignal.set('failed');
  }
}
