/**
 * A tiny in-memory Anki collection.
 *
 * Every provider fixture in the suite is described with this shape so the same
 * expectations can be asserted against a fake, an AnkiConnect adapter answering
 * recorded responses, and a real parsed package. It deliberately mirrors Anki's
 * own model — notes carry ordered field values, cards belong to a deck and
 * carry a review count — rather than a convenient flattened one, because the
 * eligibility rule is about cards and the fixtures have to be able to express
 * a note whose cards disagree.
 */
export interface FixtureNoteType {
  readonly name: string;
  readonly fieldNames: readonly string[];
}

export interface FixtureCard {
  readonly deckName: string;
  /** Anki's `reps`. Anything above zero is review evidence, forever. */
  readonly reps: number;
  readonly lapses?: number;
  readonly factor?: number;
  readonly suspended?: boolean;
}

export interface FixtureNote {
  readonly id: string;
  readonly noteTypeName: string;
  /** Field values in note-type field order, exactly as stored. */
  readonly fieldValues: readonly string[];
  readonly cards: readonly FixtureCard[];
}

export interface FixtureCollection {
  readonly deckNames: readonly string[];
  readonly noteTypes: readonly FixtureNoteType[];
  readonly notes: readonly FixtureNote[];
}

/**
 * The collection every adapter's contract run is checked against.
 *
 * Each note is here to pin one rule:
 *
 * - `n-neko-html` / `n-neko-plain` — the same expression through different
 *   markup, so exact-duplicate merging is exercised across two notes.
 * - `n-mainichi` — reviewed zero times, so it must never appear.
 * - `n-empty` — reviewed but empty, so it counts as rejected, not eligible.
 * - `n-miru` — a never-reviewed card and a suspended reviewed card on one note:
 *   one review ever is enough, and suspension does not take it away.
 * - `n-inu` — script markup that must contribute no text of its own.
 * - `n-onaka` — internal spaces that must survive verbatim.
 * - `n-pen` — a different note type, excluded by the mapping.
 * - `n-hashiru` — a subdeck, included only under `deck-and-subdecks`.
 */
export const CONTRACT_COLLECTION: FixtureCollection = {
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
      cards: [{ deckName: 'Core Japanese', reps: 3, lapses: 1, factor: 2_400 }],
    },
    {
      id: 'n-neko-plain',
      noteTypeName: 'Basic',
      fieldValues: ['ねこ', 'cat again'],
      cards: [{ deckName: 'Core Japanese', reps: 1, lapses: 0, factor: 0 }],
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
        { deckName: 'Core Japanese', reps: 5, lapses: 3, factor: 1_700, suspended: true },
      ],
    },
    {
      id: 'n-inu',
      noteTypeName: 'Basic',
      fieldValues: ['<script>alert(1)</script>犬', 'dog'],
      cards: [{ deckName: 'Core Japanese', reps: 2, lapses: 1, factor: 2_200 }],
    },
    {
      id: 'n-onaka',
      noteTypeName: 'Basic',
      fieldValues: ['お腹 が 空いた', 'hungry'],
      cards: [{ deckName: 'Core Japanese', reps: 1, lapses: 0, factor: 2_500 }],
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

/** A collection with review counts stripped, used for the no-evidence path. */
export const NO_REVIEW_EVIDENCE_COLLECTION: FixtureCollection = {
  ...CONTRACT_COLLECTION,
  notes: CONTRACT_COLLECTION.notes.map((note) => ({
    ...note,
    cards: note.cards.map((card) => ({ ...card, reps: 0 })),
  })),
};

export function deckSeparatorChildren(deckNames: readonly string[], parent: string): boolean {
  return deckNames.some((name) => name.startsWith(`${parent}::`));
}

export function fieldValueOf(
  collection: FixtureCollection,
  note: FixtureNote,
  fieldName: string,
): string | undefined {
  const noteType = collection.noteTypes.find((type) => type.name === note.noteTypeName);
  if (noteType === undefined) {
    return undefined;
  }
  const ordinal = noteType.fieldNames.indexOf(fieldName);
  return ordinal < 0 ? undefined : note.fieldValues[ordinal];
}
