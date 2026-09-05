import { isUuid, readingId, type ReadingId } from '../../domain/shared/ids';

/**
 * Something one tab did to the shared local database that another tab is
 * already showing.
 *
 * Only deletion is carried today: it is the only mutation that can leave
 * another tab rendering a reading that no longer exists. Creation and
 * enrichment leave every other tab correct, only slightly behind.
 */
export interface ReadingDeletedMutation {
  readonly kind: 'reading-deleted';
  readonly id: ReadingId;
  /** Carried so the receiving tab can name the reading without reading it. */
  readonly title: string;
}

export type ReadingMutation = ReadingDeletedMutation;

/** The largest title accepted from another tab, matching the import limit. */
const MAXIMUM_TITLE_LENGTH = 200;

/**
 * Validates a message from another tab.
 *
 * A `BroadcastChannel` or a `storage` event is external input like any other:
 * the sender is same-origin but may be an older build, a replayed value, or a
 * partially written key. Anything that does not match is dropped silently
 * rather than trusted.
 */
export function parseReadingMutation(value: unknown): ReadingMutation | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  if (candidate['kind'] !== 'reading-deleted') {
    return null;
  }
  const id = candidate['id'];
  const title = candidate['title'];
  if (typeof id !== 'string' || !isUuid(id) || typeof title !== 'string') {
    return null;
  }
  return {
    kind: 'reading-deleted',
    id: readingId(id),
    title: title.slice(0, MAXIMUM_TITLE_LENGTH),
  };
}

/**
 * Port for telling the other tabs of this browser profile what changed.
 *
 * Implementations must never deliver a tab its own messages, and must degrade
 * to doing nothing rather than throwing where the browser offers no transport.
 */
export interface ReadingMutationChannel {
  publish(mutation: ReadingMutation): void;
  /** Returns the unsubscribe function. */
  subscribe(listener: (mutation: ReadingMutation) => void): () => void;
}
