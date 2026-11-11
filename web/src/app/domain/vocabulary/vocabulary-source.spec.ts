import { describe, expect, it } from 'vitest';
import { sourceName } from './vocabulary-source';

describe('sourceName', () => {
  it('shows an Anki source by its deck alone', () => {
    expect(sourceName({ kind: 'anki-connect', label: 'Anki · Core Japanese · Expression' })).toBe(
      'Core Japanese',
    );
    expect(sourceName({ kind: 'anki-package', label: 'Anki · Mining::Daily · Word' })).toBe(
      'Mining::Daily',
    );
  });

  it('keeps a deck name that holds a separator', () => {
    expect(sourceName({ kind: 'anki-connect', label: 'Anki · A · B · Expression' })).toBe('A · B');
  });

  it('shows a label of another form as stored', () => {
    expect(sourceName({ kind: 'anki-connect', label: 'Core Japanese' })).toBe('Core Japanese');
  });

  it('shows a list the learner named as typed', () => {
    expect(sourceName({ kind: 'text-list', label: 'Anki · Mine · Notes' })).toBe(
      'Anki · Mine · Notes',
    );
  });
});
