import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import type { SentenceId } from '../../domain/shared/ids';
import { IconComponent } from '../../shared-ui/icon/icon.component';

/**
 * The whole-reading player.
 *
 * Two shapes of the same controls, because the reader has two shapes: a sticky
 * footer on desktop, and a compact strip inside the sticky header below the
 * desktop breakpoint, where a footer would sit on top of the reading it is
 * playing (`ux-ui-specification.md` lines 141–151).
 *
 * It reads the root playback store directly rather than being handed its state,
 * because playback is application-wide: a footer and a header strip that were
 * each given their own copy would be two players to keep in step.
 *
 * **Nothing here starts on mount.** The component renders only when something
 * is already playing or when the complete set exists to be started, and even
 * then the first sound is the learner pressing Play.
 */
@Component({
  selector: 'mn-reading-player',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    @if (visible()) {
      <div class="player" [class.is-compact]="compact()" role="group" aria-label="Reading player">
        @if (compact()) {
          <p class="position" role="status">{{ positionLabel() }}</p>
        }

        <div class="controls">
          <button
            type="button"
            class="icon-button"
            aria-label="Previous sentence"
            [disabled]="!store.isActive()"
            (click)="previous()"
          >
            <mn-icon name="skip-back" [size]="18" />
          </button>

          @if (isPlaying()) {
            <button
              type="button"
              class="icon-button primary"
              aria-label="Pause"
              (click)="store.pause()"
            >
              <mn-icon name="pause" [size]="20" />
            </button>
          } @else {
            <button
              type="button"
              class="icon-button primary"
              [attr.aria-label]="playLabel()"
              [disabled]="isLoading()"
              (click)="play()"
            >
              <mn-icon name="play" [size]="20" />
            </button>
          }

          <button
            type="button"
            class="icon-button"
            aria-label="Next sentence"
            [disabled]="!store.isActive()"
            (click)="next()"
          >
            <mn-icon name="skip-forward" [size]="18" />
          </button>

          <button
            type="button"
            class="icon-button"
            aria-label="Stop"
            [disabled]="!store.isActive()"
            (click)="store.stop()"
          >
            <mn-icon name="stop" [size]="18" />
          </button>
        </div>

        @if (!compact()) {
          <div class="track">
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
            <p class="position" role="status">{{ positionLabel() }}</p>
          </div>

          <!--
            Start from where the learner is rather than from the top, for a
            reading resumed halfway. Offered only when a sentence is actually
            open, because "here" needs somewhere to mean.
          -->
          @if (canStartFromSelection()) {
            <button type="button" class="quiet" (click)="playFromSelection()">
              Start from this sentence
            </button>
          }
        }

        @if (failureMessage(); as message) {
          <p class="mn-error" role="alert">{{ message }}</p>
        }
      </div>
    }
  `,
  styles: `
    .player {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      padding: var(--space-2) var(--space-3);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-card);
      background: var(--surface-panel);
      box-shadow: var(--shadow-overlay);
    }

    /* In the header there is room for the transport and a position, and no more. */
    .player.is-compact {
      gap: var(--space-2);
      padding: var(--space-1) var(--space-2);
      border: 0;
      border-radius: 0;
      background: none;
      box-shadow: none;
    }

    .controls {
      display: flex;
      flex: none;
      gap: var(--space-1);
      align-items: center;
    }

    .icon-button {
      display: inline-flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--touch-target);
      height: var(--touch-target);
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      color: var(--text-primary);
      cursor: pointer;
    }

    .icon-button.primary {
      border-color: transparent;
      background: var(--action-primary);
      color: var(--text-on-action);
    }

    .icon-button:disabled {
      opacity: 0.45;
      cursor: default;
    }

    .track {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
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

    .position {
      margin: 0;
      overflow: hidden;
      color: var(--text-secondary);
      font-size: var(--text-sm);
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .quiet {
      flex: none;
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
      flex: 1;
      margin: 0;
      color: var(--status-danger);
      font-size: var(--text-sm);
    }

    @media (prefers-reduced-motion: reduce) {
      .fill {
        transition: none;
      }
    }
  `,
})
export class ReadingPlayerComponent {
  protected readonly store = inject(AudioPlaybackStore);

  /** The header strip below the desktop breakpoint, rather than the footer. */
  readonly compact = input(false);
  /** The sentence the learner has open, which Start from here means. */
  readonly selectedSentenceId = input<SentenceId | null>(null);

  /**
   * Shown while playing, and while a complete set exists to start.
   *
   * A reading with no audio prepared has no player at all: an always-present
   * bar with everything disabled would be a permanent strip over the text,
   * which is exactly what the reading surface does not have.
   */
  protected readonly visible = computed(
    () => this.store.isActive() || this.store.canPlayWholeReading(),
  );

  protected readonly isPlaying = computed(() => this.store.status() === 'playing');

  protected readonly isLoading = computed(() => this.store.status() === 'loading');

  protected readonly playLabel = computed(() =>
    this.store.status() === 'paused' ? 'Resume' : 'Play this reading',
  );

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

  protected readonly canStartFromSelection = computed(
    () => this.selectedSentenceId() !== null && this.store.canPlayWholeReading(),
  );

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
