import { Dialog } from '@angular/cdk/dialog';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';
import { snapshotFixture } from '../../../testing/persistence-fixtures';
import { mappingFor } from '../../../testing/anki-provider-contract';
import { CLOCK } from '../../application/shared/repository-tokens';
import type { VocabularyRepository } from '../../domain/vocabulary/vocabulary-repository';
import { storageError } from '../../domain/storage/storage-error';
import { fixedClock } from '../../domain/shared/clock';
import { VocabularyBrowsePageComponent } from './vocabulary-browse-page.component';

const NOW = 1_700_000_000_000;

describe('VocabularyBrowsePageComponent', () => {
  let beds: VocabularyTestBed;
  let media: FakeMediaMatcher;

  beforeEach(() => {
    media = installFakeMatchMedia(1280);
    beds = configureVocabularyTestBed();
    TestBed.overrideProvider(CLOCK, { useValue: fixedClock(NOW) });
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
    media.restore();
  });

  async function settle(fixture: ComponentFixture<VocabularyBrowsePageComponent>): Promise<void> {
    for (let pass = 0; pass < 5; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }

  async function render(): Promise<{
    readonly fixture: ComponentFixture<VocabularyBrowsePageComponent>;
    readonly element: HTMLElement;
  }> {
    const fixture = TestBed.createComponent(VocabularyBrowsePageComponent);
    await settle(fixture);
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  async function seedVocabulary(): Promise<void> {
    const commit = snapshotFixture(80, 3);
    const sourceId = commit.provenance[0].sourceId;
    beds.mappings.stored.set(sourceId, mappingFor({ id: sourceId }));
    await beds.vocabulary.commitSnapshot({
      ...commit,
      items: [
        {
          ...commit.items[0],
          visibleExpression: '食べる',
          canonicalExpression: '食べる',
          meaning: 'eat',
          firstReviewedAt: NOW - 2 * 86_400_000,
          fsrsDifficulty: 5.5,
          analyzedSequence: [{ surface: '食べる', readingHiragana: 'たべる' }],
        },
        {
          ...commit.items[1],
          visibleExpression: '飲む',
          canonicalExpression: '飲む',
          meaning: 'drink',
          firstReviewedAt: NOW - 40 * 86_400_000,
        },
        {
          ...commit.items[2],
          visibleExpression: '見る',
          canonicalExpression: '見る',
        },
      ],
      sources: [mappingFor({ id: sourceId })],
    });
  }

  it('offers the Add words path when no vocabulary exists', async () => {
    const { element } = await render();

    expect(element.textContent).toContain('No vocabulary yet.');
    expect(element.querySelector('a[href="/reading-level#words"]')?.textContent).toContain(
      'Add words',
    );
  });

  it('distinguishes a stored empty snapshot from no vocabulary', async () => {
    const empty = snapshotFixture(81, 1);
    beds.vocabulary.snapshots.push({
      ...empty.snapshot,
      uniqueEntryCount: 0,
      sourceIds: [],
      sourceKinds: [],
      stats: { ...empty.snapshot.stats, uniqueExpressions: 0 },
    });
    beds.vocabulary.activeSnapshotId = empty.snapshot.id;

    const { element } = await render();

    expect(element.textContent).toContain('No words yet.');
    expect(element.textContent).not.toContain('No vocabulary yet.');
  });

  it('narrows by search and reports no-match state', async () => {
    await seedVocabulary();
    const { fixture, element } = await render();
    const search = element.querySelector<HTMLInputElement>('[data-testid="vocabulary-search"]');
    if (search === null) throw new Error('missing search');

    search.value = 'drink';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(element.querySelectorAll('mn-vocabulary-browse-row')).toHaveLength(1);

    search.value = 'not present';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(element.textContent).toContain('No words match your search.');
    expect(element.textContent).toContain('Reset filters');
  });

  it('applies and resets the filter sheet', async () => {
    await seedVocabulary();
    const { fixture, element } = await render();

    element.querySelector<HTMLButtonElement>('[data-testid="vocabulary-filters"]')?.click();
    await settle(fixture);
    const sheet = document.querySelector<HTMLElement>('mn-vocabulary-filter-sheet');
    if (sheet === null) throw new Error('missing filter sheet');
    const studied = sheet.querySelector<HTMLSelectElement>('[aria-label="First studied"]');
    if (studied === null) throw new Error('missing date filter');
    studied.value = 'last-7-days';
    studied.dispatchEvent(new Event('change'));
    sheet.querySelector<HTMLButtonElement>('.mn-button--primary')?.click();
    await settle(fixture);

    expect(element.querySelectorAll('mn-vocabulary-browse-row')).toHaveLength(1);
    element.querySelector<HTMLButtonElement>('[data-testid="vocabulary-filters"]')?.click();
    await settle(fixture);
    document.querySelector<HTMLButtonElement>('mn-vocabulary-filter-sheet .reset')?.click();
    document
      .querySelector<HTMLButtonElement>('mn-vocabulary-filter-sheet .mn-button--primary')
      ?.click();
    await settle(fixture);
    expect(element.querySelectorAll('mn-vocabulary-browse-row')).toHaveLength(3);
  });

  it('expands a row and shows its detailed reading and source link', async () => {
    await seedVocabulary();
    const { fixture, element } = await render();
    const details = element.querySelector<HTMLDetailsElement>('details');
    if (details === null) throw new Error('missing row');

    details.open = true;
    details.dispatchEvent(new Event('toggle'));
    await settle(fixture);

    expect(element.textContent).toContain('たべる');
    expect(element.textContent).toContain('Contributing sources');
    expect(element.querySelector('a[href^="/reading-level/source/"]')).not.toBeNull();
  });

  it('offers retry for a failed or unavailable read', async () => {
    let shouldFail = true;
    const repository = beds.vocabulary as VocabularyRepository;
    const original = repository.listVocabularyEntries.bind(repository);
    repository.listVocabularyEntries = () =>
      shouldFail
        ? Promise.resolve({
            ok: false,
            error: storageError('unavailable', 'Storage is unavailable.'),
          })
        : original();

    const { fixture, element } = await render();

    expect(element.textContent).toContain('Vocabulary is unavailable.');
    shouldFail = false;
    element.querySelector<HTMLButtonElement>('.state-message .mn-button')?.click();
    await settle(fixture);
    expect(element.textContent).toContain('No vocabulary yet.');
  });
});
