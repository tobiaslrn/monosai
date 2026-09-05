import { describe, expect, it } from 'vitest';
import { ALL_AI_ERROR_CODES, aiError } from '../../domain/ai/ai-error';
import type { AiTask } from '../../domain/ai/ai-task';
import { storageError } from '../../domain/storage/storage-error';
import { AI_TASK_COPY, aiErrorAction } from '../../shared-ui/ai-error/ai-error-copy';
import {
  describeEnrichmentFailure,
  enrichmentCanRetry,
  enrichmentNeedsSettings,
} from './enrichment-failure-copy';

/**
 * The three aids a reader can watch fail, and the surface each one appears on.
 *
 * They are listed by task rather than by component because the task is what the
 * message names: the popover and the player differ in where the retry control
 * sits, not in what went wrong.
 */
const READER_TASKS: readonly AiTask[] = ['translation', 'grammar-review', 'tts-synthesis'];

describe('describeEnrichmentFailure', () => {
  it('says nothing when nothing failed', () => {
    expect(describeEnrichmentFailure(null)).toBeNull();
  });

  it('names the aid and a next step for every failure, on every reader surface', () => {
    for (const code of ALL_AI_ERROR_CODES) {
      for (const task of READER_TASKS) {
        const error = aiError(code, task, 'raw provider wording');
        const message = describeEnrichmentFailure({ source: 'provider', error });
        const where = `${code}/${task}`;

        expect(message, where).not.toBeNull();
        expect(message, where).toContain(`while ${AI_TASK_COPY[task]}.`);
        expect(message, where).toContain(aiErrorAction(error, 'reader'));
        expect(message, where).not.toContain('raw provider wording');
      }
    }
  });

  it('never points a reader at the settings test', () => {
    for (const code of ALL_AI_ERROR_CODES) {
      for (const task of READER_TASKS) {
        const message = describeEnrichmentFailure({
          source: 'provider',
          error: aiError(code, task, 'x'),
        });

        expect(message?.toLowerCase(), `${code}/${task}`).not.toMatch(/\btests?\b/);
      }
    }
  });

  it('sends an exhausted account to add credit, not back to the key', () => {
    const message = describeEnrichmentFailure({
      source: 'provider',
      error: aiError('credit-exhausted', 'translation', 'x'),
    });

    expect(message).toBe(
      'This OpenRouter account is out of credit while translating this sentence. Add credit on openrouter.ai, then try again.',
    );
  });

  it('still sends a rejected key back to the key', () => {
    const message = describeEnrichmentFailure({
      source: 'provider',
      error: aiError('authentication', 'translation', 'x'),
    });

    expect(message).toContain('OpenRouter refused the key');
    expect(message).toContain('save it again in Settings');
  });

  it('keeps a storage failure about the sentence that is safe', () => {
    const message = describeEnrichmentFailure({
      source: 'storage',
      error: storageError('transaction-aborted', 'The write did not commit.'),
    });

    expect(message).toContain('The sentence itself is unchanged.');
  });
});

describe('enrichmentCanRetry', () => {
  it('offers another attempt when a model answered in the wrong shape', () => {
    const failure = {
      source: 'provider',
      error: aiError('malformed-response', 'translation', 'x'),
    } as const;

    expect(enrichmentCanRetry(failure)).toBe(true);
    // A better-suited model is still worth offering alongside the retry.
    expect(enrichmentNeedsSettings(failure)).toBe(true);
  });

  it('refuses a retry that cannot change its own answer', () => {
    for (const code of ['authentication', 'model-not-found', 'credit-exhausted'] as const) {
      const failure = { source: 'provider', error: aiError(code, 'translation', 'x') } as const;

      expect(enrichmentCanRetry(failure), code).toBe(false);
    }
  });
});
