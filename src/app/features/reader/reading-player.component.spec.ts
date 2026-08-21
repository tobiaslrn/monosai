import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AudioPlaybackStore,
  type PlaybackFailure,
  type PlaybackStatus,
} from '../../application/audio/audio-playback.store';
import { sentenceId, type SentenceId } from '../../domain/shared/ids';
import { ReadingPlayerComponent } from './reading-player.component';

/**
 * The playback store's surface, as the player reads it.
 *
 * A stub rather than the real store with a fake element: what is under test
 * here is which controls appear and which call is made, not what the store does
 * with them.
 */
class StubPlaybackStore {
  readonly statusSignal = signal<PlaybackStatus>('idle');
  readonly gate = signal(false);
  readonly missing = signal(0);
  readonly position = signal(0);
  readonly total = signal(0);
  readonly failureSignal = signal<PlaybackFailure | null>(null);

  readonly calls: string[] = [];

  readonly status = this.statusSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  readonly canPlayWholeReading = computed(() => this.gate());
  readonly missingCount = computed(() => this.missing());
  readonly currentPosition = computed(() => this.position());
  readonly sentenceCount = computed(() => this.total());
  readonly isActive = computed(() => this.statusSignal() !== 'idle');

  play = (): Promise<void> => this.record('play');
  resume = (): Promise<void> => this.record('resume');
  playFrom = (id: SentenceId): Promise<void> => this.record(`playFrom:${id}`);
  next = (): Promise<void> => this.record('next');
  previous = (): Promise<void> => this.record('previous');

  pause(): void {
    this.calls.push('pause');
  }

  stop(): void {
    this.calls.push('stop');
  }

  private record(call: string): Promise<void> {
    this.calls.push(call);
    return Promise.resolve();
  }
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReadingPlayerComponent],
  template: `<mn-reading-player [compact]="compact()" [selectedSentenceId]="selected()" />`,
})
class HostComponent {
  readonly compact = signal(false);
  readonly selected = signal<SentenceId | null>(null);
}

describe('ReadingPlayerComponent', () => {
  let store: StubPlaybackStore;

  beforeEach(() => {
    TestBed.resetTestingModule();
    store = new StubPlaybackStore();
    TestBed.configureTestingModule({
      providers: [{ provide: AudioPlaybackStore, useValue: store }],
    });
  });

  function render(): ReturnType<typeof TestBed.createComponent<HostComponent>> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  function control(element: HTMLElement, label: string): HTMLButtonElement | null {
    return element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }

  /**
   * A reading with no audio prepared has no player at all. An always-present
   * bar with everything disabled would be a permanent strip over the text,
   * which is exactly what the reading surface does not have.
   */
  it('shows nothing for a reading with no complete set and nothing playing', () => {
    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('.player')).toBeNull();
  });

  it('appears once the whole reading can be played', () => {
    store.gate.set(true);
    store.total.set(6);

    const element = render().nativeElement as HTMLElement;

    expect(element.querySelector('.player')).not.toBeNull();
    expect(element.textContent).toContain('6 sentences ready');
  });

  it('plays on the learner pressing play, and never on its own', () => {
    store.gate.set(true);
    store.total.set(6);
    const fixture = render();

    expect(store.calls).toEqual([]);

    control(fixture.nativeElement as HTMLElement, 'Play this reading')?.click();

    expect(store.calls).toEqual(['play']);
  });

  it('offers pause while playing, and resume once paused', () => {
    store.gate.set(true);
    store.total.set(6);
    store.position.set(2);
    store.statusSignal.set('playing');
    const fixture = render();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.textContent).toContain('Sentence 2 of 6');
    control(element, 'Pause')?.click();
    expect(store.calls).toEqual(['pause']);

    store.statusSignal.set('paused');
    fixture.detectChanges();
    control(element, 'Resume')?.click();

    expect(store.calls).toEqual(['pause', 'resume']);
  });

  it('leaves the transport disabled while nothing is playing', () => {
    store.gate.set(true);
    store.total.set(6);
    const element = render().nativeElement as HTMLElement;

    expect(control(element, 'Next sentence')?.disabled).toBe(true);
    expect(control(element, 'Previous sentence')?.disabled).toBe(true);
    expect(control(element, 'Stop')?.disabled).toBe(true);
  });

  it('steps and stops once something is playing', () => {
    store.gate.set(true);
    store.total.set(6);
    store.statusSignal.set('playing');
    const element = render().nativeElement as HTMLElement;

    control(element, 'Next sentence')?.click();
    control(element, 'Previous sentence')?.click();
    control(element, 'Stop')?.click();

    expect(store.calls).toEqual(['next', 'previous', 'stop']);
  });

  it('starts from the open sentence when one is open', () => {
    store.gate.set(true);
    store.total.set(6);
    const fixture = render();
    fixture.componentInstance.selected.set(sentenceId('s3'));
    fixture.detectChanges();

    [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent.includes('Start from this sentence'))
      ?.click();

    expect(store.calls).toEqual(['playFrom:s3']);
  });

  it('offers no start-from-here when no sentence is open', () => {
    store.gate.set(true);
    store.total.set(6);

    const element = render().nativeElement as HTMLElement;

    expect(element.textContent).not.toContain('Start from this sentence');
  });

  /** In the header there is room for the transport and a position, and no more. */
  it('drops the track and the start-from-here in its compact shape', () => {
    store.gate.set(true);
    store.total.set(6);
    const fixture = render();
    fixture.componentInstance.compact.set(true);
    fixture.componentInstance.selected.set(sentenceId('s3'));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.track')).toBeNull();
    expect(element.textContent).not.toContain('Start from this sentence');
    expect(control(element, 'Play this reading')).not.toBeNull();
    expect(element.textContent).toContain('6 sentences ready');
  });

  describe('failures name the sentence, not the reading', () => {
    beforeEach(() => {
      store.total.set(6);
    });

    it('says how many clips are still missing', () => {
      store.failureSignal.set({ kind: 'incomplete', missing: 2 });
      store.statusSignal.set('idle');
      store.gate.set(true);

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        '2 sentences have no audio yet',
      );
    });

    it('names the sentence whose clip has gone', () => {
      store.gate.set(true);
      store.failureSignal.set({ kind: 'missing-clip', position: 4 });

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'Sentence 4 has no audio for the voice you are using now',
      );
    });

    it('names the sentence that could not be decoded', () => {
      store.gate.set(true);
      store.failureSignal.set({ kind: 'decode-failed', position: 5 });

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'The audio for sentence 5 could not be played',
      );
    });

    it('reports a storage failure in its own words', () => {
      store.gate.set(true);
      store.failureSignal.set({ kind: 'storage', message: 'The database was unavailable.' });

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'Reading the saved audio failed: The database was unavailable.',
      );
    });
  });
});
