import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { CountingCountState } from './counting-count.state';

/** Long enough to read as a rise, short enough not to delay the sentence. */
const RISE_MS = 700;

/**
 * The floor a rise starts from, chosen to keep the number's width constant.
 *
 * Counting `515` up from zero would render one digit, then two, then three, and
 * every word after it in the sentence would shift twice while it did. Starting
 * at the smallest number of the same width — `100` here — keeps the glyph count
 * fixed for the whole rise, so only the digits move.
 */
function sameWidthFloor(target: number): number {
  const digits = Math.trunc(Math.abs(target)).toString().length;
  return digits <= 1 ? 0 : 10 ** (digits - 1);
}

/** Decelerating, so the number arrives rather than stopping dead. */
function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

/**
 * A count that rises to its value instead of appearing at it.
 *
 * Motion here does the job the design system asks of it — saying that a value
 * changed — so a number that moves while the learner is looking at it always
 * rises. The first count of a launch rises too, because arriving at the number
 * is the moment it means something; returning to the same screen does not
 * replay it (`CountingCountState`).
 *
 * The settled value is the text, and it is rendered before any frame runs: an
 * environment that never paints, and reduced motion, both read the true number
 * and nothing else. Only while a rise is in flight is the moving number hidden
 * from assistive technology and the settled one carried beside it, so the
 * sentence never states a count the learner does not have.
 */
@Component({
  selector: 'mn-counting-count',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="tick" [attr.aria-hidden]="rising() ? true : null">{{
      format()(displayed())
    }}</span>
    @if (rising()) {
      <span class="mn-visually-hidden">{{ format()(count()) }}</span>
    }
  `,
  styles: `
    /*
     * A number never breaks away from its noun: 67 at the end of one line and
     * words at the start of the next reads as two facts rather than one.
     */
    :host {
      display: inline;
      white-space: nowrap;
    }

    /*
     * Tabular figures so each digit occupies the same width as the one that
     * replaces it: with the width floor above, a rise moves no other word.
     */
    .tick {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class CountingCountComponent {
  /** The value to show, and to rise to when it changes. */
  readonly count = input.required<number>();
  /** How the value is said. Passed in so one formatter states it everywhere. */
  readonly format = input.required<(value: number) => string>();

  private readonly state = inject(CountingCountState);
  private readonly reduceMotion =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  private frame: number | null = null;
  private settled = false;

  protected readonly displayed = signal(0);
  protected readonly rising = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.cancel();
    });

    effect(() => {
      const target = this.count();
      untracked(() => {
        this.riseTo(target);
      });
    });
  }

  private riseTo(target: number): void {
    this.cancel();
    const first = !this.settled;
    this.settled = true;

    const from = first ? sameWidthFloor(target) : this.displayed();
    this.displayed.set(target);

    if (this.reduceMotion || from === target) {
      return;
    }
    if (first && !this.state.claimLaunchRise()) {
      return;
    }

    // The rise begins on the next frame, so the settled value is what a
    // renderer that paints nothing — a test, a prerender — is left holding.
    this.frame = requestAnimationFrame((startedAt) => {
      this.rising.set(true);
      this.step(from, target, startedAt, startedAt);
    });
  }

  private step(from: number, target: number, startedAt: number, now: number): void {
    const progress = Math.min(1, (now - startedAt) / RISE_MS);
    this.displayed.set(Math.round(from + (target - from) * easeOut(progress)));
    if (progress < 1) {
      this.frame = requestAnimationFrame((next) => {
        this.step(from, target, startedAt, next);
      });
      return;
    }
    this.frame = null;
    this.rising.set(false);
  }

  private cancel(): void {
    if (this.frame !== null) {
      cancelAnimationFrame(this.frame);
      this.frame = null;
    }
    this.rising.set(false);
  }
}
