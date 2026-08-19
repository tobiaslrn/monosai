import { ankiError, type AnkiError } from '../../../domain/anki/anki-error';
import type {
  AnkiExtractionEvent,
  AnkiVocabularyProvider,
} from '../../../domain/anki/anki-provider';
import type { AnkiCapabilities, CapabilityLimitation } from '../../../domain/anki/capabilities';
import type { AnkiCatalog } from '../../../domain/anki/catalog';
import { err, ok, type Result } from '../../../domain/shared/result';
import type { AnkiProviderKind } from '../../../domain/vocabulary/snapshot';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import type { OpenResult } from './package-protocol';
import type { PackageWorkerClient } from './package-worker.client';

/**
 * The package this provider reads, supplied by the learner.
 *
 * The bytes are read once, on the first probe, and handed to the worker; the
 * provider never keeps a second copy of a file that can be hundreds of
 * megabytes.
 */
export interface PackageSource {
  readonly fileName: string;
  bytes(): Promise<ArrayBuffer>;
}

function limitationsOf(opened: OpenResult): readonly CapabilityLimitation[] {
  const limitations: CapabilityLimitation[] = [];
  if (!opened.hasAnyReviewEvidence) {
    limitations.push({
      code: 'no-review-history',
      message:
        'No card in this package has been reviewed. If you exported it without scheduling information, export it again with scheduling included.',
    });
  }
  return limitations;
}

/**
 * Reads reviewed vocabulary out of an `.apkg` or `.colpkg`.
 *
 * All parsing happens in a dedicated worker, and the provider terminates it on
 * dispose: the archive, the decompressed SQLite database, and the WebAssembly
 * heap are only reliably reclaimed by ending the worker, which is why package
 * parsing does not share the language worker.
 */
export class PackageProviderAdapter implements AnkiVocabularyProvider {
  readonly kind: AnkiProviderKind = 'package';

  private opened: OpenResult | null = null;
  private disposed = false;

  constructor(
    private readonly client: PackageWorkerClient,
    private readonly source: PackageSource,
    private readonly wasmUrl: string,
  ) {}

  async probe(signal?: AbortSignal): Promise<Result<AnkiCapabilities, AnkiError>> {
    const opened = await this.ensureOpen(signal);
    if (!opened.ok) {
      return opened;
    }
    return ok({
      apiVersion: `anki-package/${String(opened.value.packageVersion ?? 0)} schema/${String(
        opened.value.schemaVersion,
      )}`,
      canDiscoverDecks: opened.value.deckCount > 0,
      canDiscoverNoteTypes: opened.value.noteTypeCount > 0,
      canDiscoverFields: opened.value.noteTypeCount > 0,
      // A package always carries its cards table, so review evidence can always
      // be proven; whether anything was actually reviewed is a separate answer,
      // reported as a limitation rather than as missing capability.
      canFilterReviewed: true,
      canReadNoteFields: true,
      limitations: limitationsOf(opened.value),
    });
  }

  async discover(signal?: AbortSignal): Promise<Result<AnkiCatalog, AnkiError>> {
    const opened = await this.ensureOpen(signal);
    if (!opened.ok) {
      return opened;
    }
    return this.client.discover(signal);
  }

  async *extractReviewed(
    mappings: readonly SourceMapping[],
    signal?: AbortSignal,
  ): AsyncIterable<AnkiExtractionEvent> {
    const opened = await this.ensureOpen(signal);
    if (!opened.ok) {
      yield { kind: 'failed', error: opened.error };
      return;
    }
    for (const limitation of limitationsOf(opened.value)) {
      yield { kind: 'warning', message: limitation.message };
    }

    for (const mapping of mappings) {
      if (signal?.aborted === true) {
        yield { kind: 'failed', error: ankiError('cancelled', 'The refresh was cancelled.') };
        return;
      }

      const extracted = await this.client.extract(
        {
          deckName: mapping.deckName,
          deckScope: mapping.deckScope,
          noteTypeName: mapping.noteTypeName,
          expressionFieldName: mapping.expressionFieldName,
        },
        signal,
      );
      if (!extracted.ok) {
        yield { kind: 'failed', error: extracted.error };
        return;
      }

      // One query answers a whole mapping, so progress is reported once per
      // mapping rather than invented per note.
      yield {
        kind: 'progress',
        mappingId: mapping.id,
        examined: extracted.value.examined,
        total: extracted.value.examined,
      };

      for (const field of extracted.value.fields) {
        yield {
          kind: 'entry',
          entry: {
            sourceMappingId: mapping.id,
            sourceNoteId: field.sourceNoteId,
            ...(field.rawFieldValue === undefined ? {} : { rawFieldValue: field.rawFieldValue }),
          },
        };
      }
    }
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.opened = null;
    this.client.dispose();
  }

  private async ensureOpen(signal?: AbortSignal): Promise<Result<OpenResult, AnkiError>> {
    if (this.disposed) {
      return err(ankiError('package-unreadable', 'This package was already closed.'));
    }
    if (this.opened !== null) {
      return ok(this.opened);
    }
    if (signal?.aborted === true) {
      return err(ankiError('cancelled', 'Reading the package was cancelled.'));
    }

    let bytes: ArrayBuffer;
    try {
      bytes = await this.source.bytes();
    } catch (thrown) {
      return err(
        ankiError(
          'package-unreadable',
          'That file could not be read.',
          thrown instanceof Error ? thrown.message : this.source.fileName,
        ),
      );
    }

    const opened = await this.client.open(bytes, this.wasmUrl, signal);
    if (!opened.ok) {
      return opened;
    }
    this.opened = opened.value;
    return ok(opened.value);
  }
}
