import { describe, expect, it } from 'vitest';
import {
  CONTRACT_COLLECTION,
  NO_REVIEW_EVIDENCE_COLLECTION,
} from '../../../../testing/anki-collection';
import {
  FakeAnkiConnectServer,
  type FakeServerOptions,
} from '../../../../testing/anki-connect-server';
import { collectExtraction, mappingFor } from '../../../../testing/anki-provider-contract';
import { AndroidConnectAdapter } from './android-connect.adapter';
import { AnkiConnectClient, DESKTOP_ENDPOINTS } from './connect-client';
import { DesktopConnectAdapter } from './desktop-connect.adapter';
import { representativeLocalDate } from './introduced-first-review';

const ANDROID_NOW = 1_800_000_000_000;
const DAY_MS = 86_400_000;

function serverAnd(options: FakeServerOptions = {}, collection = CONTRACT_COLLECTION) {
  const server = new FakeAnkiConnectServer(collection, options);
  const client = new AnkiConnectClient({
    endpoints: DESKTOP_ENDPOINTS,
    fetchFn: server.fetch,
    pageOrigin: 'http://localhost:4200',
    unreachableCode: 'not-running',
  });
  return { server, client };
}

describe('DesktopConnectAdapter', () => {
  it('samples visible fields through bounded read requests', async () => {
    const { server, client } = serverAnd();
    const adapter = new DesktopConnectAdapter(client);
    const catalog = await adapter.discover();
    expect(catalog.ok).toBe(true);
    if (!catalog.ok) return;
    const samples = await adapter.sampleFields(catalog.value);
    expect(samples.ok).toBe(true);
    if (!samples.ok) return;
    expect(samples.value.some((sample) => sample.fields['Expression'] === 'ねこ')).toBe(true);
    const reads = server.requests.filter((request) => request.action === 'notesInfo');
    expect(reads.length).toBeLessThanOrEqual(20);
    for (const read of reads)
      expect((read.params['notes'] as number[]).length).toBeLessThanOrEqual(8);
  });

  it('reports the AnkiConnect version it probed', async () => {
    const { server, client } = serverAnd({ version: 6 });
    const probed = await new DesktopConnectAdapter(client).probe();

    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(probed.value.apiVersion).toBe('6');
    expect(server.requests[0]?.action).toBe('requestPermission');
    expect(server.requests.some((request) => request.action === 'version')).toBe(false);
  });

  it('refuses when Anki has not granted permission', async () => {
    const { client } = serverAnd({ permission: 'denied' });
    const probed = await new DesktopConnectAdapter(client).probe();

    expect(probed.ok).toBe(false);
    if (probed.ok) return;
    expect(probed.error.code).toBe('permission-denied');
  });

  it('refuses an installation that requires an API key', async () => {
    const { client } = serverAnd({ requireApiKey: true });
    const probed = await new DesktopConnectAdapter(client).probe();

    expect(probed.ok).toBe(false);
    if (probed.ok) return;
    expect(probed.error.code).toBe('permission-denied');
    expect(probed.error.message).toContain('API key');
  });

  it('decides eligibility from review counts rather than from the search', async () => {
    const { server, client } = serverAnd();
    await collectExtraction(new DesktopConnectAdapter(client), [mappingFor()]);

    const search = server.requests.find((request) => request.action === 'findCards');
    expect(String(search?.params['query'])).not.toContain('is:');
    expect(server.requests.some((request) => request.action === 'cardsInfo')).toBe(true);
  });

  it('asks only for the notes whose cards proved a review', async () => {
    const { server, client } = serverAnd();
    await collectExtraction(new DesktopConnectAdapter(client), [mappingFor()]);

    const requested = server.requests
      .filter((request) => request.action === 'notesInfo')
      .flatMap((request) => (request.params['notes'] as number[] | undefined) ?? []);

    // 毎日 is note 3 and was never reviewed.
    expect(requested).not.toContain(3);
    expect(new Set(requested).size).toBe(requested.length);
  });

  it('carries optional lapses and ease signals from cardsInfo', async () => {
    const { client } = serverAnd();
    const collected = await collectExtraction(new DesktopConnectAdapter(client), [mappingFor()]);
    const neko = collected.entries.find((entry) => entry.rawFieldValue === '<b>ねこ</b>');

    expect(neko).toMatchObject({ reps: 3, lapseRatio: 1 / 3, easeFactor: 2_400 });
  });

  it('reads an optional meaning field from the same notesInfo response', async () => {
    const { client } = serverAnd();
    const collected = await collectExtraction(new DesktopConnectAdapter(client), [
      mappingFor({ meaningFieldName: 'Meaning' }),
    ]);
    const neko = collected.entries.find((entry) => entry.rawFieldValue === '<b>ねこ</b>');

    expect(neko).toMatchObject({ rawMeaning: 'cat' });
  });

  it('keeps working when a bridge omits optional scheduling columns', async () => {
    const collection = {
      ...CONTRACT_COLLECTION,
      notes: CONTRACT_COLLECTION.notes.map((note) => ({
        ...note,
        cards: note.cards.map(({ lapses: _lapses, factor: _factor, ...card }) => card),
      })),
    };
    const { client } = serverAnd({}, collection);
    const collected = await collectExtraction(new DesktopConnectAdapter(client), [mappingFor()]);
    const neko = collected.entries.find((entry) => entry.rawFieldValue === '<b>ねこ</b>');

    expect(neko).toMatchObject({ reps: 3 });
    expect(neko).not.toHaveProperty('lapseRatio');
    expect(neko).not.toHaveProperty('easeFactor');
  });

  it('reads the first review from the review log, ignoring a reschedule', async () => {
    const { client } = serverAnd();
    const collected = await collectExtraction(new DesktopConnectAdapter(client), [mappingFor()]);
    const neko = collected.entries.find((entry) => entry.rawFieldValue === '<b>ねこ</b>');

    // The fake writes an `ease` of zero a day before the first real answer, as
    // Anki does for a manual reschedule and for enabling FSRS.
    expect(neko).toMatchObject({ firstReviewedAt: 1_760_000_000_000, intervalDays: 23 });
  });

  it('asks for reviews only of the cards that survived eligibility', async () => {
    const { server, client } = serverAnd();
    await collectExtraction(new DesktopConnectAdapter(client), [mappingFor()]);
    const requested = server.requests
      .filter((request) => request.action === 'getReviewsOfCards')
      .flatMap((request) => (request.params['cards'] as number[] | undefined) ?? []);
    const suspended = server.requests
      .filter((request) => request.action === 'cardsInfo')
      .flatMap((request) => (request.params['cards'] as number[] | undefined) ?? []);

    expect(requested.length).toBeGreaterThan(0);
    expect(requested.length).toBeLessThan(suspended.length);
  });

  it('keeps the refresh going when the endpoint cannot serve review history', async () => {
    const { server, client } = serverAnd({ unimplementedActions: ['getReviewsOfCards'] });
    const collected = await collectExtraction(new DesktopConnectAdapter(client), [mappingFor()]);
    const neko = collected.entries.find((entry) => entry.rawFieldValue === '<b>ねこ</b>');

    // Losing an optional signal must not cost the learner their vocabulary.
    expect(neko).toMatchObject({ reps: 3, intervalDays: 23 });
    expect(neko).not.toHaveProperty('firstReviewedAt');
    expect(collected.warnings).toHaveLength(1);
    // One refusal is enough to stop asking for the rest of the run.
    expect(
      server.requests.filter((request) => request.action === 'getReviewsOfCards'),
    ).toHaveLength(1);
  });

  it('degrades the same way when review history fails or is malformed', async () => {
    for (const options of [
      { failingActions: ['getReviewsOfCards'] },
      { malformedActions: ['getReviewsOfCards'] },
    ]) {
      const { client } = serverAnd(options);
      const collected = await collectExtraction(new DesktopConnectAdapter(client), [mappingFor()]);
      const neko = collected.entries.find((entry) => entry.rawFieldValue === '<b>ねこ</b>');

      expect(neko).toMatchObject({ reps: 3 });
      expect(neko).not.toHaveProperty('firstReviewedAt');
    }
  });

  it('stops at the first failure instead of continuing to the next mapping', async () => {
    const { client } = serverAnd({ failingActions: ['findCards'] });
    const collected = await collectExtraction(new DesktopConnectAdapter(client), [
      mappingFor(),
      mappingFor(),
    ]);

    expect(collected.entries).toHaveLength(0);
    expect(collected.failure?.kind).toBe('failed');
  });

  it('surfaces a note-type discovery failure from the field probe as a warning-free catalog', async () => {
    const { client } = serverAnd({ failingActions: ['modelFieldNames'] });
    const discovered = await new DesktopConnectAdapter(client).discover();

    expect(discovered.ok).toBe(true);
    if (!discovered.ok) return;
    // The note type is still listed, so a mapping pointing at it reads as
    // stale rather than silently disappearing from the editor.
    expect(discovered.value.noteTypes.map((noteType) => noteType.name)).toContain('Basic');
    expect(discovered.value.noteTypes[0].fieldNames).toEqual([]);
  });

  it('reports a failed deck discovery rather than an empty catalog', async () => {
    const { client } = serverAnd({ failingActions: ['deckNames'] });
    const discovered = await new DesktopConnectAdapter(client).discover();

    expect(discovered.ok).toBe(false);
    if (discovered.ok) return;
    expect(discovered.error.code).toBe('query-failed');
  });
});

