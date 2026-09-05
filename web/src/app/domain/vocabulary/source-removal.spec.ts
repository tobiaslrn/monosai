import { describe, expect, it } from 'vitest';
import { vocabularySourceId } from '../shared/ids';
import { describeSourceRemoval } from './source-removal';
import type { AnkiVocabularySource, TextListVocabularySource } from './vocabulary-source';

function source(overrides: Partial<TextListVocabularySource> = {}): TextListVocabularySource {
  return {
    id: vocabularySourceId('00000000-0000-4000-8000-000000000001'),
    kind: 'text-list',
    label: 'My textbook',
    content: 'ねこ',
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
    lastSyncedAt: 1,
    ...overrides,
  };
}

const ANKI: AnkiVocabularySource = {
  id: vocabularySourceId('00000000-0000-4000-8000-000000000002'),
  kind: 'anki-connect',
  providerKind: 'desktop-connect',
  label: 'Anki · Core Japanese · Expression',
  deckName: 'Core Japanese',
  deckScope: 'deck-only',
  noteTypeName: 'Basic',
  expressionFieldName: 'Expression',
  automaticSync: true,
  enabled: true,
  createdAt: 2,
  updatedAt: 2,
  lastSyncedAt: null,
};

const OTHER = ANKI;

describe('describeSourceRemoval', () => {
  it('names the source being removed', () => {
    const target = source();

    const plan = describeSourceRemoval(target, { sources: [target, OTHER], storyCount: 0 });

    expect(plan.title).toBe('Remove My textbook?');
    expect(plan.removes[0]).toContain('My textbook');
  });

  it('says the vocabulary drops to nothing when it is the only included source', () => {
    const target = source();

    const plan = describeSourceRemoval(target, { sources: [target], storyCount: 0 });

    expect(plan.emptiesVocabulary).toBe(true);
    expect(plan.removes.join(' ')).toContain('drops to none');
  });

  it('counts only the sources that are still included as survivors', () => {
    const target = source();
    const excluded = { ...OTHER, enabled: false };

    const plan = describeSourceRemoval(target, {
      sources: [target, excluded],
      storyCount: 0,
    });

    expect(plan.emptiesVocabulary).toBe(true);
  });

  it('leaves the vocabulary standing when another source still contributes', () => {
    const target = source();

    const plan = describeSourceRemoval(target, { sources: [target, OTHER], storyCount: 0 });

    expect(plan.emptiesVocabulary).toBe(false);
    expect(plan.removes.join(' ')).toContain('your 1 other source');
  });

  it('states how many stories were generated from the vocabulary', () => {
    const target = source();

    expect(
      describeSourceRemoval(target, { sources: [target, OTHER], storyCount: 1 }).removes.join(' '),
    ).toContain('1 story was');
    expect(
      describeSourceRemoval(target, { sources: [target, OTHER], storyCount: 3 }).removes.join(' '),
    ).toContain('3 stories were');
  });

  it('omits the story line when nothing was generated from this vocabulary', () => {
    const target = source();

    const plan = describeSourceRemoval(target, { sources: [target, OTHER], storyCount: 0 });

    expect(plan.removes.join(' ')).not.toContain('story');
  });

  /** Read-only Anki access: nothing here may suggest the collection is touched. */
  it('promises the Anki collection is untouched for an Anki source', () => {
    const plan = describeSourceRemoval(ANKI, { sources: [ANKI], storyCount: 0 });

    expect(plan.preserves).toContain('your Anki collection');
    expect(plan.preserves).toContain('your stories');
  });
});
