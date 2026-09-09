import { describe, expect, it } from 'vitest';
import type { AnkiExtractionEvent, ExtractedEntry } from '../../../domain/anki/anki-provider';
import type { PracticeObservationBasis } from '../../../domain/anki/practice-evidence';
import type { FixtureCollection } from '../../../../testing/anki-collection';
import {
  FakeAnkiConnectServer,
  type FakeServerOptions,
} from '../../../../testing/anki-connect-server';
import { mappingFor } from '../../../../testing/anki-provider-contract';
import { AnkiConnectClient, DESKTOP_ENDPOINTS } from './connect-client';
import { extractMapping } from './connect-extraction';

/**
 * A collection built around the cases that separate real recent practice from
 * an estimate. Every note carries one distinguishing fact and nothing else.
 */
const COLLECTION: FixtureCollection = {
  deckNames: ['Core Japanese', 'Core Japanese::Verbs', 'Practice'],
  noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
  notes: [
    {
      // Answered this morning while still in a learning step.
      id: 'n-today',
      noteTypeName: 'Basic',
      fieldValues: ['ねこ', 'cat'],
      cards: [
        {
          deckName: 'Core Japanese',
          reps: 4,
          lastAnsweredDaysAgo: 0,
          cardType: 1,
          intervalDays: 1,
        },
      ],
    },
    {
      // A premade deck the learner reset and started again months later. Its
      // repetitions, interval and first review all describe the old life; only
      // the answer it received today says it is being practised now.
      id: 'n-restarted',
      noteTypeName: 'Basic',
      fieldValues: ['いぬ', 'dog'],
      cards: [
        {
          deckName: 'Core Japanese',
          reps: 41,
          lapses: 12,
          firstReviewedAt: 1_600_000_000_000,
          intervalDays: 1,
          cardType: 1,
          lastAnsweredDaysAgo: 0,
          answeredAgain: true,
        },
      ],
    },
    {
      // Long settled, answered five days ago: recent, but not in the narrow pools.
      id: 'n-mature',
      noteTypeName: 'Basic',
      fieldValues: ['みず', 'water'],
      cards: [
        {
          deckName: 'Core Japanese',
          reps: 30,
          intervalDays: 210,
          cardType: 2,
          lastAnsweredDaysAgo: 5,
          answeredHard: true,
        },
      ],
    },
    {
      // A short interval with no recent answer: due soon, not practised.
      id: 'n-due-soon',
      noteTypeName: 'Basic',
      fieldValues: ['やま', 'mountain'],
      cards: [{ deckName: 'Core Japanese', reps: 6, intervalDays: 2, cardType: 2 }],
    },
    {
      // Two templates of one note that disagree: one answered today and settled,
      // the other untouched and still in learning.
      id: 'n-siblings',
      noteTypeName: 'Basic',
      fieldValues: ['うみ', 'sea'],
      cards: [
        {
          deckName: 'Core Japanese',
          reps: 9,
          intervalDays: 90,
          cardType: 2,
          lastAnsweredDaysAgo: 0,
        },
        { deckName: 'Core Japanese', reps: 2, intervalDays: 1, cardType: 1 },
      ],
    },
    {
      // Studied today out of a filtered deck, which does not change where it lives.
      id: 'n-filtered',
      noteTypeName: 'Basic',
      fieldValues: ['そら', 'sky'],
      cards: [
        {
          deckName: 'Core Japanese',
          filteredDeckName: 'Practice',
          reps: 7,
          cardType: 2,
          intervalDays: 3,
          lastAnsweredDaysAgo: 0,
        },
      ],
    },
    {
      // Suspended, so its recent answer is not the learner's current vocabulary.
      id: 'n-suspended',
      noteTypeName: 'Basic',
      fieldValues: ['ゆき', 'snow'],
      cards: [{ deckName: 'Core Japanese', reps: 5, suspended: true, lastAnsweredDaysAgo: 0 }],
    },
  ],
};

interface Extraction {
  readonly entries: readonly ExtractedEntry[];
  readonly basis: PracticeObservationBasis | undefined;
  readonly events: readonly AnkiExtractionEvent[];
  readonly requests: readonly { action: string; params: Record<string, unknown> }[];
}

async function extract(options: FakeServerOptions = {}): Promise<Extraction> {
  const server = new FakeAnkiConnectServer(COLLECTION, options);
  const client = new AnkiConnectClient({
    endpoints: DESKTOP_ENDPOINTS,
    fetchFn: server.fetch,
    pageOrigin: 'http://localhost:4200',
    unreachableCode: 'not-running',
  });
  const events: AnkiExtractionEvent[] = [];
  for await (const event of extractMapping(client, mappingFor(), 200)) {
    events.push(event);
  }
  const observed = events.find((event) => event.kind === 'observed');
  return {
    entries: events.flatMap((event) => (event.kind === 'entry' ? [event.entry] : [])),
    basis: observed?.kind === 'observed' ? observed.basis : undefined,
    events,
    requests: server.requests,
  };
}

