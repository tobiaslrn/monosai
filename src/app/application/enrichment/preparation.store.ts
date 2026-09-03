import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import type { AssetJob } from '../../domain/enrichment/jobs';
import { CLAIM_STALE_AFTER_MS, remainingSentenceIds } from '../../domain/enrichment/jobs';
import {
  PREPARATION_ORDER,
  jobKindFor,
  type PreparationLayer,
} from '../../domain/enrichment/preparation';
import type { Reading } from '../../domain/reading/reading';
import type { ReadingId } from '../../domain/shared/ids';
import { GenerationActivityRegistry } from '../generation/generation-activity.registry';
import { AppUpdateStore } from '../pwa/app-update.store';
import { NETWORK_STATUS } from '../../domain/platform/network-status.port';
import { CLOCK, ID_GENERATOR, JOB_REPOSITORY } from '../shared/repository-tokens';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import { LayerRunners } from './layer-runner';
import {
  IDLE_LAYER_PROGRESS,
  type LaneHold,
  type LanePlacement,
  type LayerProgress,
} from './layer-progress';

/** How often a working lane says it is still there, well inside the stale window. */
export const CLAIM_HEARTBEAT_MS = 20_000;

/** One reading's outstanding layers, as the lane and the screens see them. */
export interface QueuedReading {
  readonly readingId: ReadingId;
  readonly layers: readonly PreparationLayer[];
}

const KIND_TO_LAYER = new Map<string, PreparationLayer>(
  PREPARATION_ORDER.map((layer) => [jobKindFor(layer), layer]),
);

/**
 * The single preparation pipeline.
 *
 * Everything the lane runs is already persisted as a job row, so the lane owns
 * ordering rather than state: which reading is worked next, which layer of it,
 * and when to step aside. It is the only thing in the application that starts a
 * layer without a learner pressing something, and it starts one only for work
 * that a named act already queued (ADR 0047).
 *
 * Three properties are load-bearing.
 *
 * **It yields, it never cancels.** Stepping aside for the open reading, for an
 * update, or for a lost connection parks the run at a batch boundary. Nothing
 * is stored until a batch returns, so aborting mid-batch throws away a paid
 * request, and a run reported as cancelled means something final to every
 * screen watching it — including the reader, which seals the media source a
 * screen-locked session is playing from (ADR 0045).
 *
 * **It is never busy.** `AppBusyRegistry` means work a reload would destroy,
 * and it makes an update unactivatable. A queue that outlives a session would
 * wedge updates for as long as it existed. The lane does the opposite: it
 * parks, lets the update through, and resumes from the rows afterwards.
 *
 * **One pipeline per reading, not per tab.** Two tabs may prepare two
 * different readings at once; neither can prepare the same one. The claim lives
 * on the reading's job rows, so the rule survives a reload and a closed tab.
 */
@Injectable({ providedIn: 'root' })
export class PreparationStore {
  private readonly jobs = inject(JOB_REPOSITORY);
  private readonly runners = inject(LayerRunners);
  private readonly generations = inject(GenerationActivityRegistry);
  private readonly network = inject(NETWORK_STATUS);
  private readonly appUpdate = inject(AppUpdateStore);
  private readonly clock = inject(CLOCK);
  private readonly ids = inject(ID_GENERATOR);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  /** This lane's identity in the claim, stable for the life of the tab. */
  private readonly ownerId = this.ids.nextId();

  private readonly queueSignal = signal<readonly QueuedReading[]>([]);
  private readonly currentSignal = signal<LanePlacement | null>(null);
  private readonly holdSignal = signal<LaneHold | null>(null);
  private readonly pausedByLearnerSignal = signal(false);
  private readonly openReadingSignal = signal<ReadingId | null>(null);
  /**
   * Layers this lane will not pick again until somebody asks for them.
   *
   * A layer that failed keeps its row — that is how the failure stays visible —
   * so without this the work list would hand the lane the same refusal on every
   * pass. Cleared by *Retry* and by a fresh reconciliation, both of which are
   * acts the learner took.
   */
  private readonly blockedSignal = signal<readonly string[]>([]);

