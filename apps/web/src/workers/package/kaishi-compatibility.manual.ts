import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { PackageProviderAdapter } from '../../app/infrastructure/anki/package/package-provider.adapter';
import { PackageWorkerClient } from '../../app/infrastructure/anki/package/package-worker.client';
import { extractVisibleText } from '../../app/domain/anki/field-extraction';
import { DomMarkupTextExtractor } from '../../app/infrastructure/anki/dom-markup-text';
import { collectExtraction, mappingFor } from '../../testing/anki-provider-contract';
import { createPackageHarness } from '../../testing/anki-package-harness';

/**
 * Real-collection compatibility check, run by hand.
 *
 * The committed fixtures are synthetic and license-safe, as the testing
 * specification requires, so nothing in the ordinary suite proves the pipeline
 * survives a real export with its real size, real note type, and real HTML.
 * This file does, against a deck that lives outside the repository.
 *
 * Run it with:
 *
 *   npx vitest run --config vitest.manual.config.ts
 *
 * It is not part of `npm run verify` and CI never sees it, because the deck it
 * needs is not distributable.
 */
const DECK_PATH = 'C:/Users/Tobias/Documents/Projects/monosai-data/Kaishi 1.5k.apkg';

describe('Kaishi 1.5k compatibility', () => {
  it('reads 150 reviewed entries from the real export', async () => {
    expect(existsSync(DECK_PATH)).toBe(true);

    const bytes = readFileSync(DECK_PATH);
    const harness = createPackageHarness();
    const provider = new PackageProviderAdapter(
      new PackageWorkerClient(harness.channel),
      {
        fileName: 'Kaishi 1.5k.apkg',
        bytes: () =>
          Promise.resolve(
            bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
          ),
      },
      'unused-in-tests',
    );

    const probed = await provider.probe();
    expect(probed.ok).toBe(true);
    if (!probed.ok) return;
    expect(probed.value.apiVersion).toContain('schema/18');
    expect(probed.value.limitations).toEqual([]);

    const discovered = await provider.discover();
    expect(discovered.ok).toBe(true);
    if (!discovered.ok) return;
    expect(discovered.value.decks.map((deck) => deck.name)).toContain('Kaishi 1.5k');
    const noteType = discovered.value.noteTypes.find((type) => type.name === 'Kaishi 1.5k+');
    expect(noteType?.fieldNames[0]).toBe('Word');

    const collected = await collectExtraction(provider, [
      mappingFor({
        deckName: 'Kaishi 1.5k',
        noteTypeName: 'Kaishi 1.5k+',
        expressionFieldName: 'Word',
      }),
    ]);
    expect(collected.failure).toBeNull();
    expect(collected.entries).toHaveLength(150);

    const extractor = new DomMarkupTextExtractor();
    const extracted = collected.entries.map((entry) =>
      extractVisibleText(entry.rawFieldValue, extractor),
    );
    expect(extracted.filter((result) => !result.ok)).toHaveLength(0);

    const expressions = extracted.flatMap((result) => (result.ok ? [result.value] : []));
    expect(expressions.slice(0, 3)).toEqual(['私', 'あなた', 'さん']);
    expect(new Set(expressions).size).toBeGreaterThanOrEqual(50);

    provider.dispose();
  }, 60_000);
});
