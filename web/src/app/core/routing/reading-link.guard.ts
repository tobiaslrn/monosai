import type { CanMatchFn } from '@angular/router';
import { classifyReadingLink } from '../../domain/reading/reading-link';

/**
 * Lets the reader match only a link that could name a reading.
 *
 * The check is `canMatch` rather than `canActivate` so a malformed id falls
 * through to the next route instead of being redirected: the learner keeps the
 * address they typed, and the screen they get can say the one true thing about
 * it. Whether a well-formed id names a *stored* reading is the reader's
 * question, not this one.
 */
export const wellFormedReadingLink: CanMatchFn = (_route, segments, _snapshot) => {
  const id = segments[1]?.path ?? '';
  return classifyReadingLink(id).kind === 'well-formed';
};
