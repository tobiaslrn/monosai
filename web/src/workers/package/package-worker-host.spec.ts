import { describe, expect, it } from 'vitest';
import {
  PACKAGE_PROTOCOL_VERSION,
  type PackageRequest,
  type PackageResponseMessage,
  type ResultFor,
} from '../../app/infrastructure/anki/package/package-protocol';
import {
  createPackageHarness,
  readAnkiFixture,
  type AnkiFixtureName,
  type PackageHarness,
} from '../../testing/anki-package-harness';
import { DEFAULT_PACKAGE_LIMITS } from './resource-limits';

async function send(
  harness: PackageHarness,
  requestId: string,
  request: PackageRequest,
  protocolVersion = PACKAGE_PROTOCOL_VERSION,
): Promise<PackageResponseMessage> {
  await harness.host.handleMessage({ protocolVersion, requestId, request });
  const response = harness.responses.find((message) => message.requestId === requestId);
  if (response === undefined) {
    throw new Error(`no response for ${requestId}`);
  }
  return response;
}

async function open(
  harness: PackageHarness,
  fixture: AnkiFixtureName,
): Promise<PackageResponseMessage> {
  return send(harness, 'open-1', {
    operation: 'open',
    payload: { archive: readAnkiFixture(fixture), wasmUrl: 'unused-in-tests' },
  });
}

function openValue(response: PackageResponseMessage): ResultFor<'open'> {
  if (!response.outcome.ok) {
    throw new Error(`open failed: ${response.outcome.error.code}`);
  }
  return response.outcome.result.value as ResultFor<'open'>;
}

const BASIC_EXPRESSION = {
  deckName: 'Core Japanese',
  deckScope: 'deck-only',
  noteTypeName: 'Basic',
  expressionFieldName: 'Expression',
} as const;

