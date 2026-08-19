import { describe, expect, it } from 'vitest';
import type {
  AnkiExtractionEvent,
  AnkiVocabularyProvider,
  ExtractedEntry,
} from '../app/domain/anki/anki-provider';
import { canDiscover, canRefresh } from '../app/domain/anki/capabilities';
import { extractVisibleText } from '../app/domain/anki/field-extraction';
import { resolveMappings } from '../app/domain/anki/mapping-validation';
import { DomMarkupTextExtractor } from '../app/infrastructure/anki/dom-markup-text';
import { sourceMappingId } from '../app/domain/shared/ids';
import type { AnkiProviderKind } from '../app/domain/vocabulary/snapshot';
import type { DeckScope, SourceMapping } from '../app/domain/vocabulary/source-mapping';
import { CONTRACT_COLLECTION } from './anki-collection';

/**
 * How a suite gets a provider for one fixture collection.
 *
 * Adapters need setup and teardown of very different kinds — a worker, a fake
 * fetch, nothing at all — so the contract asks only for a provider and a way to
 * let go of it.
 */
export interface ProviderUnderTest {
  readonly provider: AnkiVocabularyProvider;
  teardown?(): Promise<void> | void;
}

/** Creates one provider instance for a run of the suite. */
export type ProviderFactory = () => Promise<ProviderUnderTest> | ProviderUnderTest;

export interface ProviderContractSetup {
  /** A provider over `CONTRACT_COLLECTION`. */
  readonly standard: ProviderFactory;
  /**
   * A provider over the same collection with every review count removed.
   *
   * Providers that cannot represent this state — because they always know the
   * review counts — omit it and the eligibility-evidence case is skipped.
   */
  readonly withoutReviewEvidence?: ProviderFactory;
}

