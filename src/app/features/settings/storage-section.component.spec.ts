import { Dialog } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { StorageStore } from '../../application/settings/storage.store';
import { UNKNOWN_PERSISTENCE } from '../../domain/storage/persistence-status';
import { StorageSectionComponent } from './storage-section.component';

/** Only the surface the section reads and the calls it makes. */
class FakeStorageStore {
  readonly statusSignal = signal({ ...UNKNOWN_PERSISTENCE, canRequest: true });
  readonly actionSignal = signal<'idle' | 'clearing-audio'>('idle');
  readonly clearedSignal = signal(false);
  readonly calls: string[] = [];

  readonly status = this.statusSignal.asReadonly();
  readonly action = this.actionSignal.asReadonly();
  readonly failure = signal(null).asReadonly();
  readonly audioCleared = this.clearedSignal.asReadonly();

  refresh(): Promise<void> {
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
});
