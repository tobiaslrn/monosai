/**
 * Grammar difficulty presets.
 *
 * The grammar profile is one choice from an ordered ladder of presets rather
 * than a selection over catalog rules; see
 * `docs/decisions/0008-grammar-profile-presets.md`. A preset carries prose that
 * is sent to the model in place of a serialized rule list, and references no
 * catalog rule ids, so presets and the catalog can version independently.
 */

export const GRAMMAR_PRESET_IDS_EASIEST_FIRST = [
  'mn-preset-starter',
  'mn-preset-basic',
  'mn-preset-everyday',
  'mn-preset-explanatory',
  'mn-preset-formal',
  'mn-preset-literary',
] as const;

export type GrammarPresetId = (typeof GRAMMAR_PRESET_IDS_EASIEST_FIRST)[number];

/** The preset a fresh install starts on. */
export const DEFAULT_GRAMMAR_PRESET_ID: GrammarPresetId = 'mn-preset-starter';

export const REGISTER_PREFERENCES = ['spoken', 'written', 'either'] as const;

export type RegisterPreference = (typeof REGISTER_PREFERENCES)[number];

export const DEFAULT_REGISTER_PREFERENCE: RegisterPreference = 'either';

/** Free-text guidance is bounded like special instructions. */
export const MAXIMUM_GUIDANCE_LENGTH = 1000;

export interface GrammarPreset {
  readonly id: GrammarPresetId;
  /** Position in the ladder, 0 easiest. */
  readonly order: number;
  /** Names the grammar the learner commands, never a JLPT level. */
  readonly nameEn: string;
  /** Records where the patterns are conventionally taught, e.g. "usually taught around N4". */
  readonly captionEn: string;
  readonly descriptionEn: string;
  readonly exampleJa: string;
  readonly exampleEn: string;
  /** Prose sent to the model in place of a serialized rule list. */
  readonly promptGuidance: string;
}

export type RegisterGuidance = Readonly<Record<RegisterPreference, string>>;

export function isGrammarPresetId(value: string): value is GrammarPresetId {
  return (GRAMMAR_PRESET_IDS_EASIEST_FIRST as readonly string[]).includes(value);
}

export function isRegisterPreference(value: string): value is RegisterPreference {
  return (REGISTER_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Builds the guidance actually sent to the model.
 *
 * Custom guidance replaces the preset prose entirely rather than appending to
 * it, because the user edits a copy of that prose. The register line is appended
 * in both cases so switching register never requires re-editing custom text.
 */
export function resolveGuidance(
  presetGuidance: string,
  registerGuidance: string,
  customGuidance?: string,
): string {
  const base = (customGuidance ?? presetGuidance).trim();
  const register = registerGuidance.trim();
  return register.length === 0 ? base : `${base} ${register}`;
}
