import { ankiError, type AnkiError } from '../../app/domain/anki/anki-error';
import type { AnkiCatalog } from '../../app/domain/anki/catalog';
import { describeThrown } from '../../app/domain/shared/errors';
import { err, ok, type Result } from '../../app/domain/shared/result';
import {
  PACKAGE_PROTOCOL_VERSION,
  type ExtractedField,
  type PackageRequest,
  type PackageResponseMessage,
  type PackageResult,
} from '../../app/infrastructure/anki/package/package-protocol';
import { packageRequestMessageSchema } from '../../app/infrastructure/anki/package/package-protocol.schema';
import { loadCollection, type ZstdDecompressor } from './collection-loader';
import { DECK_SEPARATOR, openCollectionReader, type CollectionReader } from './collection-reader';
import { DEFAULT_PACKAGE_LIMITS, type PackageResourceLimits } from './resource-limits';
import type { CollectionDatabase, CollectionDatabaseFactory } from './sqlite-runtime';
import { openZipArchive } from './zip-reader';

/** Archive members that are media, listed for diagnostics and never read. */
const COLLECTION_MEMBERS = new Set([
  'meta',
  'media',
  'collection.anki2',
  'collection.anki21',
  'collection.anki21b',
]);

export interface PackageWorkerHostDependencies {
  readonly post: (message: PackageResponseMessage) => void;
  readonly createDatabase: (wasmUrl: string) => CollectionDatabaseFactory;
  readonly loadZstd: () => Promise<ZstdDecompressor>;
  readonly limits?: PackageResourceLimits;
}

type OpenValue = Extract<PackageResult, { operation: 'open' }>['value'];

/**
 * What stays alive between `open` and `close`.
 *
 * The archive bytes and the decompressed collection are deliberately not kept:
 * `sql.js` copies the database into its own heap, so holding the originals would
 * double the memory a large package costs for no benefit.
 */
interface OpenState {
  readonly database: CollectionDatabase;
  readonly reader: CollectionReader;
}

type Dispatched =
  | { readonly ok: true; readonly value: PackageResult }
  | { readonly ok: false; readonly error: AnkiError };

function notOpen(): AnkiError {
  return ankiError('package-unreadable', 'No Anki package is open in this worker.');
}

function cancelledError(): AnkiError {
  return ankiError('cancelled', 'The request was cancelled.');
}

function readRequestId(data: unknown): string {
  if (typeof data === 'object' && data !== null) {
    const candidate = (data as { requestId?: unknown }).requestId;
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }
  }
  return '';
}

/** Decks whose name is a prefix of another's are shown as having subdecks. */
function toCatalog(reader: CollectionReader): AnkiCatalog {
  const names = reader.decks.map((deck) => deck.name);
  return {
    decks: reader.decks.map((deck) => ({
      name: deck.name,
      hasChildren: names.some((other) => other.startsWith(`${deck.name}${DECK_SEPARATOR}`)),
    })),
    noteTypes: reader.noteTypes.map((noteType) => ({
      name: noteType.name,
      fieldNames: [...noteType.fieldNames],
    })),
  };
}

/**
 * Handles the package worker protocol.
 *
 * The message loop lives here rather than in the worker entry point so tests can
 * drive it directly, where the Worker global does not exist. It owns the open
 * collection: the archive bytes, the in-memory database, and the schema reader
 * are all held here and dropped together on `close`, which is the whole reason
 * package parsing runs in its own terminable worker.
 */
export class PackageWorkerHost {
  private state: OpenState | null = null;
  private readonly cancelled = new Set<string>();
  private readonly limits: PackageResourceLimits;

  constructor(private readonly dependencies: PackageWorkerHostDependencies) {
    this.limits = dependencies.limits ?? DEFAULT_PACKAGE_LIMITS;
  }

  async handleMessage(data: unknown): Promise<void> {
    const parsed = packageRequestMessageSchema.safeParse(data);
    if (!parsed.success) {
      this.fail(
        readRequestId(data),
        ankiError('package-unreadable', 'The package worker received an unusable message.'),
      );
      return;
    }

    const { protocolVersion, requestId, request } = parsed.data;
    if (protocolVersion !== PACKAGE_PROTOCOL_VERSION) {
      this.fail(
        requestId,
        ankiError(
          'unsupported-api',
          'The package worker speaks a different protocol version.',
          `client ${String(protocolVersion)}, worker ${String(PACKAGE_PROTOCOL_VERSION)}`,
        ),
      );
      return;
    }

    if (request.operation === 'cancel') {
      this.cancelled.add(request.payload.targetRequestId);
      this.succeed(requestId, { operation: 'cancel', value: { cancelled: true } });
      return;
    }

    try {
      const result = await this.dispatch(request);
      if (this.cancelled.has(requestId)) {
        this.fail(requestId, cancelledError());
        return;
      }
      if (result.ok) {
        this.succeed(requestId, result.value);
      } else {
        this.fail(requestId, result.error);
      }
    } catch (thrown) {
      this.fail(
        requestId,
        ankiError(
          'package-unreadable',
          'The package worker could not complete the request.',
          describeThrown(thrown),
        ),
      );
    } finally {
      this.cancelled.delete(requestId);
    }
  }

