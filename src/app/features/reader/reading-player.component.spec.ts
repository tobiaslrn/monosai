import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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
 * with them. `ready` is how many sentences have a clip, which is now the thing
 * the player is arranged around rather than a single complete/incomplete flag.
 */
class StubPlaybackStore {
  readonly statusSignal = signal<PlaybackStatus>('idle');
  readonly ready = signal(0);
  readonly total = signal(0);
  readonly position = signal(0);
  readonly pending = signal(0);
  readonly current = signal<SentenceId | null>(null);
  readonly nextIsAvailable = signal(true);
  readonly selectionIsAvailable = signal(true);
  readonly failureSignal = signal<PlaybackFailure | null>(null);
  readonly stepModeSignal = signal(false);

  readonly calls: string[] = [];

  readonly status = this.statusSignal.asReadonly();
  readonly stepMode = this.stepModeSignal.asReadonly();
  readonly failure = this.failureSignal.asReadonly();
  readonly sentenceCount = computed(() => this.total());
  readonly availableCount = computed(() => this.ready());
  readonly missingCount = computed(() => this.total() - this.ready());
  readonly hasPlayableAudio = computed(() => this.ready() > 0);
  readonly canPlayWholeReading = computed(() => this.total() > 0 && this.missingCount() === 0);
  readonly currentPosition = computed(() => this.position());
  readonly pendingPosition = computed(() => this.pending());
  readonly currentSentenceId = this.current.asReadonly();
  readonly isActive = computed(() => this.statusSignal() !== 'idle');
  readonly canGoNext = computed(() => this.current() !== null && this.nextIsAvailable());
  readonly canGoPrevious = computed(() => this.current() !== null);

  play = (): Promise<void> => this.record('play');
  resume = (continueReading = false): Promise<void> =>
    this.record(continueReading ? 'resume:reading' : 'resume');
  playFrom = (id: SentenceId): Promise<void> => this.record(`playFrom:${id}`);
  next = (): Promise<void> => this.record('next');
  previous = (): Promise<void> => this.record('previous');
  continueReading = (): Promise<void> => this.record('continueReading');

  setStepMode(enabled: boolean): void {
    this.calls.push(`setStepMode:${String(enabled)}`);
    this.stepModeSignal.set(enabled);
  }

  isAvailable(id: SentenceId | null): boolean {
    return id !== null && this.selectionIsAvailable();
  }

  pause(): void {
    this.calls.push('pause');
  }

  stop(): void {
    this.calls.push('stop');
  }

