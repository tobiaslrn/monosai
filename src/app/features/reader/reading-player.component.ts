import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import type { SentenceId } from '../../domain/shared/ids';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';

/** What the generation rail beneath the transport is saying, if anything. */
export type GenerationRail = 'running' | 'stopped' | 'offer' | 'none';

/**
 * Everything to do with a reading audio, in one player.
 *
 * Generating it, watching that run, recovering from a failure, and playing the
 * result used to be three surfaces in three places — a menu entry, a hairline in
 * the header, and a player that only appeared once the whole set existed. A
 * learner had no way to find out the application could read to them at all. The
 * header audio button is always there, and this is what it opens.
 *
 * Transport and generation are shown **together** rather than one instead of
 * the other (ADR 0034). Once any clip exists the transport is the primary thing
 * in the card, and the run that is still filling in the rest is a quiet rail
 * beneath it. Showing only the run would hide audio the learner has already
 * paid for and can already listen to.
 *
 * The transport row and the track are **always rendered**, disabled while there
 * is nothing to play. The player is docked to the bottom edge and publishes its
 * height, so every block that appeared or disappeared mid-run reflowed the
 * reading underneath it — measured at four different heights during a single
 * generation.
 *
 * There is **one** track, not two. Playback position and generation coverage
 * are measured over the same denominator, so they compose the way a buffered
 * bar does in any media player: a quiet fill for what has been generated, the
 * accent for how far playback has reached.
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
          [disabled]="!store.canGoPrevious()"
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
            [disabled]="!canPressPlay()"
            (click)="play()"
          >
            <mn-icon name="play" [size]="24" />
          </button>
        }

        <button
          type="button"
          class="mn-icon-button step"
          aria-label="Next sentence with audio"
          [disabled]="!store.canGoNext()"
          (click)="next()"
        >
          <mn-icon name="skip-forward" [size]="20" />
        </button>

        <!--
          A stop that is not "hide the player". Closing the card used to be the
          only way to end a session, so looking at the text underneath silenced
          the reading; and a session waiting at the frontier for a clip that a
          failed run will never produce had no live control at all.
        -->
        <button
          type="button"
          class="mn-icon-button step"
          aria-label="Stop reading"
          [disabled]="!store.isActive()"
          (click)="store.stop()"
        >
          <mn-icon name="stop" [size]="18" />
        </button>

        <p class="position" role="status">{{ positionLabel() }}</p>
      </div>

      <div
        class="bar"
        [class.is-generating]="isGenerating()"
        role="progressbar"
        aria-label="Position in this reading"
        [attr.aria-valuenow]="percent()"
        [attr.aria-valuetext]="trackLabel()"
        aria-valuemin="0"
        aria-valuemax="100"
      >
        <span class="fill generated" [style.inline-size.%]="generatedPercent()"></span>
        <span class="fill played" [style.inline-size.%]="percent()"></span>
      </div>

      <!--
        One contextual block, or none. Everything the card might have to say
        beneath the controls shares a single divider and a single padded band,
        so the player is two rows whenever it has nothing to add — which,
        while a run is going, is always: the track's quiet fill is the report,
        and stopping the run lives in the reader menu beside Delete audio.
      -->
      @if (hasContext()) {
        <div class="context">
          @switch (rail()) {
            @case ('offer') {
              <p class="line">{{ offerLabel() }}</p>
              <div class="row">
                <button
                  type="button"
                  class="mn-button mn-button--primary"
                  (click)="generate.emit()"
                >
                  Generate audio
                </button>
                @if (!modelConfigured()) {
                  <a class="mn-button" routerLink="/settings">Set up audio model</a>
                }
              </div>
            }

            @case ('stopped') {
              <p class="line" role="status">{{ jobLine() }}</p>
              @if (jobFailure(); as failure) {
                <p class="mn-error" role="alert">{{ failure }}</p>
              }
              <div class="row">
                <button type="button" class="mn-button" (click)="retryGeneration.emit()">
                  Try again
                </button>
                <button type="button" class="mn-button" (click)="dismissJob.emit()">Dismiss</button>
              </div>
            }

            @default {
              <!-- Running or complete: the track says it, and says it quietly. -->
            }
          }

          <!--
            Start from where the learner is rather than from the top. Offered
            only when a sentence was open when the player was opened and that
            sentence has a clip, because "this sentence" needs somewhere to mean.
          -->
          @if (canStartFromSelection()) {
            <button type="button" class="mn-button" (click)="playFromSelection()">
              Start from this sentence
            </button>
          }

          @if (failureMessage(); as message) {
            <p class="mn-error" role="alert">{{ message }}</p>
            <div class="row">
              <!--
                A playback failure used to be cleared only by a successful play,
                so a banner about a sentence the learner had moved on from
                stayed on screen until the player was destroyed.
              -->
              <button type="button" class="mn-button" (click)="store.acknowledgeFailure()">
                Dismiss
              </button>
            </div>
          }
        </div>
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
     * The transport reads left to right as one row: the controls, then where in
     * the reading they are acting. Centring it left the position line on a row
     * of its own and made a compact bar twice as tall as it needs.
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

    /*
     * Anything the card has to add sits in one band under the controls, behind
     * one divider. Separate blocks each with their own rule stacked into a
     * card that looked like a stack of unrelated notices.
     */
    .context {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
      padding-block-start: var(--space-3);
      border-block-start: 1px solid var(--border-subtle);
    }

    .row {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
    }

    /*
     * One track carrying both numbers: what has been generated behind what has
     * been played, the way a buffered bar reads. Two identical accent bars
     * stacked said nothing about which was which.
     */
    .bar {
      position: relative;
      block-size: 4px;
      overflow: hidden;
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
    }

    /*
     * The only thing that says a run is still going. A count in words under the
     * bar repeated what the bar was already showing, so the bar breathes
     * instead — visible when looked at, invisible when read past.
     */
    .bar.is-generating .fill.generated {
      animation: generating 1.8s ease-in-out infinite;
    }

    @keyframes generating {
      0%,
      100% {
        opacity: 1;
      }

      50% {
        opacity: 0.4;
      }
    }

    .fill {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      display: block;
      transition: inline-size var(--motion-medium) ease-out;
    }

    .fill.generated {
      background: var(--border-strong);
    }

    .fill.played {
      background: var(--action-primary);
    }

    .line {
      flex: 1;
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .mn-error {
      flex: 1;
      margin: 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }
    @media (prefers-reduced-motion: reduce) {
      .fill,
      .play {
        transition: none;
      }

      .bar.is-generating .fill.generated {
        animation: none;
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
  readonly retryGeneration = output<void>();
  readonly dismissJob = output<void>();

  /**
   * What the rail says, resolved from the job first and the set second.
   *
   * A run that is going or has just stopped is what the learner is waiting on.
   * With nothing to report, the rail offers to prepare whatever is still
   * missing, and disappears entirely once nothing is.
   */
  protected readonly rail = computed<GenerationRail>(() => {
    const progress = this.progress();
    if (progress.kind === 'preparing' || progress.kind === 'running') {
      return 'running';
    }
    if (progress.kind === 'failed' || progress.kind === 'cancelled') {
      return 'stopped';
    }
    if (this.store.sentenceCount() === 0 || this.store.canPlayWholeReading()) {
      return 'none';
    }
    return 'offer';
  });

  protected readonly isPlaying = computed(() => this.store.status() === 'playing');

  /** Whether a run is filling in the rest, which only the track reports. */
  protected readonly isGenerating = computed(() => this.rail() === 'running');

  /** Whether there is anything at all to put beneath the controls. */
  protected readonly hasContext = computed(
    () =>
      this.rail() === 'offer' ||
      this.rail() === 'stopped' ||
      this.canStartFromSelection() ||
      this.failureMessage() !== null,
  );

  protected readonly playLabel = computed(() => {
    switch (this.store.status()) {
      case 'paused':
        return 'Resume';
      case 'waiting':
        return 'Waiting for the next sentence';
      case 'ended':
        return 'Play again';
      default:
        return 'Play';
    }
  });

  /**
   * Play is pressable when it has somewhere to start.
   *
   * Waiting and loading are already-started sessions with nothing to press —
   * and no longer a dead end either way, because Stop is live beside them. Any
   * stored clip is enough to start on: clips arrive out of order, so requiring
   * sentence one left a learner with no way into audio they had paid for.
   */
  protected readonly canPressPlay = computed(() => {
    const status = this.store.status();
    if (status === 'paused') {
      return true;
    }
    if (status === 'loading' || status === 'waiting') {
      return false;
    }
    return this.store.hasPlayableAudio();
  });

  protected readonly percent = computed(() => {
    const total = this.store.sentenceCount();
    return total === 0 ? 0 : Math.round((this.store.currentPosition() / total) * 100);
  });

  /**
   * How much of the reading has audio, over the whole reading.
   *
   * Deliberately not the percentage of the job: a retry covering the two
   * sentences a run missed is 50% done at one of them, and drawing that as half
   * the reading would be a lie about a nearly complete set.
   */
  protected readonly generatedPercent = computed(() => {
    const total = this.store.sentenceCount();
    return total === 0 ? 0 : Math.round((this.store.availableCount() / total) * 100);
  });

  protected readonly trackLabel = computed(() => {
    const total = this.store.sentenceCount();
    const ready = this.store.availableCount();
    const position = this.store.currentPosition();
    const where = position > 0 ? `Sentence ${String(position)} of ${String(total)}` : 'Not started';
    return `${where}, ${String(ready)} of ${String(total)} with audio`;
  });

  protected readonly positionLabel = computed(() => {
    const total = this.store.sentenceCount();
    const status = this.store.status();
    if (status === 'waiting') {
      return `Waiting for sentence ${String(this.store.pendingPosition())} of ${String(total)}`;
    }
    if (status === 'ended') {
      // Distinct from "N sentences ready", which is what a reading that was
      // never started says. Reaching the end used to be reported as a reset.
      return 'Finished';
    }
    const position = this.store.currentPosition();
    if (position > 0) {
      return `Sentence ${String(position)} of ${String(total)}`;
    }
    // Nothing is playing, so the line has no position to report. It says how
    // much there is to play only when the rail beneath is not already saying
    // it: printing the same count twice in one small card reads as a bug. It
    // never goes blank, because an empty live region beside a row of controls
    // reads as a label that failed to load.
    return this.rail() === 'none' ? `${String(total)} sentences ready` : 'Not playing';
  });

  /** What is still missing, when the rail is offering to prepare it. */
  protected readonly offerLabel = computed(() => {
    const total = this.store.sentenceCount();
    const ready = this.store.availableCount();
    if (ready === 0) {
      return `${String(total)} ${total === 1 ? 'sentence' : 'sentences'}`;
    }
    return `${String(ready)} of ${String(total)} sentences have audio`;
  });

  protected readonly canStartFromSelection = computed(() =>
    this.store.isAvailable(this.selectedSentenceId()),
  );

  /**
   * What the rail says about a run that has stopped.
   *
   * Only a stopped run has anything to say. A run in progress is reported by
   * the track's generation fill and by the Stop beside it; a count in words
   * underneath repeated what the bar already showed.
   */
  protected readonly jobLine = computed(() => {
    const progress = this.progress();
    switch (progress.kind) {
      case 'idle':
      case 'complete':
      case 'preparing':
      case 'running':
        return '';
      case 'cancelled':
        return progress.counts.requested === 0
          ? 'Stopped.'
          : `Stopped with ${String(progress.counts.completed)} of ${String(progress.counts.requested)} sentences ready.`;
      case 'failed':
        // A job that failed before it resolved what to send has no position to
        // report; claiming one produced "sentence 1 of 0".
        if (progress.counts.requested === 0) {
          return 'Audio could not be prepared.';
        }
        return `Stopped with ${String(progress.counts.completed)} of ${String(progress.counts.requested)} sentences ready.`;
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
    // What went wrong, not what to do about it: the primary action in the
    // shared table is written for the settings test panel, and there is no test
    // in the reader. Try again is the button right underneath this line.
    const copy = aiErrorCopy(progress.error.error);
    return `${copy.heading} while ${aiTaskCopy(progress.error.error.task)}. ${copy.whatFailed}`;
  });

  protected readonly failureMessage = computed(() => {
    const failure = this.store.failure();
    if (failure === null) {
      return null;
    }
    switch (failure.kind) {
      case 'missing-clip':
        return `Sentence ${String(failure.position)} has no audio for the voice you are using now. Playback stopped there.`;
      case 'not-generated':
        return `Sentence ${String(failure.position)} has not been generated yet. Playback stopped there.`;
      case 'decode-failed':
        return `The audio for sentence ${String(failure.position)} could not be played. Playback stopped there.`;
      case 'storage':
        return `Reading the saved audio failed: ${failure.message}`;
    }
  });

  protected play(): void {
    if (this.store.status() === 'paused') {
      // Read on from here: a sentence started from the popover is a single
      // sentence, and resuming it from the reading transport means the reading.
      void this.store.resume(true);
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
