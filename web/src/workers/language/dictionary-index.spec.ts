import { beforeAll, describe, expect, it } from 'vitest';
import { readBundleFile } from '../../testing/language-runtime';
import type { RawDictionaryEntry } from '../../app/infrastructure/language/language-asset.schema';
import { DictionaryIndex } from './dictionary-index';

let index: DictionaryIndex;

beforeAll(() => {
  const artifact = JSON.parse(new TextDecoder().decode(readBundleFile('dictionary.json'))) as {
    entries: readonly RawDictionaryEntry[];
  };
  index = DictionaryIndex.build(artifact.entries);
});

describe('bundled dictionary lookup', () => {
  it('ranks the relevant entry for the analyzed form いなかった first', () => {
    const result = index.lookup({
      surface: 'いなかった',
      lemma: 'いる',
      readingHiragana: 'いなかった',
      partOfSpeech: 'verb',
      verbConjugationFamily: 'ichidan',
    });

    expect(result.matchedBy).toBe('lemma');
    expect(result.entries[0].id).toBe('1577980');
    expect(result.entries[0].writtenForms).toContain('居る');
    expect(result.entries[0].senses[0].glossesEn).toContain('to exist');
    expect(result.entries.map((entry) => entry.writtenForms[0])).not.toContain('炒る');
    expect(result.entries.map((entry) => entry.writtenForms[0])).not.toContain('入る');
  });

  it('finds a common beginner word by exact surface', () => {
    const result = index.lookup({ surface: '猫' });
    expect(result.matchedBy).toBe('surface');
    expect(result.entries[0].senses[0].glossesEn[0].startsWith('cat')).toBe(true);
  });

  it('falls back to the lemma when the surface is inflected', () => {
    const result = index.lookup({ surface: '食べまし', lemma: '食べる' });
    expect(result.matchedBy).toBe('lemma');
    expect(result.entries[0].senses[0].glossesEn).toContain('to eat');
  });

  it('prefers the lemma when the surface is spelled like an unrelated word', () => {
    // あり is both the stem of あります and the reading of 蟻, "ant". The verb tag
    // is the only thing that tells them apart.
    const result = index.lookup({ surface: 'あり', lemma: 'ある', partOfSpeech: 'verb' });

    expect(result.matchedBy).toBe('lemma');
    expect(
      result.entries.some((entry) =>
        entry.senses.some((sense) => sense.partsOfSpeech.includes('verb')),
      ),
    ).toBe(true);
  });

  it('returns an exact spelling whose part of speech disagrees rather than nothing', () => {
    // A disagreeing tag is weaker evidence than no entry at all.
    const result = index.lookup({ surface: '猫', partOfSpeech: 'verb' });

    expect(result.matchedBy).toBe('surface');
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('finds a kana-only word', () => {
    const result = index.lookup({ surface: 'ありがとう' });
    expect(result.matchedBy).toBe('surface');
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('finds a word through its reading when surface and lemma miss', () => {
    const result = index.lookup({ surface: 'ネコ', readingHiragana: 'ねこ' });
    expect(['surface', 'reading', 'variant']).toContain(result.matchedBy);
    expect(result.entries.length).toBeGreaterThan(0);
  });

  it('narrows a reading match by part of speech when one is supplied', () => {
    const withoutPos = index.lookup({ surface: 'x', readingHiragana: 'はし' });
    const withPos = index.lookup({ surface: 'x', readingHiragana: 'はし', partOfSpeech: 'noun' });
    expect(withoutPos.entries.length).toBeGreaterThan(0);
    expect(
      withPos.entries.every((entry) =>
        entry.senses.some((sense) => sense.partsOfSpeech.includes('noun')),
      ),
    ).toBe(true);
  });

  it('finds an orthographic variant grouped into the same entry', () => {
    const kanji = index.lookup({ surface: '珈琲' });
    const katakana = index.lookup({ surface: 'コーヒー' });
    expect(kanji.entries[0].id).toBe(katakana.entries[0].id);
  });

  it('normalizes half-width katakana and full-width Latin', () => {
    const halfWidth = index.lookup({ surface: 'ﾈｺ' });
    expect(halfWidth.entries.length).toBeGreaterThan(0);
  });

  it('returns no bundled definition rather than a guess', () => {
    const result = index.lookup({ surface: 'ぬるぽぽぽ' });
    expect(result.matchedBy).toBe('none');
    expect(result.entries).toHaveLength(0);
  });

  it('bounds the number of returned entries', () => {
    const result = index.lookup({ surface: 'こう', limit: 2 });
    expect(result.entries.length).toBeLessThanOrEqual(2);
  });

  it('uses conjugation family, kana preference, and the limit in ranking order', () => {
    const ranked = DictionaryIndex.build([
      { i: 'godan', w: ['炒る'], k: ['いる'], s: [{ p: ['verb'], g: ['roast'], c: ['godan'] }] },
      {
        i: 'ichidan',
        w: ['射る'],
        k: ['いる'],
        s: [{ p: ['verb'], g: ['shoot'], c: ['ichidan'] }],
      },
      {
        i: 'preferred',
        w: ['居る'],
        k: ['いる'],
        s: [{ p: ['verb'], g: ['exist'], c: ['ichidan'], u: true }],
      },
    ]);

    const result = ranked.lookup({
      surface: 'x',
      lemma: 'いる',
      partOfSpeech: 'verb',
      verbConjugationFamily: 'ichidan',
      limit: 1,
    });

    expect(result.entries.map((entry) => entry.id)).toEqual(['preferred']);
  });

  it('falls back deterministically to POS-compatible entries without family metadata', () => {
    const legacy = DictionaryIndex.build([
      { i: 'first', w: [], k: ['いる'], s: [{ p: ['verb'], g: ['first'] }] },
      { i: 'second', w: [], k: ['いる'], s: [{ p: ['verb'], g: ['second'] }] },
    ]);

    const result = legacy.lookup({
      surface: 'x',
      lemma: 'いる',
      partOfSpeech: 'verb',
      verbConjugationFamily: 'ichidan',
    });

    expect(result.entries.map((entry) => entry.id)).toEqual(['first', 'second']);
  });

  it('bounds senses and glosses so an inspector cannot be flooded', () => {
    for (const surface of ['行く', '出る', '取る', '入る']) {
      const result = index.lookup({ surface });
      for (const entry of result.entries) {
        expect(entry.senses.length).toBeLessThanOrEqual(4);
        for (const sense of entry.senses) {
          expect(sense.glossesEn.length).toBeLessThanOrEqual(4);
        }
      }
    }
  });
});
