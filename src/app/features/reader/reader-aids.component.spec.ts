import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  configureVocabularyTestBed,
  type VocabularyTestBed,
} from '../../../testing/vocabulary-fakes';
import { snapshotId } from '../../domain/shared/ids';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import { ReaderAidsComponent } from './reader-aids.component';

const ACTIVE = snapshotId('33333333-3333-4333-8333-333333333333');

function snapshot(uniqueEntryCount: number): VocabularySnapshot {
  return {
    id: ACTIVE,
    createdAt: 1_700_000_000_000,
    status: 'complete',
    uniqueEntryCount,
    sourceIds: [],
    sourceKinds: [],
    analyzerVersion: 'test',
    normalizationVersion: 'test',
    stats: {
      sourcesQueried: 1,
      entriesRead: uniqueEntryCount,
      nonEmptyValues: uniqueEntryCount,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 0,
      uniqueExpressions: uniqueEntryCount,
      sourceWarnings: [],
    },
  };
}

/**
 * Why the markers look the way they do.
 *
 * Losing the vocabulary repaints every reading — a story generated from those
 * very words included — and the reader used to say nothing at all about it.
 * The note sits with the switch that draws the markers.
 */
describe('ReaderAidsComponent', () => {
  let beds: VocabularyTestBed;

  beforeEach(() => {
    beds = configureVocabularyTestBed();
  });

  async function render(): Promise<HTMLElement> {
    const fixture: ComponentFixture<ReaderAidsComponent> =
      TestBed.createComponent(ReaderAidsComponent);
    for (let pass = 0; pass < 4; pass += 1) {
      fixture.detectChanges();
      await fixture.whenStable();
    }
    return fixture.nativeElement as HTMLElement;
  }

  function notice(element: HTMLElement): string | null {
    return (
      element
        .querySelector('[data-testid="reader-vocabulary-notice"]')
        ?.textContent.replace(/\s+/g, ' ')
        .trim() ?? null
    );
  }

  function activate(uniqueEntryCount: number): void {
    beds.vocabulary.snapshots.splice(
      0,
      beds.vocabulary.snapshots.length,
      snapshot(uniqueEntryCount),
    );
    beds.vocabulary.activeSnapshotId = ACTIVE;
  }

  it('says nothing while there is a vocabulary to mark against', async () => {
    activate(42);

    expect(notice(await render())).toBeNull();
  });

  it('explains an empty vocabulary, which marks every word', async () => {
    activate(0);

    const message = notice(await render());
    expect(message).toContain('no words in it');
    expect(message).toContain('marked as new');
  });

  it('explains that no vocabulary means nothing is marked', async () => {
    expect(notice(await render())).toContain('no vocabulary yet');
  });

  it('offers the page where the vocabulary is fixed', async () => {
    activate(0);
    const element = await render();

    const link = element.querySelector<HTMLAnchorElement>(
      '[data-testid="reader-vocabulary-notice"] a',
    );
    expect(link?.getAttribute('href')).toContain('/vocabulary');
  });

  /** Appearance is embedded, so a notice needs no extra header button. */
  it('shows the vocabulary notice inside appearance without another button', async () => {
    activate(0);
    const element = await render();

    expect(element.querySelector('button')).toBeNull();
    expect(notice(element)).toContain('no words in it');
  });

  it('groups the preferences under Reading appearance', async () => {
    activate(7);
    const element = await render();

    expect(element.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe(
      'Reading appearance',
    );
  });
});
