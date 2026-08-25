import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import type { SentenceId } from '../../domain/shared/ids';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';

/** What the player is showing, resolved from the job first and playback second. */
export type PlayerMode = 'generating' | 'stopped' | 'ready' | 'absent';

/**
 * Everything to do with a reading's audio, in one player.
 *
 * Generating it, watching that run, recovering from a failure, and playing the
 * result used to be three surfaces in three places — a menu entry, a hairline in
 * the header, and a player that only appeared once the whole set existed. A
 * learner had no way to find out the application could read to them at all. The
 * header's audio button is always there, and this is what it opens.
 *
 * It reads the root playback store directly rather than being handed its state,
 * because playback is application-wide and outlives the player being open.
 *
 * **Nothing here starts on mount.** Opening the player loads no audio and sends
 * no request: the first sound and the first spend are both a press.
 */
@Component({
  selector: 'mn-reading-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, RouterLink],
  template: `
    <div class="player">
      @switch (mode()) {
        @case ('generating') {
          <div
            class="bar"
            role="progressbar"
            aria-label="Preparing audio for this reading"
            [attr.aria-valuenow]="jobPercent()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span class="fill" [style.inline-size.%]="jobPercent()"></span>
          </div>
          <div class="row">
            <p class="line" role="status">{{ jobLine() }}</p>
            <button type="button" class="quiet" (click)="cancelGeneration.emit()">Stop</button>
          </div>
        }

        @case ('stopped') {
          <div class="row">
            <p class="line" role="status">{{ jobLine() }}</p>
          </div>
          @if (jobFailure(); as failure) {
            <p class="mn-error" role="alert">{{ failure }}</p>
          }
          <div class="row">
            <button type="button" class="mn-button" (click)="retryGeneration.emit()">
              Try again
            </button>
            <button type="button" class="quiet" (click)="dismissJob.emit()">Dismiss</button>
          </div>
        }

        @case ('ready') {
          <div class="transport">
            <!--
              Back replays the sentence being read before it steps to the one
              before it, because the reason to reach for it is that the sentence
              went past too fast. The name says so, since the icon cannot.
            -->
            <button
              type="button"
              class="mn-icon-button step"
              aria-label="Restart this sentence, or go back to the one before"
              [disabled]="!canNavigate()"
              (click)="previous()"
            >
              <mn-icon name="skip-back" [size]="20" />
            </button>

            @if (isPlaying()) {
              <button type="button" class="play" aria-label="Pause" (click)="store.pause()">
                <mn-icon name="pause" [size]="24" />
              </button>
            } @else {
              <button
                type="button"
                class="play"
                [attr.aria-label]="playLabel()"
                [disabled]="isLoading()"
                (click)="play()"
              >
                <mn-icon name="play" [size]="24" />
              </button>
            }

            <button
              type="button"
              class="mn-icon-button step"
              aria-label="Next sentence"
              [disabled]="!canNavigate()"
              (click)="next()"
            >
              <mn-icon name="skip-forward" [size]="20" />
            </button>

            <p class="position" role="status">{{ positionLabel() }}</p>
          </div>

          <div
            class="bar"
            role="progressbar"
            aria-label="Position in this reading"
            [attr.aria-valuenow]="percent()"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <span class="fill" [style.inline-size.%]="percent()"></span>
          </div>

          <!--
            Start from where the learner is rather than from the top. Offered
            only when a sentence was open when the player was opened, because
            "this sentence" needs somewhere to mean.
          -->
          @if (canStartFromSelection()) {
            <button type="button" class="quiet" (click)="playFromSelection()">
              Start from this sentence
            </button>
          }
        }

        @case ('absent') {
          @if (store.sentenceCount() > 0) {
            <p class="line">{{ sentenceCountLabel() }}</p>
            <button type="button" class="mn-button mn-button--primary" (click)="generate.emit()">
              Generate audio
            </button>
            @if (!modelConfigured()) {
              <a class="mn-button" routerLink="/settings">Set up audio model</a>
            }
          }
        }
      }

      @if (failureMessage(); as message) {
        <p class="mn-error" role="alert">{{ message }}</p>
      }
    </div>
  `,
  styles: `
    .player {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }

    /*
     * The transport reads left to right as one row: the three controls, then
     * where in the reading they are acting. Centring it left the position line
     * on a row of its own and made a compact bar twice as tall as it needs.
     */
    .transport {
      display: flex;
      gap: var(--space-2);
      align-items: center;
    }

    .step {
      width: var(--touch-target);
      height: var(--touch-target);
    }

    /* Play is the one control that is pressed repeatedly, so it is the big one. */
    .play {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 3.25rem;
      height: 3.25rem;
      padding: 0;
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--action-primary);
      color: var(--text-on-action);
      cursor: pointer;
      transition:
        background-color var(--motion-fast) ease-out,
        transform var(--motion-fast) ease-out;
    }

    .play:hover:not(:disabled) {
      background: var(--action-primary-hover);
    }

    .play:active:not(:disabled) {
      transform: scale(0.96);
    }

    .play:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    .position {
      flex: 1;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      text-align: end;
    }

    .row {
      display: flex;
      gap: var(--space-3);
      align-items: center;
    }

    .bar {
      block-size: 3px;
      overflow: hidden;
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
    }

    .fill {
      display: block;
      block-size: 100%;
      background: var(--action-primary);
      transition: inline-size var(--motion-medium) ease-out;
    }

    .line {
      flex: 1;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .quiet {
      min-height: var(--touch-target);
      padding-inline: var(--space-2);
      border: 0;
      background: none;
      color: var(--text-primary);
      font: inherit;
      font-size: var(--text-sm);
      text-decoration: underline;
      cursor: pointer;
    }

    .mn-error {
      margin: 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }
    @media (prefers-reduced-motion: reduce) {
      .fill,
      .play {
        transition: none;
      }
    }
  `,
})
export class ReadingPlayerComponent {
  protected readonly store = inject(AudioPlaybackStore);