  private draining: Promise<void> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private claimed: ReadingId | null = null;

  /** Readings with outstanding work, the one being worked first. */
  readonly queue = this.queueSignal.asReadonly();
  readonly current = this.currentSignal.asReadonly();
  /** Why nothing is moving, when nothing is moving. */
  readonly hold = this.holdSignal.asReadonly();
  readonly isPaused = this.pausedByLearnerSignal.asReadonly();
  readonly isWorking = computed(() => this.currentSignal() !== null);
  readonly hasWork = computed(() => this.queueSignal().length > 0);

  constructor() {
    // A hold that clears is the only thing that restarts a parked lane on its
    // own. Everything else that creates work calls `reconcile` explicitly,
    // which is what keeps a launch from starting anything (ADR 0047).
    effect(() => {
      const clear =
        this.network.isOnline() &&
        this.generations.runningCount() === 0 &&
        this.appUpdate.status().kind !== 'available';
      if (clear && this.holdSignal() !== null && !this.pausedByLearnerSignal()) {
        void this.pump();
      }
    });
    inject(DestroyRef).onDestroy(() => {
      this.stopHeartbeat();
    });
  }

  /** The layer states the lane knows about for one reading. */
  progressFor(readingId: ReadingId, layer: PreparationLayer): LayerProgress {
    const runner = this.runners.runnerFor(layer);
    const progress = runner.progressFor(readingId);
    if (progress.kind !== 'idle') {
      return progress;
    }
    const queued = this.queueSignal().find((entry) => entry.readingId === readingId);
    return queued?.layers.includes(layer) === true
      ? { kind: 'queued', readingId }
      : IDLE_LAYER_PROGRESS;
  }

  /**
   * Tells the lane which reading the learner is looking at.
   *
   * The open reading is worked first, and a lane already working another one
   * steps aside for it at the next batch boundary.
   */
  setOpenReading(readingId: ReadingId | null): void {
    this.openReadingSignal.set(readingId);
    const current = this.currentSignal();
    if (readingId !== null && current !== null && current.readingId !== readingId) {
      this.runners.runnerFor(current.layer).yieldAfterBatch();
    }
  }

  /**
   * Queues whatever this reading declares and still lacks, then works the queue.
   *
   * One of the four moments that create work: a target switched on, a generated
   * story saved, a reader opened, or an explicit request. Nothing else calls it.
   */
  async reconcile(reading: Reading): Promise<void> {
    this.unblock(reading.id, reading.preparationTargets);
    for (const layer of PREPARATION_ORDER) {
      if (!reading.preparationTargets.includes(layer)) {
        continue;
      }
      await this.runners.runnerFor(layer).enqueue(reading.id);
    }
    await this.pump();
  }

  /** Resumes the lane, and reports whether anything is outstanding. */
  async pump(): Promise<void> {
    if (this.pausedByLearnerSignal()) {
      await this.refreshQueue();
      return;
    }
    if (this.draining !== null) {
      await this.draining;
      return;
    }
    const run = this.drain();
    this.draining = run;
    try {
      await run;
    } finally {
      if (this.draining === run) {
        this.draining = null;
      }
    }
  }

  /**
   * Parks the lane where it stands. The rows survive, so *Resume* continues
   * rather than starting over.
   */
  pause(): void {
    this.pausedByLearnerSignal.set(true);
    const current = this.currentSignal();
    if (current !== null) {
      this.runners.runnerFor(current.layer).yieldAfterBatch();
    }
  }

  resume(): Promise<void> {
    this.pausedByLearnerSignal.set(false);
    return this.pump();
  }

  /** Stops one reading's preparation for good, keeping everything it produced. */
  async stop(readingId: ReadingId): Promise<void> {
    this.pausedByLearnerSignal.set(true);
    for (const layer of PREPARATION_ORDER) {
      await this.runners.runnerFor(layer).cancelAndWait(readingId);
    }
    await this.releaseClaim();
    this.pausedByLearnerSignal.set(false);
    this.currentSignal.set(null);
    await this.refreshQueue();
  }

