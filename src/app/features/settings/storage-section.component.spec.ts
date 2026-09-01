import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
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

/**
 * Deleting saved audio is the widest destructive action in Settings — every
 * clip of every reading — and it used to run on one unguarded click, next to a
 * harmless button, while the narrower per-reading deletion asked first.
 */
describe('StorageSectionComponent', () => {
  let storage: FakeStorageStore;
  let playback: FakePlaybackStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    storage = new FakeStorageStore();
    playback = new FakePlaybackStore();
    TestBed.configureTestingModule({
      providers: [
        { provide: StorageStore, useValue: storage },
        { provide: AudioPlaybackStore, useValue: playback },
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
    expect(dialog?.textContent).toContain('every reading on this device');
    expect(dialog?.textContent).toContain('Readings, translations, grammar results');
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

    it('says the browser granted it', () => {
      expect(labelFor('granted', true)).toContain('Granted');
    });

    it('says it was asked and declined, and that it may still grant later', () => {
      const label = labelFor('refused');

      expect(label).toContain('the browser declined');
      expect(label).toContain('may grant this later');
    });

    it('says the browser has nothing to offer rather than blaming the request', () => {
      expect(labelFor('unsupported')).toContain('does not offer storage protection');
    });

    it('says a failed request changed nothing', () => {
      expect(labelFor('request-failed')).toContain('could not be completed');
    });

    it('keeps the plain eviction warning before anything is asked', () => {
      expect(labelFor('not-asked')).toContain('may evict data');
    });

    it('claims nothing while the status is unknown', () => {
      expect(labelFor('unknown')).toContain('Not reported by this browser');
    });

    it('leaves the request retryable, and asks when pressed', async () => {
      const fixture = TestBed.createComponent(StorageSectionComponent);
      storage.persistenceSignal.set('refused');
      fixture.detectChanges();

      const button = [...(fixture.nativeElement as HTMLElement).querySelectorAll('button')].find(
        (candidate) => candidate.textContent.includes('Ask the browser'),
      );
      expect(button?.disabled).toBe(false);
      button?.click();
      await settle(fixture);

      expect(storage.calls).toContain('requestPersistence');
    });
  });
});
