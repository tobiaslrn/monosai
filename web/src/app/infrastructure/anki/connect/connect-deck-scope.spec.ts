import { describe, expect, it } from 'vitest';
import type { FixtureCollection, FixtureNote } from '../../../../testing/anki-collection';
import { FakeAnkiConnectServer } from '../../../../testing/anki-connect-server';
import { mappingFor } from '../../../../testing/anki-provider-contract';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import { AnkiConnectClient, DESKTOP_ENDPOINTS } from './connect-client';
import { extractMapping } from './connect-extraction';

/**
 * The endpoints, told apart by whether `cardsInfo` names a card's home deck, and
 * the desktop one under each reading of `did:` Anki has shipped. Only from 24.11
 * can `did:` see a filtered card's home deck, so only there, and on the bridge,
 * is every filtered deck decided exactly.
 */
const ENDPOINTS = [
  {
    name: 'desktop add-on on Anki 24.11 and later',
    cardShape: 'desktop',
    reportsHomeDeck: false,
    didSearch: 'current-and-home',
    exact: true,
  },
  {
    name: 'desktop add-on on Anki 23.10 to 24.06',
    cardShape: 'desktop',
    reportsHomeDeck: false,
    didSearch: 'current',
    exact: false,
  },
  {
    name: 'desktop add-on on Anki 2.1.41 to 2.1.66',
    cardShape: 'desktop',
    reportsHomeDeck: false,
    didSearch: 'single-current',
    exact: false,
  },
  {
    name: 'Android bridge',
    cardShape: 'bridge',
    reportsHomeDeck: true,
    didSearch: 'current-and-home',
    exact: true,
  },
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

async function extract(
  endpoint: Endpoint,
  collection: FixtureCollection,
  mapping: SourceMapping,
  options: { readonly batchSize?: number; readonly failingSearchTerms?: readonly string[] } = {},
): Promise<{ readonly found: string[]; readonly searches: string[] }> {
  const server = new FakeAnkiConnectServer(collection, {
    cardShape: endpoint.cardShape,
    didSearch: endpoint.didSearch,
    ...(options.failingSearchTerms === undefined
      ? {}
      : { failingSearchTerms: options.failingSearchTerms }),
  });
  const client = new AnkiConnectClient({
    endpoints: DESKTOP_ENDPOINTS,
    fetchFn: server.fetch,
    pageOrigin: 'http://localhost:4200',
    unreachableCode: 'not-running',
  });
  const found: string[] = [];
  for await (const event of extractMapping(client, mapping, options.batchSize ?? 200, undefined, {
    reportsHomeDeck: endpoint.reportsHomeDeck,
  })) {
    if (event.kind === 'failed') {
      throw new Error(event.error.message);
    }
    if (event.kind === 'entry' && event.entry.rawFieldValue !== undefined) {
      found.push(event.entry.rawFieldValue);
    }
  }
  const searches = server.requests
    .filter((request) => request.action === 'findCards')
    .map((request) => String(request.params['query']));
  return { found: found.sort(), searches };
}

async function expressions(
  endpoint: Endpoint,
  collection: FixtureCollection,
  mapping: SourceMapping,
): Promise<string[]> {
  return (await extract(endpoint, collection, mapping)).found;
}

/**
 * A deck with a subdeck and two filtered decks the learner built inside it,
 * beside a top-level one. Each note is named for where its card lives and
 * where it sits now.
 */
const NESTED_FILTERED: FixtureCollection = {
  deckNames: ['Core', 'Core::Verbs', 'Core::Cram', 'Core::Verbs::Cram', 'Cram', 'Other'],
  noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
  notes: [
    note('core', 'Core'),
    note('core-in-cram', 'Core', 'Cram'),
    note('core-in-core-cram', 'Core', 'Core::Cram'),
    note('core-in-verbs-cram', 'Core', 'Core::Verbs::Cram'),
    note('verbs', 'Core::Verbs'),
    note('verbs-in-core-cram', 'Core::Verbs', 'Core::Cram'),
    note('other', 'Other'),
    note('other-in-core-cram', 'Other', 'Core::Cram'),
    note('other-in-verbs-cram', 'Other', 'Core::Verbs::Cram'),
  ],
};

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

  it("keeps the deck's own cards studied from a filtered deck outside it", async () => {
    // A filtered deck moves a card without changing where it belongs, and the
    // desktop add-on names only the deck the card sits in.
    const collection: FixtureCollection = {
      deckNames: ['Core', 'Cram', 'Other'],
      noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
      notes: [
        note('core', 'Core'),
        note('core-in-cram', 'Core', 'Cram'),
        note('other-in-cram', 'Other', 'Cram'),
      ],
    };

    for (const deckScope of ['deck-only', 'deck-and-subdecks'] as const) {
      expect(
        await expressions(endpoint, collection, mappingFor({ deckName: 'Core', deckScope })),
      ).toEqual(['core', 'core-in-cram']);
    }
  });

  it('keeps only the cards whose home is the deck itself under deck-only', async () => {
    // A filtered deck built inside the mapped deck is one of its subdecks by
    // name, so a search that subtracts the subdecks also subtracted the cards
    // the learner is studying from it. Where `did:` cannot see home decks, a
    // filtered deck inside the tree cannot be told from the cards' home, and
    // its cards are left out.
    expect(await expressions(endpoint, NESTED_FILTERED, mappingFor({ deckName: 'Core' }))).toEqual(
      endpoint.exact
        ? ['core', 'core-in-core-cram', 'core-in-cram', 'core-in-verbs-cram']
        : ['core', 'core-in-cram'],
    );
  });

  it('keeps only the cards whose home is in the deck tree under deck-and-subdecks', async () => {
    // A filtered deck inside the tree can hold cards from anywhere; the deck
    // such a card sits in says nothing about where it belongs. Where `did:`
    // cannot see home decks, every card sitting in one is kept.
    const mapping = mappingFor({ deckName: 'Core', deckScope: 'deck-and-subdecks' });
    const inTree = [
      'core',
      'core-in-core-cram',
      'core-in-cram',
      'core-in-verbs-cram',
      'verbs',
      'verbs-in-core-cram',
    ];
    expect(await expressions(endpoint, NESTED_FILTERED, mapping)).toEqual(
      endpoint.exact ? inTree : [...inTree, 'other-in-core-cram', 'other-in-verbs-cram'].sort(),
    );
  });
});

describe('deck scope through the desktop add-on', () => {
  const current = ENDPOINTS[0];

  it('asks once per mapping whether `did:` sees home decks', async () => {
    const mapping = mappingFor({ deckName: 'Core', deckScope: 'deck-and-subdecks' });
    const { searches } = await extract(current, NESTED_FILTERED, mapping, { batchSize: 1 });

    expect(searches.filter((query) => query.includes(' deck:filtered did:'))).toHaveLength(1);
  });

  it('decides by deck name when Anki cannot run the `did:` search', async () => {
    const mapping = mappingFor({ deckName: 'Core', deckScope: 'deck-and-subdecks' });
    const { found } = await extract(current, NESTED_FILTERED, mapping, {
      failingSearchTerms: ['did:'],
    });

    expect(found).toContain('other-in-core-cram');
    expect(found).not.toContain('other');
  });
});
