import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import type { WordmarkGlyphs } from './wordmark-glyphs';
import { kana, latin } from './wordmark-glyphs';
import type { WordmarkVariant } from './wordmark.state';
import { WordmarkState } from './wordmark.state';

const GLYPHS: Record<WordmarkVariant, WordmarkGlyphs> = { latin, kana };
const SPIN_FRAMES = 9;
const WIDEST = Math.max(latin.aspect, kana.aspect);

function other(variant: WordmarkVariant): WordmarkVariant {
  return variant === 'latin' ? 'kana' : 'latin';
}

/**
 * The Monosai wordmark on the Library's bar.
 *
 * The word spins like a slot reel through its romaji and kana spellings and
 * lands on one of them, once per launch; a tap spins it again. It is
 * decoration: the bar's heading carries the page's name for assistive
 * technology, and reduced motion lands the reel without spinning.
 */
@Component({
  selector: 'mn-wordmark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (run of [run()]; track run) {
      <span
        class="reel"
        aria-hidden="true"
        [class.is-spinning]="spinning()"
        [style.--reel-width]="spinning() ? widest : landed().aspect"
        [style.--reel-stop]="stop()"
        (click)="spin()"
        (animationend)="spinning.set(false)"
      >
        <span class="strip">
          @for (frame of frames(); track $index) {
            <svg class="frame" [attr.viewBox]="frame.viewBox" [style.--frame-width]="frame.aspect">
              <path [attr.d]="frame.d" />
            </svg>
          }
        </span>
      </span>
    }
  `,
  styles: `
    :host {
      display: block;
      container-type: inline-size;
    }

    /*
     * Sized by its frame height, which shrinks when the bar is narrower than
     * the wider spelling so the wordmark fits rather than clips.
     */
    .reel {
      --frame: min(1.875rem, calc(100cqi / 4.3));

      display: block;
      width: calc(var(--reel-width) * var(--frame));
      height: var(--frame);
      overflow: hidden;
      color: var(--text-primary);
      cursor: default;
      user-select: none;
      transition: width var(--motion-medium) ease-out;
      -webkit-tap-highlight-color: transparent;
    }

    .strip {
      display: flex;
      flex-direction: column;
      transform: translateY(calc(-1 * var(--reel-stop) * var(--frame)));
    }

    .is-spinning .strip {
      animation: mn-reel-spin 900ms cubic-bezier(0.2, 0.75, 0.25, 1.12) both;
    }

    .frame {
      display: block;
      flex: none;
      width: calc(var(--frame-width) * var(--frame));
      height: var(--frame);
      fill: currentcolor;
    }

    @keyframes mn-reel-spin {
      from {
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .reel {
        transition: none;
      }

      .is-spinning .strip {
        animation: none;
      }
    }
  `,
})
export class WordmarkComponent {
  private readonly state = inject(WordmarkState);
  private readonly reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private readonly landing = signal(this.state.landing());
  protected readonly widest = WIDEST;
  protected readonly run = signal(0);
  protected readonly spinning = signal(false);
  protected readonly landed = computed(() => GLYPHS[this.landing()]);
  /** The frame the reel comes to rest on. */
  protected readonly stop = computed(() => (this.run() > 0 ? SPIN_FRAMES : 0));
  /** Alternating back from the landing, plus one frame past it for the settle to overshoot into. */
  protected readonly frames = computed(() => {
    const landing = this.landing();
    const stop = this.stop();
    return Array.from(
      { length: stop + 2 },
      (_, index) => GLYPHS[(stop - index) % 2 === 0 ? landing : other(landing)],
    );
  });

  constructor() {
    if (this.state.claimLaunchSpin()) {
      this.spin(false);
    }
  }

  protected spin(reroll = true): void {
    if (reroll) {
      this.landing.set(this.state.reroll());
    }
    if (this.reduceMotion) {
      return;
    }
    this.spinning.set(true);
    this.run.update((run) => run + 1);
  }
}
