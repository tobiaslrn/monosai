import { Injectable } from '@angular/core';

/**
 * Whether a count has already counted up in this run of the application.
 *
 * The first count the learner sees rises to its value; returning to the screen
 * that showed it does not replay, exactly as the wordmark lands once per launch
 * rather than on every visit to the Library. A value that *changes* always
 * animates, wherever it is, because that is motion doing its functional job:
 * saying the number moved.
 */
@Injectable({ providedIn: 'root' })
export class CountingCountState {
  private launchRiseClaimed = false;

  /** True exactly once per launch, for the first count that asks. */
  claimLaunchRise(): boolean {
    const first = !this.launchRiseClaimed;
    this.launchRiseClaimed = true;
    return first;
  }
}
