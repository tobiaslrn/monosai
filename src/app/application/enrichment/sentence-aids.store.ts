import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import { concernCount } from '../../domain/enrichment/grammar-normalization';
import type { GrammarAnalysisRecord, TranslationRecord } from '../../domain/enrichment/records';
import { chooseAnalysis } from '../../domain/enrichment/staleness';
import type { Reading } from '../../domain/reading/reading';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { SentenceId } from '../../domain/shared/ids';
import type { StorageError } from '../../domain/storage/storage-error';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { AppSettingsStore } from '../settings/app-settings.store';
import { TextModelStore } from '../settings/text-model.store';
import { ENRICHMENT_REPOSITORY } from '../shared/repository-tokens';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { SentenceEnrichmentService, type EnrichmentFailure } from './sentence-enrichment.service';

/** Where one explicit aid action stands for one sentence. */
export type AidActionState = 'idle' | 'running' | 'failed';

export interface AidAction {
  readonly state: AidActionState;
  /** The last failure, kept so sentence details can explain what to retry. */
  readonly error: EnrichmentFailure | null;
}

export const IDLE_ACTION: AidAction = { state: 'idle', error: null };

/** Everything the reader shows under and around one sentence. */
export interface SentenceAids {
  readonly translation: TranslationRecord | null;
  /** The global aid preference, unless this sentence was toggled by hand. */
  readonly translationVisible: boolean;
  readonly grammar: GrammarAnalysisRecord | null;
  /** True only for an imported analysis judged against an older profile. */
  readonly grammarStale: boolean;
  /** Findings outside the profile — what an amber marker actually marks. */
  readonly concernCount: number;
  readonly translationAction: AidAction;
  readonly grammarAction: AidAction;
}

export const NO_AIDS: SentenceAids = {
  translation: null,
  translationVisible: false,
  grammar: null,
  grammarStale: false,
  concernCount: 0,
  translationAction: IDLE_ACTION,
  grammarAction: IDLE_ACTION,
};

/** What one local read found for a sentence, before preferences are applied. */
interface StoredAids {
  readonly translation: TranslationRecord | null;
  readonly grammar: GrammarAnalysisRecord | null;
  readonly grammarStale: boolean;
}

interface SentenceActions {
  readonly translation: AidAction;
  readonly grammar: AidAction;
}

const NO_ACTIONS: SentenceActions = { translation: IDLE_ACTION, grammar: IDLE_ACTION };

/**
 * The translations and grammar findings for the sentences currently mounted.
 *
 * Provided by the reader page rather than at the root, so leaving the reader
 * drops the state and aborts anything in flight instead of keeping one
 * reading's aids alive behind another's.
 *
 * `load` is **local only**: it reads the two bounded per-sentence queries and
 * nothing else. Opening a reading, scrolling it, and toggling an aid therefore
 * make zero network requests — a missing aid is fetched only by an explicit
 * action.
 */
