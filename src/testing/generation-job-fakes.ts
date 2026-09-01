import { computed, signal, type Signal, type WritableSignal } from '@angular/core';
import type {
  GenerationJob,
  GenerationRun,
} from '../app/application/generation/generation-jobs.store';
import type { GenerationState } from '../app/application/generation/generation.store';
import { jobId, type JobId } from '../app/domain/shared/ids';

const RUNNING = new Set<GenerationState['kind']>([
  'checking-prerequisites',
  'preparing',
  'writing',
  'parsing',
  'validating',
  'exception-review',
  'repairing',
  'auxiliary-review',
  'finalizing',
]);

/**
 * A run whose state a test sets directly.
 *
 * The real store reaches a model provider, the tokenizer, and the database to
 * move between states, none of which a row or a screen showing that state has
 * any business starting.
 */
export class FakeGenerationRun implements GenerationRun {
  private readonly stateSignal: WritableSignal<GenerationState>;

  readonly cancelled: number[] = [];
  readonly saveRetries: number[] = [];

  constructor(initial: GenerationState = { kind: 'writing' }) {
    this.stateSignal = signal(initial);
  }

  readonly state: Signal<GenerationState> = computed(() => this.stateSignal());
  readonly isBusy = computed(() => RUNNING.has(this.stateSignal().kind));
  readonly canCancel = computed(() => this.isBusy() && this.stateSignal().kind !== 'finalizing');
  readonly canRetrySave = computed(() => {
    const state = this.stateSignal();
    return state.kind === 'failed' && state.during === 'finalizing';
  });
  readonly announcement = computed(() => `state: ${this.stateSignal().kind}`);

  set(state: GenerationState): void {
    this.stateSignal.set(state);
  }

  cancel(): void {
    this.cancelled.push(this.cancelled.length);
    this.stateSignal.set({ kind: 'cancelled', during: 'writing' });
  }

  retrySave(): Promise<void> {
    this.saveRetries.push(this.saveRetries.length);
    return Promise.resolve();
  }
}

/** A job wrapping a `FakeGenerationRun`, ready to hand to a row or a screen. */
export function fakeGenerationJob(
  id: string,
  run: FakeGenerationRun = new FakeGenerationRun(),
  premise = 'A cat visits the market',
): GenerationJob & { readonly store: FakeGenerationRun } {
  return {
    id: jobId(id),
    premise,
    sentenceCount: 4,
    startedAt: 1_700_000_000_000,
    store: run,
  };
}

/**
 * Only what a screen asks of the registry: which jobs exist, which one is
 * watched, and the chance to end one.
 */
export class FakeGenerationJobsStore {
  private readonly jobsSignal = signal<readonly GenerationJob[]>([]);

  readonly dismissed: JobId[] = [];
  readonly watching: (JobId | null)[] = [];
  readonly released: JobId[] = [];
  /** What `start` returns; null stands for "already at the limit". */
  nextJobId: JobId | null = jobId('11111111-1111-4111-8111-111111111111');

  readonly jobs = this.jobsSignal.asReadonly();
  readonly libraryEntries = computed(() =>
    this.jobsSignal().filter((job) => job.store.state().kind !== 'saved'),
  );
  readonly runningCount = computed(
    () => this.jobsSignal().filter((job) => job.store.isBusy()).length,
  );
  readonly canStart = computed(() => this.nextJobId !== null);

  setJobs(jobs: readonly GenerationJob[]): void {
    this.jobsSignal.set(jobs);
  }

  job(id: JobId): GenerationJob | null {
    return this.jobsSignal().find((candidate) => candidate.id === id) ?? null;
  }

  start(): JobId | null {
    return this.nextJobId;
  }

  watch(id: JobId | null): void {
    this.watching.push(id);
  }

  release(id: JobId): void {
    this.released.push(id);
  }

  dismiss(id: JobId): void {
    this.dismissed.push(id);
    this.jobsSignal.update((current) => current.filter((job) => job.id !== id));
  }
}
