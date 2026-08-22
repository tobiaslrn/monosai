import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mappingFor } from '../../../testing/anki-provider-contract';
import { configureVocabularyTestBed } from '../../../testing/vocabulary-fakes';
import { ANALYZER_VERSION, NORMALIZATION_VERSION } from '../../domain/language/analyzer-version';
import { vocabularySourceId } from '../../domain/shared/ids';
import type { TextListVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { SnapshotBuilder, type SourceEntry } from './snapshot-builder';

const MAPPING = mappingFor();
const TEXT_SOURCE: TextListVocabularySource = {
  id: vocabularySourceId('22222222-2222-4222-8222-222222222222'),
  kind: 'text-list',
  label: 'My textbook',
  content: 'ねこ',
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
  lastSyncedAt: 1,
};

function entry(rawValue: string | undefined, sourceRecordId?: string): SourceEntry {
  return {
    sourceId: MAPPING.id,
    ...(rawValue === undefined ? {} : { rawValue }),
    ...(sourceRecordId === undefined ? {} : { sourceRecordId }),
  };
}

describe('SnapshotBuilder', () => {
  let builder: SnapshotBuilder;

  beforeEach(() => {
    configureVocabularyTestBed();
    builder = TestBed.inject(SnapshotBuilder);
  });

  async function build(entries: readonly SourceEntry[]) {
    const built = await builder.build({
      entries,
      sources: [MAPPING],
      warnings: [],
    });
    if (!built.ok) {
      throw new Error(`build failed: ${built.error.code}`);
    }
    return built.value;
  }

  it('builds one item per distinct expression', async () => {
    const built = await build([entry('ねこ'), entry('犬')]);

    expect(built.commit.items.map((item) => item.visibleExpression)).toEqual(['ねこ', '犬']);
    expect(built.stats.uniqueExpressions).toBe(2);
  });

  it('counts a rejected value without turning it into an item', async () => {
    const built = await build([entry('ねこ'), entry('   '), entry(undefined)]);

    expect(built.stats.nonEmptyValues).toBe(1);
    expect(built.stats.rejectedEmptyValues).toBe(2);
    expect(built.commit.items).toHaveLength(1);
  });

  it('merges duplicates and counts the occurrences', async () => {
    const built = await build([entry('ねこ', 'n1'), entry('<b>ねこ</b>', 'n2')]);

    expect(built.commit.items).toHaveLength(1);
    expect(built.stats.duplicateOccurrences).toBe(1);
    expect(built.commit.provenance).toHaveLength(2);
  });

  it('records the mapping a value came from', async () => {
    const built = await build([entry('ねこ', 'n1')]);

    expect(built.commit.provenance[0]).toMatchObject({
      sourceId: MAPPING.id,
      sourceKind: 'anki-package',
      sourceLabel: 'Anki · Core Japanese · Expression',
      deckName: 'Core Japanese',
      noteTypeName: 'Basic',
      fieldName: 'Expression',
      sourceRecordId: 'n1',
    });
  });

  it('canonicalizes for identity while keeping the visible form', async () => {
    const built = await build([entry('ｱｲｳ')]);

    expect(built.commit.items[0].visibleExpression).toBe('ｱｲｳ');
    expect(built.commit.items[0].canonicalExpression).toBe('アイウ');
  });

  it('gives every item a content hash', async () => {
    const built = await build([entry('ねこ'), entry('犬')]);
    const hashes = built.commit.items.map((item) => item.expressionHash);

    expect(new Set(hashes).size).toBe(2);
    expect(hashes.every((hash) => hash.length > 0)).toBe(true);
  });

  it('analyzes each expression into a token sequence for phrase matching', async () => {
    const built = await build([entry('お腹 が 空いた')]);

    expect(built.commit.items[0].analyzedSequence).toEqual([
      { surface: 'お腹 が 空いた', lemma: 'お腹 が 空いた', readingHiragana: 'お腹 が 空いた' },
    ]);
  });

  it('stamps the analyzer and normalization versions', async () => {
    const built = await build([entry('ねこ')]);

    expect(built.commit.snapshot.analyzerVersion).toBe(ANALYZER_VERSION);
    expect(built.commit.snapshot.normalizationVersion).toBe(NORMALIZATION_VERSION);
  });

  it('records which mappings and providers produced the snapshot', async () => {
    const built = await build([entry('ねこ')]);

    expect(built.commit.snapshot.sourceIds).toEqual([MAPPING.id]);
    expect(built.commit.snapshot.sourceKinds).toEqual(['anki-package']);
    expect(built.commit.snapshot.status).toBe('complete');
  });

  it('agrees between the unique count and the items it produced', async () => {
    const built = await build([entry('ねこ'), entry('ねこ'), entry('犬')]);

    expect(built.commit.snapshot.uniqueEntryCount).toBe(built.commit.items.length);
  });

  it('points every item and provenance record at the same snapshot', async () => {
    const built = await build([entry('ねこ', 'n1')]);
    const id = built.commit.snapshot.id;
    const itemIds = new Set(built.commit.items.map((item) => item.id));

    expect(built.commit.items.every((item) => item.snapshotId === id)).toBe(true);
    expect(built.commit.provenance.every((record) => itemIds.has(record.vocabularyItemId))).toBe(
      true,
    );
  });

  it('reports progress across the analysis', async () => {
    const progress: { completed: number; total: number }[] = [];
    await builder.build(
      {
        entries: [entry('ねこ'), entry('犬')],
        sources: [MAPPING],
        warnings: [],
      },
      (update) => progress.push(update),
    );

    expect(progress[0]).toEqual({ completed: 0, total: 2 });
    expect(progress.at(-1)).toEqual({ completed: 2, total: 2 });
  });

  it('builds an empty snapshot from no entries', async () => {
    const built = await build([]);

    expect(built.commit.items).toEqual([]);
    expect(built.stats.uniqueExpressions).toBe(0);
  });

  it('merges duplicates across source kinds while retaining both provenances', async () => {
    const built = await builder.build({
      entries: [entry('<b>ねこ</b>', 'anki-note'), { sourceId: TEXT_SOURCE.id, rawValue: 'ねこ' }],
      sources: [MAPPING, TEXT_SOURCE],
      warnings: [],
    });
    if (!built.ok) throw new Error(built.error.message);

    expect(built.value.commit.items).toHaveLength(1);
    expect(built.value.commit.provenance.map((record) => record.sourceKind)).toEqual([
      'anki-package',
      'text-list',
    ]);
    expect(built.value.commit.snapshot.sourceKinds).toEqual(['anki-package', 'text-list']);
  });

  it('treats pasted-list values as literal text rather than Anki HTML', async () => {
    const built = await builder.build({
      entries: [{ sourceId: TEXT_SOURCE.id, rawValue: '<b>literal</b>' }],
      sources: [TEXT_SOURCE],
      warnings: [],
    });
    if (!built.ok) throw new Error(built.error.message);

    expect(built.value.commit.items[0].visibleExpression).toBe('<b>literal</b>');
  });
});