@Injectable()
export class SentenceAidsStore {
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly sentenceEnrichment = inject(SentenceEnrichmentService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly textModel = inject(TextModelStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly settings = inject(AppSettingsStore);

  private readonly readingSignal = signal<Reading | null>(null);
  private readonly sentencesSignal = signal<readonly Sentence[]>([]);
  private readonly storedSignal = signal<ReadonlyMap<SentenceId, StoredAids>>(new Map());
  private readonly overridesSignal = signal<ReadonlyMap<SentenceId, boolean>>(new Map());
  private readonly actionsSignal = signal<ReadonlyMap<SentenceId, SentenceActions>>(new Map());
  private readonly errorSignal = signal<StorageError | null>(null);

  /**
   * Aborts every in-flight action when the reader is left. The store is
   * provided by the reader page, so leaving destroys it and this fires.
   */
  private readonly controller = new AbortController();

  /** The reading whose aids are loaded, or null before the first load. */
  readonly reading = this.readingSignal.asReadonly();
  readonly sentences = this.sentencesSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();

  constructor() {
    effect(() => {
      // Cache keys and staleness are derived from the text model and the live
      // grammar profile, both of which load after the reader opens. Re-deriving
      // when they arrive is a repeat of the same two local reads — it can no
      // more reach a provider than the first pass could.
      this.textModel.settings();
      this.grammarProfile.liveProfileHash();
      const reading = this.readingSignal();
      const sentences = this.sentencesSignal();
      if (reading !== null && sentences.length > 0) {
        void this.load(reading, sentences);
      }
    });

    inject(DestroyRef).onDestroy(() => {
      this.controller.abort();
    });
  }

  readonly aids = computed<ReadonlyMap<SentenceId, SentenceAids>>(() => {
    const stored = this.storedSignal();
    const overrides = this.overridesSignal();
    const actions = this.actionsSignal();
    const expanded = this.settings.readerPreferences().translationsExpanded;

    const merged = new Map<SentenceId, SentenceAids>();
    for (const sentence of this.sentencesSignal()) {
      const found = stored.get(sentence.id);
      const grammar = found?.grammar ?? null;
      const action = actions.get(sentence.id) ?? NO_ACTIONS;
      merged.set(sentence.id, {
        translation: found?.translation ?? null,
        translationVisible: overrides.get(sentence.id) ?? expanded,
        grammar,
        grammarStale: found?.grammarStale ?? false,
        concernCount: grammar === null ? 0 : concernCount(grammar.findings),
        translationAction: action.translation,
        grammarAction: action.grammar,
      });
    }
    return merged;
  });

  /**
   * Reads the stored aids for the mounted sentences.
   *
   * Called on every paragraph-window change, and bounded by that window: a
   * 50,000 character reading never reads more rows than it currently renders.
   */
  async load(reading: Reading, sentences: readonly Sentence[]): Promise<void> {
    this.readingSignal.set(reading);
    this.sentencesSignal.set(sentences);
    if (sentences.length === 0) {
      this.storedSignal.set(new Map());
      return;
    }

    const sentenceIds = sentences.map((sentence) => sentence.id);
    const [translations, analyses] = await Promise.all([
      this.enrichment.listTranslationsForSentences(sentenceIds),
      this.enrichment.listGrammarAnalysesForSentences(sentenceIds),
    ]);
    if (!translations.ok) {
      this.errorSignal.set(translations.error);
      return;
    }
    if (!analyses.ok) {
      this.errorSignal.set(analyses.error);
      return;
    }

    this.errorSignal.set(null);
    this.storedSignal.set(this.assemble(reading, sentences, translations.value, analyses.value));
  }

  /** Shows or hides one sentence's translation, overriding the global aid. */
  toggleTranslation(sentenceId: SentenceId): void {
    const visible = this.aids().get(sentenceId)?.translationVisible ?? false;
    this.overridesSignal.update((overrides) => new Map(overrides).set(sentenceId, !visible));
  }

  /**
   * Translates one sentence, because the learner asked for it.
   *
   * A sentence whose stored translation already matches the current
   * configuration returns immediately: no request, no write, no state change.
   * Retrying after a failure is the same call — the failed state is simply
   * replaced by the new attempt.
   */
  async translateSentence(sentenceId: SentenceId): Promise<void> {
    const target = this.actionable(sentenceId, 'translation');
    if (target === null) {
      return;
    }
    const stored = this.storedSignal().get(sentenceId);
    const translation = stored?.translation ?? null;
    if (
      translation !== null &&
      translation.cacheKey === this.sentenceEnrichment.translationKeyFor(target.sentence)
    ) {
      return;
    }

    this.setAction(sentenceId, 'translation', { state: 'running', error: null });
    const result = await this.sentenceEnrichment.translate(
      target.sentence,
      target.reading.id,
      this.controller.signal,
    );
    if (!result.ok) {
      this.setAction(sentenceId, 'translation', { state: 'failed', error: result.error });
      return;
    }
    this.replaceStored(sentenceId, { ...emptyStored(stored), translation: result.value });
    this.setAction(sentenceId, 'translation', IDLE_ACTION);
  }

  /**
   * Analyses one sentence's grammar against the live profile.
   *
   * Re-analysis after a profile change writes a second row rather than
   * replacing the first: the older analysis is still the true record of what
   * was said under the profile it was judged by.
   */
  async analyzeGrammar(sentenceId: SentenceId): Promise<void> {
    const target = this.actionable(sentenceId, 'grammar');
    if (target === null) {
      return;
    }
    const stored = this.storedSignal().get(sentenceId);
    const grammar = stored?.grammar ?? null;
    if (
      grammar !== null &&
      stored?.grammarStale !== true &&
      grammar.cacheKey === this.sentenceEnrichment.grammarKeyFor(target.sentence)
    ) {
      return;
    }

    this.setAction(sentenceId, 'grammar', { state: 'running', error: null });
    const result = await this.sentenceEnrichment.analyzeGrammar(
      target.sentence,
      target.reading.id,
      this.controller.signal,
    );
    if (!result.ok) {
      this.setAction(sentenceId, 'grammar', { state: 'failed', error: result.error });
      return;
    }
    this.replaceStored(sentenceId, {
      ...emptyStored(stored),
      grammar: result.value,
      grammarStale: false,
    });
    this.setAction(sentenceId, 'grammar', IDLE_ACTION);
  }

  /**
   * The reading and sentence an action applies to, or null when the sentence
   * is no longer mounted or the same action is already running for it.
   */
  private actionable(
    sentenceId: SentenceId,
    kind: keyof SentenceActions,
  ): { readonly reading: Reading; readonly sentence: Sentence } | null {
    const reading = this.readingSignal();
    const sentence = this.sentencesSignal().find((entry) => entry.id === sentenceId);
    const running = (this.actionsSignal().get(sentenceId) ?? NO_ACTIONS)[kind].state === 'running';
    return reading === null || sentence === undefined || running ? null : { reading, sentence };
  }

  private replaceStored(sentenceId: SentenceId, next: StoredAids): void {
    this.storedSignal.update((stored) => new Map(stored).set(sentenceId, next));
  }

  private setAction(sentenceId: SentenceId, kind: keyof SentenceActions, action: AidAction): void {
    this.actionsSignal.update((actions) => {
      const current = actions.get(sentenceId) ?? NO_ACTIONS;
      return new Map(actions).set(sentenceId, { ...current, [kind]: action });
    });
  }

  /** The cache keys the current model and prompt would use for these sentences. */
  private translationKeys(sentences: readonly Sentence[]): ReadonlyMap<SentenceId, string> {
    return this.keys.translationKeys(
      sentences,
      this.textModel.settings().modelId,
      PROMPT_VERSIONS.translation,
    );
  }

  private grammarKeys(sentences: readonly Sentence[]): ReadonlyMap<SentenceId, string> {
    return this.keys.grammarKeys(
      sentences,
      this.textModel.settings().modelId,
      PROMPT_VERSIONS.grammar,
      this.grammarProfile.liveProfileHash() ?? '',
    );
  }

  private assemble(
    reading: Reading,
    sentences: readonly Sentence[],
    translations: readonly TranslationRecord[],
    analyses: readonly GrammarAnalysisRecord[],
  ): ReadonlyMap<SentenceId, StoredAids> {
    const translationKeys = this.translationKeys(sentences);
    const grammarKeys = this.grammarKeys(sentences);
    const liveProfileHash = this.grammarProfile.liveProfileHash();

    const translationsBySentence = groupBySentence(translations);
    const analysesBySentence = groupBySentence(analyses);

    const stored = new Map<SentenceId, StoredAids>();
    for (const sentence of sentences) {
      const translation = chooseAnalysis(
        translationsBySentence.get(sentence.id) ?? [],
        translationKeys.get(sentence.id) ?? '',
      );
      const grammar = chooseAnalysis(
        analysesBySentence.get(sentence.id) ?? [],
        grammarKeys.get(sentence.id) ?? '',
      );
      stored.set(sentence.id, {
        translation: translation?.record ?? null,
        grammar: grammar?.record ?? null,
        grammarStale:
          grammar !== null && isStaleAgainstProfile(reading, grammar.record, liveProfileHash),
      });
    }
    return stored;
  }
}

/**
 * Whether a stored analysis was judged against a profile that is no longer the
 * live one.
 *
 * Only imported readings are compared. A generated story's grammar was reviewed
 * against the profile captured in its own provenance, and that capture is the
 * profile it will always be judged by — re-marking it whenever the learner
 * changes a preset would flag history that cannot and should not be redone.
 */
function isStaleAgainstProfile(
  reading: Reading,
  record: GrammarAnalysisRecord,
  liveProfileHash: string | null,
): boolean {
  if (reading.kind === 'generated' || liveProfileHash === null) {
    return false;
  }
  return record.profileHash !== liveProfileHash;
}

function emptyStored(stored: StoredAids | undefined): StoredAids {
  return stored ?? { translation: null, grammar: null, grammarStale: false };
}

function groupBySentence<T extends { readonly sentenceId: SentenceId }>(
  records: readonly T[],
): ReadonlyMap<SentenceId, T[]> {
  const grouped = new Map<SentenceId, T[]>();
  for (const record of records) {
    const bucket = grouped.get(record.sentenceId);
    if (bucket === undefined) {
      grouped.set(record.sentenceId, [record]);
    } else {
      bucket.push(record);
    }
  }
  return grouped;
}
