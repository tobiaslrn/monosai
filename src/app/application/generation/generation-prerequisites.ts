import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { StructuredOutputMode } from '../../domain/ai/model-test';
import {
  GENERATION_SNAPSHOT_MINIMUM,
  type VocabularySnapshot,
} from '../../domain/vocabulary/snapshot';
import type { GrammarPreset, GrammarPresetId } from '../../domain/grammar/presets';

/**
 * The two external setup checks the Generate screen shows, each independently actionable.
 *
 * The grammar preset is deliberately not among them: a preset is always set, so
 * it can never block generation. It is reported separately as a read-only line
 * that may carry a warning.
 */
export type PrerequisiteId = 'text-model' | 'vocabulary';

export interface PrerequisiteCheck {
  readonly id: PrerequisiteId;
  readonly label: string;
  readonly satisfied: boolean;
  /** One sentence naming the current state, satisfied or not. */
  readonly detail: string;
  /** Where the learner goes to satisfy it. The draft survives the trip. */
  readonly route: string;
  readonly actionLabel: string;
}

export interface PrerequisiteInput {
  readonly textModelReadiness: ConfigurationReadiness;
  readonly structuredOutput: StructuredOutputMode | null;
  readonly snapshot: VocabularySnapshot | null;
}

function textModelDetail(input: PrerequisiteInput): string {
  switch (input.textModelReadiness) {
    case 'ready':
      return input.structuredOutput === null
        ? 'Run the model test once more so Monosai knows how this model returns structured replies.'
        : 'Your text model has passed its compatibility test.';
    case 'not-configured':
      return 'Add an OpenRouter key and an exact text-model ID.';
    case 'untested':
      return 'This model has not been tested yet.';
    case 'stale':
      return 'Your key or model changed since the last successful test.';
    case 'failed':
      return 'The last test of this model failed.';
  }
}

function vocabularyDetail(snapshot: VocabularySnapshot | null): string {
  if (snapshot === null) {
    return 'No vocabulary snapshot yet. Connect Anki and refresh to build one.';
  }
  if (snapshot.uniqueEntryCount < GENERATION_SNAPSHOT_MINIMUM) {
    return `Your snapshot has ${String(snapshot.uniqueEntryCount)} unique entries. Generation needs at least ${String(
      GENERATION_SNAPSHOT_MINIMUM,
    )}.`;
  }
  return `${String(snapshot.uniqueEntryCount)} unique reviewed entries are available.`;
}

/**
 * A text model is usable only when a current test vouches for it *and* that
 * test recorded how the model returns structured output. The second half
 * matters because generation opens in the recorded mode; without it there is
 * nothing to open in. See ADR 0020.
 */
export function isTextModelReady(input: PrerequisiteInput): boolean {
  return input.textModelReadiness === 'ready' && input.structuredOutput !== null;
}

export function prerequisiteChecks(input: PrerequisiteInput): readonly PrerequisiteCheck[] {
  return [
    {
      id: 'text-model',
      label: 'Text AI',
      satisfied: isTextModelReady(input),
      detail: textModelDetail(input),
      route: '/settings',
      actionLabel: 'Open Settings',
    },
    {
      id: 'vocabulary',
      label: 'Vocabulary snapshot',
      satisfied:
        input.snapshot !== null && input.snapshot.uniqueEntryCount >= GENERATION_SNAPSHOT_MINIMUM,
      detail: vocabularyDetail(input.snapshot),
      route: '/vocabulary',
      actionLabel: 'Open Vocabulary',
    },
  ];
}

export function allPrerequisitesMet(checks: readonly PrerequisiteCheck[]): boolean {
  return checks.every((check) => check.satisfied);
}

/**
 * Roughly how much reviewed vocabulary each preset assumes.
 *
 * These are not thresholds anything is blocked on and they are not claims about
 * a syllabus. They exist for one non-blocking warning: a learner who picked
 * literary prose with 60 reviewed words will get stories that repair badly or
 * fail, and saying so before they spend a request is kinder than letting them
 * find out. The numbers rise across the ladder and are deliberately generous at
 * the easy end, so the warning stays rare.
 */
const PRESET_VOCABULARY_EXPECTATION: Readonly<Record<GrammarPresetId, number>> = {
  'mn-preset-starter': 50,
  'mn-preset-basic': 150,
  'mn-preset-everyday': 400,
  'mn-preset-explanatory': 700,
  'mn-preset-formal': 1_000,
  'mn-preset-literary': 1_400,
};

export interface GrammarPresetLine {
  readonly presetName: string;
  readonly route: string;
  /** Non-blocking; null when the preset suits the snapshot. */
  readonly warning: string | null;
}

export function grammarPresetLine(
  preset: GrammarPreset | null,
  snapshot: VocabularySnapshot | null,
): GrammarPresetLine {
  if (preset === null) {
    return {
      presetName: 'Loading…',
      route: '/grammar',
      warning: null,
    };
  }

  const expectation = PRESET_VOCABULARY_EXPECTATION[preset.id];
  const count = snapshot?.uniqueEntryCount ?? 0;
  const warning =
    snapshot !== null && count < expectation
      ? `${preset.nameEn} may need more words than the ${String(
          count,
        )} in your current list. Add more words or choose an easier story setting. You can still generate, but the result may be limited with this list.`
      : null;

  return { presetName: preset.nameEn, route: '/grammar', warning };
}
