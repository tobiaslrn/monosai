import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { ViewportService } from '../../core/platform/viewport.service';
import type { GenerationState } from '../../application/generation/generation.store';
import { GenerationWaitComponent, generationWaitCopy } from './generation-wait.component';

function render(prefersReducedMotion: boolean): HTMLElement {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [
      {
        provide: ViewportService,
        useValue: {
          isDesktop: signal(true),
          isMobile: signal(false),
          prefersReducedMotion: signal(prefersReducedMotion),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(GenerationWaitComponent);
  fixture.componentRef.setInput('state', { kind: 'writing' } satisfies GenerationState);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('GenerationWaitComponent', () => {
  it('loops the illustration while the learner waits', () => {
    const element = render(false);

    expect(element.querySelector('video')?.querySelector('source')?.getAttribute('src')).toBe(
      'assets/story-writer.webm',
    );
    expect(element.querySelector('img')).toBeNull();
  });

  /*
   * A still rather than a paused loop, and a branch rather than a hidden
   * element: the video is never fetched for a learner who asked for less
   * motion.
   */
  it('shows a still frame instead under reduced motion', () => {
    const element = render(true);

    expect(element.querySelector('img')?.getAttribute('src')).toBe('assets/story-writer.png');
    expect(element.querySelector('video')).toBeNull();
  });

  it('keeps the illustration out of the accessibility tree', () => {
    expect(render(false).querySelector('.mascot')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('generationWaitCopy', () => {
  it('describes the main model request plainly', () => {
    expect(generationWaitCopy({ kind: 'writing' })).toEqual({
      key: 'writing',
      title: 'Generating your story',
      detail: 'Writing your story. This is usually the longest step.',
    });
  });

  it('uses the real unfamiliar-word count during review and repair', () => {
    expect(generationWaitCopy({ kind: 'exception-review', candidateCount: 5 }).title).toBe(
      'Reviewing 5 unfamiliar words',
    );
    expect(
      generationWaitCopy({
        kind: 'repairing',
        attempt: 1,
        totalAttempts: 2,
        unknownCount: 5,
        structureIssueCount: 0,
      }),
    ).toMatchObject({
      title: 'Replacing 5 unfamiliar words',
      detail: 'Repair attempt 1 of 2. The revised story will be checked again.',
    });
  });

  it('promises only the Japanese while the story is being saved', () => {
    const state: GenerationState = { kind: 'finalizing' };

    // Aids are no longer part of this wait: the lane produces them after the
    // story is in the library, so saying otherwise here would be a promise the
    // save does not keep.
    expect(generationWaitCopy(state)).toMatchObject({
      title: 'Saving your story',
      detail: 'Adding the Japanese to your library.',
    });
  });
});
