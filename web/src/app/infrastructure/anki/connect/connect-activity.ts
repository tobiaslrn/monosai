import type { AnkiError } from '../../../domain/anki/anki-error';
import type { EvidenceAvailability } from '../../../domain/anki/practice-evidence';
import type { SourceMapping } from '../../../domain/vocabulary/source-mapping';
import type { AnkiConnectClient } from './connect-client';
import { ACTIVITY_SEARCHES, activitySearchFor, type ActivitySearchKey } from './connect-search';

/** Card ids per activity pool, as the source reported them. */
export type ActivityPools = Readonly<Record<ActivitySearchKey, ReadonlySet<number>>>;

export interface ActivityCapture {
  readonly pools: ActivityPools;
  /**
   * `unavailable` rather than `unsupported` for every refused search.
   *
   * An endpoint that could not answer `findCards` at all has already failed the
   * vocabulary read, so a capture that gets this far is talking to a working
   * search that refused this syntax. Whether that is an old build or a bad
   * moment cannot be told apart from here, and the recoverable reading is the
   * one that does not write off the source.
   */
  readonly recentAnswers: EvidenceAvailability;
  readonly recentDifficulty: EvidenceAvailability;
  /** Present only for a cancellation, which stops the whole refresh. */
  readonly cancelled?: AnkiError;
}

/**
 * At most two searches are in flight at once.
 *
 * Five bounded id-only reads per mapping are cheap, but a collection of tens of
 * thousands of cards still makes each one real work for the provider, and a
 * refresh runs beside whatever else the learner is doing on the device.
 */
const CONCURRENT_SEARCHES = 2;

/** One retry, for the study-day rollover or concurrent answer this can catch. */
const CONSISTENCY_ATTEMPTS = 2;

function emptyPools(): ActivityPools {
  return {
    answered1: new Set(),
    answered3: new Set(),
    answered7: new Set(),
    again7: new Set(),
    hard7: new Set(),
  };
}

/**
 * Asks Anki which of a mapping's cards the learner actually answered recently.
 *
 * These are five separate reads over a live collection, not one atomic snapshot,
 * so the result is an observation over an interval. What that interval can spoil
 * is checked rather than assumed: the pools nest by definition, and a violation
 * means the study day rolled over or a card was answered between two of the
 * reads. One reread resolves the ordinary case; a capture that still disagrees
 * with itself is reported as unavailable rather than published as fact.
 */
export async function captureActivity(
  client: AnkiConnectClient,
  mapping: SourceMapping,
  signal?: AbortSignal,
): Promise<ActivityCapture> {
  for (let attempt = 0; attempt < CONSISTENCY_ATTEMPTS; attempt += 1) {
    const found = await readPools(client, mapping, signal);
    if (found.cancelled !== undefined) {
      return { ...unanswered(), cancelled: found.cancelled };
    }
    if (found.pools === undefined) {
      break;
    }
    if (isNested(found.pools)) {
      return { pools: found.pools, recentAnswers: 'available', recentDifficulty: 'available' };
    }
  }
  // Every word keeps its place in the vocabulary either way: this only decides
  // whether practice selection may claim to know what was studied recently.
  return unanswered();
}

function unanswered(): ActivityCapture {
  return { pools: emptyPools(), recentAnswers: 'unavailable', recentDifficulty: 'unavailable' };
}

interface PoolRead {
  readonly pools?: ActivityPools;
  readonly cancelled?: AnkiError;
}

async function readPools(
  client: AnkiConnectClient,
  mapping: SourceMapping,
  signal?: AbortSignal,
): Promise<PoolRead> {
  const pools: Record<string, ReadonlySet<number>> = {};
  for (let index = 0; index < ACTIVITY_SEARCHES.length; index += CONCURRENT_SEARCHES) {
    const group = ACTIVITY_SEARCHES.slice(index, index + CONCURRENT_SEARCHES);
    const answers = await Promise.all(
      group.map(async (search) => ({
        search,
        result: await client.findCards(activitySearchFor(mapping, search.term), signal),
      })),
    );
    for (const { search, result } of answers) {
      if (!result.ok) {
        return result.error.code === 'cancelled' ? { cancelled: result.error } : {};
      }
      pools[search.key] = new Set(result.value);
    }
  }
  return { pools: pools as unknown as ActivityPools };
}

/**
 * Anki's own windows nest, so a card answered today is answered within three
 * days and within seven. Checking it is what turns five independent reads into
 * one usable observation.
 */
function isNested(pools: ActivityPools): boolean {
  return (
    isSubset(pools.answered1, pools.answered3) &&
    isSubset(pools.answered3, pools.answered7) &&
    isSubset(pools.again7, pools.answered7) &&
    isSubset(pools.hard7, pools.answered7)
  );
}

function isSubset(inner: ReadonlySet<number>, outer: ReadonlySet<number>): boolean {
  for (const value of inner) {
    if (!outer.has(value)) {
      return false;
    }
  }
  return true;
}
