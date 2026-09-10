import { describe, expect, it } from 'vitest';
import { ankiError, type AnkiError } from '../../../domain/anki/anki-error';
import {
  difficultyPercent,
  fsrsDifficultyFromPercent,
} from '../../../domain/anki/scheduling-signals';
import { err, ok, type Result } from '../../../domain/shared/result';
import { difficultyTerm, resolveDifficultyPercents } from './difficulty-search';

/** Anki's `prop:d>=X` over `(D - 1) / 9`; a card absent from the map has no FSRS state. */
class DifficultySearchFake {
  readonly queries: string[] = [];

  constructor(
    private readonly difficulty: ReadonlyMap<number, number>,
    private readonly failure?: AnkiError,
  ) {}

  findCards(query: string, _signal?: AbortSignal): Promise<Result<readonly number[], AnkiError>> {
    this.queries.push(query);
    if (this.failure !== undefined) return Promise.resolve(err(this.failure));
    const matched = new Set<number>();
    for (const clause of query.matchAll(/\(cid:([0-9,]+) prop:d>=([0-9.]+)\)/gu)) {
      const threshold = Number(clause[2]);
      for (const cardId of clause[1].split(',').map(Number)) {
        const difficulty = this.difficulty.get(cardId);
        if (difficulty !== undefined && (difficulty - 1) / 9 >= threshold) matched.add(cardId);
      }
    }
    return Promise.resolve(ok([...matched]));
  }
}

describe('FSRS difficulty through search', () => {
  it('resolves each card to the percent the vocabulary browser would show', async () => {
    // The scale's ends, its middle, and both sides of the first rounding step.
    const difficulty = new Map([
      [1, 1],
      [2, 10],
      [3, 5.5],
      [4, 8.269],
      [5, 1.04],
      [6, 1.0451],
    ]);
    const fake = new DifficultySearchFake(difficulty);

    const resolved = await resolveDifficultyPercents(fake, [...difficulty.keys()]);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    for (const [cardId, value] of difficulty) {
      expect(resolved.value.get(cardId)).toBe(difficultyPercent(value));
    }
    // Seven halvings of 0-100 and one confirmation, each packed into one request.
    expect(fake.queries.length).toBeLessThanOrEqual(8);
  });

  it('leaves a card without FSRS memory state unknown rather than at 0%', async () => {
    const resolved = await resolveDifficultyPercents(new DifficultySearchFake(new Map()), [7]);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.has(7)).toBe(false);
  });

  it('returns the first query error without manufacturing partial results', async () => {
    const failure = ankiError('query-failed', 'Anki rejected prop:d search.');
    const resolved = await resolveDifficultyPercents(
      new DifficultySearchFake(new Map([[1, 5]]), failure),
      [1],
    );

    expect(resolved).toEqual(err(failure));
  });

  it('asks for the rounding boundary rather than the whole percent', () => {
    expect(difficultyTerm(0)).toBe('prop:d>=0.000');
    expect(difficultyTerm(45)).toBe('prop:d>=0.445');
    expect(difficultyTerm(100)).toBe('prop:d>=0.995');
  });

  it('maps every recovered percent back onto a raw value that shows the same percent', () => {
    for (let percent = 0; percent <= 100; percent += 1) {
      expect(difficultyPercent(fsrsDifficultyFromPercent(percent))).toBe(percent);
    }
  });
});
