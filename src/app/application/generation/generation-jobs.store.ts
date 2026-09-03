import { PreparationStore } from '../enrichment/preparation.store';
import { GenerationActivityRegistry } from './generation-activity.registry';
import {
  DestroyRef,
  EnvironmentInjector,
  Injectable,
  computed,
  createEnvironmentInjector,
  effect,
  inject,
  signal,
} from '@angular/core';
import type { StoryInputDraft } from '../../domain/ai/story-request';
import { jobId, type JobId } from '../../domain/shared/ids';
import { LibraryStore } from '../reading/library.store';
import { AppBusyRegistry } from '../shared/app-busy.registry';
import { CLOCK, ID_GENERATOR } from '../shared/repository-tokens';
import { GenerationStore } from './generation.store';
import { StoryAssemblyService } from './story-assembly.service';
import { VocabularyPreparationService } from './vocabulary-preparation.service';

/**
 * What a screen or a library row may do with a run.
 *
 * Everything that ends a run — disposing it, and the injector it lives in — is
 * the registry's, so a row holding a job cannot leave a store running with
 * nothing left to report it.
 */
export type GenerationRun = Pick<
  GenerationStore,
  'state' | 'isBusy' | 'canCancel' | 'canRetrySave' | 'announcement' | 'cancel' | 'retrySave'
>;

/** One generation the learner started, running wherever they are in the app. */
export interface GenerationJob {
  readonly id: JobId;
  /** What the learner asked for, used as the row's title until a story exists. */
  readonly premise: string;
  readonly sentenceCount: number;
  readonly startedAt: number;
  readonly store: GenerationRun;
}

interface JobRecord {
  readonly job: GenerationJob;
  readonly store: GenerationStore;
  readonly injector: EnvironmentInjector;
}

/**
 * How many stories may be written at once.
 *
 * Three, because each run is a sequence of paid requests a learner cannot see
 * the cost of while it happens, and because the point of backgrounding a
 * generation is to get on with reading — not to queue an afternoon of them.
 */
export const MAX_CONCURRENT_GENERATIONS = 3;

/**
 * The story generations in flight, and the ones that ended needing attention.
 *
 * A run used to live and die with the Generate screen. It lives here instead so
 * the learner can start a story and go and read something else, which is the
 * only way a multi-minute generation is worth waiting for. Each job keeps its
 * own `GenerationStore` in its own environment injector: the state machine is
 * written for exactly one run, with one abort controller and one set of inputs
 * captured before the first request, and giving each job its own instance keeps
 * that guarantee while several run side by side.
 *
 * Nothing here is persisted. An in-flight provider request cannot be resumed
 * after a reload, and no story is written until its last step, so a job is
 * meaningful only inside the tab that started it. See ADR 0044.
 */
@Injectable({ providedIn: 'root' })
export class GenerationJobsStore {
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly ids = inject(ID_GENERATOR);
  private readonly clock = inject(CLOCK);
  private readonly library = inject(LibraryStore);
  private readonly busyRegistry = inject(AppBusyRegistry);
  /** A saved story is one of the four moments that create preparation work. */
  private readonly preparation = inject(PreparationStore);
  private readonly activity = inject(GenerationActivityRegistry);

  private readonly records = signal<readonly JobRecord[]>([]);
  private readonly watchedSignal = signal<JobId | null>(null);
  /** Jobs whose save has already been reported, so it is reported once. */
  private readonly reportedSaves = new Set<JobId>();

  readonly jobs = computed(() => this.records().map((record) => record.job));

  /** Runs still working. A finished job holds no requests open. */
  readonly runningCount = computed(() => this.jobs().filter((job) => job.store.isBusy()).length);

  readonly canStart = computed(() => this.runningCount() < MAX_CONCURRENT_GENERATIONS);

  /**
   * The jobs the library shows a row for: everything except a saved story,
   * which is represented by the reading itself.
   */
  readonly libraryEntries = computed(() =>
    this.jobs().filter((job) => job.store.state().kind !== 'saved'),
  );

  /** The job whose progress a screen is currently showing, if any. */
  readonly watched = this.watchedSignal.asReadonly();

