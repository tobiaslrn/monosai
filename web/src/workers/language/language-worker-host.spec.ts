import { beforeAll, describe, expect, it } from 'vitest';
import {
  TEST_BASE_URL,
  bundleFetch,
  createWorkerHarness,
  failingTokenizerFactory,
} from '../../testing/language-worker-harness';
import { readBundleManifest } from '../../testing/language-runtime';
import type { LanguageAssetManifest } from '../../app/domain/language/language-assets';
import { snapshotId, vocabularyItemId } from '../../app/domain/shared/ids';
import {
  LANGUAGE_PROTOCOL_VERSION,
  type LanguageRequestMessage,
} from '../../app/infrastructure/language/worker-protocol';

function request(
  requestId: string,
  request: LanguageRequestMessage['request'],
  protocolVersion = LANGUAGE_PROTOCOL_VERSION,
): LanguageRequestMessage {
  return { protocolVersion, requestId, request };
}

function initializeRequest(requestId: string, manifest: LanguageAssetManifest) {
  return request(requestId, {
    operation: 'initialize',
    payload: { baseUrl: TEST_BASE_URL, manifest },
  });
}

describe('language worker protocol', () => {
  it('rejects a message from a different protocol version', async () => {
    const harness = createWorkerHarness();
    await harness.send(
      request(
        'r1',
        { operation: 'segment', payload: { text: '猫。' } },
        LANGUAGE_PROTOCOL_VERSION + 1,
      ),
    );
    const response = harness.responseFor('r1');
    expect(response?.outcome.ok).toBe(false);
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('protocol-version-mismatch');
    }
  });

  it('rejects a structurally invalid message', async () => {
    const harness = createWorkerHarness();
    await harness.send({ protocolVersion: LANGUAGE_PROTOCOL_VERSION, requestId: 'r1' } as never);
    const response = harness.responseFor('r1');
    expect(response?.outcome.ok).toBe(false);
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('invalid-request');
    }
  });

  it('refuses to analyze before initialization', async () => {
    const harness = createWorkerHarness();
    await harness.send(
      request('r1', { operation: 'analyze', payload: { text: '猫。', unit: 'paragraph' } }),
    );
    const response = harness.responseFor('r1');
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('not-initialized');
    } else {
      expect.fail('expected a not-initialized failure');
    }
  });

  it('segments without initialization, because segmentation needs no assets', async () => {
    const harness = createWorkerHarness();
    await harness.send(request('r1', { operation: 'segment', payload: { text: '猫。犬。' } }));
    const response = harness.responseFor('r1');
    expect(response?.outcome.ok).toBe(true);
  });
});

describe('language worker initialization', () => {
  let manifest: LanguageAssetManifest;

  beforeAll(() => {
    manifest = readBundleManifest();
  });

  it('loads and verifies the committed bundle', async () => {
    const harness = createWorkerHarness();
    await harness.send(initializeRequest('r1', manifest));
    const response = harness.responseFor('r1');
    expect(response?.outcome.ok).toBe(true);
    if (response?.outcome.ok === true && response.outcome.result.operation === 'initialize') {
      const value = response.outcome.result.value;
      expect(value.bundleVersion).toBe(manifest.bundleVersion);
      expect(value.dictionaryEntryCount).toBe(manifest.components.dictionary.entryCount);
      expect(value.structuralBaselineEntries.length).toBe(
        manifest.components.structuralBaseline.entryCount,
      );
      expect(value.versions.tokenizerVersion).toBe(manifest.components.tokenizer.version);
    }
  });

  it('reports a typed error when an asset fails its integrity check', async () => {
    const tampered = new TextEncoder().encode('{"schemaVersion":1}');
    const harness = createWorkerHarness({
      fetchFn: bundleFetch({ 'dictionary.json': tampered }),
    });
    await harness.send(initializeRequest('r1', manifest));
    const response = harness.responseFor('r1');
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('asset-integrity-mismatch');
      expect(response.outcome.error.message).not.toContain('undefined');
    } else {
      expect.fail('expected an integrity failure');
    }
  });

  it('reports a typed error when an asset cannot be downloaded', async () => {
    const harness = createWorkerHarness({
      fetchFn: bundleFetch({ 'grammar-presets.json': 'missing' }),
    });
    await harness.send(initializeRequest('r1', manifest));
    const response = harness.responseFor('r1');
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('assets-unavailable');
    } else {
      expect.fail('expected a download failure');
    }
  });

  it('reports a typed error when the tokenizer runtime cannot start', async () => {
    const harness = createWorkerHarness({ createTokenizer: failingTokenizerFactory });
    await harness.send(initializeRequest('r1', manifest));
    const response = harness.responseFor('r1');
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('tokenizer-initialization-failed');
    } else {
      expect.fail('expected an initialization failure');
    }
  });

  it('stays usable after a failed initialization is retried', async () => {
    const harness = createWorkerHarness({ createTokenizer: failingTokenizerFactory });
    await harness.send(initializeRequest('r1', manifest));

    const recovered = createWorkerHarness();
    await recovered.send(initializeRequest('r2', manifest));
    expect(recovered.responseFor('r2')?.outcome.ok).toBe(true);
  });

  it('rejects a manifest whose digests describe different bytes', async () => {
    const wrongDigest: LanguageAssetManifest = {
      ...manifest,
      components: {
        ...manifest.components,
        structuralBaseline: {
          ...manifest.components.structuralBaseline,
          files: [
            {
              ...manifest.components.structuralBaseline.files[0],
              sha256: '0'.repeat(64),
            },
          ],
        },
      },
    };
    const harness = createWorkerHarness();
    await harness.send(initializeRequest('r1', wrongDigest));
    const response = harness.responseFor('r1');
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('asset-integrity-mismatch');
    } else {
      expect.fail('expected an integrity failure');
    }
  });
});