export function mappingFor(overrides: Partial<SourceMapping> = {}): SourceMapping {
  return {
    id: sourceMappingId('11111111-1111-4111-8111-111111111111'),
    providerKind: 'package',
    deckName: 'Core Japanese',
    deckScope: 'deck-only',
    noteTypeName: 'Basic',
    expressionFieldName: 'Expression',
    enabled: true,
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

interface CollectedExtraction {
  readonly entries: readonly ExtractedEntry[];
  readonly warnings: readonly string[];
  readonly events: readonly AnkiExtractionEvent[];
  readonly failure: AnkiExtractionEvent | null;
}

export async function collectExtraction(
  provider: AnkiVocabularyProvider,
  mappings: readonly SourceMapping[],
  signal?: AbortSignal,
): Promise<CollectedExtraction> {
  const entries: ExtractedEntry[] = [];
  const warnings: string[] = [];
  const events: AnkiExtractionEvent[] = [];
  let failure: AnkiExtractionEvent | null = null;

  for await (const event of provider.extractReviewed(mappings, signal)) {
    events.push(event);
    if (event.kind === 'entry') {
      entries.push(event.entry);
    } else if (event.kind === 'warning') {
      warnings.push(event.message);
    } else if (event.kind === 'failed') {
      failure = event;
      break;
    }
  }

  return { entries, warnings, events, failure };
}

/** Visible expressions an extraction produced, in order, after domain extraction. */
function expressionsOf(entries: readonly ExtractedEntry[]): readonly string[] {
  const extractor = new DomMarkupTextExtractor();
  const values: string[] = [];
  for (const entry of entries) {
    const extracted = extractVisibleText(entry.rawFieldValue, extractor);
    if (extracted.ok) {
      values.push(extracted.value);
    }
  }
  return values;
}

/**
 * The semantic contract every `AnkiVocabularyProvider` must satisfy.
 *
 * There is one suite rather than per-adapter expectations because the whole
 * point of the port is that a snapshot means the same thing regardless of where
 * the vocabulary came from. An adapter that passes its own tests but disagrees
 * with this one would produce a snapshot that quietly means something different
 * from the last.
 */
export function runProviderContract(
  name: string,
  setup: ProviderContractSetup,
  expectedKind: AnkiProviderKind,
): void {
  describe(`${name} provider contract`, () => {
    async function withProvider<T>(
      create: ProviderFactory,
      use: (provider: AnkiVocabularyProvider) => Promise<T> | T,
    ): Promise<T> {
      const under = await create();
      try {
        return await use(under.provider);
      } finally {
        await under.teardown?.();
        under.provider.dispose();
      }
    }

    const standard = <T>(use: (provider: AnkiVocabularyProvider) => Promise<T> | T): Promise<T> =>
      withProvider(setup.standard, use);

    it('reports its kind', async () => {
      await standard((provider) => {
        expect(provider.kind).toBe(expectedKind);
      });
    });

    it('probes capabilities that allow discovery and refresh', async () => {
      await standard(async (provider) => {
        const probed = await provider.probe();
        expect(probed.ok).toBe(true);
        if (!probed.ok) return;
        expect(canDiscover(probed.value)).toBe(true);
        expect(canRefresh(probed.value)).toBe(true);
        expect(probed.value.apiVersion.length).toBeGreaterThan(0);
      });
    });

    it('discovers the deck, note-type, and field hierarchy', async () => {
      await standard(async (provider) => {
        const discovered = await provider.discover();
        expect(discovered.ok).toBe(true);
        if (!discovered.ok) return;

        const deckNames = discovered.value.decks.map((deck) => deck.name).sort();
        expect(deckNames).toEqual([...CONTRACT_COLLECTION.deckNames].sort());

        const parent = discovered.value.decks.find((deck) => deck.name === 'Core Japanese');
        expect(parent?.hasChildren).toBe(true);
        const leaf = discovered.value.decks.find((deck) => deck.name === 'Unused');
        expect(leaf?.hasChildren).toBe(false);

        const basic = discovered.value.noteTypes.find((noteType) => noteType.name === 'Basic');
        expect(basic?.fieldNames).toEqual(['Expression', 'Meaning']);
      });
    });

    it('resolves an exact mapping and marks a missing field stale', async () => {
      await standard(async (provider) => {
        const discovered = await provider.discover();
        expect(discovered.ok).toBe(true);
        if (!discovered.ok) return;

        const resolution = resolveMappings(
          [mappingFor(), mappingFor({ expressionFieldName: 'Gone' })],
          discovered.value,
        );
        expect(resolution.resolved).toHaveLength(1);
        expect(resolution.stale).toHaveLength(1);
        expect(resolution.stale[0].reason).toBe('field-missing');
      });
    });

    it('includes only notes reviewed at least once, in the selected note type and deck', async () => {
      await standard(async (provider) => {
        const collected = await collectExtraction(provider, [mappingFor()]);
        expect(collected.failure).toBeNull();

        // 毎日 was never reviewed, これはペンです。 is another note type,
        // 走る is in a subdeck this mapping did not select.
        expect([...expressionsOf(collected.entries)].sort()).toEqual(
          ['ねこ', 'ねこ', '見る', '犬', 'お腹 が 空いた'].sort(),
        );
      });
    });

    it('keeps a note whose only review is on a suspended card', async () => {
      await standard(async (provider) => {
        const collected = await collectExtraction(provider, [mappingFor()]);
        expect(expressionsOf(collected.entries)).toContain('見る');
      });
    });

    it('extracts field text literally, without markup and without splitting', async () => {
      await standard(async (provider) => {
        const collected = await collectExtraction(provider, [mappingFor()]);
        const expressions = expressionsOf(collected.entries);
        // Script content contributes nothing; internal spaces survive.
        expect(expressions).toContain('犬');
        expect(expressions).toContain('お腹 が 空いた');
        expect(expressions.some((value) => value.includes('alert'))).toBe(false);
      });
    });

    it('reports a value that is whitespace only rather than dropping it silently', async () => {
      await standard(async (provider) => {
        const collected = await collectExtraction(provider, [mappingFor()]);
        const extractor = new DomMarkupTextExtractor();
        const rejections = collected.entries
          .map((entry) => extractVisibleText(entry.rawFieldValue, extractor))
          .filter((result) => !result.ok);
        expect(rejections).toHaveLength(1);
      });
    });

    it('honours deck-and-subdecks scope', async () => {
      const scope: DeckScope = 'deck-and-subdecks';
      await standard(async (provider) => {
        const collected = await collectExtraction(provider, [mappingFor({ deckScope: scope })]);
        expect(expressionsOf(collected.entries)).toContain('走る');
      });
    });

    it('reports progress before the entries it describes', async () => {
      await standard(async (provider) => {
        const collected = await collectExtraction(provider, [mappingFor()]);
        const firstProgress = collected.events.findIndex((event) => event.kind === 'progress');
        const firstEntry = collected.events.findIndex((event) => event.kind === 'entry');
        expect(firstProgress).toBeGreaterThanOrEqual(0);
        expect(firstProgress).toBeLessThan(firstEntry);
      });
    });

    it('combines several mappings into one stream', async () => {
      await standard(async (provider) => {
        const second = mappingFor({
          id: sourceMappingId('22222222-2222-4222-8222-222222222222'),
          noteTypeName: 'Sentence',
          expressionFieldName: 'Front',
        });
        const collected = await collectExtraction(provider, [mappingFor(), second]);
        expect(expressionsOf(collected.entries)).toContain('これはペンです。');
      });
    });

    it('stops and reports cancellation when the signal aborts', async () => {
      await standard(async (provider) => {
        const controller = new AbortController();
        controller.abort();
        const collected = await collectExtraction(provider, [mappingFor()], controller.signal);
        expect(collected.entries).toHaveLength(0);
        expect(collected.failure?.kind).toBe('failed');
        if (collected.failure?.kind === 'failed') {
          expect(collected.failure.error.code).toBe('cancelled');
        }
      });
    });

    it('cancels a probe that was already aborted', async () => {
      await standard(async (provider) => {
        const controller = new AbortController();
        controller.abort();
        const probed = await provider.probe(controller.signal);
        expect(probed.ok).toBe(false);
        if (probed.ok) return;
        expect(probed.error.code).toBe('cancelled');
      });
    });

    it('tolerates being disposed more than once', async () => {
      const under = await setup.standard();
      under.provider.dispose();
      expect(() => {
        under.provider.dispose();
      }).not.toThrow();
      await under.teardown?.();
    });

    const withoutEvidence = setup.withoutReviewEvidence;
    it.runIf(withoutEvidence !== undefined)(
      'produces no entries when nothing was ever reviewed',
      async () => {
        if (withoutEvidence === undefined) return;
        await withProvider(withoutEvidence, async (provider) => {
          const collected = await collectExtraction(provider, [mappingFor()]);
          expect(collected.entries).toHaveLength(0);
        });
      },
    );
  });
}