describe('AndroidConnectAdapter', () => {
  it('records the capabilities it proved', async () => {
    const { client } = serverAnd();
    const probed = await new AndroidConnectAdapter(client).probe();

    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(probed.value.canFilterReviewed).toBe(true);
    expect(probed.value.canReadNoteFields).toBe(true);
    expect(probed.value.limitations).toEqual([]);
  });

  it('refuses to build a snapshot when card details are unavailable', async () => {
    const { client } = serverAnd({ unsupportedActions: ['cardsInfo'] });
    const probed = await new AndroidConnectAdapter(client).probe();

    expect(probed.ok).toBe(false);
    if (probed.ok) return;
    expect(probed.error.code).toBe('review-evidence-unsupported');
  });

  it('recovers the first reviewed Anki day without asking for a review log', async () => {
    // AnkiDroid's content provider exposes no review log, so asking would spend
    // a guaranteed refusal and a misleading warning on every refresh.
    const { server, client } = serverAnd({ now: ANDROID_NOW });
    const collected = await collectExtraction(
      new AndroidConnectAdapter(client, () => ANDROID_NOW),
      [mappingFor()],
    );

    expect(server.requests.filter((request) => request.action === 'getReviewsOfCards')).toEqual([]);
    expect(collected.warnings).toEqual([]);

    expect(
      server.requests.some(
        (request) =>
          request.action === 'findCards' && String(request.params['query']).includes('introduced:'),
      ),
    ).toBe(true);
    const neko = collected.entries.find((entry) => entry.rawFieldValue === '<b>ねこ</b>');
    const introducedDays = Math.floor((ANDROID_NOW - 1_760_000_000_000) / DAY_MS) + 1;
    expect(neko).toMatchObject({
      intervalDays: 23,
      firstReviewedAt: representativeLocalDate(introducedDays, ANDROID_NOW),
      firstReviewedPrecision: 'anki-day',
    });
  });

  it('keeps the vocabulary and warns once when introduced search is unavailable', async () => {
    const { server, client } = serverAnd({ failingSearchTerms: ['introduced:'] });
    const collected = await collectExtraction(new AndroidConnectAdapter(client), [mappingFor()]);

    expect(collected.entries.length).toBeGreaterThan(0);
    expect(collected.warnings).toHaveLength(1);
    expect(collected.entries.every((entry) => entry.firstReviewedAt === undefined)).toBe(true);
    expect(
      server.requests.filter(
        (request) =>
          request.action === 'findCards' && String(request.params['query']).includes('introduced:'),
      ),
    ).toHaveLength(1);
  });

  it('refuses to build a snapshot when note fields are unavailable', async () => {
    const { client } = serverAnd({ unsupportedActions: ['notesInfo'] });
    const probed = await new AndroidConnectAdapter(client).probe();

    expect(probed.ok).toBe(false);
    if (probed.ok) return;
    expect(probed.error.code).toBe('review-evidence-unsupported');
  });

  it('extracts nothing once review evidence is unsupported', async () => {
    const { client } = serverAnd({ unsupportedActions: ['cardsInfo'] });
    const collected = await collectExtraction(new AndroidConnectAdapter(client), [mappingFor()]);

    expect(collected.entries).toHaveLength(0);
    expect(collected.failure?.kind).toBe('failed');
    if (collected.failure?.kind !== 'failed') return;
    expect(collected.failure.error.code).toBe('review-evidence-unsupported');
  });

  it('does not tell the learner to install or configure AnkiDroid', async () => {
    const { client } = serverAnd({ unsupportedActions: ['cardsInfo'] });
    const probed = await new AndroidConnectAdapter(client).probe();

    expect(probed.ok).toBe(false);
    if (probed.ok) return;
    const message = probed.error.message.toLowerCase();
    expect(message).not.toContain('install');
    expect(message).not.toContain('ankidroid');
    expect(message).toContain('package');
  });

  it('records a limitation without refusing when discovery is partly unavailable', async () => {
    const { client } = serverAnd({ failingActions: ['deckNames'] });
    const probed = await new AndroidConnectAdapter(client).probe();

    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(probed.value.canDiscoverDecks).toBe(false);
    expect(probed.value.limitations.map((limitation) => limitation.code)).toContain(
      'decks-unavailable',
    );
  });

  it('uses a smaller batch size than the desktop adapter', async () => {
    const { client } = serverAnd();
    const probed = await new AndroidConnectAdapter(client).probe();

    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(probed.value.maxBatchSize).toBe(50);
  });

  it('warns about a collection with no reviews at all', async () => {
    const { client } = serverAnd({}, NO_REVIEW_EVIDENCE_COLLECTION);
    const collected = await collectExtraction(new AndroidConnectAdapter(client), [mappingFor()]);

    expect(collected.entries).toHaveLength(0);
    expect(collected.failure).toBeNull();
  });
});
