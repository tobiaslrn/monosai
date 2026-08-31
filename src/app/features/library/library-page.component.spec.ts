import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { AudioJobStore } from '../../application/enrichment/audio-job.store';
import { TranslationJobStore } from '../../application/enrichment/translation-job.store';
import { LibraryStore } from '../../application/reading/library.store';
import { CLOCK, READING_REPOSITORY } from '../../application/shared/repository-tokens';
import type { Reading } from '../../domain/reading/reading';
import type { ReadingId } from '../../domain/shared/ids';
import { fixedClock } from '../../domain/shared/clock';
import { readingId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';
import { FakeReadingRepository } from '../../../testing/reading-repository-fake';
import { FILTER_VISIBILITY_THRESHOLD, LibraryPageComponent } from './library-page.component';

function reading(
  id: string,
  kind: 'imported' | 'generated',
  createdAt: number,
  characterCount = 40,
  completedAudio = 0,
): Reading {
  const base = {
    id: readingId(id),
    title: `Reading ${id}`,
    createdAt,
    updatedAt: createdAt,
    sentenceCount: 4,
    lastOpenedAt: null,
    characterCount,
    excerpt: '猫が好きです。',
    translationSummary: { total: 4, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' as const },
    audioSummary: { total: 4, completed: completedAudio, failed: 0 },
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

/**
 * Only what the page asks a job store: whether this reading has a run, and the
 * chance to finalize it before deletion. The real stores reach the database and
 * the providers, which deleting from the library has no business starting.
 */
class FakeJobStore {
  running: ReadingId | null = null;
  readonly finalized: ReadingId[] = [];

  isRunningFor(readingId: ReadingId): boolean {
    return this.running === readingId;
  }

  readingDeleted(readingId: ReadingId): Promise<void> {
    this.finalized.push(readingId);
    this.running = null;
    return Promise.resolve();
  }
}

/**
 * Only what the page asks of playback: stop reading a reading it is deleting.
 * The real store owns an audio element and reaches the database, neither of
 * which a library deletion has any business touching.
 */
class FakePlaybackStore {
  readonly stopped: ReadingId[] = [];

  readingDeleted(readingId: ReadingId): void {
    this.stopped.push(readingId);
  }
}

describe('LibraryPageComponent', () => {
  let repository: FakeReadingRepository;
  let media: FakeMediaMatcher;
  let translationJob: FakeJobStore;
  let audioJob: FakeJobStore;
  let playback: FakePlaybackStore;

  beforeEach(() => {
    media = installFakeMatchMedia(1280);
    repository = new FakeReadingRepository();
    translationJob = new FakeJobStore();
    audioJob = new FakeJobStore();
    playback = new FakePlaybackStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        LibraryStore,
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
        { provide: READING_REPOSITORY, useValue: repository },
        { provide: TranslationJobStore, useValue: translationJob },
        { provide: AudioJobStore, useValue: audioJob },
        { provide: AudioPlaybackStore, useValue: playback },
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

  function newReadingButton(fixture: Awaited<ReturnType<typeof render>>): HTMLButtonElement | null {
    return element(fixture).querySelector<HTMLButtonElement>('.library-title-row button');
  }

  /** Enough readings that the filter chips are worth showing. */
  function shelf(): Reading[] {
    return Array.from({ length: FILTER_VISIBILITY_THRESHOLD }, (_unused, index) =>
      reading(`r${String(index)}`, index % 2 === 0 ? 'imported' : 'generated', 1_000 + index),
    );
  }

  it('explains both ways to start when nothing is saved yet', async () => {
    const fixture = await render();

    expect(element(fixture).querySelector('.mark')?.getAttribute('src')).toBe('icons/icon-192.png');
    expect(element(fixture).querySelector('.wordmark')?.textContent).toBe('Monosai');
    expect(element(fixture).querySelector('h1')?.textContent).toBe('Library');
    expect(element(fixture).textContent).toContain('Add Japanese you already have');
    expect(element(fixture).textContent).toContain('Generate from reviewed Anki vocabulary');
    expect(
      [...element(fixture).querySelectorAll<HTMLAnchorElement>('.empty-choice')].map((link) =>
        link.getAttribute('href'),
      ),
    ).toEqual(['/add', '/generate']);
    expect(element(fixture).querySelectorAll('mn-reading-card')).toHaveLength(0);
    expect(newReadingButton(fixture)).not.toBeNull();
  });

  it('offers both ways in from the one New reading button', async () => {
    const fixture = await render();

    newReadingButton(fixture)?.click();
    await settle(fixture);

    const menu = document.querySelector('mn-new-reading-menu');
    const links = [...(menu?.querySelectorAll('a') ?? [])];
    expect(links.map((link) => link.textContent.trim())).toEqual(['Paste text', 'Write with AI']);
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/add', '/generate']);
  });

  it('hides the filter chips until the shelf is large enough to need them', async () => {
    repository.readings = [reading('a', 'imported', 1_000), reading('b', 'generated', 2_000)];
    const fixture = await render();

    expect(element(fixture).querySelectorAll('.chip')).toHaveLength(0);
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

  it('groups readings by relative date without empty date sections', async () => {
    const now = 1_700_000_000_000;
    const daysAgo = (days: number): number => {
      const date = new Date(now);
      date.setHours(12, 0, 0, 0);
      date.setDate(date.getDate() - days);
      return date.getTime();
    };
    repository.readings = [
      reading('today', 'imported', daysAgo(0)),
      reading('yesterday', 'imported', daysAgo(1)),
      reading('recent', 'generated', daysAgo(4)),
    ];
    const fixture = await render();

    const groups = [...element(fixture).querySelectorAll('.date-group h2')].map((heading) =>
      heading.textContent.trim(),
    );
    expect(groups).toEqual(['Today', 'Yesterday', 'Earlier this week']);
  });

  it('shows character count and available audio without a sentence preview or Read button', async () => {
    repository.readings = [reading('a', 'imported', 1_000, 1, 1)];
    const fixture = await render();
    const row = element(fixture).querySelector('mn-reading-card');

    expect(row?.textContent).toContain('1 character');
    expect(row?.textContent).toContain('Audio available');
    expect(row?.querySelector('.excerpt')).toBeNull();
    expect(
      [...(row?.querySelectorAll('button') ?? [])].some((button) => button.textContent === 'Read'),
    ).toBe(false);
  });

  it('exposes filters as pressed-state chips and filters the list', async () => {
    repository.readings = shelf();
    const fixture = await render();

    const chips = [...element(fixture).querySelectorAll<HTMLButtonElement>('.chip')];
    expect(chips.map((chip) => chip.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false',
    ]);

    chips[1].click();
    await settle(fixture);

    expect(element(fixture).querySelectorAll('mn-reading-card')).toHaveLength(4);
    expect(
      [...element(fixture).querySelectorAll('.chip')].map((chip) =>
        chip.getAttribute('aria-pressed'),
      ),
    ).toEqual(['false', 'true', 'false']);
  });

  it('announces the filtered result in a polite live region', async () => {
    repository.readings = shelf();
    const fixture = await render();

    element(fixture).querySelectorAll<HTMLButtonElement>('.chip')[1].click();
    await settle(fixture);

    const live = element(fixture).querySelector('[aria-live="polite"]');
    expect(live?.getAttribute('role')).toBe('status');
    expect(live?.textContent).toContain('4 readings shown');
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
    expect(dialog?.textContent).toContain('reviewed vocabulary');
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
    // The reader's delete path has always done this; this one never did, and a
    // reading deleted from here went on being read aloud from a store still
    // holding its clips.
    expect(playback.stopped).toEqual([readingId('a')]);
  });

  it('leaves playback alone when the confirmation is declined', async () => {
    repository.readings = [reading('a', 'imported', 1_000)];
    const fixture = await render();

    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .overflow')?.click();
    fixture.detectChanges();
    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .menu button')?.click();
    await settle(fixture);

    const keep = [...document.querySelectorAll<HTMLButtonElement>('mn-confirm-dialog button')].find(
      (button) => button.textContent.includes('Keep it'),
    );
    keep?.click();
    await settle(fixture);

    expect(playback.stopped).toEqual([]);
  });

  it('names a running job in the confirmation and finalizes it before deleting', async () => {
    repository.readings = [reading('a', 'imported', 1_000)];
    translationJob.running = readingId('a');
    const fixture = await render();

    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .overflow')?.click();
    fixture.detectChanges();
    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .menu button')?.click();
    await settle(fixture);

    const dialog = document.querySelector('mn-confirm-dialog');
    expect(dialog?.textContent).toContain('The translation currently in progress');

    [...document.querySelectorAll<HTMLButtonElement>('mn-confirm-dialog button')]
      .find((button) => button.textContent.includes('Delete permanently'))
      ?.click();
    await settle(fixture);

    // Both stores hear about it, so neither is left writing to rows that
    // deleting the reading is about to remove.
    expect(translationJob.finalized).toEqual([readingId('a')]);
    expect(audioJob.finalized).toEqual([readingId('a')]);
    expect(repository.deleted).toEqual([readingId('a')]);
  });

  it('leaves a running job alone when the confirmation is declined', async () => {
    repository.readings = [reading('a', 'imported', 1_000)];
    audioJob.running = readingId('a');
    const fixture = await render();

    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .overflow')?.click();
    fixture.detectChanges();
    element(fixture).querySelector<HTMLButtonElement>('mn-reading-card .menu button')?.click();
    await settle(fixture);

    [...document.querySelectorAll<HTMLButtonElement>('mn-confirm-dialog button')]
      .find((button) => button.textContent.includes('Keep it'))
      ?.click();
    await settle(fixture);

    expect(audioJob.finalized).toEqual([]);
    expect(repository.deleted).toEqual([]);
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
