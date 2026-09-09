import { describe, expect, it } from 'vitest';
import { syntheticCollection } from '../../testing/anki-package-harness';
import { openCollectionReader, type ReviewedNote } from './collection-reader';
import type { CollectionDatabase } from './sqlite-runtime';

const NOTE_TYPE_ID = 1_400;
const DECK_ID = 7;
const SELECTION = {
  deckName: 'Japanese',
  deckScope: 'deck-only',
  noteTypeName: 'Vocabulary',
} as const;

/** Schema 18 with only the columns a case needs, so absent columns stay testable. */
function schema(cardColumns: readonly string[], extras: readonly string[] = []): string[] {
  return [
    'create table col (id integer primary key, ver integer)',
    `insert into col (id, ver) values (1, 18)`,
    'create table notes (id integer primary key, mid integer, flds text)',
    'create table decks (id integer primary key, name text)',
    `insert into decks (id, name) values (${DECK_ID}, 'Japanese')`,
    'create table notetypes (id integer primary key, name text)',
    `insert into notetypes (id, name) values (${NOTE_TYPE_ID}, 'Vocabulary')`,
    'create table fields (ntid integer, ord integer, name text)',
    `insert into fields (ntid, ord, name) values (${NOTE_TYPE_ID}, 0, 'Expression')`,
    `create table cards (${cardColumns.join(', ')})`,
    ...extras,
  ];
}

const FULL_CARD_COLUMNS = [
  'id integer primary key',
  'nid integer',
  'did integer',
  'odid integer default 0',
  'queue integer default 2',
  'reps integer',
  'lapses integer default 0',
  'factor integer default 0',
  'ivl integer default 0',
  'data text',
];

const REVLOG = ['create table revlog (id integer primary key, cid integer, ease integer)'];

function note(id: number, expression: string): string {
  return `insert into notes (id, mid, flds) values (${id}, ${NOTE_TYPE_ID}, '${expression}')`;
}

function card(values: Record<string, number | string | null>): string {
  const columns = Object.keys(values).join(', ');
  const literals = Object.values(values)
    .map((value) => (value === null ? 'null' : typeof value === 'string' ? `'${value}'` : value))
    .join(', ');
  return `insert into cards (${columns}) values (${literals})`;
}

async function read(statements: readonly string[]): Promise<readonly ReviewedNote[]> {
  const database: CollectionDatabase = await syntheticCollection(statements);
  const reader = openCollectionReader(database);
  if (!reader.ok) {
    throw new Error(`reader failed: ${reader.error.code}`);
  }
  return reader.value.reviewedNotes(SELECTION);
}

