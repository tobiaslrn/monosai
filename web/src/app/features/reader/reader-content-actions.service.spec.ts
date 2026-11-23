import { Dialog } from '@angular/cdk/dialog';
import { computed, signal, type WritableSignal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LayerProgress } from '../../application/enrichment/layer-progress';
import { ReadingTextAidMaintenanceStore } from '../../application/enrichment/reading-text-aid-maintenance.store';
import { AppUpdateStore } from '../../application/pwa/app-update.store';
import { DeferredReloadStore } from '../../application/pwa/deferred-reload.store';
import { isHoldingWork, type BusyWork } from '../../domain/shared/busy-work';
import { ReaderAudioStore } from '../../application/reading/reader-audio.store';
import { ReaderPreparationStore } from '../../application/reading/reader-preparation.store';
import { ReaderStore } from '../../application/reading/reader.store';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import { aiError } from '../../domain/ai/ai-error';
import { SPEECH_CODE_UNAVAILABLE } from '../../domain/ai/text-to-speech-provider';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import type { Reading } from '../../domain/reading/reading';
import { readingId, type ReadingId } from '../../domain/shared/ids';
import { ReaderContentActionsService } from './reader-content-actions.service';

const ID = readingId('018f0000-0000-7000-8000-000000000001');
const OTHER = readingId('018f0000-0000-7000-8000-000000000002');
const COUNTS = { total: 4, requested: 4, completed: 0, failed: 0 };
const IDLE: LayerProgress = { kind: 'idle' };

function reading(id: ReadingId): Reading {
  return {
    id,
    sentenceCount: 4,
    translationSummary: { total: 4, completed: 0, failed: 0 },
    audioSummary: { total: 4, completed: 0, failed: 0 },
    grammarSummary: { state: 'not-requested' },
  } as unknown as Reading;
}

function refused(code: 'authentication' | 'credit-exhausted' | 'rate-limited'): LayerProgress {
  return {
    kind: 'failed',
    readingId: ID,
    counts: COUNTS,
    canRetry: true,
    error: { source: 'provider', error: aiError(code, 'grammar-review', 'Refused') },
  };
}

function speechCodeLost(): LayerProgress {
  return {
    kind: 'failed',
    readingId: ID,
    counts: COUNTS,
    canRetry: false,
    error: {
      source: 'provider',
      error: aiError('unknown', 'tts-synthesis', 'Module failed', {
        detail: { issueCode: SPEECH_CODE_UNAVAILABLE },
      }),
    },
  };
}

type Progress = Partial<Record<PreparationLayer, LayerProgress>>;

function setup(initial: Progress = {}, shared?: WritableSignal<Progress>) {
  const progress = shared ?? signal<Progress>(initial);
  const current = signal(reading(ID));
  const readiness = signal<ConfigurationReadiness>('ready');
  const busyWork = signal<BusyWork | null>(null);
  const unsaved = signal(0);
  const work = computed<BusyWork[]>(() => [
    ...(busyWork() === null ? [] : [busyWork()!]),
    ...(unsaved() === 0 ? [] : [{ kind: 'unsaved-story' as const, count: unsaved() }]),
  ]);
  const holdingWork = computed(() => work().filter(isHoldingWork));
  const reloadNow = vi.fn();
  const answer = { confirmed: true };
  const confirm = vi.fn(() => ({ closed: of(answer.confirmed) }));
  const acknowledge = vi.fn((id: ReadingId, layer: PreparationLayer) => {
    if (id === ID) progress.update((all) => ({ ...all, [layer]: IDLE }));
  });
  TestBed.configureTestingModule({
    providers: [
      ReaderContentActionsService,
      DeferredReloadStore,
      { provide: ReaderStore, useValue: { reading: current } },
      {
        provide: ReaderPreparationStore,
        useValue: {
          pending: signal(null),
          lastError: signal(null),
          online: signal(true),
          readiness: () => readiness(),
          progressFor: (_id: ReadingId, layer: PreparationLayer) => progress()[layer] ?? IDLE,
          acknowledge,
        },
      },
      {
        provide: ReadingTextAidMaintenanceStore,
        useValue: { pending: signal(null), error: signal(null) },
      },
      { provide: ReaderAudioStore, useValue: { decoderMissing: () => false } },
      { provide: Dialog, useValue: { open: confirm } },
      {
        provide: AppUpdateStore,
        useValue: {
          unsavedStories: unsaved,
          holdingWork,
          reloadNow: (accepted = 0) => {
            if (holdingWork().length === 0 && unsaved() <= accepted) reloadNow(accepted);
          },
        },
      },
    ],
  });
  const service = TestBed.inject(ReaderContentActionsService);
  TestBed.tick();
  const leave = () => {
    TestBed.resetTestingModule();
  };
  return {
    service,
    progress,
    current,
    readiness,
    acknowledge,
    leave,
    busyWork,
    unsaved,
    reloadNow,
    answer,
    confirm,
  };
}

