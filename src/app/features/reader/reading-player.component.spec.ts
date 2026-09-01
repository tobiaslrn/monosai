import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  AudioPlaybackStore,
  type PlaybackFailure,
  type PlaybackMode,
  type PlaybackStatus,
} from '../../application/audio/audio-playback.store';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import { aiError } from '../../domain/ai/ai-error';
import { readingId, sentenceId, type SentenceId } from '../../domain/shared/ids';
import { storageError } from '../../domain/storage/storage-error';
import { ReadingPlayerComponent } from './reading-player.component';

/** The reading every progress under test belongs to. */
const READING = readingId('00000000-0000-4000-8000-000000000001');

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
  /** Stored clips this reading has that the current audio settings cannot see. */
  readonly otherSettings = signal(false);
  readonly failureSignal = signal<PlaybackFailure | null>(null);
  readonly modeSignal = signal<PlaybackMode>('continuous');

  readonly calls: string[] = [];

  readonly status = this.statusSignal.asReadonly();
  readonly mode = this.modeSignal.asReadonly();
  readonly stepMode = computed(() => this.modeSignal() === 'sentence');
  readonly failure = this.failureSignal.asReadonly();
  readonly sentenceCount = computed(() => this.total());
  readonly availableCount = computed(() => this.ready());
  readonly missingCount = computed(() => this.total() - this.ready());
  readonly hasPlayableAudio = computed(() => this.ready() > 0);
  readonly hasAudioInOtherSettings = this.otherSettings.asReadonly();
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
  /**
   * Where a drop lands, when the real store would not land on the sentence it
   * was dropped on: a position with no clip snaps to the nearest one that has,
   * and a reading with nothing playable moves nothing at all.
   */
  seekLandsAt: number | null = null;

  seekTo = (position: number): Promise<void> => {
    this.position.set(this.seekLandsAt ?? position);
    return this.record(`seekTo:${String(position)}`);
  };

  cycleMode(): void {
    this.calls.push('cycleMode');
    this.modeSignal.update((mode) => (mode === 'continuous' ? 'sentence' : 'continuous'));
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
    [modelConfigured]="modelConfigured()"
    (generate)="emitted.push('generate')"
    (retryGeneration)="emitted.push('retry')"
    (cancelGeneration)="emitted.push('cancel')"
    (dismissGeneration)="emitted.push('dismiss')"
  />`,
})
class HostComponent {
  readonly progress = signal<AudioJobProgress>({ kind: 'idle' });
  readonly selected = signal<SentenceId | null>(null);
  readonly modelConfigured = signal(true);
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
  const WAITING_LABEL = 'Waiting for the next sentence';
  const MODE_LABEL = 'One sentence at a time';

  function control(element: HTMLElement, label: string): HTMLButtonElement | null {
    return element.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  }

  /**
   * What the player says out loud.
   *
   * The card prints nothing: every string it used to render lives in a hidden
   * live region, so this is where the wording is asserted.
   */
  function said(element: HTMLElement): string {
    return element.querySelector('[role="status"]')?.textContent ?? '';
  }

  function scrubber(element: HTMLElement): HTMLInputElement | null {
    return element.querySelector<HTMLInputElement>('input.scrub');
  }

  describe('with no audio yet', () => {
    it('is a generate button where the play button would be', () => {
      store.total.set(13);

      const element = render().nativeElement as HTMLElement;

      // The learner opening a player for a reading with no audio wants the
      // audio, not a dead transport, so the primary control is the one that
      // makes it — in the same place and the same shape as Play.
      expect(control(element, 'Generate audio')?.disabled).toBe(false);
      expect(control(element, 'Play')).toBeNull();
      expect(said(element)).toContain('13 sentences');
      // The rest of the transport is reserved rather than conditional, so the
      // docked card does not change height — and reflow the reading beneath it
      // — the moment the first clip lands.
      expect(control(element, NEXT_LABEL)?.disabled).toBe(true);
      expect(control(element, BACK_LABEL)?.disabled).toBe(true);
      expect(scrubber(element)?.disabled).toBe(true);
    });

    it('generates only when the learner asks, and never on open', () => {
      store.total.set(13);
      const fixture = render();

      expect(fixture.componentInstance.emitted).toEqual([]);

      control(fixture.nativeElement as HTMLElement, 'Generate audio')?.click();

      expect(fixture.componentInstance.emitted).toEqual(['generate']);
    });

    /**
     * Nothing can be generated without a voice, so the offer is the setup — and
     * it is the centre control, saying so in words, because a first run is
     * exactly the state no icon can explain and a dead Play misreports.
     */
    it('makes setup the primary control, and offers no generation, without a model', () => {
      store.total.set(2);
      const fixture = render();
      fixture.componentInstance.modelConfigured.set(false);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const link = element.querySelector<HTMLAnchorElement>('a[aria-label="Set up audio model"]');

      expect(link?.getAttribute('href')).toBe('/settings');
      expect(link?.className).toContain('primary');
      expect(link?.textContent).toContain('Set up audio');
      expect(control(element, 'Generate audio')).toBeNull();
      expect(control(element, 'Play')).toBeNull();
      // One screen offers the same link once: the aux slot no longer repeats it.
      expect(element.querySelectorAll('a[aria-label="Set up audio model"]')).toHaveLength(1);
    });

    /**
     * Clips are keyed by the settings that made them, so a changed voice takes
     * coverage to zero without deleting a row. Saying nothing there is the
     * difference between "your audio is in the other voice" and "your audio is
     * gone", and only one of them is true.
     */
    it('says that the audio it cannot see was made in other settings', () => {
      store.total.set(5);
      store.otherSettings.set(true);
      const fixture = render();
      fixture.componentInstance.modelConfigured.set(false);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;
      const notice = element.querySelector<HTMLElement>('[data-testid="player-voice-mismatch"]');

      expect(notice?.textContent).toContain('other audio settings');
      expect(notice?.querySelector('a')?.getAttribute('href')).toBe('/settings');
      expect(said(element)).toContain('It is still stored');
    });

    /** A reading that simply has no clips anywhere has nothing to explain. */
    it('prints nothing when there is no audio in any settings', () => {
      store.total.set(5);
      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[data-testid="player-voice-mismatch"]')).toBeNull();
    });

    /** Something playable accounts for itself through the transport and the bar. */
    it('stops explaining once a clip in the current settings can be played', () => {
      store.total.set(5);
      store.ready.set(2);
      store.otherSettings.set(true);
      const element = render().nativeElement as HTMLElement;

      expect(element.querySelector('[data-testid="player-voice-mismatch"]')).toBeNull();
    });

    it('renders no action when the reading has no sentences', () => {
      const element = render().nativeElement as HTMLElement;

      expect(control(element, 'Generate audio')).toBeNull();
      expect(element.querySelector('a')).toBeNull();
    });
  });

  describe('while it is being generated', () => {
    function running(completed: number): AudioJobProgress {
      return {
        kind: 'running',
        readingId: READING,
        counts: { total: 13, requested: 13, completed, failed: 0 },
      };
    }

    it('reports the run through the track and the control that stops it', () => {
      store.total.set(13);
      store.ready.set(3);
      const fixture = render();
      fixture.componentInstance.progress.set(running(3));
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      // The track is the report: one fill for how much of the reading has
      // audio, measured over the reading rather than over the job, so a retry
      // covering two missing sentences never renders as half of the reading.
      expect(element.querySelector('.fill.generated')?.getAttribute('style')).toContain('23%');
      expect(element.querySelector('.track')?.classList.contains('is-generating')).toBe(true);
      expect(control(element, 'Stop generating audio')).not.toBeNull();
      expect(control(element, 'Generate audio')).toBeNull();
    });

    it('stops the run from the ring around it', () => {
      store.total.set(13);
      store.ready.set(3);
      const fixture = render();
      fixture.componentInstance.progress.set(running(3));
      fixture.detectChanges();

      control(fixture.nativeElement as HTMLElement, 'Stop generating audio')?.click();

      expect(fixture.componentInstance.emitted).toEqual(['cancel']);
    });

    /**
     * The point of the four-way queue: what has already arrived is playable
     * while the rest is still being made.
     */
    it('plays the prefix while the rest is still being made', () => {
      store.total.set(13);
      store.ready.set(4);
      const fixture = render();
      fixture.componentInstance.progress.set(running(4));
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(control(element, 'Play')?.disabled).toBe(false);
      expect(element.querySelector('.fill.generated')?.getAttribute('style')).toContain('31%');
    });

    /** The bar is what says a run is still going, so it has to stop saying it. */
    it('marks the track while a run is in flight, and only then', () => {
      store.total.set(13);
      store.ready.set(4);
      const fixture = render();
      fixture.componentInstance.progress.set(running(4));
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(element.querySelector('.track')?.classList.contains('is-generating')).toBe(true);

      store.ready.set(13);
      fixture.componentInstance.progress.set({
        kind: 'complete',
        readingId: READING,
        counts: { total: 13, requested: 13, completed: 13, failed: 0 },
      });
      fixture.detectChanges();

      expect(element.querySelector('.track')?.classList.contains('is-generating')).toBe(false);
    });
  });

  describe('when generation stopped', () => {
    it('says what is ready and what failed, and offers the run again', () => {
      store.total.set(13);
      store.ready.set(4);
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        readingId: READING,
        counts: { total: 13, requested: 13, completed: 4, failed: 1 },
        error: {
          source: 'provider',
          error: aiError('rate-limited', 'tts-synthesis', 'Too many requests.'),
        },
        canRetry: true,
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(said(element)).toContain('Stopped with 4 of 13 sentences ready');
      const retry = control(element, 'Try again');
      // The whole of what went wrong, for a pointer that rests on it: a card
      // that floats over the reading has no room for a paragraph.
      expect(retry?.title).toContain('Stopped with 4 of 13 sentences ready');
      retry?.click();

      expect(fixture.componentInstance.emitted).toEqual(['retry']);
    });

    /**
     * 11.2/24.1: the player, the sentence popover, and the whole-reading
     * translation row classify a failure identically and then offer the next
     * step that belongs to their own surface.
     */
    it('reports the failure in the same words as the rest of the reader', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        readingId: READING,
        counts: { total: 4, requested: 4, completed: 0, failed: 1 },
        error: {
          source: 'provider',
          error: aiError('credit-exhausted', 'tts-synthesis', 'Payment Required'),
        },
        canRetry: true,
      });
      fixture.detectChanges();
      const spoken = said(fixture.nativeElement as HTMLElement);

      expect(spoken).toContain(
        'This OpenRouter account is out of credit while reading this sentence aloud.',
      );
      expect(spoken).toContain('Add credit on openrouter.ai, then try again.');
      expect(spoken.toLowerCase()).not.toContain('run the test');
    });

    /**
     * 17.2: the count beside the track has to be measuring the same thing the
     * track is. A run that covered none of the four sentences it asked for
     * reported "0 of 4 sentences ready" next to a bar drawn a third full.
     */
    it('counts the reading as the track does, and the attempt as an attempt', () => {
      store.total.set(6);
      store.ready.set(2);
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        readingId: READING,
        counts: { total: 6, requested: 4, completed: 0, failed: 4 },
        error: {
          source: 'provider',
          error: aiError('provider-unavailable', 'tts-synthesis', 'Unavailable.'),
        },
        canRetry: true,
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(said(element)).toContain('Stopped with 2 of 6 sentences ready.');
      expect(said(element)).toContain('This attempt covered 0 of the 4 sentences');
      expect(scrubber(element)?.getAttribute('aria-valuetext')).toContain('2 of 6 with audio');
    });

    /**
     * 17.1: three presses of Try again on a reading with a dead sentence spent
     * twelve requests each and changed nothing. Once the store reports that
     * running it again cannot work, the control that spends them is gone and
     * the report says why.
     */
    it('stops offering a retry that has been shown not to work', () => {
      store.total.set(6);
      store.ready.set(2);
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        readingId: READING,
        counts: { total: 6, requested: 4, completed: 0, failed: 4 },
        error: {
          source: 'provider',
          error: aiError('provider-unavailable', 'tts-synthesis', 'Unavailable.'),
        },
        canRetry: false,
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(control(element, 'Try again')).toBeNull();
      expect(said(element)).toContain('Trying again produced nothing');
      // The card cannot leave a settled failure on its own, so what is left is
      // the press that puts the report away.
      const dismiss = control(element, 'Dismiss');
      expect(dismiss).not.toBeNull();
      dismiss?.click();

      expect(fixture.componentInstance.emitted).toEqual(['dismiss']);
    });

    /** The prefix that did arrive stays playable while the remainder is offered. */
    it('keeps the transport after a failure that produced clips', () => {
      store.total.set(13);
      store.ready.set(4);
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        readingId: READING,
        counts: { total: 13, requested: 13, completed: 4, failed: 1 },
        error: {
          source: 'provider',
          error: aiError('rate-limited', 'tts-synthesis', 'Too many requests.'),
        },
        canRetry: true,
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(control(element, 'Play')?.disabled).toBe(false);
      expect(control(element, 'Try again')).not.toBeNull();
    });

    /**
     * A run can stop after its last outstanding sentence lands. There is
     * nothing left to retry then, and a red control offering to do it again is
     * a report of a problem the learner does not have.
     */
    it('says nothing about a run that stopped with the reading complete', () => {
      store.total.set(4);
      store.ready.set(4);
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'cancelled',
        readingId: READING,
        counts: { total: 4, requested: 4, completed: 4, failed: 0 },
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(control(element, 'Try again')).toBeNull();
      expect(control(element, 'Generate audio')).toBeNull();
    });

    it('reports a storage failure in the layer that refused', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        readingId: READING,
        counts: { total: 4, requested: 4, completed: 1, failed: 1 },
        error: { source: 'storage', error: storageError('unavailable', 'No room left.') },
        canRetry: true,
      });
      fixture.detectChanges();

      expect(said(fixture.nativeElement as HTMLElement)).toContain('Saving failed: No room left.');
    });

    /**
     * A job that fails before it resolves which sentences it needs has no
     * position to report. Deriving one from the counts said "sentence 1 of 0".
     */
    it('claims no position when the job never got as far as one', () => {
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'failed',
        readingId: READING,
        counts: { total: 10, requested: 0, completed: 0, failed: 0 },
        error: {
          source: 'provider',
          error: aiError('capability-unsupported', 'tts-synthesis', 'No voice.'),
        },
        canRetry: true,
      });
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(said(element)).toContain('Audio could not be prepared.');
      expect(said(element)).not.toContain('of 0');
    });

    it('says what is ready after a cancellation', () => {
      store.total.set(13);
      store.ready.set(4);
      const fixture = render();
      fixture.componentInstance.progress.set({
        kind: 'cancelled',
        readingId: READING,
        counts: { total: 13, requested: 13, completed: 4, failed: 0 },
      });
      fixture.detectChanges();

      expect(said(fixture.nativeElement as HTMLElement)).toContain(
        'Stopped with 4 of 13 sentences ready',
      );
    });
  });

  describe('once there is something to play', () => {
    beforeEach(() => {
      store.total.set(6);
      store.ready.set(6);
    });

    it('shows the transport, and nothing left to prepare', () => {
      const element = render().nativeElement as HTMLElement;

      expect(said(element)).toContain('6 sentences ready');
      expect(control(element, 'Play')).not.toBeNull();
      expect(control(element, 'Generate audio')).toBeNull();
      expect(control(element, BACK_LABEL)).not.toBeNull();
      expect(control(element, 'Pause')).toBeNull();
      expect(control(element, NEXT_LABEL)).not.toBeNull();
    });

    /**
     * A partial set is playable and still incomplete, so the player says both:
     * the transport for what exists, and the one contextual control for what
     * does not.
     */
    it('offers the remainder beside the transport when the set is partial', () => {
      store.ready.set(4);

      const element = render().nativeElement as HTMLElement;

      expect(control(element, 'Play')?.disabled).toBe(false);
      expect(control(element, 'Generate audio')?.title).toContain('4 of 6 sentences have audio');
      expect(said(element)).toContain('Not playing');
      expect(said(element)).not.toContain('sentences ready');
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

      expect(said(element)).toContain('Sentence 2 of 6');
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
    });

    it('steps once something is playing', () => {
      store.statusSignal.set('playing');
      store.current.set(sentenceId('s2'));
      const element = render().nativeElement as HTMLElement;

      control(element, NEXT_LABEL)?.click();
      control(element, BACK_LABEL)?.click();

      expect(store.calls).toEqual(['next', 'previous']);
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

      control(fixture.nativeElement as HTMLElement, 'Start from this sentence')?.click();

      expect(store.calls).toEqual(['playFrom:s3']);
    });

    it('offers no start-from-here when no sentence is open', () => {
      const element = render().nativeElement as HTMLElement;

      expect(control(element, 'Start from this sentence')).toBeNull();
    });

    it('offers no start-from-here when the open sentence has no clip yet', () => {
      store.selectionIsAvailable.set(false);
      const fixture = render();
      fixture.componentInstance.selected.set(sentenceId('s3'));
      fixture.detectChanges();

      expect(control(fixture.nativeElement as HTMLElement, 'Start from this sentence')).toBeNull();
    });
  });

  /**
   * The track is how a reading is aimed at rather than stepped through: holes
   * and all, one drag reaches any sentence that has a clip.
   */
  describe('dragging the track', () => {
    beforeEach(() => {
      store.total.set(6);
      store.ready.set(6);
    });

    it('is a slider over the sentences of the reading', () => {
      const element = render().nativeElement as HTMLElement;
      const scrub = scrubber(element);

      expect(scrub?.getAttribute('max')).toBe('6');
      expect(scrub?.getAttribute('aria-label')).toBe('Position in this reading');
      expect(scrub?.getAttribute('aria-valuetext')).toBe('Not started, 6 of 6 with audio');
    });

    it('seeks where it is released, and not before', () => {
      const fixture = render();
      const scrub = scrubber(fixture.nativeElement as HTMLElement);
      if (scrub === null) {
        throw new Error('The track has no slider.');
      }

      scrub.value = '3';
      scrub.dispatchEvent(new Event('input'));
      fixture.detectChanges();

      // The fill follows the thumb while it is dragged, so the track reads as
      // one movement rather than snapping back until the drag is let go.
      expect(store.calls).toEqual([]);
      expect(
        (fixture.nativeElement as HTMLElement).querySelector('.fill.played')?.getAttribute('style'),
      ).toContain('50%');

      scrub.dispatchEvent(new Event('change'));

      expect(store.calls).toEqual(['seekTo:3']);
    });

    /**
     * 17.3: a drop on a sentence with no clip left the thumb at 5 while the
     * position line said 6. Playback snapping to the nearest clip is right;
     * leaving the thumb somewhere else is what made the card disagree with
     * itself. A range input can raise both events in one task, which is the
     * case the value binding alone could not correct.
     */
    it('lands the thumb where playback landed, not where it was dropped', async () => {
      store.ready.set(4);
      // Rendered at the sentence the drop will snap back to, which is the case
      // the value binding cannot correct on its own: what it last wrote and
      // what it would write next are the same number.
      store.position.set(6);
      store.current.set(sentenceId('s6'));
      store.seekLandsAt = 6;
      const fixture = render();
      const scrub = scrubber(fixture.nativeElement as HTMLElement);
      if (scrub === null) {
        throw new Error('The track has no slider.');
      }

      scrub.value = '5';
      scrub.dispatchEvent(new Event('input'));
      scrub.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(store.calls).toEqual(['seekTo:5']);
      expect(scrub.value).toBe('6');
      expect(said(fixture.nativeElement as HTMLElement)).toContain('Sentence 6 of 6');
      expect(scrub.getAttribute('aria-valuetext')).toBe('Sentence 6 of 6, 4 of 6 with audio');
    });

    /** A reading with nothing playable moves nothing, thumb included. */
    it('leaves the thumb where it was when the drop reaches nothing', async () => {
      store.ready.set(1);
      store.position.set(1);
      store.seekLandsAt = 1;
      const fixture = render();
      const scrub = scrubber(fixture.nativeElement as HTMLElement);
      if (scrub === null) {
        throw new Error('The track has no slider.');
      }

      scrub.value = '4';
      scrub.dispatchEvent(new Event('input'));
      scrub.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();

      expect(scrub.value).toBe('1');
    });

    it('cannot be dragged before anything has audio', () => {
      store.ready.set(0);

      const element = render().nativeElement as HTMLElement;

      expect(scrubber(element)?.disabled).toBe(true);
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

      expect(said(element)).toContain('Waiting for sentence 5 of 6');
    });

    /**
     * The session has already started, so there is nothing to play — but there
     * is still somewhere to go. A run that failed left the frontier waiting for
     * a clip that was never coming, and Back is the way out of it: its first
     * meaning is replaying the sentence just heard.
     */
    it('names what it is doing, and leaves a live way out', () => {
      const element = render().nativeElement as HTMLElement;

      expect(control(element, WAITING_LABEL)?.disabled).toBe(true);
      expect(control(element, 'Play')).toBeNull();
      expect(control(element, 'Pause')).toBeNull();
      expect(control(element, BACK_LABEL)?.disabled).toBe(false);
    });
  });

  describe('one sentence at a time', () => {
    it('offers the mode before there is anything to play, and never moves', () => {
      store.total.set(6);
      const fixture = render();
      const element = fixture.nativeElement as HTMLElement;

      // Persistent rather than conditional: a control that appears when the
      // first clip lands changes the docked card's height and reflows the
      // reading under it.
      expect(control(element, MODE_LABEL)?.getAttribute('aria-pressed')).toBe('false');

      store.ready.set(6);
      store.statusSignal.set('playing');
      store.current.set(sentenceId('s1'));
      fixture.detectChanges();

      expect(control(element, MODE_LABEL)?.getAttribute('aria-pressed')).toBe('false');
    });

    /** One control, pressed to move through the postures a reading can take. */
    it('cycles the mode on and off again', () => {
      store.total.set(6);
      store.ready.set(6);
      const fixture = render();
      const element = fixture.nativeElement as HTMLElement;

      control(element, MODE_LABEL)?.click();
      fixture.detectChanges();

      expect(store.calls).toEqual(['cycleMode']);
      expect(control(element, MODE_LABEL)?.getAttribute('aria-pressed')).toBe('true');
      expect(control(element, MODE_LABEL)?.classList.contains('on')).toBe(true);

      control(element, MODE_LABEL)?.click();
      fixture.detectChanges();

      expect(store.calls).toEqual(['cycleMode', 'cycleMode']);
      expect(control(element, MODE_LABEL)?.getAttribute('aria-pressed')).toBe('false');
    });

    /**
     * Held at a seam, the cursor genuinely is on the sentence just heard, so
     * the position is left alone and the button carries what the next press
     * does.
     */
    it('names the next sentence on Play while it is held at a seam', () => {
      store.total.set(6);
      store.ready.set(6);
      store.position.set(2);
      store.current.set(sentenceId('s2'));
      store.modeSignal.set('sentence');
      store.statusSignal.set('stepped');

      const element = render().nativeElement as HTMLElement;

      expect(said(element)).toContain('Sentence 2 of 6');
      expect(control(element, 'Next sentence')?.disabled).toBe(false);
      expect(control(element, BACK_LABEL)?.disabled).toBe(false);
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

    it('says so, keeps the track full, and can replay the last sentence', () => {
      const element = render().nativeElement as HTMLElement;

      expect(said(element)).toContain('Finished');
      expect(element.querySelector('.fill.played')?.getAttribute('style')).toContain('100%');
      expect(scrubber(element)?.value).toBe('6');
      expect(control(element, BACK_LABEL)?.disabled).toBe(false);
      expect(control(element, 'Play again')?.disabled).toBe(false);
    });
  });

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
     * The failure used to be cleared only by a successful play, so a report
     * about a sentence the learner had moved on from stayed until the player
     * was destroyed. It is now one press, on the control that carries it.
     */
    it('can be dismissed, and says what it is about while it is there', () => {
      store.failureSignal.set({ kind: 'decode-failed', position: 5 });
      const fixture = render();
      const dismiss = control(fixture.nativeElement as HTMLElement, 'Dismiss');

      expect(dismiss?.title).toContain('The audio for sentence 5 could not be played');

      dismiss?.click();

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
