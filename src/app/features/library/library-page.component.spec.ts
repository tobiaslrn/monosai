import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LibraryStore } from '../../application/reading/library.store';
import { CLOCK, READING_REPOSITORY } from '../../application/shared/repository-tokens';
import type { Reading } from '../../domain/reading/reading';
import { fixedClock } from '../../domain/shared/clock';
import { readingId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';
import { FakeReadingRepository } from '../../../testing/reading-repository-fake';
import { LibraryPageComponent } from './library-page.component';

function reading(id: string, kind: 'imported' | 'generated', createdAt: number): Reading {
  const base = {
    id: readingId(id),
    title: `Reading ${id}`,
    createdAt,
    updatedAt: createdAt,
    sentenceCount: 4,
    lastOpenedAt: null,
    characterCount: 40,
    translationSummary: { total: 4, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' as const },
    audioSummary: { total: 4, completed: 0, failed: 0 },
    analyzerVersion: '1',
  };
  return kind === 'imported'
    ? { ...base, kind: 'imported', importSource: 'paste', sourceTextHash: 'h' }
    : {
        ...base,
        kind: 'generated',
        form: 'micro',
        premise: 'p',
        snapshotId: 'snap' as never,
        generationProvenanceId: 'g',
        validationOutcome: { kind: 'strict' },
      };
}

describe('LibraryPageComponent', () => {
  let repository: FakeReadingRepository;
  let media: FakeMediaMatcher;

  beforeEach(() => {
    media = installFakeMatchMedia(1280);
    repository = new FakeReadingRepository();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        LibraryStore,
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
        { provide: READING_REPOSITORY, useValue: repository },
      ],
    });
  });

  afterEach(() => {
    media.restore();
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => {
      node.remove();
    });
  });

  /**
   * Loading the library is a chain of awaited repository calls, so the fixture
   * is settled repeatedly rather than once.
   */
  async function settle(fixture: {
    whenStable: () => Promise<unknown>;
    detectChanges: () => void;
  }) {
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function render() {
    const fixture = TestBed.createComponent(LibraryPageComponent);
    fixture.detectChanges();
    await settle(fixture);
    return fixture;
  }

  function element(fixture: Awaited<ReturnType<typeof render>>): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  it('explains both paths when nothing is saved yet', async () => {
    const fixture = await render();

    expect(element(fixture).textContent).toContain('Nothing saved yet');
    expect(element(fixture).textContent).toContain('Add Japanese you already have');
    expect(element(fixture).querySelectorAll('mn-reading-card')).toHaveLength(0);
  });

  it('lists saved readings newest first', async () => {
    repository.readings = [
      reading('a', 'imported', 1_000),
      reading('b', 'generated', 3_000),
      reading('c', 'imported', 2_000),
    ];
    const fixture = await render();

    const titles = [...element(fixture).querySelectorAll('mn-reading-card h3')].map((node) =>
      node.textContent.trim(),
    );
    expect(titles).toEqual(['Reading b', 'Reading c', 'Reading a']);
  });

  it('exposes filters as pressed-state chips and filters the list', async () => {
    repository.readings = [reading('a', 'imported', 1_000), reading('b', 'generated', 2_000)];
    const fixture = await render();

    const chips = [...element(fixture).querySelectorAll<HTMLButtonElement>('.chip')];
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);

    chips[1].click();
    await settle(fixture);

    expect(element(fixture).querySelectorAll('mn-reading-card')).toHaveLength(1);
    expect(element(fixture).textContent).toContain('Reading a');
    expect(
      [...element(fixture).querySelectorAll('.chip')].map((chip) =>
        chip.getAttribute('aria-pressed'),
      ),
    ).toEqual(['false', 'true', 'false']);
  });

  it('announces the filtered result in a polite live region', async () => {
    repository.readings = [reading('a', 'imported', 1_000)];
    const fixture = await render();

    element(fixture).querySelectorAll<HTMLButtonElement>('.chip')[1].click();
    await settle(fixture);

    const live = element(fixture).querySelector('[aria-live="polite"]');
    expect(live?.getAttribute('role')).toBe('status');
    expect(live?.textContent).toContain('1 readings shown');
  });

  it('asks for confirmation before deleting and states what survives', async () => {
    repository.readings = [reading('a', 'imported', 1_000)];
    const fixture = await render();

    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .overflow')?.click();
    fixture.detectChanges();
    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .menu button')?.click();
    await settle(fixture);

    const dialog = document.querySelector('mn-confirm-dialog');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('The text and 4 sentences');
    expect(dialog?.textContent).toContain('vocabulary snapshots');
    expect(repository.deleted).toEqual([]);
  });

  it('deletes only after the confirmation is accepted', async () => {
    repository.readings = [reading('a', 'imported', 1_000)];
    const fixture = await render();

    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .overflow')?.click();
    fixture.detectChanges();
    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .menu button')?.click();
    await settle(fixture);

    const confirm = [
      ...document.querySelectorAll<HTMLButtonElement>('mn-confirm-dialog button'),
    ].find((button) => button.textContent.includes('Delete permanently'));
    confirm?.click();
    await settle(fixture);

    expect(repository.deleted).toEqual([readingId('a')]);
    expect(element(fixture).querySelectorAll('mn-reading-card')).toHaveLength(0);
    expect(element(fixture).querySelector('[aria-live="polite"]')?.textContent).toContain(
      'was deleted',
    );
  });

  it('keeps the reading when the confirmation is declined', async () => {
    repository.readings = [reading('a', 'imported', 1_000)];
    const fixture = await render();

    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .overflow')?.click();
    fixture.detectChanges();
    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .menu button')?.click();
    await settle(fixture);

    const cancel = [
      ...document.querySelectorAll<HTMLButtonElement>('mn-confirm-dialog button'),
    ].find((button) => button.textContent.includes('Keep it'));
    cancel?.click();
    await settle(fixture);

    expect(repository.deleted).toEqual([]);
    expect(element(fixture).querySelectorAll('mn-reading-card')).toHaveLength(1);
  });

  it('reports a load failure and states that nothing was changed', async () => {
    repository.failListWith = storageError('unavailable', 'Storage is unavailable.');
    const fixture = await render();

    const alert = element(fixture).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('could not be loaded');
    expect(alert?.textContent).toContain('Nothing was changed or deleted');
    expect(alert?.querySelector('button')?.textContent).toContain('Try again');
  });
});