  constructor() {
    // One reason for all of them: the registry is keyed, and a second job
    // clearing the key while a first still runs would tell a reload it is safe.
    effect(() => {
      const running = this.runningCount();
      // The lane reads this rather than this store, so neither subsystem has to
      // import the other.
      this.activity.setRunningCount(running);
      this.busyRegistry.setBusy(
        'generation',
        running === 0
          ? null
          : running === 1
            ? 'a story is being generated'
            : `${String(running)} stories are being generated`,
      );
    });

    // Watching every job from one place rather than one effect per job, so a
    // job that ends can be cleaned up without an effect destroying itself.
    effect(() => {
      for (const job of this.jobs()) {
        if (job.store.state().kind === 'saved' && !this.reportedSaves.has(job.id)) {
          this.reportedSaves.add(job.id);
          this.storySaved(job.id);
        }
      }
    });

    // Reloading or closing the tab bypasses the router, and an in-flight
    // generation cannot be resumed, so the browser's own prompt is the only
    // guard available for it.
    const warnOnUnload = (event: BeforeUnloadEvent): void => {
      if (this.runningCount() > 0) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warnOnUnload);
    inject(DestroyRef).onDestroy(() => {
      window.removeEventListener('beforeunload', warnOnUnload);
      for (const record of this.records()) {
        this.tearDown(record);
      }
      this.records.set([]);
    });
  }

  job(id: JobId): GenerationJob | null {
    return this.jobs().find((candidate) => candidate.id === id) ?? null;
  }

  /**
   * Starts a generation and returns the id that addresses it, or null when
   * enough are already running.
   */
  start(
    sentenceCount: number,
    draft: StoryInputDraft,
    modelPresetId: string | null = null,
  ): JobId | null {
    if (!this.canStart()) {
      return null;
    }
    const injector = createEnvironmentInjector(
      [GenerationStore, StoryAssemblyService, VocabularyPreparationService],
      this.environmentInjector,
      'generation-job',
    );
    const store = injector.get(GenerationStore);
    const id = jobId(this.ids.nextId());
    const job: GenerationJob = {
      id,
      premise: draft.premise.trim(),
      sentenceCount,
      startedAt: this.clock.now(),
      store,
    };
    this.records.update((current) => [...current, { job, store, injector }]);
    void store.generate(sentenceCount, draft, modelPresetId);
    return id;
  }

  /** Marks `id` as the job a screen is showing, so it is not cleaned up early. */
  watch(id: JobId | null): void {
    this.watchedSignal.set(id);
  }

  /** Stops watching `id`, and drops it if it has nothing left to report. */
  release(id: JobId): void {
    if (this.watchedSignal() === id) {
      this.watchedSignal.set(null);
    }
    if (this.job(id)?.store.state().kind === 'saved') {
      this.dismiss(id);
    }
  }

  /** Ends a job: aborts whatever it is doing and removes its row. */
  dismiss(id: JobId): void {
    const record = this.records().find((candidate) => candidate.job.id === id);
    if (record === undefined) {
      return;
    }
    if (this.watchedSignal() === id) {
      this.watchedSignal.set(null);
    }
    this.records.update((current) => current.filter((candidate) => candidate !== record));
    this.reportedSaves.delete(id);
    this.tearDown(record);
  }

  /**
   * A background story landed. The shelf is reloaded so the new reading
   * appears, and the library's live region says so, because the learner is
   * somewhere else by definition.
   *
   * A job nobody is watching is then done: the story is in the library and the
   * row would only repeat it. A watched job stays until its screen releases it,
   * so the learner reading the wait screen still gets the saved panel.
   */
  private storySaved(id: JobId): void {
    const saved = this.records()
      .find((record) => record.job.id === id)
      ?.store.state();
    if (saved?.kind === 'saved') {
      void this.preparation.reconcile(saved.reading);
    }
    void this.library.load();
    this.library.noteExternalChange('Your generated story is ready and is in your library.');
    if (this.watchedSignal() !== id) {
      this.dismiss(id);
    }
  }

  private tearDown(record: JobRecord): void {
    record.store.dispose();
    record.injector.destroy();
  }
}