  private succeed(requestId: string, result: PackageResult): void {
    this.dependencies.post({
      protocolVersion: PACKAGE_PROTOCOL_VERSION,
      requestId,
      outcome: { ok: true, result },
    });
  }

  private fail(requestId: string, error: AnkiError): void {
    this.dependencies.post({
      protocolVersion: PACKAGE_PROTOCOL_VERSION,
      requestId,
      outcome: { ok: false, error },
    });
  }

  private async dispatch(
    request: Exclude<PackageRequest, { operation: 'cancel' }>,
  ): Promise<Dispatched> {
    switch (request.operation) {
      case 'open': {
        const opened = await this.open(request.payload.archive, request.payload.wasmUrl);
        return opened.ok ? { ok: true, value: { operation: 'open', value: opened.value } } : opened;
      }
      case 'discover': {
        if (this.state === null) {
          return err(notOpen());
        }
        return { ok: true, value: { operation: 'discover', value: toCatalog(this.state.reader) } };
      }
      case 'extract': {
        if (this.state === null) {
          return err(notOpen());
        }
        return this.extract(this.state, request.payload);
      }
      case 'close':
        this.closeState();
        return { ok: true, value: { operation: 'close', value: { closed: true } } };
    }
  }

  private async open(
    archiveBytes: ArrayBuffer,
    wasmUrl: string,
  ): Promise<Result<OpenValue, AnkiError>> {
    this.closeState();

    const archive = openZipArchive(new Uint8Array(archiveBytes), this.limits);
    if (!archive.ok) {
      return archive;
    }

    const collection = await loadCollection(archive.value, this.dependencies.loadZstd, this.limits);
    if (!collection.ok) {
      return collection;
    }

    let database: CollectionDatabase;
    try {
      database = await this.dependencies.createDatabase(wasmUrl)(collection.value.bytes);
    } catch (thrown) {
      return err(
        ankiError(
          'package-unreadable',
          'The collection inside this package could not be opened.',
          describeThrown(thrown),
        ),
      );
    }

    const reader = openCollectionReader(database);
    if (!reader.ok) {
      database.close();
      return reader;
    }

    this.state = { database, reader: reader.value };

    return ok({
      memberName: collection.value.memberName,
      compression: collection.value.compression,
      packageVersion: collection.value.packageVersion,
      schemaVersion: reader.value.schemaVersion,
      layout: reader.value.layout,
      deckCount: reader.value.decks.length,
      noteTypeCount: reader.value.noteTypes.length,
      hasAnyReviewEvidence: reader.value.hasAnyReviewEvidence,
      mediaEntryCount: archive.value.entries.filter((entry) => !COLLECTION_MEMBERS.has(entry.name))
        .length,
    });
  }

  private extract(
    state: OpenState,
    selection: {
      deckName: string;
      deckScope: 'deck-only' | 'deck-and-subdecks';
      noteTypeName: string;
      expressionFieldName: string;
    },
  ): Dispatched {
    const noteType = state.reader.noteTypes.find((type) => type.name === selection.noteTypeName);
    if (noteType === undefined) {
      return err(
        ankiError(
          'note-type-discovery-failed',
          'That note type is no longer in this package.',
          selection.noteTypeName,
        ),
      );
    }
    const ordinal = noteType.fieldNames.indexOf(selection.expressionFieldName);
    if (ordinal < 0) {
      return err(
        ankiError(
          'field-discovery-failed',
          'That field is no longer part of this note type.',
          selection.expressionFieldName,
        ),
      );
    }

    const notes = state.reader.reviewedNotes(selection);
    const fields: ExtractedField[] = notes.map((note) => {
      // `at` rather than an index, because a note can legitimately carry fewer
      // values than its note type declares fields.
      const value = note.fieldValues.at(ordinal);
      return {
        sourceNoteId: note.noteId,
        ...(value === undefined ? {} : { rawFieldValue: value }),
      };
    });

    return { ok: true, value: { operation: 'extract', value: { examined: notes.length, fields } } };
  }

  /**
   * Drops everything the open package holds.
   *
   * The database is closed first so its WebAssembly heap is released, then the
   * archive reference goes with the state; the worker is terminated by the
   * client afterwards, which is what actually returns the memory to the browser.
   */
  private closeState(): void {
    if (this.state === null) {
      return;
    }
    this.state.database.close();
    this.state = null;
  }
}