/** The learner opens the panel, which draws every row. */
function look(bed: ReturnType<typeof setup>): void {
  bed.service.menuShown(true);
  TestBed.tick();
}

describe('refusals the reader forgets', () => {
  it.each(['grammar', 'english'] as const)(
    'forgets a refused %s run once it was seen and the page is left',
    (layer) => {
      const bed = setup({ [layer]: refused('authentication') });
      look(bed);
      expect(bed.acknowledge).not.toHaveBeenCalled();
      bed.leave();
      expect(bed.acknowledge).toHaveBeenCalledWith(ID, layer);
    },
  );

  it('keeps a failure that arrived after the page was opened and was never shown', () => {
    const bed = setup();
    bed.progress.set({ grammar: refused('authentication') });
    TestBed.tick();
    bed.leave();
    expect(bed.acknowledge).not.toHaveBeenCalled();
  });

  it('keeps a failure that arrived while the panel was shut, when the page is left', () => {
    const bed = setup();
    look(bed);
    bed.service.menuShown(false);
    bed.progress.set({ grammar: refused('authentication') });
    TestBed.tick();
    bed.leave();
    expect(bed.acknowledge).not.toHaveBeenCalled();
  });

  it('keeps a failure it showed that is not the one it later holds', () => {
    const bed = setup({ grammar: refused('authentication') });
    look(bed);
    bed.service.menuShown(false);
    bed.progress.set({ grammar: refused('authentication') });
    TestBed.tick();
    bed.leave();
    expect(bed.acknowledge).not.toHaveBeenCalled();
  });

  it('forgets a seen refusal when the reader moves to another story', () => {
    const bed = setup({ grammar: refused('authentication') });
    look(bed);
    bed.current.set(reading(OTHER));
    TestBed.tick();
    expect(bed.acknowledge).toHaveBeenCalledWith(ID, 'grammar');
  });

  it('never forgets a stop that retrying can still fix', () => {
    const bed = setup({ grammar: refused('rate-limited') });
    look(bed);
    bed.leave();
    expect(bed.acknowledge).not.toHaveBeenCalled();
  });

  it.each([
    ['running', { kind: 'running', readingId: ID, counts: COUNTS }],
    ['queued', { kind: 'queued', readingId: ID }],
  ] as const)('never forgets a %s job', (_name, running) => {
    const bed = setup({ grammar: running, english: running });
    look(bed);
    bed.leave();
    expect(bed.acknowledge).not.toHaveBeenCalled();
  });

  it('never forgets audio, whose failures belong to the player', () => {
    const bed = setup({ audio: refused('authentication') });
    look(bed);
    bed.leave();
    expect(bed.acknowledge).not.toHaveBeenCalled();
  });

  it('forgets what was seen after the panel was closed, when the page is left', () => {
    const bed = setup({ grammar: refused('authentication') });
    look(bed);
    bed.service.menuShown(false);
    bed.leave();
    expect(bed.acknowledge).toHaveBeenCalledWith(ID, 'grammar');
  });

  describe('coming back to the story', () => {
    function reopen(bed: ReturnType<typeof setup>) {
      bed.leave();
      return setup({}, bed.progress);
    }

    it('offers the layer again once a seen refusal was left behind', () => {
      const bed = setup({ grammar: refused('authentication') });
      look(bed);
      const back = reopen(bed);
      expect(back.service.rows().find((row) => row.layer === 'grammar')).toMatchObject({
        action: 'prepare',
        error: null,
      });
    });

    it('still shows a refusal that was never seen', () => {
      const bed = setup();
      bed.progress.set({ grammar: refused('authentication') });
      TestBed.tick();
      const back = reopen(bed);
      const row = back.service.rows().find((entry) => entry.layer === 'grammar');
      expect(row).toMatchObject({ action: 'settings' });
      expect(row?.error).toBeTruthy();
    });
  });

  describe('after the credit link is followed', () => {
    const away = () => window.dispatchEvent(new Event('blur'));
    const back = () => window.dispatchEvent(new Event('focus'));
    function returnFromCredit(): void {
      away();
      back();
    }
    function setVisibility(state: DocumentVisibilityState): void {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
      document.dispatchEvent(new Event('visibilitychange'));
    }

    afterEach(() => {
      vi.useRealTimers();
      Reflect.deleteProperty(document, 'visibilityState');
    });

    it('forgets an unpaid-account stop when the learner comes back', () => {
      const bed = setup({ grammar: refused('credit-exhausted') });
      look(bed);
      bed.service.creditOpened('grammar');
      returnFromCredit();
      expect(bed.acknowledge).toHaveBeenCalledWith(ID, 'grammar');
    });

    it('relies on visibility alone where the window never blurs', () => {
      const bed = setup({ grammar: refused('credit-exhausted') });
      look(bed);
      bed.service.creditOpened('grammar');
      setVisibility('hidden');
      expect(bed.acknowledge).not.toHaveBeenCalled();
      setVisibility('visible');
      expect(bed.acknowledge).toHaveBeenCalledWith(ID, 'grammar');
    });

    it('does nothing on a focus change the link did not cause', () => {
      const bed = setup({ grammar: refused('credit-exhausted') });
      look(bed);
      returnFromCredit();
      expect(bed.acknowledge).not.toHaveBeenCalled();
    });

    it('leaves a refused key alone', () => {
      const bed = setup({ grammar: refused('authentication') });
      look(bed);
      bed.service.creditOpened('grammar');
      returnFromCredit();
      expect(bed.acknowledge).not.toHaveBeenCalled();
    });

    it('drops a press that saw no leave, so a later blur and focus do nothing', () => {
      vi.useFakeTimers();
      const bed = setup({ grammar: refused('credit-exhausted') });
      look(bed);
      bed.service.creditOpened('grammar');
      vi.advanceTimersByTime(1500);
      returnFromCredit();
      expect(bed.acknowledge).not.toHaveBeenCalled();
    });

    it('drops a press when the reader moves to another story', () => {
      const bed = setup({ grammar: refused('credit-exhausted') });
      look(bed);
      bed.service.creditOpened('grammar');
      bed.current.set(reading(OTHER));
      TestBed.tick();
      bed.acknowledge.mockClear();
      bed.current.set(reading(ID));
      TestBed.tick();
      returnFromCredit();
      expect(bed.acknowledge).not.toHaveBeenCalled();
    });

    it('forgets only the refusal whose link was followed, not a retry that failed again', () => {
      const bed = setup({ grammar: refused('credit-exhausted') });
      look(bed);
      bed.service.creditOpened('grammar');
      away();
      bed.progress.set({ grammar: refused('credit-exhausted') });
      TestBed.tick();
      back();
      expect(bed.acknowledge).not.toHaveBeenCalled();
    });

    it('keeps a refusal of the other layer that arrived while the learner was away', () => {
      const bed = setup({ grammar: refused('credit-exhausted') });
      look(bed);
      bed.service.creditOpened('grammar');
      away();
      bed.progress.update((all) => ({ ...all, english: refused('credit-exhausted') }));
      TestBed.tick();
      back();
      expect(bed.acknowledge).toHaveBeenCalledTimes(1);
      expect(bed.acknowledge).toHaveBeenCalledWith(ID, 'grammar');
    });
  });
});

