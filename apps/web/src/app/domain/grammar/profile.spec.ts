import { describe, expect, it } from 'vitest';
import { applicableSelection } from './profile';

describe('applicableSelection', () => {
  it('keeps the preset and allows every register', () => {
    expect(
      applicableSelection({ presetId: 'mn-preset-everyday', registerPreference: 'spoken' }),
    ).toEqual({ presetId: 'mn-preset-everyday', registerPreference: 'either' });
  });

  it('sends the preset prose rather than guidance edited before it was retired', () => {
    const applied = applicableSelection({
      presetId: 'mn-preset-basic',
      registerPreference: 'written',
      customGuidance: 'Only very short sentences.',
    });

    expect(applied.customGuidance).toBeUndefined();
    expect(applied.registerPreference).toBe('either');
  });
});
