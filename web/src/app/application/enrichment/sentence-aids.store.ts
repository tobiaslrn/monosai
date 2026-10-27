import {
  DestroyRef,
  Injectable,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import { concernCount } from '../../domain/enrichment/grammar-normalization';
import type {
  AudioAssetSummary,
  GrammarAnalysisRecord,
  TranslationRecord,
} from '../../domain/enrichment/records';
import { chooseAnalysis } from '../../domain/enrichment/staleness';
import type { Reading } from '../../domain/reading/reading';
import type { Sentence } from '../../domain/reading/text-hierarchy';
import type { SentenceId } from '../../domain/shared/ids';
import { err, ok, type Result } from '../../domain/shared/result';
import type { StorageError } from '../../domain/storage/storage-error';
import { GrammarProfileStore } from '../grammar/grammar-profile.store';
import { TextModelStore } from '../settings/text-model.store';
import { ReaderStore } from '../reading/reader.store';
import { ENRICHMENT_REPOSITORY } from '../shared/repository-tokens';
import { AudioConfigurationService } from './audio-configuration.service';
import { EnrichmentKeysService } from './enrichment-keys.service';
import { SentenceEnrichmentService, type EnrichmentFailure } from './sentence-enrichment.service';

/** Where one explicit aid action stands for one sentence. */
export type AidActionState = 'idle' | 'running' | 'failed';

export interface AidAction {
  readonly state: AidActionState;
  /** The last failure, kept so the surface that asked can offer a retry. */
  readonly error: EnrichmentFailure | null;
}

export const IDLE_ACTION: AidAction = { state: 'idle', error: null };

/**
 * Everything stored for one sentence.
 *
 * Nothing here is rendered on the reading surface itself: a translation is read
 * in the sentence popover and grammar in the word popover, so this describes
 * what those surfaces can show rather than what is on the page.
 */
export interface SentenceAids {
  readonly translation: TranslationRecord | null;
  readonly grammar: GrammarAnalysisRecord | null;
  /**
   * The stored clip for the current TTS configuration, or null.
   *
   * Only a clip under the current cache key appears here: an older voice's clip
   * is valid historical output, but offering to play it would be offering a
   * voice the learner is no longer configured for.
   */
  readonly audio: AudioAssetSummary | null;
  /** True only for an imported analysis judged against an older profile. */
  readonly grammarStale: boolean;
  /** Findings outside the profile — what the grammar marker actually marks. */
  readonly concernCount: number;
  readonly translationAction: AidAction;
  readonly grammarAction: AidAction;
  readonly audioAction: AidAction;
}

export const NO_AIDS: SentenceAids = {
  translation: null,
  grammar: null,
  audio: null,
  grammarStale: false,
  concernCount: 0,
  translationAction: IDLE_ACTION,
  grammarAction: IDLE_ACTION,
  audioAction: IDLE_ACTION,
};

/** What one local read found for a sentence, before preferences are applied. */
interface StoredAids {
  readonly translation: TranslationRecord | null;
  readonly grammar: GrammarAnalysisRecord | null;
  readonly audio: AudioAssetSummary | null;
  readonly grammarStale: boolean;
}

/** Everything one local read depends on: the mounted window, and the keys it is judged by. */
interface AidRequest {
  readonly reading: Reading;
  readonly sentences: readonly Sentence[];
  readonly translationKeys: ReadonlyMap<SentenceId, string>;
  readonly grammarKeys: ReadonlyMap<SentenceId, string>;
  readonly audioKeys: ReadonlyMap<SentenceId, string>;
  readonly liveProfileHash: string | null;
}

type StoredBySentence = ReadonlyMap<SentenceId, StoredAids>;

interface SentenceActions {
  readonly translation: AidAction;
  readonly grammar: AidAction;
  readonly audio: AidAction;
}

const NO_ACTIONS: SentenceActions = {
  translation: IDLE_ACTION,
  grammar: IDLE_ACTION,
  audio: IDLE_ACTION,
};

/**
 * The translations and grammar findings for the sentences currently mounted.
 *
 * Provided by the reader page rather than at the root, so leaving the reader
 * drops the state and aborts anything in flight instead of keeping one
 * reading's aids alive behind another's.
 *
 * The aids follow the reader's mounted window. Reading them is **local only**:
 * the bounded per-sentence queries and nothing else, and the audio one reads
 * metadata rather than blobs. Opening a reading, scrolling it, and toggling an
 * aid therefore make zero network requests — a missing aid is fetched only by
 * an explicit action.
 */
@Injectable()
export class SentenceAidsStore {
  private readonly enrichment = inject(ENRICHMENT_REPOSITORY);
  private readonly sentenceEnrichment = inject(SentenceEnrichmentService);
  private readonly keys = inject(EnrichmentKeysService);
  private readonly textModel = inject(TextModelStore);
  private readonly grammarProfile = inject(GrammarProfileStore);
  private readonly audioConfig = inject(AudioConfigurationService);

  private readonly reader = inject(ReaderStore);

  private readonly actionsSignal = signal<ReadonlyMap<SentenceId, SentenceActions>>(new Map());

  /**
   * Aborts every in-flight action when the reader is left. The store is
   * provided by the reader page, so leaving destroys it and this fires.
   */
  private readonly controller = new AbortController();

  /** The reading whose aids are shown, or null before the reader has opened one. */
  readonly reading = computed(() => this.reader.reading());

  /** The sentences of the paragraphs the reader has mounted. */
  readonly sentences = computed(() =>
    this.reader
      .paragraphs()
      .flatMap((paragraph) => paragraph.sentences.map((sentence) => sentence.sentence)),
  );

  /**
   * What one read depends on.
   *
   * A new reading row — the reader re-reads it whenever a job has written
   * something — is a reason to read again, and so is a new window. Cache keys
   * and staleness are derived from the text model, the live grammar profile,
   * and the TTS configuration, all of which load after the reader opens.
   * Re-deriving when they arrive is a repeat of the same local reads — it can
   * no more reach a provider than the first pass could.
   */
  private readonly request = computed<AidRequest | undefined>(() => {
    const reading = this.reading();
    if (reading === null) {
      return undefined;
    }
    const sentences = this.sentences();
    return {
      reading,
      sentences,
      translationKeys: this.translationKeys(sentences),
      grammarKeys: this.grammarKeys(sentences),
      audioKeys: this.audioKeys(sentences),
      liveProfileHash: this.grammarProfile.liveProfileHash(),
    };
  });

  /**
   * The stored aids for exactly the sentences now mounted — bounded by that
   * window, so a 50,000 character reading never reads more rows than it
   * renders. A read that is replaced before it lands is dropped.
   */
  private readonly read = resource({
    params: () => this.request(),
    loader: ({ params }) => this.readStored(params),
  });
  private readonly readResult = computed(() =>
    this.read.hasValue() ? this.read.value() : undefined,
  );

  /**
   * What the last read found, plus what explicit actions have written since.
   * Kept while the next read is in flight, and when one fails, so the reading
   * stays as readable as it was.
   */
  private readonly storedSignal = linkedSignal<
    Result<StoredBySentence, StorageError> | undefined,
    StoredBySentence
  >({
    source: this.readResult,
    computation: (result, previous) => (result?.ok ? result.value : (previous?.value ?? new Map())),
  });
  private readonly errorSignal = linkedSignal<
    Result<StoredBySentence, StorageError> | undefined,
    StorageError | null
  >({
    source: this.readResult,
    computation: (result, previous) =>
      result === undefined ? (previous?.value ?? null) : result.ok ? null : result.error,
  });
  readonly lastError = this.errorSignal.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.controller.abort();
    });
  }

  readonly aids = computed<ReadonlyMap<SentenceId, SentenceAids>>(() => {
    const stored = this.storedSignal();
    const actions = this.actionsSignal();

    const merged = new Map<SentenceId, SentenceAids>();
    for (const sentence of this.sentences()) {
      const found = stored.get(sentence.id);
      const grammar = found?.grammar ?? null;
      const action = actions.get(sentence.id) ?? NO_ACTIONS;
      merged.set(sentence.id, {
        translation: found?.translation ?? null,
        grammar,
        audio: found?.audio ?? null,
        grammarStale: found?.grammarStale ?? false,
        concernCount: grammar === null ? 0 : concernCount(grammar.findings),
        translationAction: action.translation,
        grammarAction: action.grammar,
        audioAction: action.audio,
      });
    }
    return merged;
  });

  private async readStored(request: AidRequest): Promise<Result<StoredBySentence, StorageError>> {
    const { sentences } = request;
    if (sentences.length === 0) {
      return ok(new Map());
    }

    const sentenceIds = sentences.map((sentence) => sentence.id);
    const translationKeys = [...new Set(request.translationKeys.values())];
    const grammarKeys = [...new Set(request.grammarKeys.values())];
    // Audio is asked for by key rather than by sentence, because the audio
    // table is keyed by `cacheKey`: two sentences with identical Japanese share
    // one clip, and asking by sentence would report one of them as having none.
    const audioKeys = [...new Set(request.audioKeys.values())];
    const [translations, translationHistory, analyses, analysisHistory, clips] = await Promise.all([
      this.enrichment.listTranslationsForSentences(sentenceIds),
      this.enrichment.listTranslationsForCacheKeys(translationKeys),
      this.enrichment.listGrammarAnalysesForSentences(sentenceIds),
      this.enrichment.listGrammarAnalysesForCacheKeys(grammarKeys),
      this.enrichment.listAudioSummariesForCacheKeys(audioKeys),
    ]);
    if (!translations.ok) {
      return err(translations.error);
    }
    if (!translationHistory.ok) {
      return err(translationHistory.error);
    }
    if (!analyses.ok) {
      return err(analyses.error);
    }
    if (!analysisHistory.ok) {
      return err(analysisHistory.error);
    }
    if (!clips.ok) {
      return err(clips.error);
    }

    return ok(
      this.assemble(
        request,
        mergeByCacheKey(translations.value, translationHistory.value),
        mergeByCacheKey(analyses.value, analysisHistory.value),
        clips.value,
      ),
    );
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
   * Reads one sentence aloud, because the learner asked for it.
   *
   * A sentence whose stored clip already matches the current configuration
   * returns immediately: no request, no write, no state change. Producing a
   * clip never starts it — playing is a separate, equally explicit action.
   */
  async synthesizeSentence(sentenceId: SentenceId): Promise<void> {
    const target = this.actionable(sentenceId, 'audio');
    if (target === null) {
      return;
    }
    const stored = this.storedSignal().get(sentenceId);
    const audio = stored?.audio ?? null;
    if (audio !== null && audio.cacheKey === this.sentenceEnrichment.audioKeyFor(target.sentence)) {
      return;
    }

    this.setAction(sentenceId, 'audio', { state: 'running', error: null });
    const result = await this.sentenceEnrichment.synthesizeAudio(
      target.sentence,
      target.reading.id,
      this.controller.signal,
    );
    if (!result.ok) {
      this.setAction(sentenceId, 'audio', { state: 'failed', error: result.error });
      return;
    }
    this.replaceStored(sentenceId, { ...emptyStored(stored), audio: result.value });
    this.setAction(sentenceId, 'audio', IDLE_ACTION);
  }

  /**
   * The reading and sentence an action applies to, or null when the sentence
   * is no longer mounted or the same action is already running for it.
   */
  private actionable(
    sentenceId: SentenceId,
    kind: keyof SentenceActions,
  ): { readonly reading: Reading; readonly sentence: Sentence } | null {
    const reading = this.reading();
    const sentence = this.sentences().find((entry) => entry.id === sentenceId);
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
    const configurable = this.textModel as Partial<Pick<TextModelStore, 'configForTask'>>;
    const modelId =
      configurable.configForTask?.('translation')?.modelId ?? this.textModel.settings().modelId;
    return this.keys.translationKeys(sentences, modelId, PROMPT_VERSIONS.translation);
  }

  /**
   * The keys the current voice would use, or an empty map when no tested
   * configuration exists — so an unconfigured reader matches no stored clip
   * rather than offering to play one produced by a voice that is gone.
   */
  private audioKeys(sentences: readonly Sentence[]): ReadonlyMap<SentenceId, string> {
    const config = this.audioConfig.resolve('tts-synthesis');
    if (!config.ok) {
      return new Map();
    }
    return this.keys.audioKeys(
      sentences,
      config.value.modelId,
      config.value.voiceId,
      config.value.optionsFingerprint,
      config.value.speechInstructions,
    );
  }

  private grammarKeys(sentences: readonly Sentence[]): ReadonlyMap<SentenceId, string> {
    const configurable = this.textModel as Partial<Pick<TextModelStore, 'configForTask'>>;
    const modelId =
      configurable.configForTask?.('grammar')?.modelId ?? this.textModel.settings().modelId;
    return this.keys.grammarKeys(
      sentences,
      modelId,
      PROMPT_VERSIONS.grammar,
      this.grammarProfile.liveProfileHash() ?? '',
    );
  }

  private assemble(
    request: AidRequest,
    translations: readonly TranslationRecord[],
    analyses: readonly GrammarAnalysisRecord[],
    clips: readonly AudioAssetSummary[],
  ): StoredBySentence {
    const { reading, sentences, translationKeys, grammarKeys, audioKeys, liveProfileHash } =
      request;

    const translationsByCacheKey = new Map(
      translations.map((record) => [record.cacheKey, [record]]),
    );
    const analysesByCacheKey = new Map(analyses.map((record) => [record.cacheKey, [record]]));
    const translationsBySentence = groupBySentence(translations);
    const analysesBySentence = groupBySentence(analyses);
    const clipsByCacheKey = new Map(clips.map((clip) => [clip.cacheKey, clip]));

    const stored = new Map<SentenceId, StoredAids>();
    for (const sentence of sentences) {
      const translation = chooseAnalysis(
        mergeByCacheKey(
          translationsBySentence.get(sentence.id) ?? [],
          translationsByCacheKey.get(translationKeys.get(sentence.id) ?? '') ?? [],
        ),
        translationKeys.get(sentence.id) ?? '',
      );
      const grammar = chooseAnalysis(
        mergeByCacheKey(
          analysesBySentence.get(sentence.id) ?? [],
          analysesByCacheKey.get(grammarKeys.get(sentence.id) ?? '') ?? [],
        ),
        grammarKeys.get(sentence.id) ?? '',
      );
      const currentAudioKey = audioKeys.get(sentence.id);
      const audio =
        currentAudioKey === undefined ? null : (clipsByCacheKey.get(currentAudioKey) ?? null);
      stored.set(sentence.id, {
        translation: translation?.record ?? null,
        grammar: grammar?.record ?? null,
        audio,
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
  return stored ?? { translation: null, grammar: null, audio: null, grammarStale: false };
}

function mergeByCacheKey<T extends { readonly cacheKey: string }>(
  ...recordGroups: readonly (readonly T[])[]
): readonly T[] {
  const merged = new Map<string, T>();
  for (const records of recordGroups) {
    for (const record of records) {
      if (!merged.has(record.cacheKey)) {
        merged.set(record.cacheKey, record);
      }
    }
  }
  return [...merged.values()];
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
