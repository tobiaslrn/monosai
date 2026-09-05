import { ankiError, type AnkiError } from '../../../domain/anki/anki-error';
import type {
  AnkiExtractionEvent,
  AnkiVocabularyProvider,
} from '../../../domain/anki/anki-provider';
import type { AnkiCapabilities, CapabilityLimitation } from '../../../domain/anki/capabilities';
import type { AnkiCatalog } from '../../../domain/anki/catalog';
import { canRefresh } from '../../../domain/anki/capabilities';
import { err, ok, type Result } from '../../../domain/shared/result';
import type { AnkiProviderKind } from '../../../domain/vocabulary/snapshot';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import { buildCatalog } from './connect-catalog';
import type { AnkiConnectClient } from './connect-client';
import { extractMapping } from './connect-extraction';
import { sampleConnectFields } from './connect-samples';
import type { AnkiFieldSample } from '../../../domain/vocabulary/suggest-anki-mapping';

/** Smaller batches than desktop: the bridge runs on a phone. */
const ANDROID_BATCH_SIZE = 50;

/**
 * An AnkiConnect-compatible bridge on Android.
 *
 * The specification is explicit that desktop action completeness must not be
 * assumed here, so every action this adapter needs is probed individually and
 * anything missing becomes a recorded limitation. Crucially, if review evidence
 * cannot be proven the adapter reports `review-evidence-unsupported` and builds
 * no snapshot at all — an entry that cannot be shown to have been studied must
 * never be counted as vocabulary the learner knows.
 *
 * Monosai does not claim it can install, configure, start, or obtain
 * permissions for AnkiDroid or any bridge; those are things the learner does
 * outside the application.
 */
export class AndroidConnectAdapter implements AnkiVocabularyProvider {
  readonly kind: AnkiProviderKind = 'android-connect';

  private capabilities: AnkiCapabilities | null = null;
  private disposed = false;

  constructor(private readonly client: AnkiConnectClient) {}

  async probe(signal?: AbortSignal): Promise<Result<AnkiCapabilities, AnkiError>> {
    if (this.disposed) {
      return err(ankiError('bridge-not-running', 'This Anki connection was already closed.'));
    }

    const version = await this.client.version(signal);
    if (!version.ok) {
      return version;
    }

    const permission = await this.client.requestPermission(signal);
    if (!permission.ok) return permission;
    if (permission.value.permission !== 'granted' || permission.value.requireApiKey === true) {
      return err(ankiError('ankidroid-permission-denied', 'Grant AnkiDroid access in the bridge.'));
    }

    const limitations: CapabilityLimitation[] = [];
    const note = (code: string, message: string): void => {
      limitations.push({ code, message });
    };

    const decks = await this.client.deckNames(signal);
    if (!decks.ok && decks.error.code === 'cancelled') {
      return decks;
    }
    if (!decks.ok) {
      note('decks-unavailable', 'This bridge could not list your decks.');
    }

    const models = await this.client.modelNames(signal);
    if (!models.ok && models.error.code === 'cancelled') {
      return models;
    }
    if (!models.ok) {
      note('note-types-unavailable', 'This bridge could not list your note types.');
    }

    let canDiscoverFields = false;
    if (models.ok && models.value.length > 0) {
      const fields = await this.client.modelFieldNames(models.value[0], signal);
      if (!fields.ok && fields.error.code === 'cancelled') {
        return fields;
      }
      canDiscoverFields = fields.ok;
      if (!fields.ok) {
        note('fields-unavailable', 'This bridge could not list the fields of a note type.');
      }
    }

    // Review evidence is proven by asking for one card's information and
    // checking that a review count actually came back. A bridge that answers
    // the search but not the card details cannot support a snapshot.
    let canFilterReviewed = false;
    let canReadNoteFields = false;
    const probeCards = await this.client.findCards('deck:*', signal);
    if (!probeCards.ok && probeCards.error.code === 'cancelled') {
      return probeCards;
    }
    if (!probeCards.ok) {
      note('search-unavailable', 'This bridge could not search your collection.');
    } else if (probeCards.value.length === 0) {
      note('collection-empty', 'This bridge reported no cards at all.');
    } else {
      const sample = await this.client.cardsInfo(probeCards.value.slice(0, 1), signal);
      if (!sample.ok && sample.error.code === 'cancelled') {
        return sample;
      }
      canFilterReviewed = sample.ok && sample.value.length > 0;
      if (!sample.ok || sample.value.length === 0) {
        note('review-counts-unavailable', 'This bridge could not report card review counts.');
      } else {
        const notes = await this.client.notesInfo([sample.value[0].note], signal);
        if (!notes.ok && notes.error.code === 'cancelled') {
          return notes;
        }
        canReadNoteFields = notes.ok && notes.value.length > 0;
        if (!canReadNoteFields) {
          note('note-fields-unavailable', 'This bridge could not read note fields.');
        }
      }
    }

    const capabilities: AnkiCapabilities = {
      apiVersion: String(version.value),
      canDiscoverDecks: decks.ok,
      canDiscoverNoteTypes: models.ok,
      canDiscoverFields,
      canFilterReviewed,
      canReadNoteFields,
      maxBatchSize: ANDROID_BATCH_SIZE,
      limitations,
    };

    if (!canFilterReviewed || !canReadNoteFields) {
      return err(
        ankiError(
          'review-evidence-unsupported',
          'This Anki bridge cannot show which cards you have reviewed, so Monosai cannot build a vocabulary snapshot from it. Export an Anki package instead.',
          limitations.map((limitation) => limitation.code).join(', '),
        ),
      );
    }

    this.capabilities = capabilities;
    return ok(capabilities);
  }

  async discover(signal?: AbortSignal): Promise<Result<AnkiCatalog, AnkiError>> {
    const ready = await this.ensureProbed(signal);
    if (!ready.ok) {
      return ready;
    }
    return buildCatalog(this.client, signal);
  }

  async sampleFields(
    catalog: AnkiCatalog,
    signal?: AbortSignal,
  ): Promise<Result<readonly AnkiFieldSample[], AnkiError>> {
    const ready = await this.ensureProbed(signal);
    return ready.ok ? sampleConnectFields(this.client, catalog, signal) : ready;
  }

  async *extractReviewed(
    mappings: readonly SourceMapping[],
    signal?: AbortSignal,
  ): AsyncIterable<AnkiExtractionEvent> {
    if (signal?.aborted === true) {
      yield { kind: 'failed', error: ankiError('cancelled', 'The refresh was cancelled.') };
      return;
    }

    const ready = await this.ensureProbed(signal);
    if (!ready.ok) {
      yield { kind: 'failed', error: ready.error };
      return;
    }
    for (const limitation of ready.value.limitations) {
      yield { kind: 'warning', message: limitation.message };
    }

    const batchSize = ready.value.maxBatchSize ?? ANDROID_BATCH_SIZE;
    for (const mapping of mappings) {
      for await (const event of extractMapping(this.client, mapping, batchSize, signal)) {
        yield event;
        if (event.kind === 'failed') {
          return;
        }
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.capabilities = null;
  }

  /**
   * Nothing runs before capabilities are established.
   *
   * Discovery and extraction on this provider are only meaningful once the
   * bridge has proven it can answer them, so both go through the probe rather
   * than trying and interpreting whatever comes back.
   */
  private async ensureProbed(signal?: AbortSignal): Promise<Result<AnkiCapabilities, AnkiError>> {
    if (this.capabilities !== null && canRefresh(this.capabilities)) {
      return ok(this.capabilities);
    }
    return this.probe(signal);
  }
}

export { ANDROID_BATCH_SIZE };
