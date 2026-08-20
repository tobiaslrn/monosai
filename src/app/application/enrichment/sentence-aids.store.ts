import { Injectable, computed, inject, signal } from '@angular/core';
import type { AiError } from '../../domain/ai/ai-error';
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

/** Where one explicit aid action stands for one sentence. */
export type AidActionState = 'idle' | 'running' | 'failed';

export interface AidAction {
  readonly state: AidActionState;
  /** The last failure, kept so sentence details can explain what to retry. */
  readonly error: AiError | null;
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

  /** The reading whose aids are loaded, or null before the first load. */
  readonly reading = this.readingSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();

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