describe('reloading for speech code that could not load', () => {
  it('reloads at once when nothing running would be lost', async () => {
    const bed = setup({ audio: speechCodeLost() });
    await bed.service.reload();
    TestBed.tick();
    expect(bed.reloadNow).toHaveBeenCalledTimes(1);
    expect(bed.service.reloadWaitingFor()).toBeNull();
  });

  it('waits for running work, says which, and reloads when it ends', async () => {
    const bed = setup({ audio: speechCodeLost() });
    bed.busyWork.set({ kind: 'story-generation', count: 2 });
    await bed.service.reload();
    TestBed.tick();
    expect(bed.reloadNow).not.toHaveBeenCalled();
    expect(bed.service.reloadWaitingFor()).toBe('Waiting for 2 stories');
    bed.busyWork.set({ kind: 'package-import' });
    TestBed.tick();
    expect(bed.service.reloadWaitingFor()).toBe('Waiting for Anki import');
    bed.busyWork.set(null);
    TestBed.tick();
    expect(bed.reloadNow).toHaveBeenCalledTimes(1);
  });

  it('drops a waiting reload when Story options closes', async () => {
    const bed = setup({ audio: speechCodeLost() });
    bed.service.menuShown(true);
    bed.busyWork.set({ kind: 'story-generation', count: 1 });
    await bed.service.reload();
    TestBed.tick();
    expect(bed.service.reloadWaitingFor()).toBe('Waiting for the story');
    bed.service.menuShown(false);
    TestBed.tick();
    expect(bed.service.reloadWaitingFor()).toBeNull();
    bed.busyWork.set(null);
    TestBed.tick();
    expect(bed.reloadNow).not.toHaveBeenCalled();
  });

  it('drops a waiting reload when the reader is left', async () => {
    const bed = setup({ audio: speechCodeLost() });
    bed.busyWork.set({ kind: 'story-generation', count: 1 });
    await bed.service.reload();
    TestBed.tick();
    const { busyWork, reloadNow } = bed;
    bed.leave();
    busyWork.set(null);
    expect(reloadNow).not.toHaveBeenCalled();
  });

  it('does nothing when no row offers a reload', async () => {
    const bed = setup();
    await bed.service.reload();
    TestBed.tick();
    expect(bed.reloadNow).not.toHaveBeenCalled();
  });
  describe('when a story whose save failed would be lost', () => {
    it('asks first, then reloads at once', async () => {
      const bed = setup({ audio: speechCodeLost() });
      bed.unsaved.set(1);
      expect(bed.service.reloadConfirms()).toBe(true);
      await bed.service.reload();
      TestBed.tick();
      expect(JSON.stringify(bed.confirm.mock.calls)).toContain('Reload and lose the new story?');
      expect(bed.reloadNow).toHaveBeenCalledExactlyOnceWith(1);
    });

    it('reloads nothing when the learner keeps it', async () => {
      const bed = setup({ audio: speechCodeLost() });
      bed.unsaved.set(1);
      bed.answer.confirmed = false;
      await bed.service.reload();
      TestBed.tick();
      expect(bed.reloadNow).not.toHaveBeenCalled();
      expect(bed.service.reloadWaitingFor()).toBeNull();
    });

    it('still waits for other work once the learner agreed', async () => {
      const bed = setup({ audio: speechCodeLost() });
      bed.unsaved.set(1);
      bed.busyWork.set({ kind: 'package-import' });
      await bed.service.reload();
      TestBed.tick();
      expect(bed.service.reloadWaitingFor()).toBe('Waiting for Anki import');
      expect(bed.reloadNow).not.toHaveBeenCalled();
      bed.busyWork.set(null);
      TestBed.tick();
      expect(bed.reloadNow).toHaveBeenCalledExactlyOnceWith(1);
    });

    // A story that became unsaved during the wait was never asked about.
    it('drops a wait when another story is left unsaved', async () => {
      const bed = setup({ audio: speechCodeLost() });
      bed.busyWork.set({ kind: 'story-generation', count: 1 });
      await bed.service.reload();
      TestBed.tick();
      expect(bed.confirm).not.toHaveBeenCalled();
      bed.busyWork.set(null);
      bed.unsaved.set(1);
      TestBed.tick();
      expect(bed.service.reloadWaitingFor()).toBeNull();
      expect(bed.reloadNow).not.toHaveBeenCalled();
    });
  });
});
