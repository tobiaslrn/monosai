import { describe, expect, it } from 'vitest';
import { classifyReadingLink } from './reading-link';

/**
 * A mistyped link and a deleted reading are different events, and the screens
 * that report them said the same thing. Everything downstream of that fix
 * depends on this classification being exact.
 */
describe('classifyReadingLink', () => {
  it('accepts an id of the shape the application issues', () => {
    const link = classifyReadingLink('3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33');

    expect(link.kind).toBe('well-formed');
    expect(link.kind === 'well-formed' && link.id).toBe('3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33');
  });

  it('accepts the same id in upper case, as a pasted link may carry it', () => {
    expect(classifyReadingLink('3F6D2C1A-9B4E-4A7D-8F21-0C5E7A9B1D33').kind).toBe('well-formed');
  });

  it.each([
    ['a word', 'not-a-uuid'],
    ['an empty segment', ''],
    ['a truncated id', '3f6d2c1a-9b4e-4a7d-8f21'],
    ['an id with a trailing character', '3f6d2c1a-9b4e-4a7d-8f21-0c5e7a9b1d33x'],
    ['a script payload', '<script>alert(1)</script>'],
  ])('rejects %s', (_case, raw) => {
    const link = classifyReadingLink(raw);

    expect(link.kind).toBe('malformed');
    expect(link.kind === 'malformed' && link.raw).toBe(raw);
  });
});