  readonly progress = input.required<AudioJobProgress>();
  /** The sentence that was selected when the player was opened, for Start from here. */
  readonly selectedSentenceId = input<SentenceId | null>(null);
  /** Drives the setup link, since audio cannot be generated without a model. */
  readonly modelConfigured = input<boolean>(false);

  readonly generate = output<void>();
  readonly cancelGeneration = output<void>();
  readonly retryGeneration = output<void>();
  readonly dismissJob = output<void>();

  /**
   * The job wins over playback, because a job that has just stopped is what the
   * learner is waiting on: showing a transport instead would answer a question
   * they did not ask.
   */
  protected readonly mode = computed<PlayerMode>(() => {
    const progress = this.progress();
    if (progress.kind === 'preparing' || progress.kind === 'running') {
      return 'generating';
    }
    if (progress.kind === 'failed' || progress.kind === 'cancelled') {
      return 'stopped';
    }
    return this.store.canPlayWholeReading() || this.store.isActive() ? 'ready' : 'absent';
  });

  protected readonly isPlaying = computed(() => this.store.status() === 'playing');

  protected readonly isLoading = computed(() => this.store.status() === 'loading');

  protected readonly playLabel = computed(() =>
    this.store.status() === 'paused' ? 'Resume' : 'Play',
  );

  /** Navigation only makes sense once a clip has become the active sentence. */
  protected readonly canNavigate = computed(() => this.store.currentSentenceId() !== null);

  protected readonly percent = computed(() => {
    const total = this.store.sentenceCount();
    return total === 0 ? 0 : Math.round((this.store.currentPosition() / total) * 100);
  });

  protected readonly positionLabel = computed(() => {
    const total = this.store.sentenceCount();
    const position = this.store.currentPosition();
    if (position === 0) {
      return `${String(total)} sentences ready`;
    }
    return `Sentence ${String(position)} of ${String(total)}`;
  });

  protected readonly sentenceCountLabel = computed(() => {
    const total = this.store.sentenceCount();
    return `${String(total)} ${total === 1 ? 'sentence' : 'sentences'}`;
  });

  protected readonly canStartFromSelection = computed(
    () => this.selectedSentenceId() !== null && this.store.canPlayWholeReading(),
  );

  protected readonly jobPercent = computed(() => {
    const progress = this.progress();
    if (progress.kind === 'idle' || progress.kind === 'preparing') {
      return 0;
    }
    const { completed, requested } = progress.counts;
    return requested === 0 ? 100 : Math.round((completed / requested) * 100);
  });

  protected readonly jobLine = computed(() => {
    const progress = this.progress();
    switch (progress.kind) {
      case 'idle':
      case 'complete':
        return '';
      case 'preparing':
        return 'Preparing…';
      case 'running':
        return `Sentence ${String(progress.counts.completed + 1)} of ${String(progress.counts.requested)}`;
      case 'cancelled':
        return progress.counts.requested === 0
          ? 'Stopped.'
          : 'Stopped. Sentences already read aloud were kept.';
      case 'failed':
        // A job that failed before it resolved what to send has no position to
        // report; claiming one produced "sentence 1 of 0".
        if (progress.counts.requested === 0) {
          return 'Audio could not be prepared.';
        }
        // Otherwise audio stops at the sentence that failed, so the number
        // completed is also where a retry picks up.
        return `Stopped at sentence ${String(progress.counts.completed + 1)} of ${String(progress.counts.requested)}. Earlier clips were kept.`;
    }
  });

  protected readonly jobFailure = computed(() => {
    const progress = this.progress();
    if (progress.kind !== 'failed') {
      return null;
    }
    if (progress.error.source === 'storage') {
      return `Saving failed: ${progress.error.error.message}`;
    }
    const copy = aiErrorCopy(progress.error.error);
    return `${copy.heading} while ${aiTaskCopy(progress.error.error.task)}. ${copy.primaryAction}`;
  });

  protected readonly failureMessage = computed(() => {
    const failure = this.store.failure();
    if (failure === null) {
      return null;
    }
    switch (failure.kind) {
      case 'incomplete':
        return `${String(failure.missing)} ${failure.missing === 1 ? 'sentence has' : 'sentences have'} no audio yet, so the reading cannot be played end to end.`;
      case 'missing-clip':
        return `Sentence ${String(failure.position)} has no audio for the voice you are using now. Playback stopped there.`;
      case 'decode-failed':
        return `The audio for sentence ${String(failure.position)} could not be played. Playback stopped there.`;
      case 'storage':
        return `Reading the saved audio failed: ${failure.message}`;
    }
  });

  protected play(): void {
    if (this.store.status() === 'paused') {
      void this.store.resume();
      return;
    }
    void this.store.play();
  }

  protected playFromSelection(): void {
    const sentenceId = this.selectedSentenceId();
    if (sentenceId !== null) {
      void this.store.playFrom(sentenceId);
    }
  }

  protected next(): void {
    void this.store.next();
  }

  protected previous(): void {
    void this.store.previous();
  }
}
