import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { FakeGenerationRun, fakeGenerationJob } from '../../../testing/generation-job-fakes';
import { GenerationJobCardComponent } from './generation-job-card.component';

const JOB_ID = '33333333-3333-4333-8333-333333333333';

describe('GenerationJobCardComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
  });

  function render(run: FakeGenerationRun) {
    const fixture = TestBed.createComponent(GenerationJobCardComponent);
    fixture.componentRef.setInput('job', fakeGenerationJob(JOB_ID, run));
    fixture.detectChanges();
    return fixture;
  }

  it('names the stage the run is in and leads back to it', () => {
    const page = render(new FakeGenerationRun({ kind: 'exception-review', candidateCount: 2 }))
      .nativeElement as HTMLElement;

    expect(page.querySelector('h3')?.textContent.trim()).toBe('A cat visits the market');
    expect(page.querySelector('.meta')?.textContent).toContain('Being written');
    expect(page.querySelector('.meta')?.textContent).toContain('Reviewing 2 unfamiliar words');
    expect(page.querySelector('a')?.getAttribute('href')).toBe(`/generate/${JOB_ID}`);
  });

  /** Colour is never the only carrier: the state is written out either way. */
  it('says a stopped run needs attention rather than only colouring it', () => {
    const page = render(
      new FakeGenerationRun({
        kind: 'failed',
        error: {
          domain: 'ai',
          code: 'provider-unavailable',
          task: 'story-generation',
          message: 'The provider is unavailable.',
        },
        during: 'writing',
      }),
    ).nativeElement as HTMLElement;

    expect(page.querySelector('.meta')?.textContent).toContain('Needs attention');
    expect(page.querySelector('.meta')?.textContent).toContain('Generation stopped');
    expect(page.querySelector('article')?.classList.contains('needs-attention')).toBe(true);
  });

  it('names what its one control does now', () => {
    const running = render(new FakeGenerationRun({ kind: 'writing' })).nativeElement as HTMLElement;
    expect(running.querySelector('.dismiss')?.getAttribute('aria-label')).toBe(
      'Stop writing A cat visits the market',
    );

    const stopped = render(new FakeGenerationRun({ kind: 'cancelled', during: 'writing' }))
      .nativeElement as HTMLElement;
    expect(stopped.querySelector('.dismiss')?.getAttribute('aria-label')).toBe(
      'Dismiss A cat visits the market',
    );
  });

  it('emits the job when its control is used', () => {
    const fixture = render(new FakeGenerationRun({ kind: 'cancelled', during: 'writing' }));
    const dismissed: string[] = [];
    fixture.componentInstance.dismissRequested.subscribe((job) => {
      dismissed.push(job.id);
    });

    (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.dismiss')?.click();

    expect(dismissed).toEqual([JOB_ID]);
  });
});
