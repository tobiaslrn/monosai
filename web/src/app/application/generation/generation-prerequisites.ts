import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { StructuredOutputMode } from '../../domain/ai/model-test';
import {
  GENERATION_SNAPSHOT_MINIMUM,
  type VocabularySnapshot,
} from '../../domain/vocabulary/snapshot';
import type { GrammarPreset, GrammarPresetId } from '../../domain/grammar/presets';

/**
 * The setup a story is written from, in the order a learner does it.
 *
 * Words first, because everything else is pitched at them; then the level the
 * stories are written in; then the model that writes them, which is the only
 * one that costs money. `network` is not setup at all — it is a transient
 * blocker, and it leads the list only while it applies.
 *
 * The reading level is here although it can never block generation: a preset is
 * always set, so its row is always satisfied. It earns its place by being the
 * one row a first-time learner can see is already done, and by being the only
 * way to find the setting from here. Its advisory warning is reported
 * separately and the Generate button still ignores it.
 */
export type PrerequisiteId = 'vocabulary' | 'reading-level' | 'text-model' | 'network';

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
  readonly online?: boolean;
  readonly hasSources?: boolean;
  readonly textModelFailure?: string | null;
  readonly textModelReadiness: ConfigurationReadiness;
  readonly structuredOutput: StructuredOutputMode | null;
  readonly snapshot: VocabularySnapshot | null;
  /** Null only while the language bundle that names the preset is still loading. */
  readonly preset?: GrammarPreset | null;
}

function textModelDetail(input: PrerequisiteInput): string {
  switch (input.textModelReadiness) {
    case 'ready':
      return input.structuredOutput === null
        ? 'Run the model test once more so Monosai knows how this model returns structured replies.'
        : 'Your text model has passed its compatibility test.';
    case 'no-credential':
      return 'Add an OpenRouter key.';
    case 'incomplete':
      return 'Choose a text model.';
    case 'untested':
      return 'This model has not been tested yet.';
    case 'stale':
      return 'Your key or model changed since the last successful test.';
    case 'failed':
      return input.textModelFailure ?? 'The last test of this model failed.';
  }
}

function vocabularyDetail(snapshot: VocabularySnapshot | null, hasSources: boolean): string {
  if (snapshot === null) {
    return hasSources
      ? 'Your word list has not been read yet. Open your word sources and sync the list.'
      : 'Add a word list — from Anki, an Anki package, or a pasted list.';
  }
  if (snapshot.uniqueEntryCount < GENERATION_SNAPSHOT_MINIMUM) {
    return `Your word list has ${String(snapshot.uniqueEntryCount)} words. Stories need at least ${String(
      GENERATION_SNAPSHOT_MINIMUM,
    )}.`;
  }
  return `${String(snapshot.uniqueEntryCount)} words are available.`;
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
  const preset = input.preset ?? null;
  return [
    ...(input.online === false
      ? [
          {
            id: 'network' as const,
            label: 'Connection',
            satisfied: false,
            detail: 'You are offline. Connect to the internet to generate; your draft stays here.',
            route: '',
            actionLabel: '',
          },
        ]
      : []),
    {
      id: 'vocabulary',
      label: 'Your words',
      satisfied:
        input.snapshot !== null && input.snapshot.uniqueEntryCount >= GENERATION_SNAPSHOT_MINIMUM,
      detail: vocabularyDetail(input.snapshot, input.hasSources ?? false),
      route: '/reading-level',
      actionLabel: 'Add a word source',
    },
    {
      // Always satisfied: a preset is always set. See `PrerequisiteId`.
      id: 'reading-level',
      label: 'Reading level',
      satisfied: true,
      detail: preset === null ? 'Reading your level…' : `Set to ${preset.nameEn}.`,
      route: preset === null ? '' : '/grammar',
      actionLabel: 'Change level',
    },
    {
      id: 'text-model',
      label: 'AI model',
      satisfied: isTextModelReady(input),
      detail: textModelDetail(input),
      route: '/settings',
      actionLabel: 'Open Settings',
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
