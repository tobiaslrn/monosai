import { ankiError, type AnkiError } from '../../../domain/anki/anki-error';
import type {
  AnkiExtractionEvent,
  AnkiVocabularyProvider,
} from '../../../domain/anki/anki-provider';
import type { AnkiCapabilities } from '../../../domain/anki/capabilities';
import type { AnkiCatalog } from '../../../domain/anki/catalog';
import { err, ok, type Result } from '../../../domain/shared/result';
import type { AnkiProviderKind } from '../../../domain/vocabulary/snapshot';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import type { AnkiConnectClient } from './connect-client';
import { DEFAULT_BATCH_SIZE, extractMapping } from './connect-extraction';
import { buildCatalog } from './connect-catalog';
import { escapeTerm } from './connect-search';
import type { AnkiFieldSample } from '../../../domain/vocabulary/suggest-anki-mapping';
import { DomMarkupTextExtractor } from '../dom-markup-text';

/**
 * Desktop AnkiConnect.
 *
 * The desktop add-on has a stable, complete action set, so this adapter probes
 * the version and permission and then assumes the read actions it needs are
 * present. The Android bridge cannot make that assumption, which is why it is a
 * separate adapter rather than a flag on this one.
 */
export class DesktopConnectAdapter implements AnkiVocabularyProvider {
  readonly kind: AnkiProviderKind = 'desktop-connect';

  private batchSize = DEFAULT_BATCH_SIZE;
  private disposed = false;

  constructor(private readonly client: AnkiConnectClient) {}

  async probe(signal?: AbortSignal): Promise<Result<AnkiCapabilities, AnkiError>> {
    if (this.disposed) {
      return err(ankiError('not-running', 'This Anki connection was already closed.'));
    }

    const permission = await this.client.requestPermission(signal);
    if (!permission.ok) {
      return permission;
    }
    if (permission.value.permission !== 'granted') {
      return err(
        ankiError(
          'permission-denied',
          'Anki has not granted Monosai permission to read your collection. Allow it in the AnkiConnect settings and test the connection again.',
        ),
      );
    }
    if (permission.value.requireApiKey === true) {
      return err(
        ankiError(
          'permission-denied',
          'This AnkiConnect installation requires an API key, which Monosai does not support. Use an Anki package instead.',
        ),
      );
    }

    const reportedVersion = permission.value.version;
    const version =
      reportedVersion === undefined ? await this.client.version(signal) : ok(reportedVersion);
    if (!version.ok) {
      return version;
    }

    return ok({
      apiVersion: String(version.value),
      canDiscoverDecks: true,
      canDiscoverNoteTypes: true,
      canDiscoverFields: true,
      canFilterReviewed: true,
      canReadNoteFields: true,
      maxBatchSize: this.batchSize,
      limitations: [],
    });
  }

  discover(signal?: AbortSignal): Promise<Result<AnkiCatalog, AnkiError>> {
    return buildCatalog(this.client, signal);
  }

  async sampleFields(
    catalog: AnkiCatalog,
    signal?: AbortSignal,
  ): Promise<Result<readonly AnkiFieldSample[], AnkiError>> {
    const samples: AnkiFieldSample[] = [];
    const extractor = new DomMarkupTextExtractor();
    // Cap both request count and note bodies, even for a collection with hundreds of types.
    for (const noteType of catalog.noteTypes.slice(0, 20)) {
      const found = await this.client.findCards(`"note:${escapeTerm(noteType.name)}"`, signal);
      if (!found.ok) return found;
      const cards = await this.client.cardsInfo(found.value.slice(0, 8), signal);
      if (!cards.ok) return cards;
      const notes = await this.client.notesInfo(
        [...new Set(cards.value.map((card) => card.note))],
        signal,
      );
      if (!notes.ok) return notes;
      for (const note of notes.value) {
        if (note.modelName !== noteType.name) continue;
        for (const deckName of new Set(
          cards.value.filter((card) => card.note === note.noteId).map((card) => card.deckName),
        )) {
          samples.push({
            deckName,
            noteTypeName: note.modelName,
            fields: Object.fromEntries(
              Object.entries(note.fields).map(([name, field]) => [
                name,
                extractor.toVisibleText(field.value),
              ]),
            ),
          });
        }
      }
    }
    return ok(samples);
  }

  async *extractReviewed(
    mappings: readonly SourceMapping[],
    signal?: AbortSignal,
  ): AsyncIterable<AnkiExtractionEvent> {
    if (signal?.aborted === true) {
      yield { kind: 'failed', error: ankiError('cancelled', 'The refresh was cancelled.') };
      return;
    }

    for (const mapping of mappings) {
      for await (const event of extractMapping(this.client, mapping, this.batchSize, signal)) {
        yield event;
        if (event.kind === 'failed') {
          return;
        }
      }
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}
