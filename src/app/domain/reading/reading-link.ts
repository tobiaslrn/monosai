import { isUuid, readingId, type ReadingId } from '../shared/ids';

/**
 * What a `/reader/:id` path segment turned out to be.
 *
 * `well-formed` only says the segment *could* name a reading; whether one is
 * stored is a separate question the repository answers.
 */
export type ReadingLink =
  | { readonly kind: 'well-formed'; readonly id: ReadingId }
  | { readonly kind: 'malformed'; readonly raw: string };

/**
 * Classifies a reading link before anything tries to open it.
 *
 * Reading ids are UUIDs by construction (`IdGenerator`), so a segment that is
 * not one never named a stored reading. Telling the learner such a link "is no
 * longer here" and "may have been deleted" claims a history the application
 * cannot have: nothing was ever there to delete. Separating the two cases lets
 * each screen say only what is true.
 */
export function classifyReadingLink(raw: string): ReadingLink {
  return isUuid(raw) ? { kind: 'well-formed', id: readingId(raw) } : { kind: 'malformed', raw };
}
