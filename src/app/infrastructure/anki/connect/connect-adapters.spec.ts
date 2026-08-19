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
  it('reports the AnkiConnect version it probed', async () => {
    const { client } = serverAnd({ version: 6 });
    const probed = await new DesktopConnectAdapter(client).probe();

    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(probed.value.apiVersion).toBe('6');
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
    expect(discovered.error.code).toBe('deck-discovery-failed');
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
