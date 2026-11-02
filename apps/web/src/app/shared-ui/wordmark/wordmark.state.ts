import { Injectable, InjectionToken, inject } from '@angular/core';

/** The wordmark's two spellings: romaji or kana, never a mix. */
export type WordmarkVariant = 'latin' | 'kana';

/** A source of numbers in [0, 1); replaced in tests to pin the landing. */
export const WORDMARK_RANDOM = new InjectionToken<() => number>('WORDMARK_RANDOM', {
  providedIn: 'root',
  factory: () => Math.random,
});

/**
 * What the wordmark landed on and whether it has spun yet, for the lifetime of
 * the application: returning to the Library shows the same landing, still.
 */
@Injectable({ providedIn: 'root' })
export class WordmarkState {
  private readonly random = inject(WORDMARK_RANDOM);
  private current = this.roll();
  private launchSpinClaimed = false;

  landing(): WordmarkVariant {
    return this.current;
  }

  reroll(): WordmarkVariant {
    this.current = this.roll();
    return this.current;
  }

  /** True exactly once per launch, for the first wordmark that asks. */
  claimLaunchSpin(): boolean {
    const first = !this.launchSpinClaimed;
    this.launchSpinClaimed = true;
    return first;
  }

  private roll(): WordmarkVariant {
    return this.random() < 0.5 ? 'latin' : 'kana';
  }
}