describe('PackageWorkerHost', () => {
  describe('opening supported packages', () => {
    it('opens a current zstd-compressed schema 18 export', async () => {
      const harness = createPackageHarness();
      const value = openValue(await open(harness, 'contract-schema18-zstd.apkg'));

      expect(value.memberName).toBe('collection.anki21b');
      expect(value.compression).toBe('zstd');
      expect(value.packageVersion).toBe(3);
      expect(value.schemaVersion).toBe(18);
      expect(value.layout).toBe('normalized');
      expect(value.hasAnyReviewEvidence).toBe(true);
    });

    it('prefers the real collection over the legacy upgrade stub beside it', async () => {
      const harness = createPackageHarness();
      const value = openValue(await open(harness, 'contract-schema18-zstd.apkg'));
      expect(value.memberName).not.toBe('collection.anki2');
      expect(value.noteTypeCount).toBe(2);
    });

    it('opens a deflate-compressed legacy-support export', async () => {
      const harness = createPackageHarness();
      const value = openValue(await open(harness, 'contract-schema18-deflate.apkg'));

      expect(value.memberName).toBe('collection.anki21');
      expect(value.compression).toBe('none');
      expect(value.packageVersion).toBe(2);
      expect(value.schemaVersion).toBe(18);
    });

    it('opens a pre-18 collection stored as JSON in the col row', async () => {
      const harness = createPackageHarness();
      const value = openValue(await open(harness, 'contract-schema11.apkg'));

      expect(value.memberName).toBe('collection.anki2');
      expect(value.schemaVersion).toBe(11);
      expect(value.layout).toBe('legacy-json');
      expect(value.packageVersion).toBeNull();
    });

    it('opens a .colpkg the same way as an .apkg', async () => {
      const harness = createPackageHarness();
      const value = openValue(await open(harness, 'contract-schema18-zstd.colpkg'));
      expect(value.schemaVersion).toBe(18);
    });

    it('counts media members without reading them', async () => {
      const harness = createPackageHarness();
      const value = openValue(await open(harness, 'contract-schema18-zstd.apkg'));
      expect(value.mediaEntryCount).toBe(2);
    });

    it('reports a collection with no review history as such', async () => {
      const harness = createPackageHarness();
      const value = openValue(await open(harness, 'no-review-evidence.apkg'));
      expect(value.hasAnyReviewEvidence).toBe(false);
    });
  });

  describe('rejecting unusable packages', () => {
    const cases: readonly [AnkiFixtureName, string][] = [
      ['no-collection.apkg', 'package-schema-unsupported'],
      ['not-a-database.apkg', 'package-schema-unsupported'],
      ['unsupported-compression.apkg', 'package-schema-unsupported'],
      ['missing-reps-column.apkg', 'package-review-data-missing'],
      ['unsafe-path.apkg', 'package-unreadable'],
      ['encrypted.apkg', 'package-unreadable'],
      ['truncated.apkg', 'package-unreadable'],
      ['decompression-bomb.apkg', 'package-resource-limit'],
    ];

    for (const [fixture, code] of cases) {
      it(`reports ${code} for ${fixture}`, async () => {
        const harness = createPackageHarness();
        const response = await open(harness, fixture);
        expect(response.outcome.ok).toBe(false);
        if (response.outcome.ok) return;
        expect(response.outcome.error.code).toBe(code);
        expect(response.outcome.error.message.length).toBeGreaterThan(0);
      });
    }

    it('refuses an archive larger than the configured limit', async () => {
      const harness = createPackageHarness({
        limits: { ...DEFAULT_PACKAGE_LIMITS, maxArchiveBytes: 100 },
      });
      const response = await open(harness, 'contract-schema18-zstd.apkg');
      expect(response.outcome.ok).toBe(false);
      if (response.outcome.ok) return;
      expect(response.outcome.error.code).toBe('package-resource-limit');
    });

    it('refuses a collection that expands past the member limit', async () => {
      const harness = createPackageHarness({
        limits: { ...DEFAULT_PACKAGE_LIMITS, maxMemberBytes: 1_000 },
      });
      const response = await open(harness, 'contract-schema18-zstd.apkg');
      expect(response.outcome.ok).toBe(false);
      if (response.outcome.ok) return;
      expect(response.outcome.error.code).toBe('package-resource-limit');
    });

    it('leaves no database open when the collection is rejected', async () => {
      const harness = createPackageHarness();
      await open(harness, 'missing-reps-column.apkg');
      expect(harness.openedDatabases()).toBe(harness.closedDatabases());
    });
  });

  describe('discovery', () => {
    it('lists only decks holding cards, with their note types and fields', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      const response = await send(harness, 'd-1', { operation: 'discover', payload: {} });

      expect(response.outcome.ok).toBe(true);
      if (!response.outcome.ok) return;
      const catalog = response.outcome.result.value as ResultFor<'discover'>;

      // `Default` and `Unused` hold no cards: an export carries them, but
      // neither can produce vocabulary, so neither is offered.
      expect(catalog.decks.map((deck) => deck.name).sort()).toEqual([
        'Core Japanese',
        'Core Japanese::Verbs',
      ]);
      expect(catalog.decks.find((deck) => deck.name === 'Core Japanese')?.hasChildren).toBe(true);
      expect(catalog.decks.find((deck) => deck.name === 'Core Japanese::Verbs')?.hasChildren).toBe(
        false,
      );
      expect(catalog.noteTypes.find((type) => type.name === 'Basic')?.fieldNames).toEqual([
        'Expression',
        'Meaning',
      ]);
    });

    it('keeps a parent deck whose cards all sit in its subdecks', async () => {
      const harness = createPackageHarness();
      await open(harness, 'nested-decks.apkg');
      const response = await send(harness, 'd-1', { operation: 'discover', payload: {} });

      expect(response.outcome.ok).toBe(true);
      if (!response.outcome.ok) return;
      const catalog = response.outcome.result.value as ResultFor<'discover'>;

      expect(catalog.decks.map((deck) => deck.name).sort()).toEqual([
        'Japanese',
        'Japanese::Nouns',
        'Japanese::Verbs',
      ]);
      expect(catalog.decks.find((deck) => deck.name === 'Japanese')?.hasChildren).toBe(true);
    });

    it('offers the home deck rather than the filtered deck a card was studied in', async () => {
      const harness = createPackageHarness();
      await open(harness, 'filtered-deck.apkg');
      const response = await send(harness, 'd-1', { operation: 'discover', payload: {} });

      expect(response.outcome.ok).toBe(true);
      if (!response.outcome.ok) return;
      const catalog = response.outcome.result.value as ResultFor<'discover'>;

      expect(catalog.decks.map((deck) => deck.name)).toEqual(['Core Japanese']);
    });

    it('reads the same catalog out of the legacy JSON layout', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema11.apkg');
      const response = await send(harness, 'd-1', { operation: 'discover', payload: {} });

      expect(response.outcome.ok).toBe(true);
      if (!response.outcome.ok) return;
      const catalog = response.outcome.result.value as ResultFor<'discover'>;
      expect(catalog.decks.map((deck) => deck.name)).toContain('Core Japanese::Verbs');
      expect(catalog.noteTypes.find((type) => type.name === 'Sentence')?.fieldNames).toEqual([
        'Front',
        'Back',
      ]);
    });

    it('refuses to discover before a package is open', async () => {
      const harness = createPackageHarness();
      const response = await send(harness, 'd-1', { operation: 'discover', payload: {} });
      expect(response.outcome.ok).toBe(false);
    });
  });

  describe('extraction', () => {
    async function extract(
      harness: PackageHarness,
      payload: Extract<PackageRequest, { operation: 'extract' }>['payload'],
    ): Promise<ResultFor<'extract'>> {
      const response = await send(harness, `e-${payload.noteTypeName}-${payload.deckScope}`, {
        operation: 'extract',
        payload,
      });
      if (!response.outcome.ok) {
        throw new Error(`extract failed: ${response.outcome.error.code}`);
      }
      return response.outcome.result.value as ResultFor<'extract'>;
    }

    it('returns only reviewed notes of the selected note type and deck', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      const result = await extract(harness, BASIC_EXPRESSION);

      expect(result.fields.map((field) => field.rawFieldValue)).toEqual([
        '<b>ねこ</b>',
        'ねこ',
        '   ',
        '見る',
        '<script>alert(1)</script>犬',
        'お腹 が 空いた',
      ]);
      expect(result.examined).toBe(6);
    });

    it('includes subdecks only when the mapping asks for them', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');

      const deckOnly = await extract(harness, BASIC_EXPRESSION);
      expect(deckOnly.fields.map((field) => field.rawFieldValue)).not.toContain('走る');

      const withSubdecks = await extract(harness, {
        ...BASIC_EXPRESSION,
        deckScope: 'deck-and-subdecks',
      });
      expect(withSubdecks.fields.map((field) => field.rawFieldValue)).toContain('走る');
    });

    it('reads the selected field rather than the first one', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      const result = await extract(harness, {
        ...BASIC_EXPRESSION,
        expressionFieldName: 'Meaning',
      });
      expect(result.fields.map((field) => field.rawFieldValue)).toContain('to see');
    });

    it('returns normalized scheduling signals when package card columns exist', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      const result = await extract(harness, BASIC_EXPRESSION);

      const neko = result.fields.find((field) => field.rawFieldValue === '<b>ねこ</b>');
      expect(neko).toMatchObject({ reps: 3, lapseRatio: 1 / 3, easeFactor: 2_400 });

      const plainNeko = result.fields.find((field) => field.rawFieldValue === 'ねこ');
      expect(plainNeko).toMatchObject({ reps: 1, lapseRatio: 0 });
      expect(plainNeko).not.toHaveProperty('easeFactor');

      const legacyHarness = createPackageHarness();
      await open(legacyHarness, 'contract-schema11.apkg');
      const legacy = await extract(legacyHarness, BASIC_EXPRESSION);
      expect(legacy.fields.find((field) => field.rawFieldValue === '<b>ねこ</b>')).toMatchObject({
        reps: 3,
        lapseRatio: 1 / 3,
        easeFactor: 2_400,
      });
    });

    it('counts a review made in a filtered deck against the card home deck', async () => {
      const harness = createPackageHarness();
      await open(harness, 'filtered-deck.apkg');
      const result = await extract(harness, BASIC_EXPRESSION);
      expect(result.fields.map((field) => field.rawFieldValue)).toEqual(['勉強']);
    });

    it('produces nothing from a collection with no review history', async () => {
      const harness = createPackageHarness();
      await open(harness, 'no-review-evidence.apkg');
      const result = await extract(harness, BASIC_EXPRESSION);
      expect(result.fields).toHaveLength(0);
      expect(result.examined).toBe(0);
    });

    it('gives the same answers from the legacy JSON layout', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema11.apkg');
      const result = await extract(harness, BASIC_EXPRESSION);
      expect(result.fields.map((field) => field.rawFieldValue)).toEqual([
        '<b>ねこ</b>',
        'ねこ',
        '   ',
        '見る',
        '<script>alert(1)</script>犬',
        'お腹 が 空いた',
      ]);
    });

    it('reports a note type that is no longer present', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      const response = await send(harness, 'x-1', {
        operation: 'extract',
        payload: { ...BASIC_EXPRESSION, noteTypeName: 'Gone' },
      });
      expect(response.outcome.ok).toBe(false);
      if (response.outcome.ok) return;
      expect(response.outcome.error.code).toBe('note-type-discovery-failed');
    });

    it('reports a field that is no longer part of the note type', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      const response = await send(harness, 'x-1', {
        operation: 'extract',
        payload: { ...BASIC_EXPRESSION, expressionFieldName: 'Gone' },
      });
      expect(response.outcome.ok).toBe(false);
      if (response.outcome.ok) return;
      expect(response.outcome.error.code).toBe('field-discovery-failed');
    });
  });

  describe('protocol and lifecycle', () => {
    it('refuses to answer a client on a different protocol version', async () => {
      const harness = createPackageHarness();
      const response = await send(
        harness,
        'v-1',
        { operation: 'discover', payload: {} },
        PACKAGE_PROTOCOL_VERSION + 1,
      );
      expect(response.outcome.ok).toBe(false);
      if (response.outcome.ok) return;
      expect(response.outcome.error.code).toBe('unsupported-api');
    });

    it('rejects an unusable message without throwing', async () => {
      const harness = createPackageHarness();
      await harness.host.handleMessage({ requestId: 'bad-1', nonsense: true });
      expect(harness.responses[0].outcome.ok).toBe(false);
    });

    it('answers a cancelled request with cancelled instead of a stale result', async () => {
      const harness = createPackageHarness();
      const pending = harness.host.handleMessage({
        protocolVersion: PACKAGE_PROTOCOL_VERSION,
        requestId: 'slow-1',
        request: {
          operation: 'open',
          payload: {
            archive: readAnkiFixture('contract-schema18-zstd.apkg'),
            wasmUrl: 'unused-in-tests',
          },
        },
      });
      await harness.host.handleMessage({
        protocolVersion: PACKAGE_PROTOCOL_VERSION,
        requestId: 'cancel-1',
        request: { operation: 'cancel', payload: { targetRequestId: 'slow-1' } },
      });
      await pending;

      const response = harness.responses.find((message) => message.requestId === 'slow-1');
      expect(response?.outcome.ok).toBe(false);
      if (response === undefined || response.outcome.ok) return;
      expect(response.outcome.error.code).toBe('cancelled');
    });

    it('closes the database and stops answering after close', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      expect(harness.openedDatabases()).toBe(1);

      await send(harness, 'c-1', { operation: 'close', payload: {} });
      expect(harness.closedDatabases()).toBe(1);

      const afterClose = await send(harness, 'd-2', { operation: 'discover', payload: {} });
      expect(afterClose.outcome.ok).toBe(false);
    });

    it('closes the previous database when a second package is opened', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      await send(harness, 'open-2', {
        operation: 'open',
        payload: {
          archive: readAnkiFixture('contract-schema11.apkg'),
          wasmUrl: 'unused-in-tests',
        },
      });
      expect(harness.openedDatabases()).toBe(2);
      expect(harness.closedDatabases()).toBe(1);
    });

    it('treats closing twice as a no-op', async () => {
      const harness = createPackageHarness();
      await open(harness, 'contract-schema18-zstd.apkg');
      await send(harness, 'c-1', { operation: 'close', payload: {} });
      const second = await send(harness, 'c-2', { operation: 'close', payload: {} });
      expect(second.outcome.ok).toBe(true);
      expect(harness.closedDatabases()).toBe(1);
    });
  });
});
