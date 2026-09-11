import { signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GenerationJobsStore } from '../../application/generation/generation-jobs.store';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LibraryStore } from '../../application/reading/library.store';
import {
  CLOCK,
  READING_MUTATION_CHANNEL,
  READING_REPOSITORY,
} from '../../application/shared/repository-tokens';
import { VocabularyAvailabilityStore } from '../../application/vocabulary/vocabulary-availability.store';
import type { Reading } from '../../domain/reading/reading';
import { fixedClock } from '../../domain/shared/clock';
import { readingId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import {
  FakeGenerationJobsStore,
  FakeGenerationRun,
  fakeGenerationJob,
} from '../../../testing/generation-job-fakes';
import { FakeReadingMutationChannel } from '../../../testing/reading-mutation-channel-fake';
import { FakeReadingRepository } from '../../../testing/reading-repository-fake';
import { HomePageComponent } from './home-page.component';

function reading(id: string): Reading {
  return {
    id: readingId(id),
    kind: 'imported',
    importSource: 'paste',
    sourceTextHash: 'h',
    title: `Reading ${id}`,
    createdAt: 1_000,
    updatedAt: 1_000,
    sentenceCount: 4,
    lastOpenedAt: null,
    characterCount: 40,
    excerpt: '猫が好きです。',
    translationSummary: { total: 4, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' },
    audioSummary: { total: 4, completed: 0, failed: 0 },
    preparationTargets: [],
    analyzerVersion: '1',
  };
}

describe('HomePageComponent', () => {
  let repository: FakeReadingRepository;
  let jobs: FakeGenerationJobsStore;

  beforeEach(() => {
    repository = new FakeReadingRepository();
    jobs = new FakeGenerationJobsStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        LibraryStore,
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
        { provide: READING_REPOSITORY, useValue: repository },
        { provide: READING_MUTATION_CHANNEL, useValue: new FakeReadingMutationChannel() },
        { provide: GenerationJobsStore, useValue: jobs },
        // The standing line has its own spec for the states it renders; here it
        // only has to exist without reaching the database.
        {
          provide: VocabularyAvailabilityStore,
          useValue: {
            state: signal({ kind: 'unknown' as const }),
            refresh: () => Promise.resolve(),
          },
        },
        {
          provide: GrammarProfileStore,
          useValue: { selectedPreset: signal(null), load: () => Promise.resolve() },
        },
      ],
    });
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((node) => {
      node.remove();
    });
  });

  /** Loading the library is a chain of awaited calls, so settle repeatedly. */
  async function settle(fixture: ComponentFixture<HomePageComponent>): Promise<void> {
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function render(): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();
    await settle(fixture);
    return fixture.nativeElement as HTMLElement;
  }

  function links(element: HTMLElement, selector: string): { text: string; href: string | null }[] {
    return [...element.querySelectorAll<HTMLAnchorElement>(selector)].map((link) => ({
      text: link.textContent.trim(),
      href: link.getAttribute('href'),
    }));
  }

  it('offers both ways to start a story directly, with no menu between', async () => {
    repository.readings = [reading('a')];
    const element = await render();

    expect(links(element, '.home-actions a')).toEqual([
      { text: 'Write with AI', href: '/generate' },
      { text: 'Paste text', href: '/add' },
    ]);
    expect(element.querySelector('.home-actions a.mn-button--primary')?.textContent).toContain(
      'Write with AI',
    );
    expect(element.querySelector('[aria-haspopup]')).toBeNull();
  });

  it('ends its bar with the tabs and then Help, which is on Home alone', async () => {
    const element = await render();

    const trailing = [...(element.querySelector('.trailing')?.children ?? [])];
    expect(trailing.map((child) => child.tagName.toLowerCase())).toEqual(['mn-main-nav', 'a']);
    const help = element.querySelector<HTMLAnchorElement>('.trailing > a');
    expect(help?.getAttribute('href')).toBe('/help');
    expect(help?.getAttribute('aria-label')).toBe('Help');
    expect(help?.getAttribute('title')).toBe('Help');
    expect(element.querySelector('nav[aria-label="Utilities"]')).toBeNull();
  });

  it('leads with the standing line, which opens the words and level', async () => {
    const element = await render();

    expect(element.querySelector('mn-page-header h1')?.textContent).toContain('Home');
    expect(element.querySelector('[data-testid="home-standing"]')?.getAttribute('href')).toBe(
      '/reading-level#words',
    );
  });

  it('provides day and night artwork for the theme-specific hero', async () => {
    const element = await render();

    expect(
      [...element.querySelectorAll<HTMLImageElement>('.hero-art img')].map((image) =>
        image.getAttribute('src'),
      ),
    ).toEqual(['assets/home-reader.png', 'assets/home-reader-dark.png']);
  });

  /**
   * The first-run screen has to explain what Monosai is: it is what a stranger
   * lands on at the public address, and nothing else on it says so.
   */
  it('explains what Monosai is when nothing is saved or being written', async () => {
    const element = await render();

    expect(element.querySelector('mn-home-welcome h2')?.textContent).toContain(
      'Japanese you can actually read',
    );
    expect(element.textContent).toContain('Everything stays on this device.');
    // Paste text already stands among the actions; the welcome does not repeat it.
    expect(links(element, 'mn-home-welcome a')).toEqual([
      { text: 'Add a word list', href: '/reading-level#words' },
    ]);
    expect(element.querySelector('.home-hero')?.classList.contains('is-compact')).toBe(false);
  });

  it('does not introduce Monosai before the library has answered', () => {
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('mn-home-welcome')).toBeNull();
  });

  it('steps the hero back once there is a story', async () => {
    repository.readings = [reading('a')];
    const element = await render();

    expect(element.querySelector('mn-home-welcome')).toBeNull();
    expect(element.querySelector('.home-hero')?.classList.contains('is-compact')).toBe(true);
  });

  it('lists a story being written under its own heading, naming its stage', async () => {
    jobs.setJobs([fakeGenerationJob('job-1', new FakeGenerationRun({ kind: 'writing' }))]);
    const element = await render();

    expect(element.querySelector('#home-group-writing')?.textContent).toBe('Being written');
    const card = element.querySelector('mn-generation-job-card');
    expect(card?.textContent).toContain('A cat visits the market');
    expect(card?.textContent).toContain('Generating your story');
    expect(card?.querySelector('a')?.getAttribute('href')).toBe('/generate/job-1');
    // A run is not nothing: the introduction does not stand in for its result.
    expect(element.querySelector('mn-home-welcome')).toBeNull();
  });

  it('dismisses a stopped generation without asking, and says nothing was saved', async () => {
    jobs.setJobs([
      fakeGenerationJob('job-3', new FakeGenerationRun({ kind: 'cancelled', during: 'writing' })),
    ]);
    const fixture = TestBed.createComponent(HomePageComponent);
    fixture.detectChanges();
    await settle(fixture);
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('.dismiss')?.click();
    await settle(fixture);

    expect(jobs.dismissed.map(String)).toEqual(['job-3']);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('Nothing was saved');
  });

  it('confirms before stopping a story that is still being written', async () => {
    jobs.setJobs([fakeGenerationJob('job-4', new FakeGenerationRun({ kind: 'writing' }))]);
    const element = await render();

    element.querySelector<HTMLButtonElement>('.dismiss')?.click();
    await new Promise((resolve) => setTimeout(resolve));

    expect(document.querySelector('.cdk-overlay-container')?.textContent).toContain(
      'Stop writing this story?',
    );
    expect(jobs.dismissed).toHaveLength(0);
  });

  it('offers no way back and no figures while no story has been opened', async () => {
    repository.readings = [reading('a')];
    const element = await render();

    expect(element.querySelector('#home-group-continue')).toBeNull();
    expect(element.querySelector('#home-group-reading')).toBeNull();
    expect(element.textContent).not.toContain('Sample');
  });

  it('continues the story opened most recently, under a Sample pill', async () => {
    repository.readings = [
      { ...reading('a'), lastOpenedAt: 1_500 },
      { ...reading('b'), lastOpenedAt: 2_500 },
    ];
    const element = await render();

    const group = element.querySelector('#home-group-continue')?.closest('section');
    expect(group?.querySelector('.mn-status-pill--warning')?.textContent.trim()).toBe('Sample');
    const row = group?.querySelector<HTMLAnchorElement>('a[data-testid="continue-reading"]');
    expect(row?.getAttribute('href')).toBe('/reader/b');
    expect(row?.textContent).toContain('Reading b');
    expect(row?.textContent).toContain('Paragraph 3 of 5');
  });

  it('shows the reading figures and the streak under a Sample pill', async () => {
    repository.readings = [{ ...reading('a'), lastOpenedAt: 1_500 }];
    const element = await render();

    const group = element.querySelector('#home-group-reading')?.closest('section');
    expect(group?.querySelector('.mn-status-pill--warning')?.textContent.trim()).toBe('Sample');
    expect(group?.querySelectorAll('mn-home-stat-tiles li')).toHaveLength(3);
    expect(
      group?.querySelector('mn-streak-calendar [role="img"]')?.getAttribute('aria-label'),
    ).toBe('Sample: 5-day reading streak');
    // The headline already says how many words are known; no tile repeats it.
    expect(group?.textContent).not.toContain('words');
  });

  it('reports a library that could not be read and keeps both ways to start', async () => {
    repository.failListWith = storageError('unavailable', 'Storage is unavailable.');
    const element = await render();

    const alert = element.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('could not be loaded');
    expect(alert?.querySelector('button')?.textContent).toContain('Try again');
    expect(element.querySelector('mn-home-welcome')).toBeNull();
    expect(element.querySelectorAll('.home-actions a')).toHaveLength(2);
  });
});
