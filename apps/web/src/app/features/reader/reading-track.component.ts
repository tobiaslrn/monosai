import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AudioPlaybackStore } from '../../application/audio/audio-playback.store';
import { trackValueText } from './reading-player-copy';
import { coveragePercent } from './reading-player-view';

/**
 * The one track of the reading player, and the only way to move through the
 * reading by hand.
 *
 * What has been generated sits behind how far playback has reached, over the
 * same denominator, with a range on top of it so the reading can be aimed at
 * rather than stepped through. Dragging, tapping, touch and the arrow keys are
 * the native range's job rather than ours.
 *
 * Like the player, it reads the root playback store directly: the position is
 * the store's, and a drop is a seek the store answers.
 */
@Component({
  selector: 'mn-reading-track',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="track">
      <span class="track-paint" aria-hidden="true">
        <span class="rail">
          <span class="fill generated" [style.--fill]="generatedPercent() / 100"></span>
          <span class="fill played" [style.--fill]="playedPercent() / 100"></span>
        </span>
      </span>
      <input
        class="scrub"
        type="range"
        min="0"
        [max]="maxPosition()"
        step="1"
        [value]="position()"
        [disabled]="!store.hasPlayableAudio()"
        aria-label="Position in this story"
        [attr.aria-valuetext]="valueText()"
        (input)="onInput($event)"
        (change)="onCommit($event)"
      />
    </div>
  `,
  styles: `
    /* The track is a flex item of the card, not a box of its own. */
    :host {
      display: contents;
    }

    /*
     * The track is a hairline with a hit area around it: 4px of paint is not
     * something a thumb can catch, and a 44px bar in a card that floats over
     * the reading is half the card.
     */
    .track {
      --scrub-track-size: 24px;
      --scrub-thumb-size: 14px;
      --scrub-thumb-radius: calc(var(--scrub-thumb-size) / 2);

      position: relative;
      order: -1;
      display: flex;
      align-items: center;
      block-size: var(--scrub-track-size);
    }

    /*
     * Native range thumbs travel between their own two radii, not between the
     * input's outer edges. Paint on that same inner rail so the played fill
     * ends at the thumb's centre throughout the drag.
     */
    .track-paint {
      position: absolute;
      inset: 0 var(--scrub-thumb-radius);
      pointer-events: none;
    }

    .rail {
      position: absolute;
      inset-block-start: 50%;
      inset-inline: 0;
      block-size: 5px;
      border-radius: var(--radius-pill);
      background: var(--surface-sunken);
      transform: translateY(-50%);
    }

    /*
     * A fill is laid out once, at the rail's full width, and shown up to its
     * fraction by a clip from the inline start: moving it costs no layout pass.
     * The clip, not a border radius, rounds its ends, which a scale would
     * squash and leave square.
     */
    .fill {
      position: absolute;
      inset: 0;
      clip-path: inset(0 calc((1 - var(--fill, 0)) * 100%) 0 0 round var(--radius-pill));
      transition: clip-path var(--motion-medium) var(--ease-standard);
    }

    /*
     * Mixed back towards the rail rather than painted in the border colour it
     * used to be: at full strength it read as a filled progress bar, so a
     * prepared reading that had never been played looked finished.
     */
    .fill.generated {
      background: var(--surface-reader-progress);
    }

    .fill.played {
      background: var(--action-primary);
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
      block-size: var(--scrub-track-size);
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
      block-size: var(--scrub-track-size);
      background: none;
    }

    .scrub::-moz-range-track {
      block-size: var(--scrub-track-size);
      background: none;
    }

    /*
     * A compact, persistent thumb makes the generated track read as something
     * that can be aimed at, not only as a report. It disappears while the
     * range is disabled, when there is no audio position to choose yet.
     */
    .scrub::-webkit-slider-thumb {
      inline-size: var(--scrub-thumb-size);
      block-size: var(--scrub-thumb-size);
      margin-block-start: calc((var(--scrub-track-size) - var(--scrub-thumb-size)) / 2);
      border: 3px solid var(--surface-panel);
      border-radius: var(--radius-pill);
      background: var(--action-primary);
      box-shadow: var(--shadow-raised);
      opacity: 1;
      appearance: none;
      transition: opacity var(--motion-fast) var(--ease-standard);
    }

    .scrub::-moz-range-thumb {
      inline-size: var(--scrub-thumb-size);
      block-size: var(--scrub-thumb-size);
      border: 3px solid var(--surface-panel);
      border-radius: var(--radius-pill);
      background: var(--action-primary);
      box-shadow: var(--shadow-raised);
      opacity: 1;
      transition: opacity var(--motion-fast) var(--ease-standard);
    }

    .scrub:disabled::-webkit-slider-thumb {
      opacity: 0;
    }

    .scrub:disabled::-moz-range-thumb {
      opacity: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      .fill,
      .scrub::-webkit-slider-thumb {
        transition: none;
      }

      /* Its own rule: a browser drops a whole list holding a pseudo it does not know. */
      .scrub::-moz-range-thumb {
        transition: none;
      }
    }
  `,
})
export class ReadingTrackComponent {
  protected readonly store = inject(AudioPlaybackStore);

  /**
   * Where the thumb is while it is being dragged, rather than where playback is.
   *
   * A drag that let the store keep writing the value would fight the pointer at
   * every sentence boundary the reading crossed underneath it.
   */
  private readonly scrubbing = signal<number | null>(null);

  /** The track's denominator, kept at least one so the range stays valid. */
  protected readonly maxPosition = computed(() => Math.max(this.store.sentenceCount(), 1));

  /** Where the thumb is: the drag if there is one, playback otherwise. */
  protected readonly position = computed(() => this.scrubbing() ?? this.store.currentPosition());

  protected readonly playedPercent = computed(() =>
    coveragePercent(this.position(), this.store.sentenceCount()),
  );

  protected readonly generatedPercent = computed(() =>
    coveragePercent(this.store.availableCount(), this.store.sentenceCount()),
  );

  protected readonly valueText = computed(() =>
    trackValueText(this.position(), this.store.sentenceCount(), this.store.availableCount()),
  );

  protected onInput(event: Event): void {
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
  protected async onCommit(event: Event): Promise<void> {
    const track = event.target as HTMLInputElement;
    const position = Number(track.value);
    this.scrubbing.set(null);
    try {
      await this.store.seekTo(position);
    } finally {
      // Also when the seek failed: the thumb must not be left where it was
      // dropped, which is somewhere the reading is not. The failure itself is
      // not swallowed.
      if (this.scrubbing() === null) {
        track.value = String(this.store.currentPosition());
      }
    }
  }
}
