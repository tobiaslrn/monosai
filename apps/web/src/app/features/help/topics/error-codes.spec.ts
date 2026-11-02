import { describe, expect, it } from 'vitest';
import { ALL_ANKI_ERROR_CODES } from '../../../domain/anki/anki-error';
import { ERROR_CODE_GROUPS } from './error-codes';

describe('ERROR_CODE_GROUPS', () => {
  it('lists every Anki error code', () => {
    const listed = new Set(
      ERROR_CODE_GROUPS.find((group) => group.id === 'anki')?.entries.map((entry) => entry.code),
    );
    for (const code of ALL_ANKI_ERROR_CODES) {
      expect(listed.has(`anki/${code}`), code).toBe(true);
    }
  });
});