/** Asserts the capture reported what it could establish, then returns it. */
function basisOf(extraction: Extraction): PracticeObservationBasis {
  const { basis } = extraction;
  if (basis === undefined) {
    throw new Error('The capture reported no observation.');
  }
  return basis;
}

function evidenceOf(extraction: Extraction, expression: string) {
  return extraction.entries.find((entry) => entry.rawFieldValue === expression)?.practice;
}

describe('recent practice from Anki', () => {
  it('asks Anki the five questions, each narrowed to the mapping', async () => {
    const { requests } = await extract();
    const searches = requests
      .filter((request) => request.action === 'findCards')
      .map((request) => request.params['query']);
    expect(searches).toEqual([
      '"deck:Core Japanese" "note:Basic" -"deck:Core Japanese::*"',
      '("deck:Core Japanese" "note:Basic" -"deck:Core Japanese::*") rated:1',
      '("deck:Core Japanese" "note:Basic" -"deck:Core Japanese::*") rated:3',
      '("deck:Core Japanese" "note:Basic" -"deck:Core Japanese::*") rated:7',
      '("deck:Core Japanese" "note:Basic" -"deck:Core Japanese::*") rated:7:1',
      '("deck:Core Japanese" "note:Basic" -"deck:Core Japanese::*") rated:7:2',
    ]);
  });

  it('places a word answered today in the narrowest window', async () => {
    expect(evidenceOf(await extract(), 'ねこ')).toMatchObject({ answeredWithinDays: 1 });
  });

  it('finds a restarted deck through its new answer, not its old history', async () => {
    // Forty-one repetitions, a first review from years ago and a one-day
    // interval describe the life before the reset. The answer today is the only
    // thing that says the learner is practising it now, and it is what Anki was
    // asked about.
    const evidence = evidenceOf(await extract(), 'いぬ');
    expect(evidence).toMatchObject({
      answeredWithinDays: 1,
      answeredAgain: true,
      recentlyAnsweredWhileLearning: true,
    });
  });

  it('keeps a word answered five days ago out of the narrow pools', async () => {
    expect(evidenceOf(await extract(), 'みず')).toMatchObject({
      answeredWithinDays: 7,
      answeredHard: true,
    });
    expect(evidenceOf(await extract(), 'みず')).not.toMatchObject({ answeredWithinDays: 1 });
  });

  it('does not call a short interval recent practice', async () => {
    // Due in two days is a prediction about the future, not evidence that the
    // learner opened Anki. Treating it as recency is the mistake this replaces.
    expect(evidenceOf(await extract(), 'やま')).toBeUndefined();
  });

  it('correlates learning state with the card that was actually answered', async () => {
    // One sibling was answered today and is settled; the other is in learning
    // and was not answered. Neither card is both, so neither is the note.
    const evidence = evidenceOf(await extract(), 'うみ');
    expect(evidence).toMatchObject({ answeredWithinDays: 1 });
    expect(evidence?.recentlyAnsweredWhileLearning).toBeUndefined();
  });

  it('keeps a card studied from a filtered deck inside its own mapping', async () => {
    expect(evidenceOf(await extract(), 'そら')).toMatchObject({
      answeredWithinDays: 1,
      recentlyAnsweredWithShortInterval: true,
    });
  });

  it('never lets a suspended card contribute its recent answer', async () => {
    const { entries } = await extract();
    expect(entries.map((entry) => entry.rawFieldValue)).not.toContain('ゆき');
  });

  it('reports what the capture could establish', async () => {
    const basis = basisOf(await extract());
    expect(basis).toMatchObject({
      recentAnswers: 'available',
      recentDifficulty: 'available',
      learningState: 'available',
      windowBasis: 'anki-study-days',
    });
    // No card in this collection carries FSRS data, so nothing proved the column.
    expect(basis.fsrsDifficulty).toBe('unsupported');
  });
});

describe('a source that cannot answer', () => {
  it('keeps every word when the searches are refused, and says so', async () => {
    const extraction = await extract({ failingSearchTerms: ['rated:'] });
    // The vocabulary is what the learner reviewed; that question was answered.
    expect(extraction.entries.map((entry) => entry.rawFieldValue)).toContain('ねこ');
    const basis = basisOf(extraction);
    expect(basis.recentAnswers).not.toBe('available');
    expect(basis.recentDifficulty).not.toBe('available');
  });

  it('leaves no word carrying evidence the capture could not establish', async () => {
    const { entries } = await extract({ failingSearchTerms: ['rated:'] });
    expect(entries.every((entry) => entry.practice === undefined)).toBe(true);
  });

  it('gives up the vocabulary itself only when the scope search fails', async () => {
    // A refused activity search costs the recommendation; a refused scope search
    // is the source, and the two must not produce the same outcome.
    const refused = await extract({ failingSearchTerms: ['rated:'] });
    expect(basisOf(refused).recentAnswers).toBe('unavailable');
    expect(refused.entries.length).toBeGreaterThan(0);
    // A source that could not be read at all reports no observation to record.
    const absent = await extract({ unsupportedActions: ['findCards'] });
    expect(absent.entries).toEqual([]);
    expect(absent.basis).toBeUndefined();
    expect(absent.events.at(-1)?.kind).toBe('failed');
  });
});
