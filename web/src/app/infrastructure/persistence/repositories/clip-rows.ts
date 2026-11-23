import type { AssetId, ReadingId, SentenceId } from '../../../domain/shared/ids';
import type { MonosaiDatabase } from '../monosai-db';
import type { AudioAssetMetadata, AudioAssetStoredRow } from '../schemas/enrichment.schema';
import { releaseReadingAids } from './shared-aid-rows';

/**
 * Writes that keep a clip's two rows in step.
 *
 * A clip is stored twice: whole in `audioAssets`, which is read only to play or
 * re-encode that one clip, and without its bytes in `audioSummaries`, which
 * every list of clips reads. IndexedDB reads a row whole, so a list over
 * `audioAssets` would copy every clip's audio out of the database only to drop
 * it.
 *
 * Every write to either table goes through here, inside the caller's
 * read-write transaction over both (`clipTables`), so the two never disagree.
 * Coverage and key checks may still read `audioAssets`, through its keys only.
 */
export function clipTables(db: MonosaiDatabase) {
  return [db.audioAssets, db.audioSummaries];
}

export async function putClip(db: MonosaiDatabase, row: AudioAssetStoredRow): Promise<void> {
  await db.audioAssets.put(row);
  await db.audioSummaries.put(clipMetadata(row));
}

export async function deleteClipsWithId(db: MonosaiDatabase, id: AssetId): Promise<void> {
  await db.audioAssets.where('id').equals(id).delete();
  await db.audioSummaries.where('id').equals(id).delete();
}

export async function clearClips(db: MonosaiDatabase): Promise<void> {
  await db.audioAssets.clear();
  await db.audioSummaries.clear();
}

/**
 * `releaseReadingAids` for clips. Both tables hold the same keys for the same
 * sentences, so each hands the same rows to the same twins and deletes the
 * same rest. Also needs `sentences` in the transaction.
 */
export async function releaseReadingClips(
  db: MonosaiDatabase,
  readingId: ReadingId,
  currentCacheKeys: ReadonlyMap<SentenceId, string> | null = null,
): Promise<void> {
  await releaseReadingAids(db, db.audioSummaries, readingId, currentCacheKeys);
  await releaseReadingAids(db, db.audioAssets, readingId, currentCacheKeys);
}

/** A stored clip without its bytes. */
export function clipMetadata(row: AudioAssetStoredRow): AudioAssetMetadata {
  const { bytes: _bytes, ...metadata } = row;
  return metadata;
}
