import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { CONTRACT_COLLECTION } from '../../../testing/anki-collection';
import { FakeAnkiProvider } from '../../../testing/anki-fakes';
import { mappingFor } from '../../../testing/anki-provider-contract';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { ANKI_PROVIDER_FACTORY } from '../../application/shared/anki-tokens';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { snapshotFixture } from '../../../testing/persistence-fixtures';
import { vocabularySourceId } from '../../domain/shared/ids';
import { unmeasuredBasis } from '../../domain/anki/practice-evidence';
import type { SourceMapping } from '../../domain/vocabulary/source-mapping';
import type { TextListVocabularySource } from '../../domain/vocabulary/vocabulary-source';
import { SourceListComponent } from './source-list.component';

const TEXT_LIST: TextListVocabularySource = {
  id: vocabularySourceId('22222222-2222-4222-8222-222222222222'),
  kind: 'text-list',
  label: 'My textbook',
  content: 'ねこ\n犬',
  enabled: true,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  lastSyncedAt: 1_700_000_000_000,
};

/**
 * A shelf, not a control panel.
 *
 * A row answers what it is, where it came from, and how many words. Everything
 * a source can be made to do lives on its own page, and the row is the way in —
 * so the thing this spec guards hardest is what is *not* on a row.
 */
describe('SourceListComponent', () => {
  let beds: VocabularyTestBed;
  let anki: SourceMapping;

  beforeEach(async () => {
    beds = configureVocabularyTestBed();
    TestBed.overrideProvider(ANKI_PROVIDER_FACTORY, {
      useValue: () => new FakeAnkiProvider(CONTRACT_COLLECTION, { kind: 'desktop-connect' }),
    });
    beds.mappings.stored.set(TEXT_LIST.id, TEXT_LIST);
    anki = mappingFor({ kind: 'anki-connect', providerKind: 'desktop-connect' });
    beds.mappings.stored.set(anki.id, anki);
    await TestBed.inject(SourceMappingStore).load();
  });

  async function render(): Promise<{
    readonly fixture: ComponentFixture<SourceListComponent>;
    readonly element: HTMLElement;
  }> {
    const fixture = TestBed.createComponent(SourceListComponent);
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  /** The last complete read of the text list, as the source repository holds it. */
  function cacheWords(words: readonly string[]): void {
    beds.mappings.caches.set(TEXT_LIST.id, {
      sourceId: TEXT_LIST.id,
      refreshedAt: 1_700_000_000_000,
      entries: words.map((rawValue) => ({ rawValue })),
      warnings: [],
      practice: unmeasuredBasis(1_700_000_000_000),
    });
  }

  async function settle(fixture: ComponentFixture<SourceListComponent>): Promise<void> {
    for (let pass = 0; pass < 3; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  function rows(element: HTMLElement): readonly HTMLAnchorElement[] {
    return [...element.querySelectorAll<HTMLAnchorElement>('[data-testid="source-row"]')];
  }

  it('gives every source one row that opens its own page', async () => {
    const { element } = await render();
    const listed = rows(element);

    expect(listed).toHaveLength(2);
    expect(listed.map((row) => row.getAttribute('href'))).toEqual([
      `/reading-level/source/${TEXT_LIST.id}`,
      `/reading-level/source/${anki.id}`,
    ]);
  });

  /** A row is for choosing what to open, so nothing on it configures anything. */
  it('carries no controls of its own', async () => {
    const { element } = await render();

    expect(element.querySelectorAll('input')).toHaveLength(0);
    expect(element.querySelectorAll('select')).toHaveLength(0);
    expect(element.textContent).not.toContain('Remove');
  });

  it('says where a source came from and how much is in it', async () => {
    cacheWords(['ねこ', '犬']);
    const { element } = await render();
    const list = rows(element)[0]!;

    expect(list.textContent).toContain('My textbook');
    expect(list.textContent).toContain('Your list');
    expect(list.textContent).toContain('2 words');
  });

  /** Re-reading a source changes its cache, and the new snapshot is how the list hears of it. */
  it('reads the standings again when a new vocabulary becomes current', async () => {
    cacheWords(['ねこ', '犬']);
    const { fixture, element } = await render();
    expect(rows(element)[0]!.textContent).toContain('2 words');

    cacheWords(['ねこ', '犬', '鳥']);
    beds.vocabulary.snapshots.push(snapshotFixture(1).snapshot);
    beds.vocabulary.activeSnapshotId = snapshotFixture(1).snapshot.id;
    await TestBed.inject(SnapshotHistoryStore).load();
    await settle(fixture);

    expect(rows(element)[0]!.textContent).toContain('3 words');
  });

  it('reads the standings again when the list of sources changes', async () => {
    const { fixture, element } = await render();
    expect(rows(element)[0]!.textContent).not.toContain('words');

    cacheWords(['ねこ']);
    await TestBed.inject(SourceMappingStore).setIncluded(TEXT_LIST.id, false);
    await settle(fixture);

    expect(rows(element)[0]!.textContent).toContain('1 word');
  });

  /**
   * Leaving a source out is a reversible decision, not a fault. The row keeps
   * its name and says the one thing that changed.
   */
  it('marks an uncounted source as uncounted rather than as broken', async () => {
    await TestBed.inject(SourceMappingStore).setIncluded(TEXT_LIST.id, false);
    const { element } = await render();

    expect(rows(element)[0]!.textContent).toContain('not counted');
    expect(rows(element)[0]!.closest('mn-list-row')?.classList.contains('is-off')).toBe(true);
  });

  /** The vocabulary card above the list states the count; the list does not repeat it. */
  it('leaves the count to the vocabulary card', async () => {
    const { element } = await render();

    expect(element.querySelector('[data-testid="words-standing"]')).toBeNull();
  });

  it('says nothing about how current the sources are before one has been read', async () => {
    const { element } = await render();

    expect(element.querySelector('[data-testid="source-synced"]')).toBeNull();
    expect(element.querySelector('[data-testid="sync-again"]')).toBeNull();
  });

  it('says nothing about attention while nothing needs it', async () => {
    const { element } = await render();

    expect(element.querySelector('[data-testid="source-attention"]')).toBeNull();
  });
});