  /** Runs one failed layer again, from whatever it still has outstanding. */
  async retry(readingId: ReadingId, layer: PreparationLayer): Promise<void> {
    const runner = this.runners.runnerFor(layer);
    runner.acknowledge(readingId);
    this.unblock(readingId, [layer]);
    await runner.enqueue(readingId);
    await this.pump();
  }

  /** Drops a deleted reading from the queue and finalizes anything running. */
  async readingDeleted(readingId: ReadingId): Promise<void> {
    for (const layer of PREPARATION_ORDER) {
      await this.runners.runnerFor(layer).readingDeleted(readingId);
    }
    if (this.claimed === readingId) {
      await this.releaseClaim();
    }
    this.queueSignal.update((queue) => queue.filter((entry) => entry.readingId !== readingId));
    if (this.currentSignal()?.readingId === readingId) {
      this.currentSignal.set(null);
    }
  }

  private async drain(): Promise<void> {
    // Readings this pass has already stepped away from. A parked reading is
    // still outstanding and its row still says so, so without this the lane
    // would pick it straight back up and park it again for ever.
    const deferred = new Set<ReadingId>();
    for (;;) {
      // The queue is refreshed before the hold is checked, so a held lane can
      // still say what it is holding rather than looking empty.
      const rows = await this.refreshQueue();
      if (rows === null) {
        return;
      }
      const hold = this.currentHold();
      if (hold !== null) {
        this.park(hold);
        return;
      }
      const next = this.pick(rows, deferred);
      if (next === null) {
        this.currentSignal.set(null);
        await this.releaseClaim();
        return;
      }
      const worked = await this.workReading(next.readingId, next.layers, deferred);
      if (!worked) {
        return;
      }
    }
  }

  /**
   * Works one reading's outstanding layers in order, under one claim.
   *
   * Returns false when the lane should stop looping — it was parked, paused, or
   * refused the claim in a way that leaves nothing useful to try immediately.
   */
  private async workReading(
    readingId: ReadingId,
    layers: readonly PreparationLayer[],
    deferred: Set<ReadingId>,
  ): Promise<boolean> {
    const claimed = await this.jobs.claimReading(readingId, this.ownerId, this.clock.now());
    if (!claimed.ok) {
      // Another tab holds this reading. Its own lane will finish it; this one
      // moves on rather than waiting, and the next pass leaves the reading out
      // entirely while that claim stays alive.
      this.holdSignal.set('claimed-elsewhere');
      deferred.add(readingId);
      const remaining = this.queueSignal().filter((entry) => entry.readingId !== readingId);
      this.queueSignal.set(remaining);
      return remaining.length > 0;
    }
    this.claimed = readingId;
    this.startHeartbeat(readingId);
    this.holdSignal.set(null);

    try {
      for (const layer of layers) {
        const hold = this.currentHold();
        if (hold !== null) {
          this.park(hold);
          return false;
        }
        if (this.pausedByLearnerSignal()) {
          this.currentSignal.set(null);
          return false;
        }
        this.currentSignal.set({ readingId, layer });
        const runner = this.runners.runnerFor(layer);
        await runner.start(readingId);
        const progress = runner.progressFor(readingId);
        // A parked layer keeps its row: whoever resumes picks it up from here,
        // and the lane must not walk on to the next layer of this reading as
        // though this one were done.
        if (progress.kind === 'failed') {
          this.block(readingId, layer);
          this.currentSignal.set(null);
          return true;
        }
        if (progress.kind === 'paused' || progress.kind === 'cancelled') {
          deferred.add(readingId);
          this.currentSignal.set(null);
          return !this.pausedByLearnerSignal();
        }
      }
      return true;
    } finally {
      this.currentSignal.set(null);
      await this.releaseClaim();
    }
  }

  /**
   * The reading to work next: the one the learner has open, then the rest in
   * the order their rows were created.
   */
  private pick(
    queue: readonly QueuedReading[],
    deferred: ReadonlySet<ReadingId>,
  ): QueuedReading | null {
    const open = this.openReadingSignal();
    const eligible = queue.filter((entry) => !deferred.has(entry.readingId));
    return eligible.find((entry) => entry.readingId === open) ?? eligible.at(0) ?? null;
  }

