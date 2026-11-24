import { describe, expect, it } from 'vitest';
import type { BusyWork, HoldingWork } from '../../domain/shared/busy-work';
import { busyWorkLine, unsavedStoryReload, waitingForWork } from './busy-work-copy';

describe('busy work copy', () => {
  it.each<[HoldingWork, string]>([
    [{ kind: 'story-generation', count: 1 }, 'Waiting for the story'],
    [{ kind: 'story-generation', count: 2 }, 'Waiting for 2 stories'],
    [{ kind: 'package-import' }, 'Waiting for Anki import'],
    [{ kind: 'import-draft' }, 'Waiting for pasted text'],
  ])('names what a waiting Reload waits for in a short phrase', (work, phrase) => {
    expect(waitingForWork(work)).toBe(phrase);
  });

  it('groups a count with the shared formatter', () => {
    expect(waitingForWork({ kind: 'story-generation', count: 1200 })).toBe(
      'Waiting for 1,200 stories',
    );
  });

  it('asks before a reload loses a story whose save failed, naming it, and keeps it safely', () => {
    expect(unsavedStoryReload(1)).toMatchObject({
      title: 'Reload and lose the new story?',
      confirmLabel: 'Reload',
      cancelLabel: 'Keep story',
      tone: 'danger',
    });
    expect(unsavedStoryReload(1200)).toMatchObject({
      title: 'Reload and lose 1,200 new stories?',
      cancelLabel: 'Keep stories',
    });
  });

  it.each<[BusyWork, string]>([
    [{ kind: 'story-generation', count: 1 }, 'A story is being generated'],
    [{ kind: 'story-generation', count: 3 }, '3 stories are being generated'],
    [{ kind: 'unsaved-story', count: 1 }, 'A written story is unsaved'],
    [{ kind: 'package-import' }, 'An Anki package is being imported'],
    [{ kind: 'import-draft' }, 'An import draft is unsaved'],
  ])('says what a reload would discard as a line of its own', (work, line) => {
    expect(busyWorkLine(work)).toBe(line);
  });
});