describe('collection reader scheduling signals', () => {
  describe('first review', () => {
    it('reads the earliest real review as the moment the word was learned', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS, REVLOG),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3 }),
        'insert into revlog (id, cid, ease) values (1760000000000, 11, 3)',
        'insert into revlog (id, cid, ease) values (1770000000000, 11, 2)',
      ]);

      expect(notes[0]).toMatchObject({ firstReviewedAt: 1_760_000_000_000 });
    });

    it('ignores a reschedule even when it is the oldest entry', async () => {
      // Enabling FSRS rewrites the whole collection's scheduling as `ease = 0`
      // entries. Counting one as a review would date every word to that day.
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS, REVLOG),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3 }),
        'insert into revlog (id, cid, ease) values (1000000000000, 11, 0)',
        'insert into revlog (id, cid, ease) values (1760000000000, 11, 3)',
      ]);

      expect(notes[0]).toMatchObject({ firstReviewedAt: 1_760_000_000_000 });
    });

    it('omits the signal when the package carries no review log', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3 }),
      ]);

      expect(notes[0].firstReviewedAt).toBeUndefined();
      expect(notes[0].reps).toBe(3);
    });

    it('omits the signal when the review log is empty', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS, REVLOG),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3 }),
      ]);

      expect(notes[0].firstReviewedAt).toBeUndefined();
    });

    it('does not count reviews of a suspended card toward its note', async () => {
      // The two queries must apply eligibility identically. If they drift, a
      // suspended card's history leaks into a note built from other cards.
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS, REVLOG),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3, queue: 2 }),
        card({ id: 12, nid: 1, did: DECK_ID, reps: 9, queue: -1 }),
        'insert into revlog (id, cid, ease) values (1700000000000, 12, 3)',
        'insert into revlog (id, cid, ease) values (1760000000000, 11, 3)',
      ]);

      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ firstReviewedAt: 1_760_000_000_000, reps: 3 });
    });
  });

  describe('interval', () => {
    it('keeps the largest interval across the cards of a note', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3, ivl: 40 }),
        card({ id: 12, nid: 1, did: DECK_ID, reps: 2, ivl: 5 }),
      ]);

      expect(notes[0]).toMatchObject({ intervalDays: 40 });
    });

    it('reads a learning card as at most a day out', async () => {
      // Anki stores a learning interval as negative seconds.
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 1, ivl: -600 }),
      ]);

      expect(notes[0]).toMatchObject({ intervalDays: 1 });
    });

    it('omits the signal when the column is absent', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS.filter((column) => !column.startsWith('ivl'))),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3 }),
      ]);

      expect(notes[0].intervalDays).toBeUndefined();
    });
  });

  describe('FSRS difficulty', () => {
    it('reads the difficulty out of the card data', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS),
        note(1, 'ねこ'),
        card({
          id: 11,
          nid: 1,
          did: DECK_ID,
          reps: 3,
          data: '{"pos":1,"s":11.1361,"d":8.269,"dr":0.8}',
        }),
      ]);

      expect(notes[0]).toMatchObject({ fsrsDifficulty: 8.269 });
    });

    it('keeps the difficulty of the hardest card for the note', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3, data: '{"d":2.5}' }),
        card({ id: 12, nid: 1, did: DECK_ID, reps: 3, data: '{"d":9.1}' }),
      ]);

      expect(notes[0]).toMatchObject({ fsrsDifficulty: 9.1 });
    });

    it('reads every unusable value as no signal rather than as easy', async () => {
      for (const data of ['', '{', '{"s":11.2}', '{"d":0}', '{"d":11}', '{"d":"hard"}', null]) {
        const notes = await read([
          ...schema(FULL_CARD_COLUMNS),
          note(1, 'ねこ'),
          card({ id: 11, nid: 1, did: DECK_ID, reps: 3, data }),
        ]);

        expect(notes[0].fsrsDifficulty, `data: ${String(data)}`).toBeUndefined();
      }
    });

    it('omits the signal when the column is absent', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS.filter((column) => !column.startsWith('data'))),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 3 }),
      ]);

      expect(notes[0].fsrsDifficulty).toBeUndefined();
    });
  });

  describe('merging the cards of a note', () => {
    it('applies every priority rule in one read', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS, REVLOG),
        note(1, 'ねこ'),
        card({
          id: 11,
          nid: 1,
          did: DECK_ID,
          reps: 8,
          lapses: 0,
          factor: 2_400,
          ivl: 40,
          data: '{"d":3}',
        }),
        card({
          id: 12,
          nid: 1,
          did: DECK_ID,
          reps: 2,
          lapses: 1,
          factor: 1_700,
          ivl: 1,
          data: '{"d":9}',
        }),
        'insert into revlog (id, cid, ease) values (1700000000000, 11, 3)',
        'insert into revlog (id, cid, ease) values (1760000000000, 12, 3)',
      ]);

      expect(notes[0]).toMatchObject({
        reps: 2,
        lapseRatio: 0.5,
        easeFactor: 1_700,
        firstReviewedAt: 1_700_000_000_000,
        intervalDays: 40,
        fsrsDifficulty: 9,
      });
    });
  });

  describe('deck scope', () => {
    it('keeps a card studied in a filtered deck with its home deck', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS, REVLOG),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: 999, odid: DECK_ID, reps: 3, ivl: 12 }),
        'insert into revlog (id, cid, ease) values (1760000000000, 11, 3)',
      ]);

      expect(notes).toHaveLength(1);
      expect(notes[0]).toMatchObject({ firstReviewedAt: 1_760_000_000_000, intervalDays: 12 });
    });

    it('omits a note whose cards were never reviewed', async () => {
      const notes = await read([
        ...schema(FULL_CARD_COLUMNS, REVLOG),
        note(1, 'ねこ'),
        card({ id: 11, nid: 1, did: DECK_ID, reps: 0 }),
      ]);

      expect(notes).toEqual([]);
    });
  });
});
