import type { AnkiError } from '../../../domain/anki/anki-error';
import type { AnkiCatalog } from '../../../domain/anki/catalog';
import type { DeckScope } from '../../../domain/vocabulary/source-mapping';

/**
 * Bumped whenever a request or response shape changes.
 *
 * A client and a worker that disagree refuse to talk rather than guessing,
 * which matters because a service-worker update can leave an old worker script
 * cached independently of the page that loads it.
 */
export const PACKAGE_PROTOCOL_VERSION = 1;

export interface OpenRequest {
  readonly operation: 'open';
  readonly payload: {
    readonly archive: ArrayBuffer;
    /** Absolute URL of the SQLite WebAssembly binary; the worker cannot derive it. */
    readonly wasmUrl: string;
  };
}

export interface DiscoverRequest {
  readonly operation: 'discover';
  readonly payload: Record<string, never>;
}

export interface ExtractRequest {
  readonly operation: 'extract';
  readonly payload: {
    readonly deckName: string;
    readonly deckScope: DeckScope;
    readonly noteTypeName: string;
    readonly expressionFieldName: string;
  };
}

export interface CloseRequest {
  readonly operation: 'close';
  readonly payload: Record<string, never>;
}

export interface CancelRequest {
  readonly operation: 'cancel';
  readonly payload: { readonly targetRequestId: string };
}

export type PackageRequest =
  OpenRequest | DiscoverRequest | ExtractRequest | CloseRequest | CancelRequest;

export type PackageOperation = PackageRequest['operation'];

export interface PackageRequestMessage {
  readonly protocolVersion: number;
  readonly requestId: string;
  readonly request: PackageRequest;
}

/** What was found in the archive, reported so diagnostics can name it exactly. */
export interface OpenResult {
  readonly memberName: string;
  readonly compression: 'zstd' | 'none';
  readonly packageVersion: number | null;
  readonly schemaVersion: number;
  readonly layout: 'normalized' | 'legacy-json';
  readonly deckCount: number;
  readonly noteTypeCount: number;
  readonly hasAnyReviewEvidence: boolean;
  /** Media members present but deliberately never read. */
  readonly mediaEntryCount: number;
}

export interface ExtractedField {
  readonly sourceNoteId: string;
  /** Absent when the note carries no value in that field position at all. */
  readonly rawFieldValue?: string;
}

export interface ExtractResult {
  /** Notes examined for this mapping, whether or not they produced a value. */
  readonly examined: number;
  readonly fields: readonly ExtractedField[];
}

export type PackageResult =
  | { readonly operation: 'open'; readonly value: OpenResult }
  | { readonly operation: 'discover'; readonly value: AnkiCatalog }
  | { readonly operation: 'extract'; readonly value: ExtractResult }
  | { readonly operation: 'close'; readonly value: { readonly closed: boolean } }
  | { readonly operation: 'cancel'; readonly value: { readonly cancelled: boolean } };

export interface PackageResponseMessage {
  readonly protocolVersion: number;
  readonly requestId: string;
  /** Errors cross the boundary as serializable domain errors, never as `Error`. */
  readonly outcome:
    | { readonly ok: true; readonly result: PackageResult }
    | { readonly ok: false; readonly error: AnkiError };
}

/** Narrows a `PackageResult` to the variant produced by one operation. */
export type ResultFor<TOperation extends PackageOperation> = Extract<
  PackageResult,
  { operation: TOperation }
>['value'];
