import type { Table } from 'dexie';
import type { ReadingId, SentenceId } from '../../../domain/shared/ids';
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
): Promise<void> {
  const sentences = await db.sentences.where('readingId').equals(readingId).toArray();
  const hashBySentence = new Map<string, string>(
    sentences.map((sentence) => [sentence.id, sentence.contentHash]),
  );
  const written: { cacheKey: string; sentenceId: string }[] = [];
  await table
    .where('sentenceId')
    .anyOf([...hashBySentence.keys()])
    .eachKey((sentenceId, cursor) => {
      written.push({ cacheKey: cursor.primaryKey, sentenceId: sentenceId as string });
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
