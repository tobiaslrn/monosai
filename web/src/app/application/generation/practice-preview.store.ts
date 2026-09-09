import { Injectable, computed, inject, signal } from '@angular/core';
import {
  practiceTargetLimit,
  selectPracticeTargets,
  type PracticeSelection,
} from '../../domain/ai/practice-selection';
import type { PracticeWindowDays } from '../../domain/anki/practice-evidence';
import {
  DEFAULT_PRACTICE_SETTINGS,
  type PracticeMode,
  type PracticeSettings,
} from '../../domain/settings/practice-settings';
import { DEFAULT_STORY_SENTENCES } from '../../domain/ai/story-request';
import type { StorageError } from '../../domain/storage/storage-error';
import type {
  CapturedSourceObservation,
  VocabularyCapture,
} from '../../domain/vocabulary/vocabulary-repository';
import { RANDOM_SOURCE, VOCABULARY_REPOSITORY } from '../shared/repository-tokens';

/**
 * Whether a source could answer the question the practice list is built on.
 *
 * Four states rather than a boolean, because they need four different things
 * said about them: a source nobody has read yet is not a source that answered
 * no, and a bridge too old to run the searches is not a bridge that failed.
 */
export type PracticeSourceStanding = 'measured' | 'unsupported' | 'unavailable' | 'unread';

export interface PracticeSourceState {
  readonly observation: CapturedSourceObservation;
  readonly standing: PracticeSourceStanding;
}

export type PracticePreviewState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  /** No vocabulary has been built yet, so there is nothing to practise from. */
  | { readonly kind: 'empty' }
  | { readonly kind: 'ready'; readonly selection: PracticeSelection }
  | {
      readonly kind: 'failed';
      readonly message: string;
      /** True when an earlier capture is still shown behind the failure. */
      readonly keptPreviousSelection: boolean;
    };

/**
 * Exactly what one generation was handed, frozen at the moment it was asked for.
 *
 * A value, not a view: once this is taken, later refreshes, source removals and
 * setting changes cannot reach it. That is the whole point — the words a story
 * was asked to practise have to stay answerable after the vocabulary they came
 * from has moved on.
 */
export interface PracticeCommitment {
  readonly revision: string;
  readonly settings: PracticeSettings;
  readonly selection: PracticeSelection;
  /** The canonical expressions this run may use: allowlist and matcher input. */
  readonly allowedVocabulary: readonly string[];
  readonly sources: readonly PracticeSourceState[];
}

/**
 * The practice words the next story will be built around, and the capture they
 * were chosen from.
 *
 * The store holds one immutable capture rather than querying as it goes.
 * Everything shown — the words, their reasons, the counts, what each source
 * could prove — comes out of that one capture, so the list cannot change
 * beneath a learner who is reading it, and the list handed to a generation is
 * the list that was on screen.
 *
 * Selection is recomputed only when something actually asks for it: a new
 * capture, a changed setting, an edited choice, or Shuffle. It is deliberately
 * not a computed signal, because drawing is random, and a value that redrew
 * itself whenever Angular re-evaluated it would be a different list every time
 * anything else on the page changed.
 */
@Injectable({ providedIn: 'root' })
export class PracticePreviewStore {
  private readonly vocabulary = inject(VOCABULARY_REPOSITORY);
  private readonly random = inject(RANDOM_SOURCE);

  private readonly captureSignal = signal<VocabularyCapture | null>(null);
  private readonly settingsSignal = signal<PracticeSettings>(DEFAULT_PRACTICE_SETTINGS);
  private readonly sentenceCountSignal = signal<number>(DEFAULT_STORY_SENTENCES);
  private readonly pinsSignal = signal<readonly string[]>([]);
  private readonly removedSignal = signal<readonly string[]>([]);
  private readonly selectionSignal = signal<PracticeSelection | null>(null);
  private readonly stateSignal = signal<PracticePreviewState>({ kind: 'idle' });
  private readonly refreshingSignal = signal(false);
  private inFlight: Promise<void> | null = null;

  readonly state = this.stateSignal.asReadonly();
  readonly settings = this.settingsSignal.asReadonly();
  /** True while a read is under way; the list below stays usable meanwhile. */
  readonly refreshing = this.refreshingSignal.asReadonly();
  /** The current list, or null before a first capture. Reading never redraws it. */
  readonly selection = this.selectionSignal.asReadonly();
  readonly targets = computed(() => this.selectionSignal()?.targets ?? []);

  /** The revision the shown list belongs to, for spotting a stale capture. */
  readonly revision = computed(() => this.captureSignal()?.snapshot.revision ?? null);

  readonly sources = computed<readonly PracticeSourceState[]>(() =>
    (this.captureSignal()?.sources ?? []).map((observation) => ({
      observation,
      standing: standingOf(observation),
    })),
  );

  /**
   * Whether any included source could answer the recent-practice question.
   *
   * False is the honest empty state: not "you have not studied", but "nothing
   * here can tell", which needs a different offer — pick words, or read freely.
   */
  readonly hasMeasuredPractice = computed(() =>
    this.sources().some((source) => source.standing === 'measured'),
  );

  setMode(mode: PracticeMode): void {
    if (mode === this.settingsSignal().mode) {
      return;
    }
    this.settingsSignal.update((settings) => ({ ...settings, mode }));
    this.reselect();
  }

  setWindowDays(windowDays: PracticeWindowDays): void {
    if (windowDays === this.settingsSignal().windowDays) {
      return;
    }
    this.settingsSignal.update((settings) => ({ ...settings, windowDays }));
    this.reselect();
  }

