import { describe, expect, it } from 'vitest';
import type { FixtureCollection, FixtureNote } from '../../../../testing/anki-collection';
import { FakeAnkiConnectServer } from '../../../../testing/anki-connect-server';
import { mappingFor } from '../../../../testing/anki-provider-contract';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import { AnkiConnectClient, DESKTOP_ENDPOINTS } from './connect-client';
import { extractMapping } from './connect-extraction';

/** The two endpoints, told apart by whether `cardsInfo` names a card's home deck. */
const ENDPOINTS = [
  { name: 'desktop add-on', cardShape: 'desktop', reportsHomeDeck: false },
  { name: 'Android bridge', cardShape: 'bridge', reportsHomeDeck: true },
] as const;

type Endpoint = (typeof ENDPOINTS)[number];

function note(id: string, deckName: string, filteredDeckName?: string): FixtureNote {
  return {
    id,
    noteTypeName: 'Basic',
    fieldValues: [id, ''],
    cards: [{ deckName, reps: 3, ...(filteredDeckName === undefined ? {} : { filteredDeckName }) }],
  };
}

async function expressions(
  endpoint: Endpoint,
  collection: FixtureCollection,
  mapping: SourceMapping,
): Promise<string[]> {
  const server = new FakeAnkiConnectServer(collection, { cardShape: endpoint.cardShape });
  const client = new AnkiConnectClient({
    endpoints: DESKTOP_ENDPOINTS,
    fetchFn: server.fetch,
    pageOrigin: 'http://localhost:4200',
    unreachableCode: 'not-running',
  });
  const found: string[] = [];
  for await (const event of extractMapping(client, mapping, 200, undefined, {
    reportsHomeDeck: endpoint.reportsHomeDeck,
  })) {
    if (event.kind === 'failed') {
      throw new Error(event.error.message);
    }
    if (event.kind === 'entry' && event.entry.rawFieldValue !== undefined) {
      found.push(event.entry.rawFieldValue);
    }
  }
  return found.sort();
}

describe.each(ENDPOINTS)('deck scope through the $name', (endpoint) => {
  it('reads an underscore in a deck name as itself, not as any character', async () => {
    // Anki's `_` matches any one character, so a search for `N5_vocab` would
    // also find the learner's `N5-vocab` deck while one of its cards is being
    // studied from a filtered deck.
    const collection: FixtureCollection = {
      deckNames: ['N5_vocab', 'N5-vocab', 'Cram'],
      noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
      notes: [note('own', 'N5_vocab'), note('other', 'N5-vocab', 'Cram')],
    };

    expect(await expressions(endpoint, collection, mappingFor({ deckName: 'N5_vocab' }))).toEqual([
      'own',
    ]);
  });
});
