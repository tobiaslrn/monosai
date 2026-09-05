import { describe, expect, it } from 'vitest';
import { chooseAnalysis } from './staleness';

interface Row {
  readonly cacheKey: string;
  readonly createdAt: number;
  readonly label: string;
}

function row(cacheKey: string, createdAt: number, label: string): Row {
  return { cacheKey, createdAt, label };
}

describe('chooseAnalysis', () => {
  it('returns null for an empty record set', () => {
    expect(chooseAnalysis<Row>([], 'current')).toBeNull();
  });

  it('picks the record matching the current key even when it is older', () => {
    const current = row('current', 1_000, 'current-but-old');
    const newer = row('stale', 2_000, 'newer-but-stale');

    const result = chooseAnalysis([newer, current], 'current');

    expect(result).toEqual({ record: current, stale: false });
  });

  it('falls back to the newest record, flagged stale, when no key matches', () => {
    const older = row('a', 1_000, 'older');
    const newest = row('b', 3_000, 'newest');
    const middle = row('c', 2_000, 'middle');

    const result = chooseAnalysis([older, newest, middle], 'current');

    expect(result).toEqual({ record: newest, stale: true });
  });

  it('breaks a createdAt tie by keeping the last one in input order', () => {
    const first = row('a', 1_000, 'first');
    const second = row('b', 1_000, 'second');

    const result = chooseAnalysis([first, second], 'current');

    expect(result).toEqual({ record: second, stale: true });
  });
});
