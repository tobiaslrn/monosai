import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import type { AudioJobProgress } from '../../application/enrichment/audio-job.store';
import type { SentenceId } from '../../domain/shared/ids';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { GenerationRingComponent } from './generation-ring.component';
import {
  playbackFailureMessage,
  playbackSpeedAriaLabel,
  playbackSpeedLabel,
} from './reading-player-copy';
import {
  announcement,
  auxAction,
  centreControl,
  coveragePercent,
  nextPlaybackRate,
  sameControl,
  setupNeeded,
  type AuxAction,
  type PlayerFacts,
} from './reading-player-view';
import { ReadingTrackComponent } from './reading-track.component';

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
 * What it decides lives beside it as plain functions of {@link PlayerFacts}:
 * `reading-player-view.ts` says what each control is, and `reading-player-copy.ts`
 * says every word. The track and the ring are components of their own.
 *
 * **Nothing here starts on mount.** Opening the player loads no audio and sends
 * no request: the first sound and the first spend are both a press.
 */
@Component({
  selector: 'mn-reading-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [GenerationRingComponent, IconComponent, ReadingTrackComponent, RouterLink],
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
        them (ADR 0043), so changing a voice can leave current coverage empty
        while same-content older clips remain playable (ADR 0072). The notice
        names that older audio instead of making a full bar fall silent without
        explanation. The prose budget keeps room for exactly this: money and
        apparent loss.
      -->
      @if (staleAudio()) {
        <p class="notice" data-testid="player-stale-audio">
          Some audio is from older settings.
          @if (!modelConfigured()) {
            <a routerLink="/settings">Audio settings</a>
          }
        </p>
      }

      <!--
        Every control on one line above the track, ranged to the leading edge:
        the transport first, where a thumb already is on a docked card, then the
        mode, then the local speed and contextual slots. An unused slot is held open, and at
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
          class="mn-icon-button slot"
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
        @if (setupRequired()) {
          <!--
            A reading whose audio needs a model has no Play to press, and a
            dead Play beside a gear says none of that. The primary control is
            the setup itself, in the place and the shape Play would have had.
            A link cannot be the button below, so this is the one swap.
          -->
          <a
            class="mn-icon-button mn-icon-button--primary primary--wide"
            routerLink="/settings"
            aria-label="Set up audio model"
            title="Set up audio model"
          >
            <mn-icon name="settings" [size]="20" />
            <span>Set up audio</span>
          </a>
        } @else {
          <!--
            One button for generate, generating, play and pause, never one
            element swapped for another: the focus a press left on it, and the
            filled circle itself, survive the work the press started.
          -->
          <button
            type="button"
            class="mn-icon-button mn-icon-button--primary"
            [attr.aria-label]="centre().label"
            [title]="centre().label"
            [disabled]="centre().disabled"
            [attr.aria-busy]="centre().busy ? 'true' : null"
            (click)="pressCentre()"
          >
            <mn-icon [name]="centre().icon" [size]="24" />
          </button>
        }

        <button
          type="button"
          class="mn-icon-button slot"
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
          class="mn-icon-button slot mode"
          [attr.aria-pressed]="store.stepMode()"
          title="One sentence at a time"
          aria-label="One sentence at a time"
          (click)="cycleMode()"
        >
          <mn-icon name="step" [size]="20" />
        </button>

        <button
          type="button"
          class="mn-button mn-button--ghost slot speed"
          [attr.aria-label]="speedAriaLabel()"
          [title]="speedAriaLabel()"
          (click)="cyclePlaybackRate()"
        >
          {{ speedLabel() }}
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
            class="mn-icon-button slot"
            aria-label="Start from this sentence"
            title="Start from this sentence"
            (click)="playFromSelection()"
          >
            <mn-icon name="sentence-start" [size]="20" />
          </button>
        } @else {
          <span class="slot empty-slot" aria-hidden="true"></span>
        }

        @if (aux(); as action) {
          <button
            type="button"
            [class]="'mn-icon-button slot tone-' + action.tone"
            [attr.aria-label]="action.label"
            [title]="action.title"
            (click)="pressAux(action)"
          >
            @if (action.kind === 'cancel') {
              <mn-generation-ring [fraction]="coverage() / 100" />
            }
            <mn-icon [name]="action.icon" [size]="action.kind === 'cancel' ? 14 : 20" />
          </button>
        } @else {
          <span class="slot empty-slot" aria-hidden="true"></span>
        }
      </div>

      <mn-reading-track />
    </div>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
      container-type: inline-size;
    }

    .player {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }

    /*
     * One line, ranged to the leading edge. An empty slot is held open rather
     * than collapsed, so the line is one width in every state and nothing under
     * a thumb reaching for it ever moves.
     */
    .controls {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      justify-content: space-between;
    }

    /* Everything that is not the primary verb: no chrome until it is touched. */
    .slot {
      position: relative;
      color: var(--text-secondary);
    }

    .empty-slot {
      inline-size: var(--touch-target);
      block-size: var(--touch-target);
    }

    button.slot:where(:not(:disabled, [aria-pressed='true'])),
    a.slot {
      color: var(--action-primary);
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
      margin-inline: 0;
    }

    /*
     * The pressed state of the mode, since one glyph on its own cannot say it.
     * The shared pressed tint is the state; the dot only says it a second way.
     */
    .mode[aria-pressed='true']::after {
      position: absolute;
      inset-block-end: 6px;
      inline-size: 4px;
      block-size: 4px;
      border-radius: var(--radius-pill);
      background: currentcolor;
      content: '';
    }

    .speed {
      min-inline-size: 3.5rem;
      padding-inline: var(--space-2);
      font-variant-numeric: tabular-nums;
    }

    /*
     * The one primary that says a word. A first run cannot be inferred from an
     * icon, so the control that leaves it carries its own name and takes the
     * width that needs — still one control, in the place Play would have been.
     */
    .primary--wide {
      gap: var(--space-2);
      inline-size: auto;
      min-inline-size: 4rem;
      padding-inline: var(--space-3);
      font-size: var(--text-sm);
      font-weight: var(--weight-semibold);
      text-decoration: none;
      white-space: nowrap;
    }

    /* A labelled setup action gets its own row when six full touch targets no longer fit. */
    @container (max-width: 23rem) {
      .controls:has(.primary--wide) {
        flex-wrap: wrap;
      }

      .controls:has(.primary--wide) .primary--wide {
        order: -1;
        flex-basis: 100%;
        inline-size: 100%;
      }
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

    @media (prefers-reduced-motion: reduce) {
      .slot {
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
  readonly retryGeneration = output<void>();
  readonly cancelGeneration = output<void>();
  /** Returns a settled report to rest without asking for the work again. */
  readonly dismissGeneration = output<void>();

  /** What the stores and the inputs say right now; every decision is a function of it. */
  private readonly facts = computed<PlayerFacts>(() => ({
    progress: this.progress(),
    status: this.store.status(),
    failure: this.store.failure(),
    sentenceCount: this.store.sentenceCount(),
    availableCount: this.store.availableCount(),
    position: this.store.currentPosition(),
    pendingPosition: this.store.pendingPosition(),
    hasPlayableAudio: this.store.hasPlayableAudio(),
    canPlayWholeReading: this.store.canPlayWholeReading(),
    hasStaleAudio: this.store.hasStaleAudio(),
    modelConfigured: this.modelConfigured(),
  }));

  protected readonly setupRequired = computed(() => setupNeeded(this.facts()));
  protected readonly centre = computed(() => centreControl(this.facts()), { equal: sameControl });
  protected readonly aux = computed(() => auxAction(this.facts()), { equal: sameControl });
  protected readonly announcement = computed(() => announcement(this.facts()));

  /** At least one playable sentence uses a clip made with older settings. */
  protected readonly staleAudio = computed(() => this.store.hasStaleAudio());

  /** Whatever stopped playback on its own; the dismiss control clears it. */
  protected readonly failureMessage = computed(() => playbackFailureMessage(this.store.failure()));

  /** How much of the reading has audio, which the ring around Stop draws. */
  protected readonly coverage = computed(() =>
    coveragePercent(this.store.availableCount(), this.store.sentenceCount()),
  );

  protected readonly canStartFromSelection = computed(() =>
    this.store.isAvailable(this.selectedSentenceId()),
  );

  protected readonly speedLabel = computed(() => playbackSpeedLabel(this.store.playbackRate()));
  protected readonly speedAriaLabel = computed(() =>
    playbackSpeedAriaLabel(this.store.playbackRate()),
  );

  protected cycleMode(): void {
    this.store.cycleMode();
  }

  protected cyclePlaybackRate(): void {
    this.store.setPlaybackRate(nextPlaybackRate(this.store.playbackRate()));
  }

  protected pressCentre(): void {
    const centre = this.centre();
    if (centre.busy) {
      // Working: the press is ignored rather than the control being disabled.
      return;
    }
    switch (centre.kind) {
      case 'generate':
        this.generate.emit();
        return;
      case 'pause':
        this.store.pause();
        return;
      case 'play':
        this.play();
        return;
      case 'generating':
        return;
    }
  }

  protected pressAux(action: AuxAction): void {
    switch (action.kind) {
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

  private play(): void {
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
