import type { AnalyzedText } from '../../domain/language/analyzed-text';
import type { ClassificationMode } from '../../domain/language/classification';
import type { DictionaryLookup, DictionaryQuery } from '../../domain/language/dictionary';
import type { LanguageError } from '../../domain/language/language-error';
import type { LanguageAssetManifest } from '../../domain/language/language-assets';
import type {
  ClassificationResult,
  CompiledSnapshotInfo,
  LanguageRuntimeInfo,
  SentenceTokens,
} from '../../domain/language/language-runtime';
import type { SentenceSegment } from '../../domain/language/segmentation';
import type { VocabularyItem } from '../../domain/vocabulary/snapshot';

/**
 * Bumped whenever a request or response shape changes. A client and a worker
 * that disagree refuse to talk rather than guessing, which matters because a
 * service-worker update can leave an old worker script cached.
 */
export const LANGUAGE_PROTOCOL_VERSION = 1;

export interface InitializeRequest {
  readonly operation: 'initialize';
  readonly payload: {
    /** Absolute URL of the bundle directory, ending with a slash. */
    readonly baseUrl: string;
    readonly manifest: LanguageAssetManifest;
  };
}

export interface SegmentRequest {
  readonly operation: 'segment';
  readonly payload: { readonly text: string };
}

export interface AnalyzeRequest {
  readonly operation: 'analyze';
  readonly payload: { readonly text: string; readonly unit: 'paragraph' | 'sentence' };
}

export interface LookupRequest {
  readonly operation: 'lookup';
  readonly payload: { readonly query: DictionaryQuery };
}

export interface CompileSnapshotRequest {
  readonly operation: 'compile-snapshot';
  readonly payload: {
    readonly snapshotId: string;
    readonly items: readonly VocabularyItem[];
  };
}

export interface ClassifyRequest {
  readonly operation: 'classify';
  readonly payload: {
    readonly snapshotId: string;
    readonly mode: ClassificationMode;
    readonly sentences: readonly SentenceTokens[];
  };
}

export interface CancelRequest {
  readonly operation: 'cancel';
  readonly payload: { readonly targetRequestId: string };
}

export type LanguageRequest =
  | InitializeRequest
  | SegmentRequest
  | AnalyzeRequest
  | LookupRequest
  | CompileSnapshotRequest
  | ClassifyRequest
  | CancelRequest;

export type LanguageOperation = LanguageRequest['operation'];

export interface LanguageRequestMessage {
  readonly protocolVersion: number;
  readonly requestId: string;
  readonly request: LanguageRequest;
}

/** Worker results reuse the domain runtime types so both sides share one shape. */
export type InitializeResult = LanguageRuntimeInfo;
export type ClassifyResult = ClassificationResult;
export type CompileSnapshotResult = CompiledSnapshotInfo;

export type LanguageResult =
  | { readonly operation: 'initialize'; readonly value: InitializeResult }
  | { readonly operation: 'segment'; readonly value: readonly SentenceSegment[] }
  | { readonly operation: 'analyze'; readonly value: AnalyzedText }
  | { readonly operation: 'lookup'; readonly value: DictionaryLookup }
  | { readonly operation: 'compile-snapshot'; readonly value: CompileSnapshotResult }
  | { readonly operation: 'classify'; readonly value: ClassifyResult }
  | { readonly operation: 'cancel'; readonly value: { readonly cancelled: boolean } };

export interface LanguageResponseMessage {
  readonly protocolVersion: number;
  readonly requestId: string;
  /** Errors cross the boundary as serializable domain errors, never as `Error`. */
  readonly outcome:
    | { readonly ok: true; readonly result: LanguageResult }
    | { readonly ok: false; readonly error: LanguageError };
}

/** Narrows a `LanguageResult` to the variant produced by one operation. */
export type ResultFor<TOperation extends LanguageOperation> = Extract<
  LanguageResult,
  { operation: TOperation }
>['value'];
