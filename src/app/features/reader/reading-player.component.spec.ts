import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AudioPlaybackStore,
  type PlaybackFailure,
  type PlaybackStatus,
} from '../../application/audio/audio-playback.store';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import { aiError } from '../../domain/ai/ai-error';
import { sentenceId, type SentenceId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
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
  readonly current = signal<SentenceId | null>(null);
  readonly failureSignal = signal<PlaybackFailure | null>(null);

  readonly calls: string[] = [];

  readonly status = this.statusSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  readonly canPlayWholeReading = computed(() => this.gate());
  readonly missingCount = computed(() => this.missing());
  readonly currentPosition = computed(() => this.position());
  readonly currentSentenceId = this.current.asReadonly();
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
  template: `<mn-reading-player
    [progress]="progress()"
    [selectedSentenceId]="selected()"
    (generate)="emitted.push('generate')"
    (cancelGeneration)="emitted.push('cancel')"
    (retryGeneration)="emitted.push('retry')"
    (dismissJob)="emitted.push('dismiss')"
  />`,
})
class HostComponent {
  readonly progress = signal<AudioJobProgress>({ kind: 'idle' });
  readonly selected = signal<SentenceId | null>(null);
  readonly emitted: string[] = [];
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

  function press(element: HTMLElement, text: string): void {
    [...element.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent.includes(text))
      ?.click();
  }

  describe('with no audio yet', () => {
    it('offers to generate it, and says how many sentences that is', () => {
      store.total.set(13);

      const element = render().nativeElement as HTMLElement;

      expect(element.textContent).toContain('13 sentences');
      expect(element.textContent).toContain('Generate audio');
      // Nothing about playing, because there is nothing to play.
      expect(control(element, 'Play')).toBeNull();
    });

    it('generates only when the learner asks, and never on open', () => {
      store.total.set(13);
      const fixture = render();

      expect(fixture.componentInstance.emitted).toEqual([]);

      press(fixture.nativeElement as HTMLElement, 'Generate audio');

      expect(fixture.componentInstance.emitted).toEqual(['generate']);
    });
  });

  describe('while it is being generated', () => {
    it('reports which sentence it has reached, in the player', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'running',
        counts: { total: 13, requested: 13, completed: 3, failed: 0 },
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.textContent).toContain('Sentence 4 of 13');
      expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
        '23',
      );
    });

    it('stops on request', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({ kind: 'preparing' });
      fixture.detectChanges();

      press(fixture.nativeElement as HTMLElement, 'Stop');

      expect(fixture.componentInstance.emitted).toEqual(['cancel']);
    });
  });

  describe('when generation stopped', () => {
    it('names where it stopped, what failed, and both ways out', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        counts: { total: 13, requested: 13, completed: 4, failed: 1 },
        error: {
          source: 'provider',
          error: aiError('rate-limited', 'tts-synthesis', 'Too many requests.'),
        },
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.textContent).toContain('Stopped at sentence 5 of 13');
      expect(element.querySelector('[role="alert"]')).not.toBeNull();

      press(element, 'Try again');
      press(element, 'Dismiss');
      expect(fixture.componentInstance.emitted).toEqual(['retry', 'dismiss']);
    });

    it('reports a storage failure in the layer that refused', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        counts: { total: 4, requested: 4, completed: 1, failed: 1 },
        error: { source: 'storage', error: storageError('unavailable', 'No room left.') },
      });
      fixture.detectChanges();

      expect(
        (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent,
      ).toContain('Saving failed: No room left.');
    });

    /**
     * A job that fails before it resolves which sentences it needs has no
     * position to report. Deriving one from the counts said "sentence 1 of 0".
     */
    it('claims no position when the job never got as far as one', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        counts: { total: 10, requested: 0, completed: 0, failed: 0 },
        error: {
          source: 'provider',
          error: aiError('capability-unsupported', 'tts-synthesis', 'No voice.'),
        },
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.textContent).toContain('Audio could not be prepared.');
      expect(element.textContent).not.toContain('of 0');
    });

    it('says what was kept after a cancellation', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'cancelled',
        counts: { total: 13, requested: 13, completed: 4, failed: 0 },
      });
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Sentences already read aloud were kept',
      );
    });
  });

  describe('once the whole reading can be played', () => {
    beforeEach(() => {
      store.gate.set(true);
      store.total.set(6);
    });

    it('shows the transport and the position', () => {
      const element = render().nativeElement as HTMLElement;

      expect(element.textContent).toContain('6 sentences ready');
      expect(control(element, 'Play')).not.toBeNull();
      expect(element.textContent).not.toContain('Generate audio');
      expect(control(element, 'Previous sentence')).not.toBeNull();
      expect(control(element, 'Pause')).toBeNull();
      expect(control(element, 'Next sentence')).not.toBeNull();
      expect(control(element, 'Stop')).toBeNull();
    });

    it('plays on the learner pressing play, and never on its own', () => {
      const fixture = render();

      expect(store.calls).toEqual([]);

      control(fixture.nativeElement as HTMLElement, 'Play')?.click();

      expect(store.calls).toEqual(['play']);
    });

    it('offers pause while playing, and resume once paused', () => {
      store.position.set(2);
      store.current.set(sentenceId('s2'));
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

    it('leaves previous and next disabled until a sentence is active', () => {
      const element = render().nativeElement as HTMLElement;

      expect(control(element, 'Next sentence')?.disabled).toBe(true);
      expect(control(element, 'Previous sentence')?.disabled).toBe(true);
      expect(control(element, 'Stop')).toBeNull();
    });

    it('steps once something is playing', () => {
      store.statusSignal.set('playing');
      store.current.set(sentenceId('s2'));
      const element = render().nativeElement as HTMLElement;

      control(element, 'Next sentence')?.click();
      control(element, 'Previous sentence')?.click();

      expect(store.calls).toEqual(['next', 'previous']);
    });

    it('starts from the open sentence when one is open', () => {
      const fixture = render();
      fixture.componentInstance.selected.set(sentenceId('s3'));
      fixture.detectChanges();

      press(fixture.nativeElement as HTMLElement, 'Start from this sentence');

      expect(store.calls).toEqual(['playFrom:s3']);
    });

    it('offers no start-from-here when no sentence is open', () => {
      const element = render().nativeElement as HTMLElement;

      expect(element.textContent).not.toContain('Start from this sentence');
    });
  });

  describe('failures name the sentence, not the reading', () => {
    beforeEach(() => {
      store.total.set(6);
      store.gate.set(true);
    });

    it('says how many clips are still missing', () => {
      store.failureSignal.set({ kind: 'incomplete', missing: 2 });

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        '2 sentences have no audio yet',
      );
    });

    it('names the sentence whose clip has gone', () => {
      store.failureSignal.set({ kind: 'missing-clip', position: 4 });

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'Sentence 4 has no audio for the voice you are using now',
      );
    });

    it('names the sentence that could not be decoded', () => {
      store.failureSignal.set({ kind: 'decode-failed', position: 5 });

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'The audio for sentence 5 could not be played',
      );
    });

    it('reports a storage failure in its own words', () => {
      store.failureSignal.set({ kind: 'storage', message: 'The database was unavailable.' });

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'Reading the saved audio failed: The database was unavailable.',
      );
    });
  });
});
