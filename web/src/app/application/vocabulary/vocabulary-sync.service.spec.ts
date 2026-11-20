import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { mappingFor } from '../../../testing/anki-provider-contract';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { unmeasuredBasis } from '../../domain/anki/practice-evidence';
import type { VocabularySourceId } from '../../domain/shared/ids';
import type { VocabularySourceCache } from '../../domain/vocabulary/vocabulary-source';
import { VocabularySyncService } from './vocabulary-sync.service';

describe('VocabularySyncService', () => {
  let beds: VocabularyTestBed;
  let sync: VocabularySyncService;

  beforeEach(() => {
    beds = configureVocabularyTestBed();
    sync = TestBed.inject(VocabularySyncService);
  });

  function cacheFor(sourceId: VocabularySourceId): VocabularySourceCache {
    return {
      sourceId,
      refreshedAt: 1_700_000_000_000,
      entries: [{ rawValue: '猫', sourceRecordId: '1' }],
      warnings: [],
      practice: unmeasuredBasis(1_700_000_000_000),
    };
  }

  it('drops what a refresh read from a source the learner has removed since', async () => {
    const kept = mappingFor({ kind: 'anki-connect', providerKind: 'desktop-connect' });
    const removed = { ...kept, id: '00000000-0000-4000-8000-0000000000aa' as VocabularySourceId };
    beds.mappings.stored.set(kept.id, kept);

    const prepared = await sync.prepare({ caches: [cacheFor(kept.id), cacheFor(removed.id)] });

    if (!prepared.ok) throw new Error('the refresh should prepare');
    expect(prepared.value.commit.caches.map((cache) => cache.sourceId)).toEqual([kept.id]);
  });
});