describe('language worker request handling', () => {
  it('answers concurrent requests with their own request ids', async () => {
    const harness = createWorkerHarness();
    await harness.send(initializeRequest('init', readBundleManifest()));

    await Promise.all([
      harness.send(
        request('a', { operation: 'analyze', payload: { text: '猫。', unit: 'paragraph' } }),
      ),
      harness.send(
        request('b', { operation: 'analyze', payload: { text: '犬が寝る。', unit: 'paragraph' } }),
      ),
      harness.send(request('c', { operation: 'segment', payload: { text: '一。二。' } })),
    ]);

    for (const id of ['a', 'b', 'c']) {
      expect(harness.responseFor(id)?.outcome.ok, id).toBe(true);
    }
    const first = harness.responseFor('a');
    if (first?.outcome.ok === true && first.outcome.result.operation === 'analyze') {
      expect(first.outcome.result.value.sentences[0].text).toBe('猫。');
    }
  });

  it('answers a cancelled analysis with the cancelled error instead of a result', async () => {
    const harness = createWorkerHarness({ chunkCharacters: 1 });
    await harness.send(initializeRequest('init', readBundleManifest()));

    const analysis = harness.send(
      request('long', {
        operation: 'analyze',
        payload: { text: '猫が寝た。犬も寝た。鳥も寝た。'.repeat(50), unit: 'paragraph' },
      }),
    );
    await harness.send(
      request('cancel', { operation: 'cancel', payload: { targetRequestId: 'long' } }),
    );
    await analysis;

    const response = harness.responseFor('long');
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('cancelled');
    } else {
      expect.fail('expected the analysis to be cancelled');
    }
    expect(harness.responseFor('cancel')?.outcome.ok).toBe(true);
  });

  it('emits exactly one response per request, even after cancellation', async () => {
    const harness = createWorkerHarness({ chunkCharacters: 1 });
    await harness.send(initializeRequest('init', readBundleManifest()));
    const analysis = harness.send(
      request('long', {
        operation: 'analyze',
        payload: { text: '猫が寝た。'.repeat(80), unit: 'paragraph' },
      }),
    );
    await harness.send(
      request('cancel', { operation: 'cancel', payload: { targetRequestId: 'long' } }),
    );
    await analysis;

    expect(harness.responses.filter((response) => response.requestId === 'long')).toHaveLength(1);
  });

  it('requires a compiled snapshot before classifying', async () => {
    const harness = createWorkerHarness();
    await harness.send(initializeRequest('init', readBundleManifest()));
    await harness.send(
      request('classify', {
        operation: 'classify',
        payload: { snapshotId: 'missing', mode: 'imported', sentences: [] },
      }),
    );
    const response = harness.responseFor('classify');
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('snapshot-not-compiled');
    } else {
      expect.fail('expected a snapshot failure');
    }
  });

  it('classifies against a compiled snapshot', async () => {
    const harness = createWorkerHarness();
    await harness.send(initializeRequest('init', readBundleManifest()));
    await harness.send(
      request('analyze', { operation: 'analyze', payload: { text: '猫', unit: 'sentence' } }),
    );
    const analyzed = harness.responseFor('analyze');
    const tokens =
      analyzed?.outcome.ok === true && analyzed.outcome.result.operation === 'analyze'
        ? analyzed.outcome.result.value.sentences[0].tokens
        : [];

    await harness.send(
      request('compile', {
        operation: 'compile-snapshot',
        payload: {
          snapshotId: 'snap-1',
          items: [
            {
              id: vocabularyItemId('item-1'),
              snapshotId: snapshotId('snap-1'),
              visibleExpression: '猫',
              canonicalExpression: '猫',
              expressionHash: 'hash',
              analyzedSequence: [{ surface: '猫', lemma: '猫', readingHiragana: 'ねこ' }],
            },
          ],
        },
      }),
    );

    await harness.send(
      request('classify', {
        operation: 'classify',
        payload: {
          snapshotId: 'snap-1',
          mode: 'imported',
          sentences: [{ sentenceId: 's1', tokens }],
        },
      }),
    );

    const response = harness.responseFor('classify');
    if (response?.outcome.ok === true && response.outcome.result.operation === 'classify') {
      expect(response.outcome.result.value.sentences[0].statuses[0].validation.category).toBe(
        'anki-exact',
      );
    } else {
      expect.fail('expected a classification result');
    }
  });

  it('looks a word up in the bundled dictionary', async () => {
    const harness = createWorkerHarness();
    await harness.send(initializeRequest('init', readBundleManifest()));
    await harness.send(
      request('lookup', { operation: 'lookup', payload: { query: { surface: '食べる' } } }),
    );
    const response = harness.responseFor('lookup');
    if (response?.outcome.ok === true && response.outcome.result.operation === 'lookup') {
      expect(response.outcome.result.value.matchedBy).toBe('surface');
      expect(response.outcome.result.value.entries[0].senses[0].glossesEn).toContain('to eat');
    } else {
      expect.fail('expected a dictionary result');
    }
  });

  it('reports no bundled definition rather than an error for an unknown word', async () => {
    const harness = createWorkerHarness();
    await harness.send(initializeRequest('init', readBundleManifest()));
    await harness.send(
      request('lookup', { operation: 'lookup', payload: { query: { surface: 'ぬるぽぽぽ' } } }),
    );
    const response = harness.responseFor('lookup');
    if (response?.outcome.ok === true && response.outcome.result.operation === 'lookup') {
      expect(response.outcome.result.value.matchedBy).toBe('none');
      expect(response.outcome.result.value.entries).toHaveLength(0);
    } else {
      expect.fail('expected an empty dictionary result');
    }
  });
});
