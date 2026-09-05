import type { AnkiExtractionEvent, AnkiVocabularyProvider } from '../app/domain/anki/anki-provider';
import { ankiError, type AnkiError } from '../app/domain/anki/anki-error';
import type { AnkiCapabilities } from '../app/domain/anki/capabilities';
import type { AnkiCatalog } from '../app/domain/anki/catalog';
import { err, ok, type Result } from '../app/domain/shared/result';
import type { AnkiProviderKind } from '../app/domain/vocabulary/snapshot';
import type { SourceMapping } from '../app/domain/vocabulary/source-mapping';
import {
  mergeSchedulingSignals,
  schedulingSignalsFromCard,
} from '../app/domain/anki/scheduling-signals';
import {
  deckSeparatorChildren,
  fieldValueOf,
  type FixtureCollection,
  type FixtureNote,
} from './anki-collection';

export interface FakeProviderOptions {
  readonly kind?: AnkiProviderKind;
  readonly capabilities?: Partial<AnkiCapabilities>;
  readonly probeError?: AnkiError;
  readonly discoverError?: AnkiError;
  readonly extractError?: AnkiError;
  readonly warnings?: readonly string[];
}

const BASE_CAPABILITIES: AnkiCapabilities = {
  apiVersion: 'fake/1',
  canDiscoverDecks: true,
  canDiscoverNoteTypes: true,
  canDiscoverFields: true,
  canFilterReviewed: true,
  canReadNoteFields: true,
  maxBatchSize: 3,
  limitations: [],
};

/** A card in scope for this mapping's deck selection. */
function inScope(note: FixtureNote, mapping: SourceMapping): boolean {
  return note.cards.some((card) => {
    if (card.deckName === mapping.deckName) {
      return true;
    }
    return (
      mapping.deckScope === 'deck-and-subdecks' && card.deckName.startsWith(`${mapping.deckName}::`)
    );
  });
}

/**
 * Reviewed at least once, on a card that is itself in scope.
 *
 * Both conditions have to hold for the same card: a note whose only reviewed
 * card lives in a different deck is not evidence that this deck's material was
 * studied.
 */
function isEligible(note: FixtureNote, mapping: SourceMapping): boolean {
  return note.cards.some((card) => {
    const scoped =
      card.deckName === mapping.deckName ||
      (mapping.deckScope === 'deck-and-subdecks' &&
        card.deckName.startsWith(`${mapping.deckName}::`));
    return scoped && card.reps > 0;
  });
}

/**
 * Reference implementation of `AnkiVocabularyProvider` over an in-memory
 * collection.
 *
 * It is the yardstick the real adapters are measured against: the contract
 * suite runs against this first, so a disagreement between an adapter and the
 * fake is a bug in the adapter rather than an argument about what the rule was.
 */
export class FakeAnkiProvider implements AnkiVocabularyProvider {
  readonly kind: AnkiProviderKind;
  disposed = false;
  readonly extractedMappings: string[] = [];

  constructor(
    private readonly collection: FixtureCollection,
    private readonly options: FakeProviderOptions = {},
  ) {
    this.kind = options.kind ?? 'package';
  }

  probe(signal?: AbortSignal): Promise<Result<AnkiCapabilities, AnkiError>> {
    if (signal?.aborted === true) {
      return Promise.resolve(err(ankiError('cancelled', 'The connection test was cancelled.')));
    }
    if (this.options.probeError !== undefined) {
      return Promise.resolve(err(this.options.probeError));
    }
    return Promise.resolve(ok({ ...BASE_CAPABILITIES, ...this.options.capabilities }));
  }

  discover(signal?: AbortSignal): Promise<Result<AnkiCatalog, AnkiError>> {
    if (signal?.aborted === true) {
      return Promise.resolve(err(ankiError('cancelled', 'Discovery was cancelled.')));
    }
    if (this.options.discoverError !== undefined) {
      return Promise.resolve(err(this.options.discoverError));
    }
    return Promise.resolve(
      ok({
        decks: this.collection.deckNames.map((name) => ({
          name,
          hasChildren: deckSeparatorChildren(this.collection.deckNames, name),
        })),
        noteTypes: this.collection.noteTypes.map((noteType) => ({
          name: noteType.name,
          fieldNames: [...noteType.fieldNames],
        })),
      }),
    );
  }

  async *extractReviewed(
    mappings: readonly SourceMapping[],
    signal?: AbortSignal,
  ): AsyncIterable<AnkiExtractionEvent> {
    // A real provider always crosses an await before its first event; doing the
    // same here keeps callers honest about events arriving asynchronously.
    await Promise.resolve();

    for (const warning of this.options.warnings ?? []) {
      yield { kind: 'warning', message: warning };
    }
    if (this.options.extractError !== undefined) {
      yield { kind: 'failed', error: this.options.extractError };
      return;
    }

    for (const mapping of mappings) {
      this.extractedMappings.push(mapping.id);
      const candidates = this.collection.notes.filter(
        (note) => note.noteTypeName === mapping.noteTypeName && inScope(note, mapping),
      );

      let examined = 0;
      for (const note of candidates) {
        if (signal?.aborted === true) {
          yield { kind: 'failed', error: ankiError('cancelled', 'The refresh was cancelled.') };
          return;
        }
        examined += 1;
        yield {
          kind: 'progress',
          mappingId: mapping.id,
          examined,
          total: candidates.length,
        };
        if (!isEligible(note, mapping)) {
          continue;
        }
        const value = fieldValueOf(this.collection, note, mapping.expressionFieldName);
        yield {
          kind: 'entry',
          entry: {
            sourceMappingId: mapping.id,
            ...(value === undefined ? {} : { rawFieldValue: value }),
            sourceNoteId: note.id,
            ...note.cards
              .filter((card) => {
                const scoped =
                  card.deckName === mapping.deckName ||
                  (mapping.deckScope === 'deck-and-subdecks' &&
                    card.deckName.startsWith(`${mapping.deckName}::`));
                return scoped && card.reps > 0;
              })
              .reduce(
                (signals, card) =>
                  mergeSchedulingSignals(
                    signals,
                    schedulingSignalsFromCard(card.reps, card.lapses, card.factor),
                  ),
                {},
              ),
          },
        };
      }
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}
