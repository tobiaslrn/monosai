import { describe, expect, it } from 'vitest';
import { readingMarker } from './reading-marker';

describe('readingMarker', () => {
  it('calls a story never opened new', () => {
    expect(readingMarker({ lastOpenedAt: null })).toBe('new');
  });

  it('calls a story that has been opened read', () => {
    expect(readingMarker({ lastOpenedAt: 1_700_000_000_000 })).toBe('read');
  });

  it('counts an opening at the epoch as an opening', () => {
    expect(readingMarker({ lastOpenedAt: 0 })).toBe('read');
  });
});
