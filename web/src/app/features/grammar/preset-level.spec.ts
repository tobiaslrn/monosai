import { describe, expect, it } from 'vitest';
import { TEST_PRESETS } from '../../../testing/grammar-fakes';
import { conventionalLevel } from './preset-level';

describe('conventionalLevel', () => {
  it('reads the level a caption names', () => {
    expect(conventionalLevel(TEST_PRESETS[1])).toBe('N5');
  });

  it('invents none for a caption that names no level', () => {
    expect(conventionalLevel(TEST_PRESETS[0])).toBeNull();
  });

  it('does not mistake a longer word for a level', () => {
    expect(
      conventionalLevel({ ...TEST_PRESETS[0], captionEn: 'taught in N50 courses' }),
    ).toBeNull();
  });
});
