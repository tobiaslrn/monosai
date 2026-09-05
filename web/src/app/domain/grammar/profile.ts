import {
  DEFAULT_GRAMMAR_PRESET_ID,
  DEFAULT_REGISTER_PREFERENCE,
  type GrammarPresetId,
  type RegisterPreference,
} from './presets';

/**
 * The learner's live grammar profile.
 *
 * A preset is always set, so unlike the per-rule selection it replaced this can
 * never be empty and generation is never gated on it.
 */
export interface GrammarProfileSelection {
  readonly presetId: GrammarPresetId;
  readonly registerPreference: RegisterPreference;
  /** Set only when the learner forked the preset's prose; bounded at 1,000 characters. */
  readonly customGuidance?: string;
}

/**
 * Immutable capture taken when a story is generated.
 *
 * Captures the resolved guidance text rather than only the preset id, so
 * revising a preset cannot rewrite the history of stories generated under it.
 */
export interface GrammarProfileSnapshot {
  readonly id: string;
  readonly profileHash: string;
  readonly capturedAt: number;
  readonly presetId: GrammarPresetId;
  readonly resolvedGuidance: string;
  readonly registerPreference: RegisterPreference;
  readonly isCustomGuidance: boolean;
  readonly structuralBaselineVersion: string;
}

export const DEFAULT_GRAMMAR_PROFILE_SELECTION: GrammarProfileSelection = {
  presetId: DEFAULT_GRAMMAR_PRESET_ID,
  registerPreference: DEFAULT_REGISTER_PREFERENCE,
};
