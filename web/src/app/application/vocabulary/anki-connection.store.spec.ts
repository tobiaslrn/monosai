import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONTRACT_COLLECTION } from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { ok } from '../../domain/shared/result';
import { AnkiConnectionStore } from './anki-connection.store';

describe('AnkiConnectionStore', () => {
  let beds: VocabularyTestBed;
  let store: AnkiConnectionStore;
  beforeEach(() => {
    beds = configureVocabularyTestBed();
    TestBed.configureTestingModule({ providers: [AnkiConnectionStore] });
    store = TestBed.inject(AnkiConnectionStore);
  });

  it.each(['desktop-connect', 'android-connect'] as const)(
    'previews and commits %s without changing its kind',
    async (kind) => {
      const provider = Object.assign(new FakeAnkiProvider(CONTRACT_COLLECTION, { kind }), {
        sampleFields: () =>
          Promise.resolve(
            ok([
              {
                deckName: 'Core Japanese',
                noteTypeName: 'Basic',
                fields: { Expression: 'ねこ', Meaning: 'cat' },
              },
            ]),
          ),
      });
      await store.connect(provider);
      expect(store.refresh.state().kind).toBe('awaiting-confirmation');
      expect(store.sampleWords()).toContain('ねこ');
      expect(beds.vocabulary.commitCount).toBe(0);
      expect(beds.mappings.stored.size).toBe(0);
      await store.confirm();
      expect(beds.vocabulary.commitCount).toBe(1);
      expect(beds.mappings.stored.size).toBe(1);
      const source = [...beds.mappings.stored.values()][0];
      expect(source.kind !== 'text-list' && source.providerKind).toBe(kind);
    },
  );

  it('leaves all choices empty when sampling is unavailable and cancels without a write', async () => {
    await store.connect(new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' }));
    expect(store.selection()).toEqual({ deckName: '', noteTypeName: '', expressionFieldName: '' });
    store.cancel();
    expect(beds.vocabulary.commitCount).toBe(0);
    expect(beds.mappings.stored.size).toBe(0);
  });
});
