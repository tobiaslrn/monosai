import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { ReadingTrackComponent } from './reading-track.component';

/**
 * The slice of the playback store the track reads and the one call it makes.
 *
 * Typed against the real store, so renaming or reshaping any of it fails here.
 */
type TrackStore = Pick<
  AudioPlaybackStore,
  'sentenceCount' | 'availableCount' | 'currentPosition' | 'hasPlayableAudio' | 'seekTo'
>;

class StubPlaybackStore implements TrackStore {
  readonly total = signal(0);
  readonly ready = signal(0);
  readonly position = signal(0);
  readonly seeks: number[] = [];
  /** Where a seek really lands, when it is not where it was aimed. */
  landsAt: number | null = null;

  readonly sentenceCount = this.total.asReadonly();
  readonly availableCount = this.ready.asReadonly();
  readonly currentPosition = this.position.asReadonly();
  readonly hasPlayableAudio = computed(() => this.ready() > 0);

  seekTo = (position: number): Promise<void> => {
    this.seeks.push(position);
    this.position.set(this.landsAt ?? position);
    return Promise.resolve();
  };
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReadingTrackComponent],
  template: `<mn-reading-track />`,
})
class HostComponent {}

describe('ReadingTrackComponent', () => {
  let store: StubPlaybackStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    store = new StubPlaybackStore();
    TestBed.configureTestingModule({
      providers: [{ provide: AudioPlaybackStore, useValue: store satisfies TrackStore }],
    });
  });

  function render(): {
    fixture: ReturnType<typeof TestBed.createComponent<HostComponent>>;
    scrub: HTMLInputElement;
    fill: (name: 'generated' | 'played') => string;
  } {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const scrub = element.querySelector<HTMLInputElement>('input.scrub');
    if (scrub === null) {
      throw new Error('The track has no slider.');
    }
    const fill = (name: 'generated' | 'played'): string =>
      element.querySelector(`.fill.${name}`)?.getAttribute('style') ?? '';
    return { fixture, scrub, fill };
  }

  function drag(scrub: HTMLInputElement, value: number): void {
    scrub.value = String(value);
    scrub.dispatchEvent(new Event('input'));
  }

  it('is a native range over the sentences, named for what it moves through', () => {
    store.total.set(6);
    store.ready.set(2);
    const { scrub } = render();

    expect(scrub.type).toBe('range');
    expect(scrub.max).toBe('6');
    expect(scrub.step).toBe('1');
    expect(scrub.getAttribute('aria-label')).toBe('Position in this story');
    expect(scrub.getAttribute('aria-valuetext')).toBe('Not started, 2 of 6 with audio');
  });

  it('keeps its range valid for a reading with no sentences', () => {
    const { scrub } = render();

    expect(scrub.max).toBe('1');
    expect(scrub.disabled).toBe(true);
  });

  it('draws what has audio behind how far playback has reached, over one denominator', () => {
    store.total.set(8);
    store.ready.set(6);
    store.position.set(2);
    const { fill } = render();

    expect(fill('generated')).toContain('--fill: 0.75');
    expect(fill('played')).toContain('--fill: 0.25');
  });

  it('follows playback, and says where it is', () => {
    store.total.set(8);
    store.ready.set(8);
    const { fixture, scrub, fill } = render();

    store.position.set(4);
    fixture.detectChanges();

    expect(scrub.value).toBe('4');
    expect(fill('played')).toContain('--fill: 0.5');
    expect(scrub.getAttribute('aria-valuetext')).toBe('Sentence 4 of 8, 8 of 8 with audio');
  });

  it('is disabled until something has audio', () => {
    store.total.set(8);
    const { fixture, scrub } = render();
    expect(scrub.disabled).toBe(true);

    store.ready.set(1);
    fixture.detectChanges();

    expect(scrub.disabled).toBe(false);
  });

  it('follows the thumb while it is dragged, and seeks only when it is released', () => {
    store.total.set(6);
    store.ready.set(6);
    const { fixture, scrub, fill } = render();

    drag(scrub, 3);
    fixture.detectChanges();

    expect(store.seeks).toEqual([]);
    expect(fill('played')).toContain('--fill: 0.5');

    scrub.dispatchEvent(new Event('change'));

    expect(store.seeks).toEqual([3]);
  });

  it('is not moved by playback while the thumb is being dragged', () => {
    store.total.set(6);
    store.ready.set(6);
    const { fixture, scrub } = render();

    drag(scrub, 5);
    store.position.set(2);
    fixture.detectChanges();

    expect(scrub.getAttribute('aria-valuetext')).toBe('Sentence 5 of 6, 6 of 6 with audio');
  });

  it('lands the thumb where playback landed, even on the number it already showed', async () => {
    store.total.set(6);
    store.ready.set(4);
    store.position.set(6);
    store.landsAt = 6;
    const { fixture, scrub } = render();

    drag(scrub, 5);
    scrub.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.seeks).toEqual([5]);
    expect(scrub.value).toBe('6');
  });

  it('leaves the thumb alone when a new drag started before the last seek settled', async () => {
    store.total.set(6);
    store.ready.set(6);
    const { fixture, scrub } = render();
    let release: () => void = () => undefined;
    store.seekTo = (position: number): Promise<void> => {
      store.seeks.push(position);
      return new Promise((resolve) => {
        release = resolve;
      });
    };

    drag(scrub, 2);
    scrub.dispatchEvent(new Event('change'));
    drag(scrub, 4);
    release();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(scrub.value).toBe('4');
  });

  it('lands the thumb on the sentence playback snapped to, and says so', async () => {
    store.total.set(6);
    store.ready.set(3);
    store.position.set(1);
    store.landsAt = 3;
    const { fixture, scrub } = render();

    drag(scrub, 5);
    scrub.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(store.seeks).toEqual([5]);
    expect(scrub.value).toBe('3');
    expect(scrub.getAttribute('aria-valuetext')).toBe('Sentence 3 of 6, 3 of 6 with audio');
  });

  it('leaves the thumb where it was when the drop reaches nothing playable', async () => {
    store.total.set(6);
    store.ready.set(1);
    store.position.set(1);
    store.landsAt = 1;
    const { fixture, scrub } = render();

    drag(scrub, 4);
    scrub.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(scrub.value).toBe('1');
    expect(scrub.getAttribute('aria-valuetext')).toBe('Sentence 1 of 6, 1 of 6 with audio');
  });

  it('puts the thumb back when the seek fails, and does not hide the failure', async () => {
    store.total.set(6);
    store.ready.set(6);
    store.position.set(2);
    const { fixture, scrub } = render();
    store.seekTo = (): Promise<void> => Promise.reject(new Error('seek failed'));
    const track = fixture.debugElement.query(By.directive(ReadingTrackComponent))
      .componentInstance as { onCommit(event: Event): Promise<void> };
    const commit = new Event('change');
    Object.defineProperty(commit, 'target', { value: scrub });

    drag(scrub, 5);
    await expect(track.onCommit(commit)).rejects.toThrow('seek failed');

    expect(scrub.value).toBe('2');
  });
});
