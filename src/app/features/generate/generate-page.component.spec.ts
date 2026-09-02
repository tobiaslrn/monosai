import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { GenerationJobsStore } from '../../application/generation/generation-jobs.store';
import { TextModelStore } from '../../application/settings/text-model.store';
import { configureGenerationTestBed } from '../../../testing/generation-fakes';
import { buildReading } from '../../../testing/reading-repository-fake';
import {
  FakeGenerationJobsStore,
  FakeGenerationRun,
  fakeGenerationJob,
} from '../../../testing/generation-job-fakes';
import { GeneratePageComponent } from './generate-page.component';

const JOB_ID = '22222222-2222-4222-8222-222222222222';

describe('GeneratePageComponent', () => {
  let jobs: FakeGenerationJobsStore;

  beforeEach(() => {
    jobs = new FakeGenerationJobsStore();
    configureGenerationTestBed({
      extraProviders: [
        // Every route the screen navigates to resolves to nothing in
        // particular: what is under test is which address it goes to.
        provideRouter([{ path: '**', children: [] }]),
        { provide: GenerationJobsStore, useValue: jobs },
        {
          // The pipeline harness's model stub answers the store's questions,
          // not the screen's.
          provide: TextModelStore,
          useValue: {
            readiness: signal({ state: 'ready' as const }),
            structuredOutput: signal('native-schema' as const),
            activePresetId: signal<string | null>('preset'),
          },
        },
      ],
    });
  });

  async function renderFixture(jobId?: string) {
    const fixture = TestBed.createComponent(GeneratePageComponent);
    if (jobId !== undefined) {
      fixture.componentRef.setInput('jobId', jobId);
    }
    fixture.detectChanges();
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
    return fixture;
  }

  async function render(jobId?: string) {
    return (await renderFixture(jobId)).nativeElement as HTMLElement;
  }

  it('shows the form when no run is addressed', async () => {
    const page = await render();

    expect(page.querySelector('mn-story-form')).not.toBeNull();
    expect(page.querySelector('[data-testid="generation-screen"]')).toBeNull();
    expect(page.querySelector('[data-testid="missing-job"]')).toBeNull();
  });

  it('shows the progress of the addressed run and says it can be left', async () => {
    jobs.setJobs([fakeGenerationJob(JOB_ID, new FakeGenerationRun({ kind: 'writing' }))]);

    const page = await render(JOB_ID);

    expect(page.querySelector('[data-testid="generation-screen"]')?.textContent).toContain(
      'Generating your story',
    );
    expect(page.querySelector('[data-testid="leave-hint"]')?.textContent).toContain(
      'go back to your library',
    );
    expect(page.querySelector('[data-testid="cancel-generation"]')).not.toBeNull();
    expect(page.querySelector('mn-story-form')).toBeNull();
    // The registry has to know a screen is showing this run, or a story that
    // lands while it is open would be cleaned up before it is reported.
    expect(jobs.watching).toContain(JOB_ID);
  });

  it('says so plainly when the addressed run is not in this tab', async () => {
    const page = await render(JOB_ID);

    const panel = page.querySelector('[data-testid="missing-job"]');
    expect(panel?.textContent).toContain('no longer running');
    expect(panel?.textContent).toContain('Nothing was saved');
    expect(page.querySelector('mn-story-form')).toBeNull();
    expect(page.querySelector('[data-testid="generation-screen"]')).toBeNull();
  });

  it('cancels the run it is watching, and reports that nothing was saved', async () => {
    const run = new FakeGenerationRun({ kind: 'writing' });
    jobs.setJobs([fakeGenerationJob(JOB_ID, run)]);
    const fixture = await renderFixture(JOB_ID);
    const page = fixture.nativeElement as HTMLElement;

    page.querySelector<HTMLButtonElement>('[data-testid="cancel-generation"]')?.click();
    fixture.detectChanges();

    expect(run.cancelled).toHaveLength(1);
    expect(page.textContent).toContain('Nothing was saved');
    expect(page.textContent).toContain('Your premise and instructions are still here');
  });

  it('drops a finished run when the learner goes back to the form', async () => {
    jobs.setJobs([
      fakeGenerationJob(JOB_ID, new FakeGenerationRun({ kind: 'cancelled', during: 'writing' })),
    ]);
    const fixture = await renderFixture(JOB_ID);
    const page = fixture.nativeElement as HTMLElement;

    [...page.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Back to the form'))
      ?.click();
    await fixture.whenStable();

    // The run is over; keeping its row would offer a result there is none of.
    expect(jobs.dismissed.map(String)).toEqual([JOB_ID]);
  });

  it('reports a provider failure with the stage it happened in', async () => {
    jobs.setJobs([
      fakeGenerationJob(
        JOB_ID,
        new FakeGenerationRun({
          kind: 'failed',
          error: {
            domain: 'ai',
            task: 'story-generation',
            code: 'authentication',
            message: 'The key was refused.',
          },
          during: 'writing',
        }),
      ),
    ]);
    const page = (await renderFixture(JOB_ID)).nativeElement as HTMLElement;

    expect(page.querySelector('[data-testid="failure-context"]')?.textContent).toContain(
      'writing your story',
    );
    expect(page.textContent).toContain('ai/authentication');
    expect(page.querySelector('[data-testid="retry-save"]')).toBeNull();
  });

  it('offers one free retry after a save failed, and nothing else', async () => {
    const run = new FakeGenerationRun({
      kind: 'failed',
      error: { domain: 'storage', code: 'unavailable', message: 'Storage is unavailable.' },
      during: 'finalizing',
    });
    jobs.setJobs([fakeGenerationJob(JOB_ID, run)]);
    const fixture = await renderFixture(JOB_ID);
    const page = fixture.nativeElement as HTMLElement;

    expect(page.querySelector('[data-testid="failure-context"]')?.textContent).toContain(
      'saving your story',
    );
    page.querySelector<HTMLButtonElement>('[data-testid="retry-save"]')?.click();
    await fixture.whenStable();

    expect(run.saveRetries).toHaveLength(1);
  });

  it('explains that a new story has to wait while the limit is reached', async () => {
    jobs.nextJobId = null;
    const page = await render();

    expect(page.querySelector('[data-testid="generation-limit"]')?.textContent).toContain(
      'as many stories being written as Monosai runs at once',
    );
    expect(page.querySelector<HTMLButtonElement>('[data-testid="generate"]')?.disabled).toBe(true);
  });

  it('offers the saved story once the run it is watching lands', async () => {
    const run = new FakeGenerationRun({ kind: 'writing' });
    jobs.setJobs([fakeGenerationJob(JOB_ID, run)]);
    const fixture = TestBed.createComponent(GeneratePageComponent);
    fixture.componentRef.setInput('jobId', JOB_ID);
    fixture.detectChanges();

    const saved = buildReading({ id: 'reading-1', title: 'ねこの一日', kind: 'generated' }).reading;
    if (saved.kind !== 'generated') {
      throw new Error('The fixture must build a generated story.');
    }
    run.set({ kind: 'saved', reading: saved });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('[data-testid="saved-title"]')?.textContent).toContain('ねこの一日');
    expect(page.querySelector('[data-testid="open-story"]')?.getAttribute('href')).toBe(
      '/reader/reading-1',
    );
  });
});
