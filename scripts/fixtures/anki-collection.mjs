/**
 * The collection every Anki provider fixture is built from.
 *
 * This mirrors `CONTRACT_COLLECTION` in `src/testing/anki-collection.ts`, which
 * describes the same notes for the in-memory fake. The two are deliberately
 * separate — one is consumed by a Node build script, the other by the browser
 * test bundle — and the shared provider contract is what keeps them honest: if
 * they drift, the package adapter and the fake stop agreeing and the contract
 * run fails.
 */
export const CONTRACT_COLLECTION = {
  deckNames: ['Core Japanese', 'Core Japanese::Verbs', 'Unused'],
  noteTypes: [
    { name: 'Basic', fieldNames: ['Expression', 'Meaning'] },
    { name: 'Sentence', fieldNames: ['Front', 'Back'] },
  ],
  notes: [
    {
      id: 'n-neko-html',
      noteTypeName: 'Basic',
      fieldValues: ['<b>ねこ</b>', 'cat'],
      cards: [{ deckName: 'Core Japanese', reps: 3 }],
    },
    {
      id: 'n-neko-plain',
      noteTypeName: 'Basic',
      fieldValues: ['ねこ', 'cat again'],
      cards: [{ deckName: 'Core Japanese', reps: 1 }],
    },
    {
      id: 'n-mainichi',
      noteTypeName: 'Basic',
      fieldValues: ['毎日', 'every day'],
      cards: [{ deckName: 'Core Japanese', reps: 0 }],
    },
    {
      id: 'n-empty',
      noteTypeName: 'Basic',
      fieldValues: ['   ', 'blank'],
      cards: [{ deckName: 'Core Japanese', reps: 2 }],
    },
    {
      id: 'n-miru',
      noteTypeName: 'Basic',
      fieldValues: ['見る', 'to see'],
      cards: [
        { deckName: 'Core Japanese', reps: 0 },
        { deckName: 'Core Japanese', reps: 5, suspended: true },
      ],
    },
    {
      id: 'n-inu',
      noteTypeName: 'Basic',
      fieldValues: ['<script>alert(1)</script>犬', 'dog'],
      cards: [{ deckName: 'Core Japanese', reps: 2 }],
    },
    {
      id: 'n-onaka',
      noteTypeName: 'Basic',
      fieldValues: ['お腹 が 空いた', 'hungry'],
      cards: [{ deckName: 'Core Japanese', reps: 1 }],
    },
    {
      id: 'n-pen',
      noteTypeName: 'Sentence',
      fieldValues: ['これはペンです。', 'This is a pen.'],
      cards: [{ deckName: 'Core Japanese', reps: 4 }],
    },
    {
      id: 'n-hashiru',
      noteTypeName: 'Basic',
      fieldValues: ['走る', 'to run'],
      cards: [{ deckName: 'Core Japanese::Verbs', reps: 4 }],
    },
  ],
};

/** The same collection with every review count removed. */
export const NO_REVIEW_EVIDENCE_COLLECTION = {
  ...CONTRACT_COLLECTION,
  notes: CONTRACT_COLLECTION.notes.map((note) => ({
    ...note,
    cards: note.cards.map((card) => ({ ...card, reps: 0 })),
  })),
};

/**
 * A card studied through Custom Study, which moves it into a filtered deck and
 * records its real deck in `odid`. Its review must still count for the mapping
 * that selected the home deck.
 */
export const FILTERED_DECK_COLLECTION = {
  deckNames: ['Core Japanese', 'Filtered'],
  noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
  notes: [
    {
      id: 'n-filtered',
      noteTypeName: 'Basic',
      fieldValues: ['勉強', 'study'],
      cards: [{ deckName: 'Filtered', filteredFrom: 'Core Japanese', reps: 6 }],
    },
  ],
};
