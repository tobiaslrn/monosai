import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  input,
  signal,
  type OnChanges,
  type SimpleChanges,
} from '@angular/core';
import { ViewportService } from '../../core/platform/viewport.service';

/** Long enough to read as a rise, short enough not to delay the sentence. */
const RISE_MS = 700;

/** Decelerating, so the number arrives rather than stopping dead. */
function easeOut(progress: number): number {
  return 1 - (1 - progress) ** 3;
}

/**
 * A count that rises when it changes, rather than whenever it is rendered.
 *
 * Motion here does the one job the design system asks of it — saying that a
 * value moved — so the first value of a launch is simply the number: nothing
 * moved yet, and a rise on arrival competed with the learner reading the
 * sentence it sits in. A later value rises from the one before it, which is the
 * moment that means something: a sync found words the learner did not have.
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
     * replaces it, and a rise moves no other word.
     */
    .tick {
      font-variant-numeric: tabular-nums;
    }
  `,
})
export class CountingCountComponent implements OnChanges {
  /** The value to show, and to rise to when it changes. */
  readonly count = input.required<number>();
  /** How the value is said. Passed in so one formatter states it everywhere. */
  readonly format = input.required<(value: number) => string>();

  private readonly viewport = inject(ViewportService);
  private frame: number | null = null;

  protected readonly displayed = signal(0);
  protected readonly rising = signal(false);

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      this.cancel();
    });
  }

  /**
   * A new count is a one-off command, so it starts the rise from here rather
   * than from an effect: the displayed number is the one the learner is looking
   * at, including one part-way through an earlier rise.
   */
  ngOnChanges(changes: SimpleChanges): void {
    const count = changes['count'];
    if (count !== undefined) {
      this.riseTo(this.count(), count.firstChange);
    }
  }

  private riseTo(target: number, first: boolean): void {
    this.cancel();
    const from = this.displayed();
    this.displayed.set(target);

    if (
      first ||
      this.viewport.prefersReducedMotion() ||
      from === target ||
      typeof requestAnimationFrame === 'undefined'
    ) {
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
    // A setting turned on mid-rise lands the number rather than finishing the rise.
    const progress = this.viewport.prefersReducedMotion()
      ? 1
      : Math.min(1, (now - startedAt) / RISE_MS);
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
