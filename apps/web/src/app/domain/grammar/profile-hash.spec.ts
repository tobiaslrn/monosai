import { describe, expect, it } from 'vitest';
import type { Hasher } from '../shared/hashing';
import type { GrammarPreset, RegisterGuidance } from './presets';
import type { GrammarProfileSelection } from './profile';
import { captureGrammarProfile, grammarProfileHash } from './profile-hash';

/**
 * Deterministic stand-in for the real digest. The domain must not depend on an
 * infrastructure adapter, and these assertions are about which fields reach the
 * hasher, not about the algorithm that consumes them.
 */
const HASHER: Hasher = {
  algorithm: 'test-fnv1a',
  hashText: (text) => {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index += 1) {
      hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  },
};

const REGISTER: RegisterGuidance = {
  spoken: 'Prefer everyday spoken register.',
  written: 'Prefer polite written register.',
  either: '',
};

const BASELINE_VERSION = '1.0.0';

function preset(overrides: Partial<GrammarPreset> = {}): GrammarPreset {
  return {
    id: 'mn-preset-everyday',
    order: 2,
    nameEn: 'Everyday forms',
    captionEn: 'usually taught around N4',
    descriptionEn: 'Ordinary writing with conditionals.',
    exampleJa: '本を読んでみたら面白かった。',
    exampleEn: 'When I tried reading the book, it was interesting.',
    promptGuidance: 'Write at roughly N4 complexity.',
    ...overrides,
  };
}

function selection(overrides: Partial<GrammarProfileSelection> = {}): GrammarProfileSelection {
  return { presetId: 'mn-preset-everyday', registerPreference: 'either', ...overrides };
}

function capture(
  selectionOverrides: Partial<GrammarProfileSelection> = {},
  presetOverrides: Partial<GrammarPreset> = {},
  structuralBaselineVersion = BASELINE_VERSION,
) {
  return captureGrammarProfile(
    HASHER,
    selection(selectionOverrides),
    preset(presetOverrides),
    REGISTER,
    structuralBaselineVersion,
    1_700_000_000_000,
  );
}

describe('grammarProfileHash', () => {
  it('covers only the guidance, the register, and the baseline version', () => {
    const input = {
      resolvedGuidance: 'Write at roughly N4 complexity.',
      registerPreference: 'either' as const,
      structuralBaselineVersion: BASELINE_VERSION,
    };

    expect(grammarProfileHash(HASHER, input)).toBe(grammarProfileHash(HASHER, input));
  });

  it('changes when any covered field changes', () => {
    const base = {
      resolvedGuidance: 'Write at roughly N4 complexity.',
      registerPreference: 'either' as const,
      structuralBaselineVersion: BASELINE_VERSION,
    };
    const hash = grammarProfileHash(HASHER, base);

    expect(grammarProfileHash(HASHER, { ...base, resolvedGuidance: 'Write simply.' })).not.toBe(
      hash,
    );
    expect(grammarProfileHash(HASHER, { ...base, registerPreference: 'spoken' })).not.toBe(hash);
    expect(grammarProfileHash(HASHER, { ...base, structuralBaselineVersion: '2.0.0' })).not.toBe(
      hash,
    );
  });
});

describe('captureGrammarProfile', () => {
  it('is stable across preset edits that leave the resolved guidance unchanged', () => {
    // A copyedit to the caption, description, or example must not stale every
    // stored analysis; only the prose actually sent to the model may.
    const original = capture();
    const copyedited = capture(
      {},
      {
        captionEn: 'usually taught around N4 and N3',
        descriptionEn: 'Ordinary writing, rewritten blurb.',
        exampleEn: 'A freshly translated gloss.',
      },
    );

    expect(copyedited.profileHash).toBe(original.profileHash);
  });

  it('changes when the guidance, the register, or the baseline version changes', () => {
    const original = capture();

    expect(capture({}, { promptGuidance: 'Write far more simply.' }).profileHash).not.toBe(
      original.profileHash,
    );
    expect(capture({ registerPreference: 'written' }).profileHash).not.toBe(original.profileHash);
    expect(capture({}, {}, '2.0.0').profileHash).not.toBe(original.profileHash);
  });

  it('hashes a custom variant identically to the preset it reproduces verbatim', () => {
    // Identity is the text sent, not how it was authored, so a fork that says
    // exactly what the preset says is the same profile.
    const fromPreset = capture();
    const fromCustom = capture({ customGuidance: 'Write at roughly N4 complexity.' });

    expect(fromCustom.resolvedGuidance).toBe(fromPreset.resolvedGuidance);
    expect(fromCustom.profileHash).toBe(fromPreset.profileHash);
  });

  it('records the fork as custom even when its text matches the preset', () => {
    expect(capture().isCustomGuidance).toBe(false);
    expect(capture({ customGuidance: 'Write at roughly N4 complexity.' }).isCustomGuidance).toBe(
      true,
    );
  });

  it('resolves the register line into the guidance it hashes and sends', () => {
    const spoken = capture({ registerPreference: 'spoken' });

    expect(spoken.resolvedGuidance).toBe(
      'Write at roughly N4 complexity. Prefer everyday spoken register.',
    );
    expect(capture().resolvedGuidance).toBe('Write at roughly N4 complexity.');
  });

  it('is content addressed and frozen', () => {
    const snapshot = capture();

    expect(snapshot.id).toBe(snapshot.profileHash);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(() => {
      (snapshot as { capturedAt: number }).capturedAt = 0;
    }).toThrow();
  });

  it('keeps everything the story is judged against on the snapshot', () => {
    const snapshot = capture({ registerPreference: 'written' });

    expect(snapshot).toMatchObject({
      capturedAt: 1_700_000_000_000,
      presetId: 'mn-preset-everyday',
      registerPreference: 'written',
      structuralBaselineVersion: BASELINE_VERSION,
    });
  });
});
