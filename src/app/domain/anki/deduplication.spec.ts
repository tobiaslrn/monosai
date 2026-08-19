import { describe, expect, it } from 'vitest';
import { snapshotId, sourceMappingId, vocabularyItemId } from '../shared/ids';
import type { VocabularyItemId } from '../shared/ids';
import { mergeEntries, type PreparedEntry } from './deduplication';

const SNAPSHOT = snapshotId('33333333-3333-4333-8333-333333333333');
const MAPPING_A = sourceMappingId('11111111-1111-4111-8111-111111111111');
const MAPPING_B = sourceMappingId('22222222-2222-4222-8222-222222222222');

function idSequence(): () => VocabularyItemId {
  let next = 0;
  return () => {
    next += 1;
    return vocabularyItemId(`item-${String(next)}`);
  };
}

function entry(overrides: Partial<PreparedEntry> = {}): PreparedEntry {
  const visible = overrides.visibleExpression ?? 'ねこ';
  return {
    sourceMappingId: MAPPING_A,
    deckName: 'Core Japanese',
    noteTypeName: 'Basic',
    fieldName: 'Expression',
    visibleExpression: visible,
    canonicalExpression: visible,
    expressionHash: `hash(${visible})`,
    analyzedSequence: [{ surface: visible }],
    ...overrides,
  };
}

describe('mergeEntries', () => {
  it('keeps distinct expressions apart', () => {
    const result = mergeEntries(
      [entry({ visibleExpression: 'ねこ' }), entry({ visibleExpression: '犬' })],
      SNAPSHOT,
      idSequence(),
    );

    expect(result.items.map((item) => item.visibleExpression)).toEqual(['ねこ', '犬']);
    expect(result.duplicateOccurrences).toBe(0);
  });

  it('merges exact canonical duplicates into one item', () => {
    const result = mergeEntries(
      [entry({ sourceNoteId: 'n1' }), entry({ sourceNoteId: 'n2' })],
      SNAPSHOT,
      idSequence(),
    );

    expect(result.items).toHaveLength(1);
    expect(result.duplicateOccurrences).toBe(1);
  });

  it('retains one provenance record per mapping and note', () => {
    const result = mergeEntries(
      [
        entry({ sourceNoteId: 'n1' }),
        entry({ sourceNoteId: 'n2' }),
        entry({ sourceMappingId: MAPPING_B, deckName: 'Extra', sourceNoteId: 'n1' }),
      ],
      SNAPSHOT,
      idSequence(),
    );

    expect(result.items).toHaveLength(1);
    expect(result.provenance).toHaveLength(3);
    expect(result.provenance.map((record) => record.sourceMappingId)).toEqual([
      MAPPING_A,
      MAPPING_A,
      MAPPING_B,
    ]);
    expect(
      result.provenance.every((record) => record.vocabularyItemId === result.items[0].id),
    ).toBe(true);
  });

  it('does not repeat provenance for the same mapping and note seen twice', () => {
    const result = mergeEntries(
      [entry({ sourceNoteId: 'n1' }), entry({ sourceNoteId: 'n1' })],
      SNAPSHOT,
      idSequence(),
    );

    expect(result.provenance).toHaveLength(1);
    expect(result.duplicateOccurrences).toBe(1);
  });

  it('omits the note id when the provider could not supply one', () => {
    const result = mergeEntries([entry()], SNAPSHOT, idSequence());
    expect(result.provenance[0]).not.toHaveProperty('sourceNoteId');
  });

  it('keeps distinct orthographies of one word as separate items', () => {
    const result = mergeEntries(
      [entry({ visibleExpression: 'たべる' }), entry({ visibleExpression: '食べる' })],
      SNAPSHOT,
      idSequence(),
    );

    expect(result.items).toHaveLength(2);
  });

  it('takes the first occurrence for the visible form and analyzed sequence', () => {
    const result = mergeEntries(
      [
        entry({ analyzedSequence: [{ surface: 'ねこ', lemma: 'ねこ' }] }),
        entry({ analyzedSequence: [{ surface: 'different' }] }),
      ],
      SNAPSHOT,
      idSequence(),
    );

    expect(result.items[0].analyzedSequence).toEqual([{ surface: 'ねこ', lemma: 'ねこ' }]);
  });

  it('stamps every item with the snapshot it belongs to', () => {
    const result = mergeEntries([entry()], SNAPSHOT, idSequence());
    expect(result.items[0].snapshotId).toBe(SNAPSHOT);
  });
});
