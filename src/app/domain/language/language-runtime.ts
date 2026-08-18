import type { Result } from '../shared/result';
import type { AnalyzedSentence } from './analyzed-text';
import type { Token } from '../reading/token';
import type { TokenStatusAssignment } from '../reading/validation';
import type { VocabularyItem } from '../vocabulary/snapshot';
import type { ClassificationMode } from './classification';
import type { Dictionary } from './dictionary';
import type { LanguageError } from './language-error';
import type { ActiveLanguageAssetVersions, LanguageAssetManifest } from './language-assets';
import type { SentenceSegment } from './segmentation';
import type { GrammarPreset, RegisterGuidance } from '../grammar/presets';
import type { StructuralBaselineEntry } from './structural-baseline';
import type { Tokenizer } from './tokenizer';

/** What the language runtime reports once its assets are loaded and verified. */
export interface LanguageRuntimeInfo {
  readonly bundleVersion: string;
  readonly versions: ActiveLanguageAssetVersions;
  readonly analyzerVersion: string;
  readonly dictionaryEntryCount: number;
  /** Published in-app as the read-only list of forms that count as readable. */
  readonly structuralBaselineEntries: readonly StructuralBaselineEntry[];
  /** Difficulty presets the learner picks from; replaces per-rule selection. */
  readonly grammarPresets: readonly GrammarPreset[];
  readonly registerGuidance: RegisterGuidance;
}

export interface ClassifiedSentence {
  readonly sentenceId: string;
  readonly statuses: readonly TokenStatusAssignment[];
}

export interface ClassificationResult {
  readonly snapshotId: string;
  readonly validatorVersion: string;
  readonly sentences: readonly ClassifiedSentence[];
}

export interface CompiledSnapshotInfo {
  readonly snapshotId: string;
  readonly itemCount: number;
}

export interface SentenceTokens {
  readonly sentenceId: string;
  readonly tokens: readonly Token[];
}

/**
 * Port for the off-thread language runtime.
 *
 * Every method takes an optional `AbortSignal`; cancellation is cooperative and
 * a cancelled call reports the `cancelled` error rather than resolving late.
 */
export interface LanguageRuntime extends Tokenizer, Dictionary {
  initialize(
    baseUrl: string,
    manifest: LanguageAssetManifest,
    signal?: AbortSignal,
  ): Promise<Result<LanguageRuntimeInfo, LanguageError>>;
  segment(
    text: string,
    signal?: AbortSignal,
  ): Promise<Result<readonly SentenceSegment[], LanguageError>>;
  /**
   * Tokenizes sentences whose boundaries the caller has already decided, which
   * is what import review produces once the learner has split or merged them.
   * Results are positional: one analysis per input text, in the same order.
   */
  analyzeSentences(
    texts: readonly string[],
    signal?: AbortSignal,
  ): Promise<Result<readonly AnalyzedSentence[], LanguageError>>;
  compileSnapshot(
    snapshotId: string,
    items: readonly VocabularyItem[],
    signal?: AbortSignal,
  ): Promise<Result<CompiledSnapshotInfo, LanguageError>>;
  classify(
    snapshotId: string,
    mode: ClassificationMode,
    sentences: readonly SentenceTokens[],
    signal?: AbortSignal,
  ): Promise<Result<ClassificationResult, LanguageError>>;
  dispose(): void;
}

/** Port for locating and validating the immutable language bundle. */
export interface LanguageAssetSource {
  /** Absolute URL of the active bundle directory, ending with a slash. */
  readonly baseUrl: string;
  loadManifest(signal?: AbortSignal): Promise<Result<LanguageAssetManifest, LanguageError>>;
  /** Drops cached bundles other than the active one. */
  pruneSupersededBundles(activeBundleVersion: string): Promise<void>;
}