  private block(readingId: ReadingId, layer: PreparationLayer): void {
    this.blockedSignal.update((blocked) => [...new Set([...blocked, blockKey(readingId, layer)])]);
  }

  private unblock(readingId: ReadingId, layers: readonly PreparationLayer[]): void {
    const dropped = new Set(layers.map((layer) => blockKey(readingId, layer)));
    this.blockedSignal.update((blocked) => blocked.filter((key) => !dropped.has(key)));
  }

  /** Rebuilds the work list from the job rows, which are its only source. */
  private async refreshQueue(): Promise<readonly QueuedReading[] | null> {
    const rows = await this.jobs.listActive();
    if (!rows.ok) {
      this.logger.error('job.failed', {
        kind: 'preparation',
        errorDomain: rows.error.domain,
        errorCode: rows.error.code,
      });
      this.queueSignal.set([]);
      return null;
    }
    const queue = groupByReading(
      rows.value,
      this.clock.now(),
      this.ownerId,
      new Set(this.blockedSignal()),
    );
    this.queueSignal.set(queue);
    return queue;
  }

  /**
   * What is stopping the lane, in the order the learner would want told.
   *
   * A generation outranks the rest because it is the thing the learner is
   * waiting for: three paid story streams or one preparation pipeline, never
   * both.
   */
  private currentHold(): LaneHold | null {
    if (this.generations.runningCount() > 0) {
      return 'generation';
    }
    if (!this.network.isOnline()) {
      return 'offline';
    }
    if (this.appUpdate.status().kind === 'available') {
      return 'update';
    }
    return null;
  }

  private park(hold: LaneHold): void {
    this.holdSignal.set(hold);
    const current = this.currentSignal();
    if (current !== null) {
      this.runners.runnerFor(current.layer).yieldAfterBatch();
    }
    this.currentSignal.set(null);
  }

  private startHeartbeat(readingId: ReadingId): void {
    this.stopHeartbeat();
    this.heartbeat = setInterval(() => {
      void this.jobs.heartbeatReading(readingId, this.ownerId, this.clock.now());
    }, CLAIM_HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeat !== null) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private async releaseClaim(): Promise<void> {
    this.stopHeartbeat();
    const readingId = this.claimed;
    if (readingId === null) {
      return;
    }
    this.claimed = null;
    await this.jobs.releaseReading(readingId, this.ownerId);
  }
}

/**
 * One entry per reading, layers in `PREPARATION_ORDER`.
 *
 * A row another live lane holds is left out entirely: it is real work, but not
 * this lane's, and listing it would show a queue that never moves.
 */
function groupByReading(
  rows: readonly AssetJob[],
  now: number,
  ownerId: string,
  blocked: ReadonlySet<string>,
): readonly QueuedReading[] {
  const byReading = new Map<ReadingId, PreparationLayer[]>();
  const order: ReadingId[] = [];
  for (const row of [...rows].sort((left, right) => left.createdAt - right.createdAt)) {
    const layer = KIND_TO_LAYER.get(row.kind);
    if (
      layer === undefined ||
      remainingSentenceIds(row).length === 0 ||
      blocked.has(blockKey(row.readingId, layer))
    ) {
      continue;
    }
    const claim = row.claim;
    if (
      claim !== undefined &&
      claim.ownerId !== ownerId &&
      now - claim.heartbeatAt < CLAIM_STALE_AFTER_MS
    ) {
      continue;
    }
    const existing = byReading.get(row.readingId);
    if (existing === undefined) {
      byReading.set(row.readingId, [layer]);
      order.push(row.readingId);
    } else if (!existing.includes(layer)) {
      existing.push(layer);
    }
  }
  return order.map((readingId) => ({
    readingId,
    layers: PREPARATION_ORDER.filter((layer) => byReading.get(readingId)?.includes(layer) === true),
  }));
}

function blockKey(readingId: ReadingId, layer: PreparationLayer): string {
  return `${readingId}::${layer}`;
}
