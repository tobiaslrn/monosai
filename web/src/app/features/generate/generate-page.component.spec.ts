import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenerationDraftStore } from '../../application/generation/generation-draft.store';
import { PreparationStore } from '../../application/enrichment/preparation.store';
import type { LayerProgress } from '../../application/enrichment/layer-progress';
import { aiError } from '../../domain/ai/ai-error';
import { GenerationJobsStore } from '../../application/generation/generation-jobs.store';
import { ExceptionPolicyStore } from '../../application/settings/exception-policy.store';
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
  const laneProgress = signal<LayerProgress>({ kind: 'idle' });

  beforeEach(() => {
    sources.set([]);
    laneProgress.set({ kind: 'idle' });
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
        { provide: PreparationStore, useValue: { progressFor: () => laneProgress() } },
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

  afterEach(() => {
    vi.restoreAllMocks();
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

  /**
   * A click on the named button. Its count is 1 unless said otherwise: a phone
   * may report 1 for both taps of a double tap, so nothing here may rely on it.
   */
  function press(page: HTMLElement, testId: string, clicks = 1): void {
    const button = page.querySelector<HTMLButtonElement>(`[data-testid="${testId}"]`);
    if (button === null) {
      throw new Error(`no button named ${testId}`);
    }
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: clicks }));
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
    expect(page.querySelector('mn-prerequisite-panel')?.textContent).toContain('Offline');
    expect(page.querySelector('[data-check="network"] strong')?.textContent).toContain(
      'Connection',
    );
  });

  it('shows the progress of the addressed run and says it can be left', async () => {
    jobs.setJobs([fakeGenerationJob(JOB_ID, new FakeGenerationRun({ kind: 'writing' }))]);

    const page = await render(JOB_ID);

    expect(page.querySelector('[data-testid="generation-screen"]')?.textContent).toContain(
      'Writing the story',
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
    expect(panel?.textContent).not.toContain('Nothing was saved');
    expect(panel?.textContent).not.toContain('This generation is no longer running.');
    expect(panel?.querySelector('.mn-button--primary')?.textContent.trim()).toBe('Go to library');
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

  describe('a double tap, whatever click count the browser reports', () => {
    type Input = 'touch' | 'pen' | 'mouse' | 'keyboard';

    /**
     * One press as the browser reports it: a finger down at `down`, and the
     * click it ends in at `up`, both stamped with the time of the input. The
     * count is 1 throughout, since a phone may report that for both taps.
     */
    function tap(
      page: HTMLElement,
      selector: string,
      input: Input,
      down: number,
      up: number,
      detail = 1,
    ): void {
      const target = page.querySelector(selector);
      if (target === null) {
        throw new Error(`nothing matches ${selector}`);
      }
      const pointerType = input === 'keyboard' ? '' : input;
      const stamped = <E extends Event>(event: E, at: number): E => {
        Object.defineProperty(event, 'timeStamp', { value: at });
        return event;
      };
      if (input !== 'keyboard') {
        target.dispatchEvent(
          stamped(new PointerEvent('pointerdown', { bubbles: true, pointerType }), down),
        );
      }
      target.dispatchEvent(
        stamped(
          new PointerEvent('click', {
            bubbles: true,
            cancelable: true,
            pointerType,
            detail: input === 'keyboard' ? 0 : detail,
          }),
          up,
        ),
      );
    }

    const NEXT = '[data-testid="wizard-next"]';
    const GENERATE = '[data-testid="generate"]';
    const BACK = '[data-testid="step-back"]';

    async function reachForm() {
      bed.provider.plotQueue.push(ok(['One plot.', 'Two plot.', 'Three plot.']));
      sources.set([{}]);
      const fixture = await renderFixture();
      return { fixture, page: fixture.nativeElement as HTMLElement };
    }

    async function reachGenerate() {
      const { fixture, page } = await reachForm();
      tap(page, NEXT, 'touch', 0, 60);
      await settle(fixture);
      tap(page, NEXT, 'touch', 1_000, 1_060);
      await vi.waitFor(() => {
        fixture.detectChanges();
        expect(page.querySelectorAll('[data-testid="plot-option"]')).toHaveLength(3);
      });
      return { fixture, page };
    }

    const step = () => TestBed.inject(GenerationDraftStore).step();

    it('takes two touch taps on Next, the screen redrawn between them, as one press', async () => {
      const { fixture, page } = await reachForm();

      tap(page, NEXT, 'touch', 0, 60);
      fixture.detectChanges();
      tap(page, NEXT, 'touch', 200, 260);
      await settle(fixture);

      expect(step()).toBe(2);
      expect(bed.provider.generationCalls.plots).toBe(0);
    });

    it('judges by when the fingers touched, not when a busy page got to the taps', async () => {
      const { fixture, page } = await reachForm();

      // The page handled both long after the fingers were off the glass; only
      // the times on the events say that the taps were 200 ms apart.
      tap(page, NEXT, 'touch', 0, 60);
      fixture.detectChanges();
      await new Promise((resolve) => setTimeout(resolve, 350));
      tap(page, NEXT, 'touch', 260, 320);
      await settle(fixture);

      expect(step()).toBe(2);
      expect(bed.provider.generationCalls.plots).toBe(0);
    });

    it('takes a second tap before the screen has redrawn for the first as one press', async () => {
      const { fixture, page } = await reachForm();

      // Far enough apart to be two presses; what makes it a repeat is that the
      // button it landed on was drawn for the step already left.
      tap(page, NEXT, 'touch', 0, 60);
      tap(page, NEXT, 'touch', 900, 960);
      await settle(fixture);

      expect(step()).toBe(2);
      expect(bed.provider.generationCalls.plots).toBe(0);
    });

    it('takes two touch taps at a normal pace as two presses', async () => {
      const { fixture, page } = await reachForm();

      tap(page, NEXT, 'touch', 0, 60);
      await settle(fixture);
      tap(page, NEXT, 'touch', 400, 460);
      await settle(fixture);

      expect(step()).toBe(3);
      expect(bed.provider.generationCalls.plots).toBe(1);
    });

    it('takes quick mouse and keyboard presses as separate presses', async () => {
      const { fixture, page } = await reachForm();

      tap(page, NEXT, 'mouse', 0, 5);
      await settle(fixture);
      tap(page, NEXT, 'mouse', 10, 15);
      await settle(fixture);
      expect(step()).toBe(3);

      TestBed.inject(GenerationDraftStore).setStep(1);
      await settle(fixture);
      tap(page, NEXT, 'keyboard', 20, 20);
      await settle(fixture);
      tap(page, NEXT, 'keyboard', 21, 21);
      await settle(fixture);
      expect(step()).toBe(3);
    });

    it('takes a mouse double click as one press', async () => {
      const { fixture, page } = await reachForm();

      tap(page, NEXT, 'mouse', 0, 5, 1);
      fixture.detectChanges();
      tap(page, NEXT, 'mouse', 10, 15, 2);
      await settle(fixture);

      expect(step()).toBe(2);
    });

    it('starts one story, and the Next that takes Generate’s place does not move the form', async () => {
      const { fixture, page } = await reachGenerate();

      tap(page, GENERATE, 'touch', 2_000, 2_060);
      fixture.detectChanges();
      tap(page, NEXT, 'touch', 2_200, 2_260);
      await settle(fixture);

      expect(jobs.started).toHaveLength(1);
      expect(step()).toBe(1);
      expect(bed.provider.generationCalls.plots).toBe(1);
    });

    it('starts one story from a second Generate tap before the screen has redrawn', async () => {
      const { fixture, page } = await reachGenerate();

      tap(page, GENERATE, 'touch', 2_000, 2_060);
      tap(page, GENERATE, 'touch', 3_000, 3_060);
      await settle(fixture);

      expect(jobs.started).toHaveLength(1);
    });

    it('lets Generate be pressed again after a start that did not go ahead', async () => {
      const { fixture, page } = await reachGenerate();
      vi.spyOn(jobs, 'start').mockReturnValueOnce(null);

      tap(page, GENERATE, 'touch', 2_000, 2_060);
      await settle(fixture);
      expect(step()).toBe(3);
      tap(page, GENERATE, 'touch', 3_000, 3_060);
      await settle(fixture);

      expect(jobs.started).toHaveLength(1);
      expect(step()).toBe(1);
    });

    it('keeps Next still while the story is still moving the screen on', async () => {
      const { fixture, page } = await reachGenerate();
      let arrive: (reached: boolean) => void = () => undefined;
      vi.spyOn(TestBed.inject(Router), 'navigate').mockReturnValue(
        new Promise<boolean>((resolve) => {
          arrive = resolve;
        }),
      );

      tap(page, GENERATE, 'touch', 2_000, 2_060);
      await settle(fixture);
      // A separate press, long after, while the navigation is still pending.
      tap(page, NEXT, 'touch', 5_000, 5_060);
      await settle(fixture);
      expect(step()).toBe(1);

      arrive(true);
      await settle(fixture);
      tap(page, NEXT, 'touch', 6_000, 6_060);
      await settle(fixture);
      expect(step()).toBe(2);
    });

    it('takes a second Next while the exceptions are still saving as one press', async () => {
      const { fixture, page } = await reachForm();
      TestBed.inject(ExceptionPolicyStore).setDraft('Allow proper nouns for the cat.');
      let finish: () => void = () => undefined;
      const saving = new Promise<void>((resolve) => {
        finish = resolve;
      });
      const update = bed.policy.updateExceptionPolicy.bind(bed.policy);
      const spy = vi
        .spyOn(bed.policy, 'updateExceptionPolicy')
        .mockImplementation(async (policy) => {
          await saving;
          return update(policy);
        });

      tap(page, NEXT, 'touch', 0, 60);
      fixture.detectChanges();
      tap(page, NEXT, 'touch', 900, 960);
      finish();
      await settle(fixture);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(step()).toBe(2);
    });

    it('lets Next be pressed again after the exceptions failed to save', async () => {
      const { fixture, page } = await reachForm();
      TestBed.inject(ExceptionPolicyStore).setDraft('Allow proper nouns for the cat.');
      vi.spyOn(TestBed.inject(ExceptionPolicyStore), 'save').mockResolvedValueOnce(false);

      tap(page, NEXT, 'touch', 0, 60);
      await settle(fixture);
      expect(step()).toBe(1);
      tap(page, NEXT, 'touch', 900, 960);
      await settle(fixture);

      expect(step()).toBe(2);
    });

    it('takes two taps on Back as one press', async () => {
      const { fixture, page } = await reachForm();
      TestBed.inject(GenerationDraftStore).setStep(3);
      fixture.detectChanges();

      tap(page, BACK, 'touch', 0, 60);
      fixture.detectChanges();
      tap(page, BACK, 'touch', 200, 260);
      await settle(fixture);

      expect(step()).toBe(2);
    });

    it('does not carry a second tap on Back out of the page', async () => {
      const { fixture, page } = await reachForm();
      TestBed.inject(GenerationDraftStore).setStep(2);
      fixture.detectChanges();
      const leave = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);

      tap(page, BACK, 'touch', 0, 60);
      fixture.detectChanges();
      // The step button is now the way back to the library, under the finger.
      tap(page, '[aria-label="Back to library"]', 'touch', 200, 260);
      await settle(fixture);

      expect(step()).toBe(1);
      expect(leave).not.toHaveBeenCalled();

      tap(page, '[aria-label="Back to library"]', 'touch', 900, 960);
      expect(leave).toHaveBeenCalledTimes(1);
    });

    it('takes a burst of three taps as one press, not one press and a half', async () => {
      const { fixture, page } = await reachForm();

      tap(page, NEXT, 'touch', 0, 10);
      fixture.detectChanges();
      tap(page, NEXT, 'touch', 165, 175);
      fixture.detectChanges();
      tap(page, NEXT, 'touch', 330, 340);
      await settle(fixture);

      expect(step()).toBe(2);
      expect(bed.provider.generationCalls.plots).toBe(0);
    });

    it('takes a pen like a finger', async () => {
      const { fixture, page } = await reachForm();

      tap(page, NEXT, 'pen', 0, 60);
      fixture.detectChanges();
      tap(page, NEXT, 'pen', 200, 260);
      await settle(fixture);

      expect(step()).toBe(2);
    });

    it('leaves the story it started running when the second tap lands on Cancel', async () => {
      const { fixture, page } = await reachGenerate();
      const run = new FakeGenerationRun({ kind: 'writing' });
      jobs.setJobs([fakeGenerationJob(JOB_ID, run)]);

      tap(page, GENERATE, 'touch', 2_000, 2_060);
      await settle(fixture);
      // The run's screen is a new page, with Cancel where Generate was.
      const watching = await renderFixture(JOB_ID);
      const screen = watching.nativeElement as HTMLElement;
      const CANCEL = '[data-testid="cancel-generation"]';
      tap(screen, CANCEL, 'touch', 2_200, 2_260);
      await settle(watching);
      expect(run.cancelled).toHaveLength(0);

      tap(screen, CANCEL, 'touch', 3_000, 3_060);
      await settle(watching);
      expect(run.cancelled).toHaveLength(1);
    });
  });

  it('saves exceptions that were typed but not saved before leaving the words', async () => {
    const fixture = await renderFixture();
    const page = fixture.nativeElement as HTMLElement;
    const policy = TestBed.inject(ExceptionPolicyStore);
    policy.setDraft('Allow proper nouns for the cat.');

    press(page, 'wizard-next');
    await settle(fixture);

    expect(policy.hasUnsavedChanges()).toBe(false);
    expect(policy.policy().text).toBe('Allow proper nouns for the cat.');
    expect(TestBed.inject(GenerationDraftStore).step()).toBe(2);
  });

  it('holds Next on the words while the exceptions are over the limit', async () => {
    const fixture = await renderFixture();
    const page = fixture.nativeElement as HTMLElement;
    TestBed.inject(ExceptionPolicyStore).setDraft('x'.repeat(2_001));
    fixture.detectChanges();

    expect(page.querySelector<HTMLButtonElement>('[data-testid="wizard-next"]')?.disabled).toBe(
      true,
    );
    expect(TestBed.inject(GenerationDraftStore).step()).toBe(1);
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
      'Limit reached',
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

  it('names the layers the lane is making, and drops the line once none is', () => {
    const run = new FakeGenerationRun({ kind: 'writing' });
    jobs.setJobs([fakeGenerationJob(JOB_ID, run)]);
    const fixture = TestBed.createComponent(GeneratePageComponent);
    fixture.componentRef.setInput('jobId', JOB_ID);
    fixture.detectChanges();
    const built = buildReading({ id: 'reading-1', title: 'ねこの一日', kind: 'generated' }).reading;
    if (built.kind !== 'generated') {
      throw new Error('The fixture must build a generated story.');
    }
    const saved = { ...built, preparationTargets: ['english', 'grammar'] as const };
    laneProgress.set({ kind: 'queued', readingId: saved.id });
    run.set({ kind: 'saved', reading: saved });
    fixture.detectChanges();
    const page = fixture.nativeElement as HTMLElement;
    const line = (): string | undefined =>
      page.querySelector('[data-testid="saved-preparation"]')?.textContent.trim();
    expect(line()).toBe('Preparing English and grammar notes.');

    laneProgress.set({ kind: 'idle' });
    fixture.detectChanges();
    expect(line()).toBeUndefined();
  });

  it('ends a provider failure with the retry wording, not the settings test wording', async () => {
    const run = new FakeGenerationRun({
      kind: 'failed',
      during: 'writing',
      error: aiError('credit-exhausted', 'story-generation', 'x'),
    });
    jobs.setJobs([fakeGenerationJob(JOB_ID, run)]);
    const page = await render(JOB_ID);
    const text = page.querySelector('mn-error-screen')?.textContent ?? '';
    expect(text).toContain('Add credit on openrouter.ai, then try again.');
    expect(text).not.toContain('test again');
  });
});
