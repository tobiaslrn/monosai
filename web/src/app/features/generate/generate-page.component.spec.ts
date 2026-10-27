import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { GenerationJobsStore } from '../../application/generation/generation-jobs.store';
import { StoryPlotStore } from '../../application/generation/story-plot.store';
import {
  EMPTY_STORY_DIRECTION,
  rollPlotFrames,
  storyDirectionRecord,
} from '../../domain/ai/story-direction';
import { TextModelStore } from '../../application/settings/text-model.store';
import { TtsStore } from '../../application/settings/tts.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import { ok } from '../../domain/shared/result';
import {
  configureGenerationTestBed,
  type GenerationTestBed,
} from '../../../testing/generation-fakes';
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
  let bed: GenerationTestBed;
  const online = signal(true);
  const sources = signal<readonly unknown[]>([]);

  beforeEach(() => {
    sources.set([]);
    jobs = new FakeGenerationJobsStore();
    online.set(true);
    bed = configureGenerationTestBed({
      // Enough reviewed words that the word list is not itself a blocker.
      uniqueEntryCount: 60,
      extraProviders: [
        // Every route the screen navigates to resolves to nothing in
        // particular: what is under test is which address it goes to.
        provideRouter([{ path: '**', children: [] }]),
        { provide: GenerationJobsStore, useValue: jobs },
        { provide: NETWORK_STATUS, useValue: { isOnline: online } },
        {
          provide: SourceMappingStore,
          useValue: { sources, load: () => Promise.resolve() },
        },
        {
          // The form asks the voice configuration one question: whether audio
          // can be prepared at all. The real store reaches a speech provider,
          // which writing a story has no business opening.
          provide: TtsStore,
          useValue: { readiness: signal('ready' as const) },
        },
        {
          // The pipeline harness's model stub answers the store's questions,
          // not the screen's.
          provide: TextModelStore,
          useValue: {
            readiness: signal('ready' as const),
            testFailure: signal(null),
            structuredOutput: signal('native-schema' as const),
            activePresetId: signal<string | null>('preset'),
            configForTask: () => ({
              modelId: 'vendor/text-model',
              reasoningEffort: null,
              structuredOutput: 'native-schema' as const,
              storyTokenBudget: 8_000,
            }),
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
    await settle(fixture);
    return fixture;
  }

  async function settle(fixture: {
    whenStable(): Promise<unknown>;
    detectChanges(): void;
  }): Promise<void> {
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  function press(page: HTMLElement, testId: string): void {
    const button = page.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    if (button === null) {
      throw new Error(`no button named ${testId}`);
    }
    button.click();
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
  it('places labelled offline blockers beside the disabled Next that would draft plots', async () => {
    online.set(false);
    const fixture = await renderFixture();
    const page = fixture.nativeElement as HTMLElement;

    // Leaving the words costs nothing, so it is never blocked.
    expect(page.querySelector<HTMLButtonElement>('[data-testid="wizard-next"]')?.disabled).toBe(
      false,
    );
    press(page, 'wizard-next');
    await settle(fixture);

    const button = page.querySelector<HTMLButtonElement>('[data-testid="wizard-next"]');
    expect(button?.disabled).toBe(true);
    expect(button?.getAttribute('aria-describedby')).toBe('mn-generate-disabled-reason');
    // The blockers lead the form in the document flow, never inside the sticky
    // action bar, where they rode up over the fields they explain.
    expect(page.querySelector('mn-prerequisite-panel')?.textContent).toContain('You are offline');
    expect(page.querySelector('[data-check="network"] strong')?.textContent).toContain(
      'Connection',
    );
  });

  it('shows the progress of the addressed run and says it can be left', async () => {
    jobs.setJobs([fakeGenerationJob(JOB_ID, new FakeGenerationRun({ kind: 'writing' }))]);

    const page = await render(JOB_ID);

    expect(page.querySelector('[data-testid="generation-screen"]')?.textContent).toContain(
      'Generating your story',
    );
    expect(page.querySelector('[data-testid="leave-hint"]')?.textContent).toContain(
      'return to the library',
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
    expect(page.textContent).toContain('Your direction and plots are still here');
  });

  it('drops a finished run when the learner goes back to the form', async () => {
    const frame = rollPlotFrames(EMPTY_STORY_DIRECTION, { nextInt: () => 0 })[0]!;
    jobs.setJobs([
      {
        ...fakeGenerationJob(
          JOB_ID,
          new FakeGenerationRun({ kind: 'cancelled', during: 'writing' }),
        ),
        chosenPlot: {
          frame,
          record: storyDirectionRecord(
            EMPTY_STORY_DIRECTION,
            frame,
            'A lost glove.',
            'A lost glove.',
          ),
        },
      },
    ]);
    const fixture = await renderFixture(JOB_ID);
    const page = fixture.nativeElement as HTMLElement;

    [...page.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Back to the form'))
      ?.click();
    await fixture.whenStable();

    // The run is over; keeping its row would offer a result there is none of.
    expect(jobs.dismissed.map(String)).toEqual([JOB_ID]);
    // Nothing was written, so the learner is back at the plot they sent.
    expect(TestBed.inject(GenerationDraftStore).step()).toBe(3);
    expect(TestBed.inject(StoryPlotStore).selected()?.text).toBe('A lost glove.');
  });

  it('walks words, direction, and plot, and starts the story from the picked plot', async () => {
    bed.provider.plotQueue.push(
      ok([
        'Aiko loses her umbrella at the station and has to ask a stranger for help.',
        'Two old friends plan a picnic, but a sudden call changes the day.',
        'A boy finds a letter under his desk that was meant for his teacher.',
      ]),
    );
    const fixture = await renderFixture();
    const page = fixture.nativeElement as HTMLElement;
    const draft = TestBed.inject(GenerationDraftStore);
    draft.toggleOption('mood', 'Cozy');
    // A configured word source is the one prerequisite this bed leaves unmet.
    sources.set([{}]);

    press(page, 'wizard-next');
    await settle(fixture);
    expect(page.querySelector('mn-story-direction')).not.toBeNull();
    expect(bed.provider.generationCalls.plots).toBe(0);

    press(page, 'wizard-next');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(page.querySelectorAll('[data-testid="plot-option"]')).toHaveLength(3);
    });
    expect(bed.provider.generationCalls.plots).toBe(1);

    page.querySelectorAll<HTMLInputElement>('input[name="mn-plot"]')[1]!.click();
    await settle(fixture);
    press(page, 'generate');
    await settle(fixture);

    expect(jobs.started).toHaveLength(1);
    const started = jobs.started[0]!.draft;
    expect(started.premise).toBe(
      'Two old friends plan a picnic, but a sudden call changes the day.',
    );
    expect(started.chosenPlot?.record.selected).toEqual({ mood: ['Cozy'] });
    expect(started.chosenPlot?.frame.values.mood).toEqual([{ value: 'Cozy', rolled: false }]);
    // The next story starts from the words, with the same choices.
    expect(draft.step()).toBe(1);
    expect(draft.direction().selected.mood).toEqual(['Cozy']);
  });

  it('goes up one step at a time from the header, and to the library from the words', async () => {
    const fixture = await renderFixture();
    const page = fixture.nativeElement as HTMLElement;
    const draft = TestBed.inject(GenerationDraftStore);
    TestBed.inject(StoryPlotStore).clear();
    draft.setStep(3);
    fixture.detectChanges();

    expect(page.querySelector('[data-testid="step-back"]')?.getAttribute('aria-label')).toBe(
      'Back to direction',
    );
    press(page, 'step-back');
    fixture.detectChanges();
    expect(draft.step()).toBe(2);
    expect(page.querySelector('[data-testid="step-back"]')?.getAttribute('aria-label')).toBe(
      'Back to words',
    );
    press(page, 'step-back');
    fixture.detectChanges();
    expect(draft.step()).toBe(1);
    expect(page.querySelector('[data-testid="step-back"]')).toBeNull();
    expect(page.querySelector('[aria-label="Back to library"]')).not.toBeNull();
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

    expect(page.querySelector('[data-testid="failure-context"]')).toBeNull();
    expect(page.textContent).not.toContain('ai/authentication');
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

    expect(page.querySelector('[data-testid="failure-context"]')).toBeNull();
    page.querySelector<HTMLButtonElement>('[data-testid="retry-save"]')?.click();
    await fixture.whenStable();

    expect(run.saveRetries).toHaveLength(1);
  });

  it('explains that a new story has to wait while the limit is reached', async () => {
    jobs.nextJobId = null;
    TestBed.inject(GenerationDraftStore).setStep(3);
    const page = await render();

    expect(page.querySelector('[data-testid="generation-limit"]')?.textContent).toContain(
      'Generation limit reached',
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
