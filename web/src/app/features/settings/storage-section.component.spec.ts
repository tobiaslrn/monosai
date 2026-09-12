import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { computed, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import {
  AudioCompressionStore,
  type AudioCompressionState,
} from '../../application/settings/audio-compression.store';
import { StorageStore, type PersistenceState } from '../../application/settings/storage.store';
import { UNKNOWN_PERSISTENCE } from '../../domain/storage/persistence-status';
import { StorageSectionComponent } from './storage-section.component';

/** Only the surface the section reads and the calls it makes. */
class FakeStorageStore {
  readonly statusSignal = signal({ ...UNKNOWN_PERSISTENCE, supported: true, canRequest: true });
  readonly persistenceSignal = signal<PersistenceState>('not-asked');
  readonly actionSignal = signal<'idle' | 'clearing-audio'>('idle');
  readonly clearedSignal = signal(false);
  readonly calls: string[] = [];

  readonly status = this.statusSignal.asReadonly();
  readonly persistence = this.persistenceSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly failure = signal(null).asReadonly();
  readonly audioCleared = this.clearedSignal.asReadonly();

  refresh(): Promise<void> {
    return Promise.resolve();
  }

  requestPersistence(): Promise<void> {
    this.calls.push('requestPersistence');
    return Promise.resolve();
  }

  clearAudioCache(): Promise<void> {
    this.calls.push('clearAudioCache');
    this.clearedSignal.set(true);
    return Promise.resolve();
  }
}

class FakePlaybackStore {
  readonly calls: string[] = [];
  private readonly active = signal(true);

  isActive(): boolean {
    return this.active();
  }

  audioCacheCleared(): void {
    this.calls.push('audioCacheCleared');
    this.active.set(false);
  }
}

/** The background pass that re-encodes clips stored before speech was compressed. */
class FakeCompressionStore {
  readonly stateSignal = signal<AudioCompressionState>({ kind: 'idle' });
  readonly state = this.stateSignal.asReadonly();
  readonly running = computed(() => this.stateSignal().kind === 'running');
  stopped = 0;

  stop(): void {
    this.stopped += 1;
  }
}

/**
 * Deleting saved audio is the widest destructive action in Settings — every
 * clip of every reading — and it used to run on one unguarded click, next to a
 * harmless button, while the narrower per-reading deletion asked first.
 */
describe('StorageSectionComponent', () => {
  let storage: FakeStorageStore;
  let playback: FakePlaybackStore;
  let compression: FakeCompressionStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    storage = new FakeStorageStore();
    playback = new FakePlaybackStore();
    compression = new FakeCompressionStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: StorageStore, useValue: storage },
        { provide: AudioPlaybackStore, useValue: playback },
        {
          provide: AudioCompressionStore,
          useValue: compression as unknown as AudioCompressionStore,
        },
      ],
    });
  });

  afterEach(() => {
    TestBed.inject(Dialog).closeAll();
  });

  async function settle(fixture: {
    whenStable: () => Promise<unknown>;
    detectChanges: () => void;
  }): Promise<void> {
    for (let pass = 0; pass < 5; pass += 1) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  async function pressDeleteAudio(): Promise<ReturnType<typeof TestBed.createComponent>> {
    const fixture = TestBed.createComponent(StorageSectionComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent.includes('Delete saved audio'))
      ?.click();
    await settle(fixture);
    return fixture;
  }

  function dialogButton(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll<HTMLButtonElement>('mn-confirm-dialog button')].find(
      (candidate) => candidate.textContent.includes(label),
    );
  }

  it('asks first, and names the scope the button never did', async () => {
    await pressDeleteAudio();

    const dialog = document.querySelector('[role="alertdialog"]');
    expect(dialog?.textContent).toContain('every story on this device');
    expect(dialog?.textContent).toContain('Stories, translations, grammar results');
    expect(storage.calls).toEqual([]);
    expect(playback.calls).toEqual([]);
  });

  it('deletes nothing when the confirmation is declined', async () => {
    const fixture = await pressDeleteAudio();

    dialogButton('Keep it')?.click();
    await settle(fixture);

    expect(storage.calls).toEqual([]);
    expect(playback.calls).toEqual([]);
  });

  /**
   * Playback stops before the cache is reported empty. Telling the learner the
   * clips are gone while one of them is still audible is a report they can hear
   * is false.
   */
  it('stops playback and then clears, once confirmed', async () => {
    const fixture = await pressDeleteAudio();

    dialogButton('Delete saved audio')?.click();
    await settle(fixture);

    expect(playback.calls).toEqual(['audioCacheCleared']);
    expect(storage.calls).toEqual(['clearAudioCache']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain(
      'Saved audio deleted, and playback stopped',
    );
  });

  /**
   * Four different situations used to share one sentence. Pressing the button
   * and being declined left the screen character-for-character unchanged, so
   * the only available reading was that nothing had happened.
   */
  describe('storage protection states', () => {
    function labelFor(state: PersistenceState, persisted = false): string {
      storage.statusSignal.set({
        ...UNKNOWN_PERSISTENCE,
        supported: true,
        canRequest: !persisted,
        persisted,
      });
      storage.persistenceSignal.set(state);
      const fixture = TestBed.createComponent(StorageSectionComponent);
      fixture.detectChanges();
      return (
        (fixture.nativeElement as HTMLElement).querySelector('dd[aria-live="polite"]')
          ?.textContent ?? ''
      );
    }

    it('says the browser protects it', () => {
      expect(labelFor('granted', true)).toBe('Protected');
    });

    it('shows an unprotected status after the browser declines', () => {
      const label = labelFor('refused');

      expect(label).toBe('Not protected');
    });

    it('says protection is unavailable', () => {
      expect(labelFor('unsupported')).toBe('Protection unavailable');
    });

    it('shows an unprotected status when the request fails', () => {
      expect(labelFor('request-failed')).toBe('Not protected');
    });

    it('shows an unprotected status before protection is requested', () => {
      expect(labelFor('not-asked')).toBe('Not protected');
    });

    it('keeps an unknown status explicit', () => {
      expect(labelFor('unknown')).toBe('Protection status unknown');
    });

    it('leaves the request retryable, and asks when pressed', async () => {
      const fixture = TestBed.createComponent(StorageSectionComponent);
      storage.persistenceSignal.set('refused');
      fixture.detectChanges();

      const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
        (candidate) => candidate.textContent.includes('Keep data'),
      );
      expect(button?.disabled).toBe(false);
      button?.click();
      await settle(fixture);

      expect(storage.calls).toContain('requestPersistence');
    });
  });

  /** The rendered card, typed, so assertions are not made against `any`. */
  function host(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function stopButton(fixture: { nativeElement: unknown }): HTMLButtonElement | undefined {
    return [...host(fixture).querySelectorAll('button')].find(
      (button) => button.textContent.trim() === 'Stop',
    );
  }

  describe('the background compression pass', () => {
    it('says nothing while it has nothing to report', async () => {
      const fixture = TestBed.createComponent(StorageSectionComponent);
      await settle(fixture);

      expect(host(fixture).textContent).not.toContain('Saved audio');
    });

    it('names a real count while it runs, and offers a way to stop it', async () => {
      compression.stateSignal.set({ kind: 'running', done: 11, total: 42 });
      const fixture = TestBed.createComponent(StorageSectionComponent);
      await settle(fixture);

      const text = host(fixture).textContent;
      expect(text).toContain('Compressing 12 of 42');
      // A percentage of an internal step count is not what is happening now.
      expect(text).not.toContain('%');

      const stop = stopButton(fixture);
      expect(stop).toBeDefined();
      stop?.click();
      expect(compression.stopped).toBe(1);
    });

    it('reports what it reclaimed when it finishes', async () => {
      compression.stateSignal.set({
        kind: 'finished',
        compressed: 41,
        skipped: 0,
        freedBytes: 111_149_056,
      });
      const fixture = TestBed.createComponent(StorageSectionComponent);
      await settle(fixture);

      expect(host(fixture).textContent).toContain('Compressed 41 clips and freed 106 MB.');
    });

    it('says what it left alone, because those clips are still there', async () => {
      compression.stateSignal.set({
        kind: 'finished',
        compressed: 41,
        skipped: 1,
        freedBytes: 1024,
      });
      const fixture = TestBed.createComponent(StorageSectionComponent);
      await settle(fixture);

      expect(host(fixture).textContent).toContain('1 clip was left as it was.');
    });

    it('offers no Stop once it is finished', async () => {
      compression.stateSignal.set({
        kind: 'finished',
        compressed: 1,
        skipped: 0,
        freedBytes: 10,
      });
      const fixture = TestBed.createComponent(StorageSectionComponent);
      await settle(fixture);

      const stop = stopButton(fixture);
      expect(stop).toBeUndefined();
    });
  });
});
