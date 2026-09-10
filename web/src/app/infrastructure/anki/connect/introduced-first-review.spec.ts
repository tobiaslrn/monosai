import { describe, expect, it } from 'vitest';
import { ankiError, type AnkiError } from '../../../domain/anki/anki-error';
import { err, ok, type Result } from '../../../domain/shared/result';
import {
  buildIntroducedQueries,
  representativeLocalDate,
  resolveIntroducedFirstReviews,
} from './introduced-first-review';

const DAY_MS = 86_400_000;
const NOW = new Date(2026, 8, 10, 18, 30).getTime();

class IntroducedSearchFake {
  readonly queries: string[] = [];

  constructor(
    private readonly firstMatchAt: ReadonlyMap<number, number>,
    private readonly failure?: AnkiError,
  ) {}

  findCards(query: string, _signal?: AbortSignal): Promise<Result<readonly number[], AnkiError>> {
    this.queries.push(query);
    if (this.failure !== undefined) return Promise.resolve(err(this.failure));
    const matched = new Set<number>();
    for (const clause of query.matchAll(/\(cid:([0-9,]+) introduced:([0-9]+)\)/gu)) {
      const days = Number(clause[2]);
      for (const cardId of clause[1].split(',').map(Number)) {
        const first = this.firstMatchAt.get(cardId);
        if (first !== undefined && days >= first) matched.add(cardId);
      }
    }
    return Promise.resolve(ok([...matched]));
  }
}

describe('AnkiDroid introduced-day first reviews', () => {
  it('resolves several first-review days in parallel', async () => {
    const cardIds = [NOW - 20 * DAY_MS, NOW - 200 * DAY_MS, NOW - 2_000 * DAY_MS];
    const firstMatchAt = new Map([
      [cardIds[0], 1],
      [cardIds[1], 8],
      [cardIds[2], 365],
    ]);
    const fake = new IntroducedSearchFake(firstMatchAt);

    const resolved = await resolveIntroducedFirstReviews(fake, cardIds, NOW);

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    for (const [cardId, introducedDays] of firstMatchAt) {
      expect(resolved.value.get(cardId)).toEqual({
        firstReviewedAt: representativeLocalDate(introducedDays, NOW),
        firstReviewedPrecision: 'anki-day',
      });
    }
    expect(fake.queries.length).toBeLessThanOrEqual(13);
    expect(fake.queries.some((query) => query.includes(' OR '))).toBe(true);
  });

  it('does not invent a date when a reviewed card has no matching history', async () => {
    const cardId = NOW - 30 * DAY_MS;
    const resolved = await resolveIntroducedFirstReviews(
      new IntroducedSearchFake(new Map()),
      [cardId],
      NOW,
    );

    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    expect(resolved.value.has(cardId)).toBe(false);
  });

  it('keeps every provider query below the bridge string limit', () => {
    const predicates = Array.from({ length: 1_000 }, (_, index) => ({
      cardId: NOW - (index + 1) * DAY_MS,
      days: index + 1,
    }));

    const queries = buildIntroducedQueries(predicates);

    expect(queries.length).toBeGreaterThan(1);
    expect(queries.every((request) => request.query.length <= 8_000)).toBe(true);
    expect(queries.flatMap((request) => request.predicates)).toHaveLength(predicates.length);
  });

  it('returns the first query error without manufacturing partial results', async () => {
    const failure = ankiError('query-failed', 'Anki rejected introduced search.');
    const resolved = await resolveIntroducedFirstReviews(
      new IntroducedSearchFake(new Map(), failure),
      [NOW - DAY_MS],
      NOW,
    );

    expect(resolved).toEqual(err(failure));
  });

  it('uses local day-start for a stable displayed date that is never in the future', () => {
    const timestamp = representativeLocalDate(3, new Date(2026, 2, 30, 1, 30).getTime());
    const date = new Date(timestamp);

    expect(date.getHours()).toBe(0);
    expect(date.getMinutes()).toBe(0);
    expect(date.getDate()).toBe(28);
  });
});
