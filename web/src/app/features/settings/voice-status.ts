import type { TtsStore } from '../../application/settings/tts.store';
import type { AudioStatus } from './ai-status';

/**
 * Where the speech configuration stands, in one value.
 *
 * `testing` and `cancelled` are not readiness — a running test proves nothing
 * yet, and a stopped one proves nothing ever — but they are two of the states a
 * learner has to be able to tell apart, so they are resolved here rather than
 * each being inferred from a different signal where it is drawn.
 */
export function audioStatusOf(
  tts: Pick<TtsStore, 'action' | 'readiness' | 'testCancelled'>,
): AudioStatus {
  if (tts.action() === 'testing') {
    return 'testing';
  }
  const readiness = tts.readiness();
  if (tts.testCancelled() && readiness !== 'ready') {
    return 'cancelled';
  }
  return readiness;
}
