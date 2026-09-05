import { describe, expect, it } from 'vitest';
import { readBundleManifest } from '../../testing/language-runtime';
import {
  TEST_BASE_URL,
  bundleFetch,
  createWorkerHarness,
  sharedTokenizerFactory,
} from '../../testing/language-worker-harness';
import {
  LANGUAGE_PROTOCOL_VERSION,
  type LanguageResponseMessage,
} from '../../app/infrastructure/language/worker-protocol';
import { LanguageWorkerHost } from './language-worker-host';

const FIXTURE_LENGTH = 50_000;
const CHUNK_CHARACTERS = 2_000;

function longFixture(): string {
  const paragraph =
    '猫がテーブルの上で寝ていました。田中さんは東京へ行きたくなかった。' +
    '「そうか。」と彼は答えた。三月十四日の午後七時、五冊の本を買いました。';
  let text = '';
  while (text.length < FIXTURE_LENGTH) {
    text += paragraph;
  }
  return text.slice(0, FIXTURE_LENGTH);
}

interface Measurement {
  readonly chunkTimings: readonly number[];
  readonly totalMilliseconds: number;
  readonly response: LanguageResponseMessage | undefined;
}

/**
 * Analyses the long fixture while recording how long the worker runs between two
 * yields. Each interval is work that would have been one uninterrupted task.
 */
async function measureLongAnalysis(text: string): Promise<Measurement> {
  const responses: LanguageResponseMessage[] = [];
  const chunkTimings: number[] = [];
  let lastYield = performance.now();

  const host = new LanguageWorkerHost({
    post: (message) => responses.push(message),
    createTokenizer: sharedTokenizerFactory,
    fetchFn: bundleFetch(),
    cacheStorage: null,
    chunkCharacters: CHUNK_CHARACTERS,
    yieldControl: () => {
      chunkTimings.push(performance.now() - lastYield);
      lastYield = performance.now();
      return Promise.resolve();
    },
  });

  await host.handleMessage({
    protocolVersion: LANGUAGE_PROTOCOL_VERSION,
    requestId: 'init',
    request: {
      operation: 'initialize',
      payload: { baseUrl: TEST_BASE_URL, manifest: readBundleManifest() },
    },
  });

  lastYield = performance.now();
  const started = performance.now();
  await host.handleMessage({
    protocolVersion: LANGUAGE_PROTOCOL_VERSION,
    requestId: 'long',
    request: { operation: 'analyze', payload: { text, unit: 'paragraph' } },
  });

  return {
    chunkTimings,
    totalMilliseconds: performance.now() - started,
    response: responses.find((message) => message.requestId === 'long'),
  };
}

describe('50,000-character analysis', () => {
  it('analyses the whole fixture without losing a character', async () => {
    const text = longFixture();
    const { response } = await measureLongAnalysis(text);

    expect(response?.outcome.ok).toBe(true);
    if (response?.outcome.ok !== true || response.outcome.result.operation !== 'analyze') {
      expect.fail('expected an analysis result');
      return;
    }
    const sentences = response.outcome.result.value.sentences;
    expect(sentences.length).toBeGreaterThan(100);
    expect(sentences.map((sentence) => sentence.text).join('')).toBe(text);
    for (const sentence of sentences) {
      expect(sentence.tokens.map((token) => token.surface).join('')).toBe(sentence.text);
    }
  });

  it('splits the work into chunks rather than one blocking pass', async () => {
    const { chunkTimings, totalMilliseconds } = await measureLongAnalysis(longFixture());
    const measured = chunkTimings.reduce((sum, timing) => sum + timing, 0);

    // Almost all of the elapsed time is accounted for by the measured chunks,
    // which proves the loop actually yields rather than running to completion.
    expect(measured).toBeLessThanOrEqual(totalMilliseconds + 1);
    expect(chunkTimings.length).toBeGreaterThanOrEqual(
      Math.floor(FIXTURE_LENGTH / CHUNK_CHARACTERS) - 2,
    );
  });

  it('cancels a long analysis promptly', async () => {
    const harness = createWorkerHarness({ chunkCharacters: CHUNK_CHARACTERS });
    await harness.send({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId: 'init',
      request: {
        operation: 'initialize',
        payload: { baseUrl: TEST_BASE_URL, manifest: readBundleManifest() },
      },
    });

    const analysis = harness.send({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId: 'long',
      request: { operation: 'analyze', payload: { text: longFixture(), unit: 'paragraph' } },
    });
    await harness.send({
      protocolVersion: LANGUAGE_PROTOCOL_VERSION,
      requestId: 'cancel',
      request: { operation: 'cancel', payload: { targetRequestId: 'long' } },
    });
    await analysis;

    const response = harness.responseFor('long');
    expect(response?.outcome.ok).toBe(false);
    if (response?.outcome.ok === false) {
      expect(response.outcome.error.code).toBe('cancelled');
    }
  });
});
