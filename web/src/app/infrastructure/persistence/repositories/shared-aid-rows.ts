import type { Table } from 'dexie';
import { concernCount } from '../../../domain/enrichment/grammar-normalization';
import type { ReadingId, SentenceId } from '../../../domain/shared/ids';
import {
  NO_GRAMMAR_REVIEW,
  grammarComplete,
  grammarPartial,
  type CompletionSummary,
  type GrammarSummary,
} from '../../../domain/reading/summaries';
import type { MonosaiDatabase } from '../monosai-db';

interface WrittenFor {
  readonly readingId: ReadingId;
  readonly sentenceId: SentenceId;
}

/**
 * Removes a reading's grammar analyses or clips, keeping the ones another
 * reading still uses.
 *
 * Grammar and audio keys name the Japanese and the configuration, never the
 * reading, so one row serves every sentence with the same text. The row says
 * only which sentence it was last written for. Deleting by that alone would
 * take the analysis or clip from every other reading with the same sentence,
 * while their summaries still counted it. Instead, a row whose sentence has a
 * twin with the same content in another reading is handed to that twin and
 * kept; only the rest is deleted.
 *
 * `currentCacheKeys` narrows what a clear keeps. A deletion passes none: the
 * reading goes, so every row its sentences could still serve elsewhere is
 * handed on. A clear passes the reading's current keys, and keeps only a row
 * that is current for it. Another reading with the same sentence can use such
 * a row by key, so it stays. A row the cleared reading no longer uses by key
 * (an older voice or model) serves no other reading by key either, because
 * configuration is the same for every reading, so it is deleted. Without that,
 * clearing the twin would hand the older row back, and the reading cleared
 * first would play it again.
 *
 * Translations do not need this: their key includes the reading's own plan, so
 * no other reading can use one.
 *
 * Must run inside the caller's read-write transaction over `sentences` and the
 * table, before the reading's own sentences are deleted. Reads only index keys
 * of the table, so a clip's bytes are loaded only for a row that is handed on.
 */
export async function releaseReadingAids<Row extends WrittenFor>(
  db: MonosaiDatabase,
  table: Table<Row, string>,
  readingId: ReadingId,
  currentCacheKeys: ReadonlyMap<SentenceId, string> | null = null,
): Promise<void> {
  const sentences = await db.sentences.where('readingId').equals(readingId).toArray();
  const hashBySentence = new Map<string, string>(
    sentences.map((sentence) => [sentence.id, sentence.contentHash]),
  );
  const current = currentCacheKeys === null ? null : new Set(currentCacheKeys.values());
  const written: { cacheKey: string; sentenceId: string }[] = [];
  await table
    .where('sentenceId')
    .anyOf([...hashBySentence.keys()])
    .eachKey((sentenceId, cursor) => {
      if (current === null || current.has(cursor.primaryKey)) {
        written.push({ cacheKey: cursor.primaryKey, sentenceId: sentenceId as string });
      }
    });

  const hashes = new Set(written.flatMap(({ sentenceId }) => hashBySentence.get(sentenceId) ?? []));
  const twinByHash = new Map<string, WrittenFor>();
  if (hashes.size > 0) {
    const twins = await db.sentences
      .where('contentHash')
      .anyOf([...hashes])
      .toArray();
    for (const twin of twins) {
      if (twin.readingId !== readingId && !twinByHash.has(twin.contentHash)) {
        twinByHash.set(twin.contentHash, { readingId: twin.readingId, sentenceId: twin.id });
      }
    }
  }

  for (const { cacheKey, sentenceId } of written) {
    const twin = twinByHash.get(hashBySentence.get(sentenceId) ?? '');
    if (twin !== undefined) {
      await table
        .where(':id')
        .equals(cacheKey)
        .modify((row: WrittenFor) => {
          Object.assign(row, twin);
        });
    }
  }
  await table.where('readingId').equals(readingId).delete();
}

/**
 * Which of these keys have a row, read through the primary key alone, so a
 * clip's bytes are never deserialized.
 */
export async function storedCacheKeys<Row>(
  table: Table<Row, string>,
  cacheKeys: ReadonlyMap<SentenceId, string>,
): Promise<ReadonlySet<string>> {
  if (cacheKeys.size === 0) {
    return new Set();
  }
  const keys = await table
    .where(':id')
    .anyOf([...new Set(cacheKeys.values())])
    .primaryKeys();
  return new Set(keys);
}

/**
 * Counts the sentences whose current key has a row, wherever that row says it
 * was last written. Two sentences with the same key share one row, so this
 * counts sentences, never rows.
 */
export async function coverageByKey<Row>(
  table: Table<Row, string>,
  cacheKeys: ReadonlyMap<SentenceId, string>,
): Promise<CompletionSummary> {
  const stored = await storedCacheKeys(table, cacheKeys);
  const completed = [...cacheKeys.values()].filter((cacheKey) => stored.has(cacheKey)).length;
  return { total: cacheKeys.size, completed, failed: 0 };
}

/**
 * Read by key, like every other count: an analysis another reading wrote for
 * the same sentence under the same key is this reading's too.
 */
export async function grammarCoverageByKey(
  db: MonosaiDatabase,
  cacheKeys: ReadonlyMap<SentenceId, string>,
): Promise<GrammarSummary> {
  if (cacheKeys.size === 0) {
    return NO_GRAMMAR_REVIEW;
  }
  const rows = await db.grammarAnalyses
    .where(':id')
    .anyOf([...new Set(cacheKeys.values())])
    .toArray();
  const currentByKey = new Map(rows.map((row) => [row.cacheKey, row]));
  let analyzedSentenceCount = 0;
  let concern = 0;
  for (const cacheKey of cacheKeys.values()) {
    const row = currentByKey.get(cacheKey);
    if (row !== undefined) {
      analyzedSentenceCount += 1;
      concern += concernCount(row.findings);
    }
  }
  return analyzedSentenceCount === cacheKeys.size
    ? grammarComplete(concern)
    : grammarPartial(analyzedSentenceCount, concern);
}
