import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryStore } from '../../application/reading/library.store';
import {
  CLOCK,
  READING_MUTATION_CHANNEL,
  READING_REPOSITORY,
} from '../../application/shared/repository-tokens';
import { fixedClock } from '../../domain/shared/clock';
import { readingId } from '../../domain/shared/ids';
import { FakeReadingMutationChannel } from '../../../testing/reading-mutation-channel-fake';
import { buildReading, FakeReadingRepository } from '../../../testing/reading-repository-fake';
import { OpenReadingWatcher } from './open-reading-watcher.service';

@Component({ selector: 'mn-test-blank', template: '' })
class BlankComponent {}

const OPEN = '3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33';
const OTHER = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d';

/**
 * The reader tab's half of the cross-tab story: there is nothing honest left
 * to render once the reading is gone, so the tab goes back to the library
 * rather than keeping a live surface over deleted rows.
 */
describe('OpenReadingWatcher', () => {
  let channel: FakeReadingMutationChannel;
  let router: Router;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    channel = new FakeReadingMutationChannel();
    const repository = new FakeReadingRepository();
    repository.add(buildReading({ id: OPEN, title: 'Reading one' }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'library', component: BlankComponent },
          { path: 'reader/:id', component: BlankComponent },
        ]),
        LibraryStore,
        { provide: CLOCK, useValue: fixedClock(1_700_000_000_000) },
        { provide: READING_REPOSITORY, useValue: repository },
        { provide: READING_MUTATION_CHANNEL, useValue: channel },
      ],
    });
    router = TestBed.inject(Router);
    TestBed.inject(OpenReadingWatcher);
    await router.navigateByUrl(`/reader/${OPEN}`);
  });

  it('leaves the reader when the reading it shows is deleted elsewhere', async () => {
    channel.deliver({ kind: 'reading-deleted', id: readingId(OPEN), title: 'Reading one' });

    await vi.waitFor(() => {
      expect(router.url).toBe('/library');
    });
    expect(TestBed.inject(LibraryStore).announcement()).toBe(
      'Reading one was deleted in another tab.',
    );
  });

  it('stays put when a different reading is deleted elsewhere', () => {
    channel.deliver({ kind: 'reading-deleted', id: readingId(OTHER), title: 'Another' });

    expect(router.url).toBe(`/reader/${OPEN}`);
  });

  it('stays put when the tab is not in the reader at all', async () => {
    await router.navigateByUrl('/library');

    channel.deliver({ kind: 'reading-deleted', id: readingId(OPEN), title: 'Reading one' });

    expect(router.url).toBe('/library');
  });
});
