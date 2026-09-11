import type { Reading } from '../../domain/reading/reading';

/** What a shelf row says about whether its story has been read. */
export type ReadingMarker = 'new' | 'read';

/**
 * Read means the learner reached the end of the story. That is not recorded
 * yet, so having opened a story stands in for having read it (ADR 0070).
 */
export function readingMarker(reading: Pick<Reading, 'lastOpenedAt'>): ReadingMarker {
  return reading.lastOpenedAt === null ? 'new' : 'read';
}