  /**
   * Follows the requested story length, which decides how many words to ask for.
   *
   * Only a change that actually moves the limit redraws the list. Nudging a
   * slider from fifteen to thirty sentences must not silently replace the words
   * the learner was reading while they moved it.
   */
  setSentenceCount(sentenceCount: number): void {
    const before = practiceTargetLimit(this.sentenceCountSignal());
    this.sentenceCountSignal.set(sentenceCount);
    if (practiceTargetLimit(sentenceCount) !== before) {
      this.reselect();
    }
  }

  /**
   * Keeps one word in the list whatever the automatic draw would have chosen.
   *
   * A pin can name a word the current mode has no evidence about — the picker
   * offers the whole eligible vocabulary — but never one outside it, because
   * being inside the allowlist is what makes a target askable at all.
   */
  pin(canonicalExpression: string): void {
    if (this.pinsSignal().includes(canonicalExpression)) {
      return;
    }
    this.removedSignal.update((removed) =>
      removed.filter((expression) => expression !== canonicalExpression),
    );
    this.pinsSignal.update((pins) => [...pins, canonicalExpression]);
    this.reselect();
  }

  /**
   * Takes one word out of the list without putting another in its place.
   *
   * The slot goes with it, so the list gets shorter rather than refilling with
   * a word the learner did not ask for and did not choose to reject. The
   * removal outlives a shuffle, or it would not be a removal.
   */
  remove(canonicalExpression: string): void {
    this.pinsSignal.update((pins) =>
      pins.filter((expression) => expression !== canonicalExpression),
    );
    if (!this.removedSignal().includes(canonicalExpression)) {
      this.removedSignal.update((removed) => [...removed, canonicalExpression]);
    }
    this.reselect();
  }

  /**
   * Draws the automatic slots again, leaving manual choices and removals alone.
   *
   * It can return the same words when the pool has nothing else to offer.
   * Nothing here promises novelty that the candidates cannot supply.
   */
  shuffle(): void {
    this.reselect();
  }

  /**
   * Reads the vocabulary again and updates the automatic half of the list.
   *
   * Manual choices survive by canonical expression while the word is still
   * eligible; one that has gone is reported rather than quietly dropped, so the
   * learner is not left waiting for a target the story can never contain.
   *
   * A failed read keeps the previous capture. A stopped bridge should not empty
   * a list that was right a minute ago, and reading the vocabulary already
   * stored is still perfectly possible while a source is unreachable.
   */
  refresh(): Promise<void> {
    if (this.inFlight !== null) {
      return this.inFlight;
    }
    this.inFlight = this.run().finally(() => {
      this.inFlight = null;
      this.refreshingSignal.set(false);
    });
    return this.inFlight;
  }

  /**
   * Hands the current list to a generation, exactly as shown.
   *
   * Null before a capture exists. Nothing is drawn here: the selection returned
   * is the one already on screen, because a Generate that resampled would make
   * the visible list a suggestion rather than the request.
   */
  submit(): PracticeCommitment | null {
    const capture = this.captureSignal();
    const selection = this.selectionSignal();
    if (capture === null || selection === null) {
      return null;
    }
    return {
      revision: capture.snapshot.revision,
      settings: this.settingsSignal(),
      selection,
      allowedVocabulary: capture.expressions.map((expression) => expression.canonicalExpression),
      sources: this.sources(),
    };
  }

  private async run(): Promise<void> {
    const hadSelection = this.selectionSignal() !== null;
    this.refreshingSignal.set(true);
    if (!hadSelection) {
      this.stateSignal.set({ kind: 'loading' });
    }

    const captured = await this.vocabulary.captureVocabulary();
    if (!captured.ok) {
      this.failed(captured.error, hadSelection);
      return;
    }
    if (captured.value === null) {
      this.captureSignal.set(null);
      this.selectionSignal.set(null);
      this.stateSignal.set({ kind: 'empty' });
      return;
    }
    this.captureSignal.set(captured.value);
    this.reselect();
  }

  private failed(error: StorageError, keptPreviousSelection: boolean): void {
    this.stateSignal.set({
      kind: 'failed',
      message: keptPreviousSelection
        ? `${error.message} The practice words you already have were kept.`
        : error.message,
      keptPreviousSelection,
    });
  }

  private reselect(): void {
    const capture = this.captureSignal();
    if (capture === null) {
      return;
    }
    const settings = this.settingsSignal();
    const removed = new Set(this.removedSignal());
    const selection = selectPracticeTargets({
      mode: settings.mode,
      windowDays: settings.windowDays,
      // Every removal takes its slot with it, so nothing replaces a word the
      // learner deliberately turned down.
      limit: Math.max(0, practiceTargetLimit(this.sentenceCountSignal()) - removed.size),
      candidates: capture.expressions.filter(
        (expression) => !removed.has(expression.canonicalExpression),
      ),
      pinned: this.pinsSignal(),
      random: this.random,
    });
    this.selectionSignal.set(selection);
    this.stateSignal.set({ kind: 'ready', selection });
  }
}

/**
 * What one source's last read could establish about recent practice.
 *
 * Read off the recent-answer family alone, because that is the question the
 * list is built on. A source that proved recent answers but not difficulty is
 * still measured; it simply has less to say about one of the two halves.
 */
function standingOf(observation: CapturedSourceObservation): PracticeSourceStanding {
  if (observation.practice === null) {
    return 'unread';
  }
  switch (observation.practice.recentAnswers) {
    case 'available':
      return 'measured';
    case 'unsupported':
      return 'unsupported';
    case 'unavailable':
      return 'unavailable';
  }
}