  acknowledgeFailure(): void {
    this.calls.push('acknowledgeFailure');
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
      providers: [provideRouter([]), { provide: AudioPlaybackStore, useValue: store }],
    });
  });

  function render(): ReturnType<typeof TestBed.createComponent<HostComponent>> {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** Back names both of the things it does, because its icon can name neither. */
  const BACK_LABEL = 'Restart this sentence, or go back to the one before';
  const NEXT_LABEL = 'Next sentence with audio';
  const STOP_LABEL = 'Stop reading';
  const WAITING_LABEL = 'Waiting for the next sentence';

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
      // The transport row is reserved rather than conditional, so the docked
      // card does not change height — and reflow the reading beneath it — the
      // moment the first clip lands. There is nothing to press yet.
      expect(control(element, 'Play')?.disabled).toBe(true);
      expect(control(element, NEXT_LABEL)?.disabled).toBe(true);
      expect(control(element, STOP_LABEL)?.disabled).toBe(true);
    });

    it('generates only when the learner asks, and never on open', () => {
      store.total.set(13);
      const fixture = render();

      expect(fixture.componentInstance.emitted).toEqual([]);

      press(fixture.nativeElement as HTMLElement, 'Generate audio');

      expect(fixture.componentInstance.emitted).toEqual(['generate']);
    });

    it('uses the internal router for audio setup', () => {
      store.total.set(2);
      const element = render().nativeElement as HTMLElement;
      const link = [...element.querySelectorAll<HTMLAnchorElement>('a')].find((anchor) =>
        anchor.textContent.includes('Set up audio model'),
      );

      expect(link?.getAttribute('href')).toBe('/settings');
    });

    it('renders no action when the reading has no sentences', () => {
      const element = render().nativeElement as HTMLElement;

      expect(element.textContent).not.toContain('Generate audio');
      expect(element.querySelector('a')).toBeNull();
    });
  });

  describe('while it is being generated', () => {
    it('counts what is ready rather than claiming one sentence is being read', () => {
      store.total.set(13);
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'running',
        counts: { total: 13, requested: 13, completed: 3, failed: 0 },
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.textContent).toContain('3 of 13 sentences ready');
      // One track, not two identical accent bars stacked. The generated fill is
      // measured over the reading rather than over the job, so a retry covering
      // two missing sentences never renders as half of the reading.
      expect(element.querySelectorAll('[role="progressbar"]')).toHaveLength(1);
    });

    /**
     * The point of the four-way queue: what has already arrived is playable
     * while the rest is still being made, so the transport is present *and* the
     * run reports itself, rather than one replacing the other.
     */
    it('shows the transport and the run together once a prefix exists', () => {
      store.total.set(13);
      store.ready.set(4);
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'running',
        counts: { total: 13, requested: 13, completed: 4, failed: 0 },
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(control(element, 'Play')?.disabled).toBe(false);
      expect(element.textContent).toContain('4 of 13 sentences ready');
      expect(
        element.querySelector('[role="progressbar"] .fill.generated')?.getAttribute('style'),
      ).toContain('31%');
      expect([...element.querySelectorAll('button')].map((button) => button.textContent)).toContain(
        'Stop',
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
    it('names what is ready, what failed, and both ways out', () => {
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

      expect(element.textContent).toContain('Stopped with 4 of 13 sentences ready');
      expect(element.querySelector('[role="alert"]')).not.toBeNull();

      press(element, 'Try again');
      press(element, 'Dismiss');
      expect(fixture.componentInstance.emitted).toEqual(['retry', 'dismiss']);
    });

    /** The prefix that did arrive stays playable while the remainder is offered. */
    it('keeps the transport after a failure that produced clips', () => {
      store.total.set(13);
      store.ready.set(4);
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

      expect(control(element, 'Play')?.disabled).toBe(false);
      expect(element.textContent).toContain('Try again');
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

    it('says what is ready after a cancellation', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'cancelled',
        counts: { total: 13, requested: 13, completed: 4, failed: 0 },
      });
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).toContain(
        'Stopped with 4 of 13 sentences ready',
      );
    });
  });

  describe('once there is something to play', () => {
    beforeEach(() => {
      store.total.set(6);
      store.ready.set(6);
    });

    it('shows the transport and the position, and nothing left to prepare', () => {
      const element = render().nativeElement as HTMLElement;

      expect(element.textContent).toContain('6 sentences ready');
      expect(control(element, 'Play')).not.toBeNull();
      expect(element.textContent).not.toContain('Generate audio');
      expect(control(element, BACK_LABEL)).not.toBeNull();
      expect(control(element, 'Pause')).toBeNull();
      expect(control(element, NEXT_LABEL)).not.toBeNull();
      // A Stop that is not "hide the player", disabled until there is a session.
      expect(control(element, STOP_LABEL)?.disabled).toBe(true);
    });

    /**
     * A partial set is playable and still incomplete, so the player says both:
     * the transport for what exists, and the offer for what does not.
     */
    it('offers the remainder beside the transport when the set is partial', () => {
      store.ready.set(4);

      const element = render().nativeElement as HTMLElement;

      expect(control(element, 'Play')?.disabled).toBe(false);
      expect(element.textContent).toContain('4 of 6 sentences have audio');
      expect(element.textContent).toContain('Generate audio');
      // The rail already says how much there is; the position line does not
      // repeat it while nothing is playing. It says something, though: an empty
      // live region beside a row of controls reads as a label that failed.
      expect(element.textContent).not.toContain('sentences ready');
      expect(element.querySelector('.position')?.textContent).toContain('Not playing');
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

      // Resuming from the transport means reading on, not finishing the one
      // sentence a popover started.
      expect(store.calls).toEqual(['pause', 'resume:reading']);
    });

    it('leaves previous and next disabled until a sentence is active', () => {
      const element = render().nativeElement as HTMLElement;

      expect(control(element, NEXT_LABEL)?.disabled).toBe(true);
      expect(control(element, BACK_LABEL)?.disabled).toBe(true);
      expect(control(element, STOP_LABEL)?.disabled).toBe(true);
    });

    it('steps once something is playing', () => {
      store.statusSignal.set('playing');
      store.current.set(sentenceId('s2'));
      const element = render().nativeElement as HTMLElement;

      control(element, NEXT_LABEL)?.click();
      control(element, BACK_LABEL)?.click();
      control(element, STOP_LABEL)?.click();

      expect(store.calls).toEqual(['next', 'previous', 'stop']);
    });

    /** Manual Next is a jump, and a jump needs somewhere to land. */
    it('disables Next while no later sentence has a clip', () => {
      store.statusSignal.set('playing');
      store.current.set(sentenceId('s2'));
      store.nextIsAvailable.set(false);

      const element = render().nativeElement as HTMLElement;

      expect(control(element, NEXT_LABEL)?.disabled).toBe(true);
      // Back still works, because its first meaning is replaying this sentence.
      expect(control(element, BACK_LABEL)?.disabled).toBe(false);
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

    it('offers no start-from-here when the open sentence has no clip yet', () => {
      store.selectionIsAvailable.set(false);
      const fixture = render();
      fixture.componentInstance.selected.set(sentenceId('s3'));
      fixture.detectChanges();

      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain(
        'Start from this sentence',
      );
    });
  });

  describe('waiting at the frontier', () => {
    beforeEach(() => {
      store.total.set(6);
      store.ready.set(4);
      store.current.set(sentenceId('s4'));
      store.position.set(4);
      store.pending.set(5);
      store.statusSignal.set('waiting');
    });

    it('says which sentence it is waiting for', () => {
      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="status"]')?.textContent).toContain(
        'Waiting for sentence 5 of 6',
      );
    });

    /**
     * The session has already started, so there is nothing to play — but there
     * is always something to press. A run that failed left the frontier waiting
     * for a clip that was never coming, with every transport control dead.
     */
    it('leaves a live Stop while it waits', () => {
      const element = render().nativeElement as HTMLElement;

      expect(control(element, WAITING_LABEL)?.disabled).toBe(true);
      expect(control(element, 'Play')).toBeNull();
      expect(control(element, 'Pause')).toBeNull();
      expect(control(element, STOP_LABEL)?.disabled).toBe(false);
    });
  });

  describe('one sentence at a time', () => {
    const TOGGLE_LABEL = 'One sentence at a time';

    function toggle(element: HTMLElement): HTMLButtonElement | undefined {
      return [...element.querySelectorAll<HTMLButtonElement>('button')].find((button) =>
        button.textContent.includes(TOGGLE_LABEL),
      );
    }

    it('offers the mode before there is anything to play, and never moves', () => {
      store.total.set(6);
      const fixture = render();
      const element = fixture.nativeElement as HTMLElement;

      // Persistent rather than conditional: a control that appears when the
      // first clip lands changes the docked card's height and reflows the
      // reading under it.
      expect(toggle(element)?.getAttribute('aria-pressed')).toBe('false');

      store.ready.set(6);
      store.statusSignal.set('playing');
      store.current.set(sentenceId('s1'));
      fixture.detectChanges();

      expect(toggle(element)?.getAttribute('aria-pressed')).toBe('false');
    });

    it('turns the mode on and says that it is on', () => {
      store.total.set(6);
      store.ready.set(6);
      const fixture = render();
      const element = fixture.nativeElement as HTMLElement;

      toggle(element)?.click();
      fixture.detectChanges();

      expect(store.calls).toEqual(['setStepMode:true']);
      expect(toggle(element)?.getAttribute('aria-pressed')).toBe('true');

      toggle(element)?.click();
      fixture.detectChanges();

      expect(store.calls).toEqual(['setStepMode:true', 'setStepMode:false']);
      expect(toggle(element)?.getAttribute('aria-pressed')).toBe('false');
    });

    /**
     * Held at a seam, the cursor genuinely is on the sentence just heard, so
     * the position line is left alone and the button carries what the next
     * press does.
     */
    it('names the next sentence on Play while it is held at a seam', () => {
      store.total.set(6);
      store.ready.set(6);
      store.position.set(2);
      store.current.set(sentenceId('s2'));
      store.stepModeSignal.set(true);
      store.statusSignal.set('stepped');

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('.position')?.textContent).toContain('Sentence 2 of 6');
      expect(control(element, 'Next sentence')?.disabled).toBe(false);
      expect(control(element, STOP_LABEL)?.disabled).toBe(false);
    });

    it('reads on rather than resuming when that Play is pressed', () => {
      store.total.set(6);
      store.ready.set(6);
      store.position.set(2);
      store.current.set(sentenceId('s2'));
      store.statusSignal.set('stepped');

      const element = render().nativeElement as HTMLElement;
      control(element, 'Next sentence')?.click();

      // Not `resume`: nothing was interrupted, and resuming a session that is
      // not paused does nothing at all.
      expect(store.calls).toEqual(['continueReading']);
    });
  });

  /**
   * Reaching the end is not a reset. Snapping back to "N sentences ready" made
   * a reading that had just been read aloud indistinguishable from one that had
   * never been started, and put the last sentence out of reach.
   */
  describe('a reading that finished', () => {
    beforeEach(() => {
      store.total.set(6);
      store.ready.set(6);
      store.position.set(6);
      store.current.set(sentenceId('s6'));
      store.statusSignal.set('ended');
    });

    it('says so, keeps the bar full, and can replay the last sentence', () => {
      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('.position')?.textContent).toContain('Finished');
      expect(element.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe(
        '100',
      );
      expect(control(element, BACK_LABEL)?.disabled).toBe(false);
      expect(control(element, 'Play again')?.disabled).toBe(false);
    });
  });

  /**
   * Clips arrive out of order, so a reading can have audio without having the
   * audio Play from the beginning would need.
   */
  /**
   * Clips arrive out of order, so a reading can have audio without having the
   * audio that starting from sentence one would need. Refusing to play at all
   * left the learner with no way into audio they had already paid for; the
   * store starts at the first sentence that does have a clip instead.
   */
  it('offers Play whenever any sentence has a clip', () => {
    store.total.set(6);
    store.ready.set(2);

    const element = render().nativeElement as HTMLElement;

    expect(control(element, 'Play')?.disabled).toBe(false);
  });

  describe('failures name the sentence, not the reading', () => {
    beforeEach(() => {
      store.total.set(6);
      store.ready.set(6);
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

    /**
     * The banner used to be cleared only by a successful play, so a failure
     * about a sentence the learner had moved on from stayed on screen until the
     * player was destroyed.
     */
    it('can be dismissed', () => {
      store.failureSignal.set({ kind: 'decode-failed', position: 5 });
      const fixture = render();

      press(fixture.nativeElement as HTMLElement, 'Dismiss');

      expect(store.calls).toEqual(['acknowledgeFailure']);
    });

    it('names a sentence the run never got to', () => {
      store.failureSignal.set({ kind: 'not-generated', position: 4 });

      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[role="alert"]')?.textContent).toContain(
        'Sentence 4 has not been generated yet',
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
