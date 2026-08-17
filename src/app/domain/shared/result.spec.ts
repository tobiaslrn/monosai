import { describe, expect, it } from 'vitest';
import { err, isErr, isOk, mapError, mapResult, ok, unwrap } from './result';

describe('Result', () => {
  it('narrows success and failure', () => {
    expect(isOk(ok(1))).toBe(true);
    expect(isErr(err('bad'))).toBe(true);
    expect(isOk(err('bad'))).toBe(false);
    expect(isErr(ok(1))).toBe(false);
  });

  it('maps only the matching side', () => {
    expect(mapResult(ok(2), (n) => n * 2)).toEqual(ok(4));
    expect(mapResult(err<'x'>('x'), (n: number) => n * 2)).toEqual(err('x'));
    expect(mapError(err('x'), (e) => `${e}!`)).toEqual(err('x!'));
    expect(mapError(ok(1), () => 'never')).toEqual(ok(1));
  });

  it('unwraps success and refuses failure', () => {
    expect(unwrap(ok('v'))).toBe('v');
    expect(() => unwrap(err('nope'))).toThrow(/failed result/);
  });
});
