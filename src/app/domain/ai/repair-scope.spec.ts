import { describe, expect, it } from 'vitest';
import type { StoryCandidate } from './story-request';
import {
  TITLE_INDEX,
  applyScopedRepair,
  planScopedRepair,
  scopedRepairTargets,
} from './repair-scope';

const CANDIDATE: StoryCandidate = {
  titleJa: 'ねこの一日',
  sentences: [
    { index: 0, textJa: 'ねこがいます。' },
    { index: 1, textJa: 'ねこはねます。' },
    { index: 2, textJa: 'ねこは図書館へ行きます。' },
    { index: 3, textJa: 'ねこはあるきます。' },
    { index: 4, textJa: 'ねこはたべます。' },
  ],
};

describe('planScopedRepair', () => {
  it('sends the faulty sentence with one untouched neighbour on each side', () => {
    const entries = planScopedRepair(CANDIDATE, [{ sentenceIndex: 2, surface: '図書館' }]);

    expect(entries.map((entry) => entry.index)).toEqual([1, 2, 3]);
    expect(scopedRepairTargets(entries).map((entry) => entry.index)).toEqual([2]);
    expect(entries[1].surfaces).toEqual(['図書館']);
    expect(entries[0].surfaces).toEqual([]);
  });

  it('sends each sentence once when two faults have overlapping windows', () => {
    const entries = planScopedRepair(CANDIDATE, [
      { sentenceIndex: 1, surface: '図書館' },
      { sentenceIndex: 2, surface: '公園' },
    ]);

    expect(entries.map((entry) => entry.index)).toEqual([0, 1, 2, 3]);
  });

  it('clamps the window at the ends of the story', () => {
    const entries = planScopedRepair(CANDIDATE, [{ sentenceIndex: 0, surface: 'ねこ' }]);

    expect(entries.map((entry) => entry.index)).toEqual([0, 1]);
  });

  it('carries the title as its own entry, without pulling in sentences', () => {
    const entries = planScopedRepair(CANDIDATE, [{ sentenceIndex: null, surface: '一日' }]);

    expect(entries.map((entry) => entry.index)).toEqual([TITLE_INDEX]);
    expect(entries[0].textJa).toBe('ねこの一日');
  });

  it('groups several surfaces in one sentence into a single entry', () => {
    const entries = planScopedRepair(CANDIDATE, [
      { sentenceIndex: 2, surface: '図書館' },
      { sentenceIndex: 2, surface: '行き' },
      { sentenceIndex: 2, surface: '図書館' },
    ]);

    expect(scopedRepairTargets(entries)[0].surfaces).toEqual(['図書館', '行き']);
  });
});

describe('applyScopedRepair', () => {
  const entries = planScopedRepair(CANDIDATE, [{ sentenceIndex: 2, surface: '図書館' }]);

  it('splices the replacement in and leaves every other sentence byte-identical', () => {
    const result = applyScopedRepair(CANDIDATE, entries, {
      titleJa: null,
      replacements: [{ index: 2, textJa: 'ねこはにわへ行きます。' }],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.value.titleJa).toBe('ねこの一日');
    expect(result.value.sentences.map((sentence) => sentence.textJa)).toEqual([
      'ねこがいます。',
      'ねこはねます。',
      'ねこはにわへ行きます。',
      'ねこはあるきます。',
      'ねこはたべます。',
    ]);
  });

  it('refuses a patch that rewrites a sentence it was not asked about', () => {
    const result = applyScopedRepair(CANDIDATE, entries, {
      titleJa: null,
      replacements: [
        { index: 2, textJa: 'ねこはにわへ行きます。' },
        { index: 3, textJa: 'ねこはねむります。' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'story-repair-extra-sentence' });
  });

  it('refuses a patch that leaves a target unanswered', () => {
    const result = applyScopedRepair(CANDIDATE, entries, { titleJa: null, replacements: [] });

    expect(result).toEqual({ ok: false, error: 'story-repair-missing-sentence' });
  });

  it('refuses the same target answered twice', () => {
    const result = applyScopedRepair(CANDIDATE, entries, {
      titleJa: null,
      replacements: [
        { index: 2, textJa: 'ねこはにわへ行きます。' },
        { index: 2, textJa: 'ねこはうみへ行きます。' },
      ],
    });

    expect(result).toEqual({ ok: false, error: 'story-repair-duplicate-sentence' });
  });

  it('refuses a blank replacement rather than deleting the sentence', () => {
    const result = applyScopedRepair(CANDIDATE, entries, {
      titleJa: null,
      replacements: [{ index: 2, textJa: '   ' }],
    });

    expect(result).toEqual({ ok: false, error: 'story-repair-blank-sentence' });
  });

  it('refuses a rewritten title that was never a target', () => {
    const result = applyScopedRepair(CANDIDATE, entries, {
      titleJa: 'まったく別の題',
      replacements: [{ index: 2, textJa: 'ねこはにわへ行きます。' }],
    });

    expect(result).toEqual({ ok: false, error: 'story-repair-title-mismatch' });
  });

  it('requires a title when the title was the target', () => {
    const titleEntries = planScopedRepair(CANDIDATE, [{ sentenceIndex: null, surface: '一日' }]);

    expect(applyScopedRepair(CANDIDATE, titleEntries, { titleJa: null, replacements: [] })).toEqual(
      { ok: false, error: 'story-repair-title-mismatch' },
    );

    const replaced = applyScopedRepair(CANDIDATE, titleEntries, {
      titleJa: 'ねこのあさ',
      replacements: [],
    });
    expect(replaced.ok && replaced.value.titleJa).toBe('ねこのあさ');
  });
});
