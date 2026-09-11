import { TestBed } from '@angular/core/testing';
import { WORDMARK_RANDOM, WordmarkState } from './wordmark.state';

function stateWith(...draws: number[]): WordmarkState {
  let next = 0;
  TestBed.configureTestingModule({
    providers: [{ provide: WORDMARK_RANDOM, useValue: () => draws[next++ % draws.length] }],
  });
  return TestBed.inject(WordmarkState);
}

describe('WordmarkState', () => {
  it('lands on romaji or kana', () => {
    const state = stateWith(0.1, 0.9);

    expect(state.landing()).toBe('latin');
    expect(state.reroll()).toBe('kana');
    expect(state.landing()).toBe('kana');
  });

  it('grants the launch spin exactly once', () => {
    const state = stateWith(0.5);

    expect(state.claimLaunchSpin()).toBe(true);
    expect(state.claimLaunchSpin()).toBe(false);
  });
});
