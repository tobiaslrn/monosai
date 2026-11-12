import { Dialog } from '@angular/cdk/dialog';
import { installFakeMatchMedia, type FakeMediaMatcher } from '../../../testing/match-media';
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
import { provideRouter } from '@angular/router';
import { StorageSectionComponent } from './storage-section.component';

/** Only the surface the section reads and the calls it makes. */
class FakeStorageStore {
  readonly statusSignal = signal({ ...UNKNOWN_PERSISTENCE, supported: true, canRequest: true });
  readonly persistenceSignal = signal<PersistenceState>('not-asked');
  readonly actionSignal = signal<'idle' | 'clearing-audio' | 'requesting-persistence'>('idle');
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

  resetAllData(): Promise<boolean> {
    this.calls.push('resetAllData');
    return Promise.resolve(false);
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
  let media: FakeMediaMatcher;
  let storage: FakeStorageStore;
  let playback: FakePlaybackStore;
  let compression: FakeCompressionStore;

  beforeEach(() => {
    // Still, so a confirmation answers at once rather than after it has left.
    media = installFakeMatchMedia(1280, false, true);
    TestBed.resetTestingModule();
    storage = new FakeStorageStore();
    playback = new FakePlaybackStore();
    compression = new FakeCompressionStore();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
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
    media.restore();
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
    element.querySelector<HTMLButtonElement>('[data-testid="delete-saved-audio"]')?.click();
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
    expect(dialog?.textContent).toContain('Stories and notes are not affected');
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

  it('asks twice before deleting everything, and deletes nothing on a decline', async () => {
    const fixture = TestBed.createComponent(StorageSectionComponent);
    document.body.appendChild(fixture.nativeElement as HTMLElement);
    await settle(fixture);
    const element = fixture.nativeElement as HTMLElement;
    const press = (): void => {
      element.querySelector<HTMLButtonElement>('[data-testid="delete-all-data"]')?.click();
    };

    press();
    await settle(fixture);
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'Delete all Monosai data?',
    );
    dialogButton('Keep my data')?.click();
    await settle(fixture);
    expect(storage.calls).not.toContain('resetAllData');

    press();
    await settle(fixture);
    dialogButton('Continue')?.click();
    await settle(fixture);
    expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain(
      'Delete everything?',
    );
    dialogButton('Cancel')?.click();
    await settle(fixture);
    expect(storage.calls).not.toContain('resetAllData');

    press();
    await settle(fixture);
    dialogButton('Continue')?.click();
    await settle(fixture);
    dialogButton('Delete everything')?.click();
    await settle(fixture);
    expect(storage.calls).toContain('resetAllData');
    element.remove();
  });

  /**
   * Playback stops before the cache is reported empty. Telling the learner the
   * clips are gone while one of them is still audible is a report they can hear
   * is false.
   */
  it('stops playback and then clears, once confirmed', async () => {
    const fixture = await pressDeleteAudio();

    dialogButton('Delete audio')?.click();
    await settle(fixture);

    expect(playback.calls).toEqual(['audioCacheCleared']);
    expect(storage.calls).toEqual(['clearAudioCache']);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Audio deleted');
  });

  /**
   * Four different situations used to share one sentence. Pressing the button
   * and being declined left the screen character-for-character unchanged, so
   * the only available reading was that nothing had happened.
   */
  describe('storage protection states', () => {
    /** What the storage-protection row says: its summary, or its value at the end. */
    function labelFor(state: PersistenceState, persisted = false): string {
      storage.statusSignal.set({
        ...UNKNOWN_PERSISTENCE,
        supported: true,
        canRequest: !persisted && state !== 'unsupported' && state !== 'unknown',
        persisted,
      });
      storage.persistenceSignal.set(state);
      const fixture = TestBed.createComponent(StorageSectionComponent);
      fixture.detectChanges();
      const row = [
        ...(fixture.nativeElement as HTMLElement).querySelectorAll('mn-settings-row'),
      ].find((candidate) => /Protect storage|Storage protection/.test(candidate.textContent));
      return (
        (
          row?.querySelector('.mn-settings-value') ??
          row?.querySelector('.mn-settings-row__details')
        )?.textContent.trim() ?? ''
      );
    }

    it('says the browser protects it', () => {
      expect(labelFor('granted', true)).toBe('Protected');
    });

    it('shows an unprotected status after the browser declines', () => {
      const label = labelFor('refused');

      expect(label).toBe('Not protected. The browser may clear data.');
    });

    it('says protection is unavailable', () => {
      expect(labelFor('unsupported')).toBe('Unavailable');
    });

    it('shows an unprotected status when the request fails', () => {
      expect(labelFor('request-failed')).toBe('Not protected. The browser may clear data.');
    });

    it('shows an unprotected status before protection is requested', () => {
      expect(labelFor('not-asked')).toBe('Not protected. The browser may clear data.');
    });

    it('keeps an unknown status explicit', () => {
      expect(labelFor('unknown')).toBe('Unknown');
    });

    it('leaves the request retryable, and asks when pressed', async () => {
      const fixture = TestBed.createComponent(StorageSectionComponent);
      storage.persistenceSignal.set('refused');
      fixture.detectChanges();

      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="protect-storage"]',
      );
      expect(button?.disabled).toBe(false);
      button?.click();
      await settle(fixture);

      expect(storage.calls).toContain('requestPersistence');
    });

    it('keeps Protect busy, not disabled, while the browser is asked, and ignores a press', async () => {
      const fixture = TestBed.createComponent(StorageSectionComponent);
      storage.persistenceSignal.set('refused');
      storage.actionSignal.set('requesting-persistence');
      fixture.detectChanges();

      const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
        '[data-testid="protect-storage"]',
      );
      expect((fixture.nativeElement as HTMLElement).textContent).toContain('Protecting');
      expect(button?.disabled).toBe(false);
      expect(button?.getAttribute('aria-busy')).toBe('true');
      button?.click();
      await settle(fixture);

      expect(storage.calls).not.toContain('requestPersistence');
    });
  });

  /** The rendered card, typed, so assertions are not made against `any`. */
  function host(fixture: { nativeElement: unknown }): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function stopButton(fixture: { nativeElement: unknown }): HTMLButtonElement | undefined {
    return (
      host(fixture).querySelector<HTMLButtonElement>('[data-testid="stop-compression"]') ??
      undefined
    );
  }

  describe('the background compression pass', () => {
    it('says nothing while it has nothing to report', async () => {
      const fixture = TestBed.createComponent(StorageSectionComponent);
      await settle(fixture);

      expect(host(fixture).textContent).not.toContain('Compressing');
      expect(host(fixture).textContent).not.toContain('Compressed');
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
