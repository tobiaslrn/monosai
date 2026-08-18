import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAMMAR_PRESET_ID,
  GRAMMAR_PRESET_IDS_EASIEST_FIRST,
  isGrammarPresetId,
  isRegisterPreference,
  resolveGuidance,
} from './presets';

describe('grammar presets', () => {
  it('orders the ladder easiest first and starts a fresh install at the easiest stop', () => {
    expect(GRAMMAR_PRESET_IDS_EASIEST_FIRST[0]).toBe(DEFAULT_GRAMMAR_PRESET_ID);
    expect(GRAMMAR_PRESET_IDS_EASIEST_FIRST).toHaveLength(6);
  });

  it('recognises only declared preset ids and register preferences', () => {
    expect(isGrammarPresetId('mn-preset-formal')).toBe(true);
    expect(isGrammarPresetId('mn-preset-n2')).toBe(false);
    expect(isRegisterPreference('spoken')).toBe(true);
    expect(isRegisterPreference('polite')).toBe(false);
  });

  describe('resolveGuidance', () => {
    it('sends the preset prose when the learner has not forked it', () => {
      expect(resolveGuidance('Write simply.', '')).toBe('Write simply.');
    });

    it('appends register guidance', () => {
      expect(resolveGuidance('Write simply.', 'Prefer polite written register.')).toBe(
        'Write simply. Prefer polite written register.',
      );
    });

    it('replaces preset prose with custom guidance rather than appending to it', () => {
      const resolved = resolveGuidance('Write simply.', '', 'Casual style with contractions.');

      expect(resolved).toBe('Casual style with contractions.');
      expect(resolved).not.toContain('Write simply.');
    });

    it('still applies register to custom guidance so switching register needs no re-edit', () => {
      expect(
        resolveGuidance('Write simply.', 'Prefer casual spoken register.', 'My own wording.'),
      ).toBe('My own wording. Prefer casual spoken register.');
    });
  });
});
