import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import type {
  AudioJobCounts,
  AudioJobProgress,
} from '../../application/enrichment/audio-job.store';
import type { SentenceId } from '../../domain/shared/ids';
import type { IconName } from '../../shared-ui/icon/icon-set';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { aiErrorCopy, aiTaskCopy } from '../../shared-ui/ai-error/ai-error-copy';

/** What the card has to say about generation, if anything. */
export type GenerationRail = 'running' | 'stopped' | 'offer' | 'none';

/**
 * The one contextual control, and what it is at this moment.
 *
 * Everything the card used to say in a band of prose and buttons — prepare
 * this, stop that, this failed — is one slot in the control row whose icon,
 * name and tint say which of them it currently is.
 */
export interface AuxAction {
  readonly kind: 'cancel' | 'generate' | 'retry' | 'dismiss';
  readonly icon: IconName;
  /** The accessible name, and the whole of what the button says out loud. */
  readonly label: string;
  /** The long version, for a pointer that rests on it. */
  readonly title: string;
  readonly tone: 'accent' | 'danger' | 'secondary';
}

/** Geometry of the ring drawn around the aux button while a run is going. */
const RING_RADIUS = 19;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

/**
 * Everything to do with a reading audio, in one player.
 *
 * Generating it, watching that run, recovering from a failure, and playing the
 * result used to be three surfaces in three places — a menu entry, a hairline in
 * the header, and a player that only appeared once the whole set existed. A
 * learner had no way to find out the application could read to them at all. The
 * header audio button is always there, and this is what it opens.
 *
 * It is **two rows and no prose**: one row of controls over a track that can be
 * dragged. Everything the card used to print — the position, how much has been
 * generated, what a stopped run managed, why playback stopped — is said by the
 * state of a control or by a hidden live region, never by a paragraph. A player
 * that floats over the reading has no room to be a form, and a learner reading
 * Japanese does not want an English status report in their peripheral vision.
 *
 * Nothing is removed for a screen reader: the position line, the job line and
 * every failure are announced exactly as before, through `.mn-visually-hidden`
 * live regions and the accessible names of the icons.
 *
 * Transport and generation are shown **together** rather than one instead of
 * the other (ADR 0034). Once any clip exists the transport is the primary thing
 * in the card, and the run that is still filling in the rest reports itself
 * through the track and the ring around the aux button.
 *
 * Every slot is **always rendered**, so the card is one fixed height and one
 * fixed set of positions. It is docked to the bottom edge and publishes its
 * height, so anything that came and went reflowed the reading underneath it.
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
      <!--
        What the card used to print. The position line keeps its live region and
        its wording; the contextual line follows it in the same announcement, so
        a screen reader hears one sentence about where the reading is rather
        than two regions competing at every seam.
      -->
      <p class="mn-visually-hidden" role="status">{{ announcement() }}</p>
      @if (failureMessage(); as message) {
        <p class="mn-visually-hidden" role="alert">{{ message }}</p>
      }

      <!--
        The one thing the card prints. Clips are keyed by the settings that made
        them (ADR 0042), so changing a voice hides every clip made with the old
        one without deleting anything — and a bar that falls from full to empty
        with no word said reads as audio that has been lost and paid for twice.
        The prose budget keeps room for exactly this: money and apparent loss.
      -->
      @if (voiceMismatch()) {
        <p class="notice" data-testid="player-voice-mismatch">
          Saved in other audio settings.
          <a routerLink="/settings">Audio settings</a>
        </p>
      }

      <!--
        Every control on one line above the track, ranged to the leading edge:
        the transport first, where a thumb already is on a docked card, then the
        mode, then the two contextual slots. An unused slot is held open, and at
        the end of the line an empty one is simply where the line stops.
      -->
      <div class="controls">
        <!--
          Back replays the sentence being read before it steps to the one
          before it, because the reason to reach for it is that the sentence
          went past too fast. The name says so, since the icon cannot.
        -->
        <button
          type="button"
          class="slot"
          aria-label="Restart this sentence, or go back to the one before"
          title="Restart this sentence, or go back to the one before"
          [disabled]="!store.canGoPrevious()"
          (click)="previous()"
        >
          <mn-icon name="skip-back" [size]="20" />
        </button>

        <!--
          The centre is whatever the primary verb is right now. A reading with
          no audio at all has nothing to play, so the button that would be a
          dead Play is the one that makes the audio instead.
        -->
        @switch (centreAction()) {
          @case ('setup') {
            <!--
              A reading whose audio needs a model has no Play to press, and a
              dead Play beside a gear says none of that. The primary control is
              the setup itself, in the place and the shape Play would have had.
            -->
            <a
              class="primary primary--wide"
              routerLink="/settings"
              aria-label="Set up audio model"
              title="Set up audio model"
            >
              <mn-icon name="settings" [size]="20" />
              <span>Set up audio</span>
            </a>
          }
          @case ('generate') {
            <button
              type="button"
              class="primary"
              aria-label="Generate audio"
              title="Generate audio"
              (click)="generate.emit()"
            >
              <mn-icon name="generate" [size]="24" />
            </button>
          }
          @case ('pause') {
            <button
              type="button"
              class="primary"
              aria-label="Pause"
              title="Pause"
              (click)="store.pause()"
            >
              <mn-icon name="pause" [size]="24" />
            </button>
          }
          @default {
            <button
              type="button"
              class="primary"
              [attr.aria-label]="playLabel()"
              [title]="playLabel()"
              [disabled]="!canPressPlay()"
              (click)="play()"
            >
              <mn-icon name="play" [size]="24" />
            </button>
          }
        }

        <button
          type="button"
          class="slot"
          aria-label="Next sentence with audio"
          title="Next sentence with audio"
          [disabled]="!store.canGoNext()"
          (click)="next()"
        >
          <mn-icon name="skip-forward" [size]="20" />
        </button>

        <!--
          The mode control, in the idiom every media player uses for one: the
          same glyph always, lit when it is on. It closes the line, past the
          transport, because it is a posture for the reading rather than a
          control of the session running now.
        -->
        <button
          type="button"
          class="slot mode"
          [class.on]="store.stepMode()"
          [attr.aria-pressed]="store.stepMode()"
          title="One sentence at a time"
          aria-label="One sentence at a time"
          (click)="cycleMode()"
        >
          <mn-icon name="step" [size]="20" />
        </button>

        <!--
          Start from where the learner is rather than from the top. Offered
          only when a sentence was open when the player was opened and that
          sentence has a clip, because "this sentence" needs somewhere to mean.
          Its slot is held open when it is not, so nothing beside it moves.
        -->
        @if (canStartFromSelection()) {
          <button
            type="button"
            class="slot"
            aria-label="Start from this sentence"
            title="Start from this sentence"
            (click)="playFromSelection()"
          >
            <mn-icon name="sentence-start" [size]="20" />
          </button>
        } @else {
          <span class="slot" aria-hidden="true"></span>
        }

        @if (auxAction(); as aux) {
          <button
            type="button"
            [class]="'slot tone-' + aux.tone"
            [attr.aria-label]="aux.label"
            [title]="aux.title"
            (click)="pressAux(aux)"
          >
            @if (aux.kind === 'cancel') {
              <!--
                  The run, drawn where the control that stops it is. A count in
                  words underneath said what the ring and the track already say.
                -->
              <svg class="ring" viewBox="0 0 44 44" aria-hidden="true" focusable="false">
                <circle class="ring-track" cx="22" cy="22" [attr.r]="ringRadius" />
                <circle
                  class="ring-fill"
                  cx="22"
                  cy="22"
                  [attr.r]="ringRadius"
                  [attr.stroke-dasharray]="ringCircumference"
                  [attr.stroke-dashoffset]="ringOffset()"
                />
              </svg>
            }
            <mn-icon [name]="aux.icon" [size]="aux.kind === 'cancel' ? 14 : 20" />
          </button>
        } @else {
          <span class="slot" aria-hidden="true"></span>
        }
      </div>

      <!--
        One track carrying both numbers, and the only way to move through the
        reading by hand: what has been generated behind how far playback has
        reached, with a range on top of it so the reading can be aimed at rather
        than stepped through.
      -->
      <div class="track" [class.is-generating]="isGenerating()">
        <span class="rail"></span>
        <span class="fill generated" [style.inline-size.%]="generatedPercent()"></span>
        <span class="fill played" [style.inline-size.%]="percent()"></span>
        <input
          class="scrub"
          type="range"
          min="0"
          [max]="maxPosition()"
          step="1"
          [value]="positionValue()"
          [disabled]="!store.hasPlayableAudio()"
          aria-label="Position in this reading"
          [attr.aria-valuetext]="trackLabel()"
          (input)="onScrubInput($event)"
          (change)="onScrubCommit($event)"
        />
      </div>
    </div>
  `,
  styles: `
    .player {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
    }

    /*
     * The track is a hairline with a hit area around it: 4px of paint is not
     * something a thumb can catch, and a 44px bar in a card that floats over
     * the reading is half the card.
     */
    .track {
      position: relative;
      display: flex;
      align-items: center;
      block-size: 20px;
    }

    .rail,
    .fill {
      position: absolute;
      inset-block-start: 50%;
      inset-inline-start: 0;
      block-size: 4px;
      border-radius: var(--radius-pill);
      transform: translateY(-50%);
      pointer-events: none;
    }

    .rail {
      inline-size: 100%;
      background: var(--surface-sunken);
    }

    .fill {
      transition: inline-size var(--motion-medium) ease-out;
    }

    /*
     * Mixed back towards the rail rather than painted in the border colour it
     * used to be: at full strength it read as a filled progress bar, so a
     * prepared reading that had never been played looked finished.
     */
    .fill.generated {
      background: color-mix(in srgb, var(--border-strong) 50%, var(--surface-sunken));
    }

    .fill.played {
      background: var(--action-primary);
    }

    /*
     * The only thing that says a run is still going, together with the ring on
     * the button that stops it: visible when looked at, invisible when read past.
     */
    .track.is-generating .fill.generated {
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

    /*
     * A native range, so dragging, tapping and the arrow keys are the browser's
     * job rather than ours. It is transparent: the fills underneath are the
     * track, and only the thumb is painted.
     */
    .scrub {
      position: relative;
      z-index: 1;
      inline-size: 100%;
      min-block-size: 0;
      block-size: 20px;
      margin: 0;
      padding: 0;
      appearance: none;
      background: none;
      cursor: pointer;
    }

    .scrub:disabled {
      cursor: default;
    }

    .scrub::-webkit-slider-runnable-track {
      block-size: 20px;
      background: none;
    }

    .scrub::-moz-range-track {
      block-size: 20px;
      background: none;
    }

    /*
     * The thumb appears when the track is being used and not before, the way a
     * media scrubber does: at rest the bar is a reading of where the reading is,
     * and a permanent handle on a 4px line reads as a defect.
     */
    .scrub::-webkit-slider-thumb {
      inline-size: 12px;
      block-size: 12px;
      margin-block-start: 4px;
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--text-primary);
      opacity: 0;
      appearance: none;
      transition: opacity var(--motion-fast) ease-out;
    }

    .scrub::-moz-range-thumb {
      inline-size: 12px;
      block-size: 12px;
      border: 0;
      border-radius: var(--radius-pill);
      background: var(--text-primary);
      opacity: 0;
      transition: opacity var(--motion-fast) ease-out;
    }

    .track:hover .scrub:not(:disabled)::-webkit-slider-thumb,
    .scrub:focus-visible::-webkit-slider-thumb,
    .scrub:active::-webkit-slider-thumb {
      opacity: 1;
    }

    .track:hover .scrub:not(:disabled)::-moz-range-thumb,
    .scrub:focus-visible::-moz-range-thumb,
    .scrub:active::-moz-range-thumb {
      opacity: 1;
    }

    /*
     * One line, ranged to the leading edge. An empty slot is held open rather
     * than collapsed, so the line is one width in every state and nothing under
     * a thumb reaching for it ever moves.
     */
    .controls {
      display: flex;
      gap: var(--space-1);
      align-items: center;
      justify-content: flex-start;
    }

    /* Everything that is not the primary verb: no chrome until it is touched. */
    .slot {
      position: relative;
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      inline-size: var(--touch-target);
      block-size: var(--touch-target);
      padding: 0;
      border: 0;
      border-radius: var(--radius-pill);
      background: none;
      color: var(--text-secondary);
      text-decoration: none;
      cursor: pointer;
      transition:
        color var(--motion-fast) ease-out,
        background-color var(--motion-fast) ease-out;
    }

    button.slot:hover:not(:disabled),
    a.slot:hover {
      background: var(--surface-sunken);
      color: var(--text-primary);
    }

    .slot:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }

    .tone-accent {
      color: var(--action-primary);
    }

    .tone-danger {
      color: var(--status-danger);
    }

    /*
     * The mode belongs to neither of its neighbours: the transport on one side
     * is the session running now, and the contextual slot on the other is the
     * audio being made. It keeps its own air on both sides.
     */
    .mode {
      margin-inline: var(--space-2);
    }

    /* The pressed state of the mode, since one glyph on its own cannot say it. */
    .mode.on {
      color: var(--action-primary);
    }

    .mode.on::after {
      position: absolute;
      inset-block-end: 6px;
      inline-size: 4px;
      block-size: 4px;
      border-radius: var(--radius-pill);
      background: currentcolor;
      content: '';
    }

    /* Play is the one control that is pressed repeatedly, so it is the big one. */
    .primary {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      inline-size: 3.25rem;
      block-size: 3.25rem;
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

    .primary:hover:not(:disabled) {
      background: var(--action-primary-hover);
    }

    .primary:active:not(:disabled) {
      transform: scale(0.96);
    }

    .primary:disabled {
      cursor: not-allowed;
      opacity: 0.55;
    }

    /*
     * The one primary that says a word. A first run cannot be inferred from an
     * icon, so the control that leaves it carries its own name and takes the
     * width that needs — still one control, in the place Play would have been.
     */
    .primary--wide {
      gap: var(--space-2);
      inline-size: auto;
      min-inline-size: 3.25rem;
      padding-inline: var(--space-3);
      font-size: var(--text-sm);
      font-weight: 600;
      text-decoration: none;
      white-space: nowrap;
    }

    /*
     * Prints only where something has been paid for and looks lost, and sits
     * above the controls so nothing under it moves when it appears.
     */
    .notice {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-1) var(--space-2);
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .notice a {
      color: var(--text-primary);
    }

    /* The run, drawn around the control that stops it. */
    .ring {
      position: absolute;
      inset: 0;
      inline-size: 100%;
      block-size: 100%;
      transform: rotate(-90deg);
      pointer-events: none;
    }

    .ring-track,
    .ring-fill {
      fill: none;
      stroke-width: 2;
    }

    .ring-track {
      stroke: var(--surface-sunken);
    }

    .ring-fill {
      stroke: currentcolor;
      stroke-linecap: round;
      transition: stroke-dashoffset var(--motion-medium) ease-out;
    }

    @media (prefers-reduced-motion: reduce) {
      .fill,
      .primary,
      .slot,
      .ring-fill,
      .scrub::-webkit-slider-thumb,
      .scrub::-moz-range-thumb {
        transition: none;
      }

      .track.is-generating .fill.generated {
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
  readonly cancelGeneration = output<void>();
  /** Returns a settled report to rest without asking for the work again. */
  readonly dismissGeneration = output<void>();

  protected readonly ringRadius = RING_RADIUS;
  protected readonly ringCircumference = RING_CIRCUMFERENCE;

  /**
   * Where the thumb is while it is being dragged, rather than where playback is.
   *
   * A drag that let the store keep writing the value would fight the pointer at
   * every sentence boundary the reading crossed underneath it.
   */
  private readonly scrubbing = signal<number | null>(null);

  /**
   * What the rail says, resolved from the job first and the set second.
   *
   * A run that is going or has just stopped is what the learner is waiting on.
   * With nothing to report, the rail offers to prepare whatever is still
   * missing, and disappears entirely once nothing is.
   */
  protected readonly rail = computed<GenerationRail>(() => {
    const progress = this.progress();
    if (progress.kind === 'deleted') {
      return 'none';
    }
    if (progress.kind === 'preparing' || progress.kind === 'running') {
      return 'running';
    }
    if (this.store.canPlayWholeReading()) {
      // A run that stopped but left the reading complete has nothing to retry,
      // so it has nothing to say: the whole set is there and playable.
      return 'none';
    }
    if (progress.kind === 'failed' || progress.kind === 'cancelled') {
      return 'stopped';
    }
    if (this.store.sentenceCount() === 0) {
      return 'none';
    }
    return 'offer';
  });

  protected readonly isPlaying = computed(() => this.store.status() === 'playing');

  /**
   * Clips exist for this reading, and the settings in force cannot play them.
   *
   * Reported only while nothing at all is playable, because that is the state
   * that reads as loss: a partly covered reading already has a transport and a
   * bar that account for themselves.
   */
  protected readonly voiceMismatch = computed(
    () => this.store.hasAudioInOtherSettings() && !this.store.hasPlayableAudio(),
  );

  /** Whether a run is filling in the rest, which only the track and ring report. */
  protected readonly isGenerating = computed(() => this.rail() === 'running');

  /**
   * What the big button in the middle is.
   *
   * A reading with nothing to play has no use for a Play button, and the thing
   * a learner opening that player wants is the audio itself — so the primary
   * control is the one that makes it, in the same place and the same shape.
   */
  protected readonly centreAction = computed<'setup' | 'generate' | 'play' | 'pause'>(() => {
    if (this.isPlaying()) {
      return 'pause';
    }
    // Nothing can be generated and nothing can be played without a tested
    // model, so the press that is worth making is the one that gets one.
    if (
      this.store.sentenceCount() > 0 &&
      !this.modelConfigured() &&
      !this.store.hasPlayableAudio()
    ) {
      return 'setup';
    }
    if (
      this.store.sentenceCount() > 0 &&
      !this.store.hasPlayableAudio() &&
      !this.isGenerating() &&
      this.modelConfigured()
    ) {
      return 'generate';
    }
    return 'play';
  });

  /**
   * The one contextual control, in priority order.
   *
   * A failure is acknowledged before anything else is offered, because it is
   * the only state the card cannot leave on its own. A run being stopped or
   * retried comes next, and preparing what is missing last.
   */
  protected readonly auxAction = computed<AuxAction | null>(() => {
    if (this.isGenerating()) {
      return {
        kind: 'cancel',
        icon: 'stop',
        label: 'Stop generating audio',
        title: 'Stop generating audio',
        tone: 'accent',
      };
    }
    const playbackFailure = this.failureMessage();
    if (playbackFailure !== null) {
      return {
        kind: 'dismiss',
        icon: 'close',
        label: 'Dismiss',
        title: playbackFailure,
        tone: 'danger',
      };
    }
    if (this.rail() === 'stopped') {
      const title = [this.jobLine(), this.jobFailure() ?? '']
        .filter((part) => part !== '')
        .join(' ');
      // A retry that has been shown not to work is not offered. What is left to
      // do with the report is put it away, so that is what the button says: the
      // card cannot leave a settled failure on its own, and a control that
      // spends a request per missing sentence to reproduce the same answer is
      // not the way out of it.
      return this.canRetryGeneration()
        ? { kind: 'retry', icon: 'retry', label: 'Try again', title, tone: 'danger' }
        : { kind: 'dismiss', icon: 'close', label: 'Dismiss', title, tone: 'danger' };
    }
    if (!this.modelConfigured()) {
      // The centre control is the setup in this state, and one screen does not
      // offer the same link twice.
      return null;
    }
    if (this.rail() === 'offer' && this.store.hasPlayableAudio()) {
      return {
        kind: 'generate',
        icon: 'generate',
        label: 'Generate audio',
        title: `Generate audio — ${this.offerLabel()}`,
        tone: 'accent',
      };
    }
    return null;
  });

  protected readonly playLabel = computed(() => {
    switch (this.store.status()) {
      case 'paused':
        return 'Resume';
      case 'stepped':
        // The one press whose meaning the position line cannot carry: the
        // cursor genuinely is on the sentence just heard, so the button is
        // where "and now the next one" has to be said.
        return 'Next sentence';
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
    if (status === 'paused' || status === 'stepped') {
      return true;
    }
    if (status === 'loading' || status === 'waiting') {
      return false;
    }
    return this.store.hasPlayableAudio();
  });

  /** The track's denominator, kept at least one so the range stays valid. */
  protected readonly maxPosition = computed(() => Math.max(this.store.sentenceCount(), 1));

  /** Where the thumb is: the drag if there is one, playback otherwise. */
  protected readonly positionValue = computed(
    () => this.scrubbing() ?? this.store.currentPosition(),
  );

  protected readonly percent = computed(() => {
    const total = this.store.sentenceCount();
    return total === 0 ? 0 : Math.round((this.positionValue() / total) * 100);
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

  /** The ring around the cancel button, drawn from the same coverage figure. */
  protected readonly ringOffset = computed(
    () => RING_CIRCUMFERENCE * (1 - this.generatedPercent() / 100),
  );

  protected readonly trackLabel = computed(() => {
    const total = this.store.sentenceCount();
    const ready = this.store.availableCount();
    const position = this.positionValue();
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
    return this.rail() === 'none' ? `${String(total)} sentences ready` : 'Not playing';
  });

  /** What is still missing, when there is an offer to prepare it. */
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
   * What a run that has stopped has to report.
   *
   * Only a stopped run has anything to say. A run in progress is reported by
   * the track and the ring alone; a count in words repeated what they showed.
   */
  protected readonly jobLine = computed(() => {
    const progress = this.progress();
    switch (progress.kind) {
      case 'idle':
      case 'complete':
      case 'deleted':
      case 'preparing':
      case 'running':
        return '';
      case 'cancelled':
        return progress.counts.requested === 0
          ? 'Stopped.'
          : `${this.readyLine()} ${this.attemptLine(progress.counts)}`;
      case 'failed': {
        // A job that failed before it resolved what to send has no position to
        // report; claiming one produced "sentence 1 of 0".
        if (progress.counts.requested === 0) {
          return 'Audio could not be prepared.';
        }
        const exhausted = progress.canRetry
          ? ''
          : ' Trying again produced nothing, so it is no longer offered: a different voice or model may read these sentences.';
        return `${this.readyLine()} ${this.attemptLine(progress.counts)}${exhausted}`;
      }
    }
  });

  /**
   * What the *reading* has, which is what the track beside this is drawing.
   *
   * Deliberately not the run's own numerator over the run's own denominator:
   * "0 of 4 ready" beside a bar drawn a third full read as "nothing is ready"
   * when a third of the reading was, and the two figures were measuring
   * different things under one form of words.
   */
  private readonly readyLine = computed(() => {
    const total = this.store.sentenceCount();
    return `Stopped with ${String(this.store.availableCount())} of ${String(total)} sentences ready.`;
  });

  /** What this attempt did, said as an attempt rather than as the reading. */
  private attemptLine(counts: AudioJobCounts): string {
    const missing = counts.requested;
    return `This attempt covered ${String(counts.completed)} of the ${String(missing)} ${missing === 1 ? 'sentence' : 'sentences'} it set out to read.`;
  }

  /** Whether the settled report on screen still has a retry worth offering. */
  private readonly canRetryGeneration = computed(() => {
    const progress = this.progress();
    return progress.kind !== 'failed' || progress.canRetry;
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
    // in the reader. Try again is the control right beside this.
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

  /**
   * Everything the card used to print, in one announcement.
   *
   * The position first, because it is what changes and what a learner listening
   * with a screen reader is following; then whatever the card would have said
   * beneath the controls, so nothing that was readable has become unsayable.
   */
  protected readonly announcement = computed(() => {
    const parts = [this.positionLabel()];
    const failure = this.failureMessage();
    if (failure !== null) {
      parts.push(failure);
    }
    const job = this.jobLine();
    if (job !== '') {
      parts.push(job);
    }
    const jobFailure = this.jobFailure();
    if (jobFailure !== null) {
      parts.push(jobFailure);
    }
    if (this.voiceMismatch()) {
      parts.push(
        'This reading has saved audio that was made with other audio settings, so none of it can be played as things stand. It is still stored: restore those settings, or generate this reading again.',
      );
    }
    if (this.rail() === 'offer') {
      parts.push(`${this.offerLabel()} — audio can be generated.`);
    }
    if (this.isGenerating()) {
      parts.push(`Generating audio, ${String(this.generatedPercent())}% of the reading ready.`);
    }
    return parts.join(' ');
  });

  protected cycleMode(): void {
    this.store.cycleMode();
  }

  protected pressAux(aux: AuxAction): void {
    switch (aux.kind) {
      case 'cancel':
        this.cancelGeneration.emit();
        return;
      case 'generate':
        this.generate.emit();
        return;
      case 'retry':
        // One press clears what was reported and starts the work again: a
        // separate Dismiss button existed only to put the card back the way
        // pressing Try again already puts it.
        this.retryGeneration.emit();
        return;
      case 'dismiss':
        // Whichever of the two settled reports is showing. Playback's is the
        // one offered first, so it is the one this clears first.
        if (this.failureMessage() !== null) {
          this.store.acknowledgeFailure();
          return;
        }
        this.dismissGeneration.emit();
        return;
    }
  }

  protected onScrubInput(event: Event): void {
    this.scrubbing.set(Number((event.target as HTMLInputElement).value));
  }

  /**
   * Lands the thumb where playback actually went.
   *
   * A drop on a sentence with no clip snaps to the nearest one that has, and a
   * drop that finds nothing playable at all moves nothing — so where the thumb
   * was released is not where the reading is either way. The element is written
   * rather than left to the value binding, because a range input can raise
   * `input` and `change` in one task: the binding then only ever sees the
   * position the drag ended on, finds it unchanged, and leaves the thumb
   * sitting at a sentence the position line is not reporting.
   */
  protected async onScrubCommit(event: Event): Promise<void> {
    const track = event.target as HTMLInputElement;
    const position = Number(track.value);
    this.scrubbing.set(null);
    await this.store.seekTo(position);
    if (this.scrubbing() === null) {
      track.value = String(this.store.currentPosition());
    }
  }

  protected play(): void {
    if (this.store.status() === 'stepped') {
      void this.store.continueReading();
      return;
    }
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
