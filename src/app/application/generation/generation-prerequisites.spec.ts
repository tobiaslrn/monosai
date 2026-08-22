import { describe, expect, it } from 'vitest';
import type { GrammarPreset, GrammarPresetId } from '../../domain/grammar/presets';
import { snapshotId } from '../../domain/shared/ids';
import type { VocabularySnapshot } from '../../domain/vocabulary/snapshot';
import {
  allPrerequisitesMet,
  grammarPresetLine,
  isTextModelReady,
  prerequisiteChecks,
  type PrerequisiteInput,
} from './generation-prerequisites';

function snapshot(uniqueEntryCount: number): VocabularySnapshot {
  return {
    id: snapshotId('00000000-0000-4000-8000-000000000001'),
    createdAt: 0,
    status: 'complete',
    uniqueEntryCount,
    sourceIds: [],
    sourceKinds: ['anki-package'],
    analyzerVersion: 'analyzer/1',
    normalizationVersion: 'normalization/1',
    stats: {
      sourcesQueried: 1,
      entriesRead: uniqueEntryCount,
      nonEmptyValues: uniqueEntryCount,
      rejectedEmptyValues: 0,
      duplicateOccurrences: 0,
      uniqueExpressions: uniqueEntryCount,
      sourceWarnings: [],
    },
  };
}

function input(overrides: Partial<PrerequisiteInput> = {}): PrerequisiteInput {
  return {
    textModelReadiness: 'ready',
    structuredOutput: 'native-schema',
    snapshot: snapshot(200),
    ...overrides,
  };
}

function checkFor(
  id: string,
  over: Partial<PrerequisiteInput> = {},
): {
  readonly satisfied: boolean;
  readonly detail: string;
  readonly route: string;
} {
  const check = prerequisiteChecks(input(over)).find((entry) => entry.id === id);
  if (check === undefined) {
    throw new Error(`no check named ${id}`);
  }
  return check;
}

describe('prerequisiteChecks', () => {
  it('lists exactly the two external setup checks', () => {
    expect(prerequisiteChecks(input()).map((check) => check.id)).toEqual([
      'text-model',
      'vocabulary',
    ]);
  });

  it('passes everything when the configuration is complete', () => {
    expect(allPrerequisitesMet(prerequisiteChecks(input()))).toBe(true);
  });

  it('fails the text model for every readiness that is not ready', () => {
    for (const readiness of ['not-configured', 'untested', 'stale', 'failed'] as const) {
      expect(checkFor('text-model', { textModelReadiness: readiness }).satisfied).toBe(false);
    }
  });

  it('fails the text model when no test recorded how it returns structured output', () => {
    expect(isTextModelReady(input({ structuredOutput: null }))).toBe(false);
    expect(checkFor('text-model', { structuredOutput: null }).detail).toContain(
      'Run the model test once more',
    );
  });

  it('sends each failing check to the screen that fixes it', () => {
    expect(checkFor('text-model', { textModelReadiness: 'untested' }).route).toBe('/settings');
    expect(checkFor('vocabulary', { snapshot: null }).route).toBe('/vocabulary');
  });

  it('fails the vocabulary check below the documented minimum and names the count', () => {
    const check = checkFor('vocabulary', { snapshot: snapshot(49) });

    expect(check.satisfied).toBe(false);
    expect(check.detail).toContain('49');
    expect(check.detail).toContain('50');
  });

  it('passes the vocabulary check exactly at the minimum', () => {
    expect(checkFor('vocabulary', { snapshot: snapshot(50) }).satisfied).toBe(true);
  });
});

function preset(id: GrammarPresetId, nameEn: string): GrammarPreset {
  return {
    id,
    order: 0,
    nameEn,
    captionEn: 'caption',
    descriptionEn: 'description',
    exampleJa: '例。',
    exampleEn: 'Example.',
    promptGuidance: 'guidance',
  };
}

describe('grammarPresetLine', () => {
  it('is a read-only line, never a blocking check', () => {
    const line = grammarPresetLine(preset('mn-preset-starter', 'Starter forms'), snapshot(200));

    expect(line.presetName).toBe('Starter forms');
    expect(line.route).toBe('/grammar');
    expect(line.warning).toBeNull();
  });

  it('warns without blocking when the preset outruns the snapshot', () => {
    const line = grammarPresetLine(preset('mn-preset-literary', 'Literary prose'), snapshot(60));

    expect(line.warning).not.toBeNull();
    expect(line.warning).toContain('60');
    expect(line.warning).toContain('generate anyway');
  });

  it('stays quiet for an easy preset on a small snapshot', () => {
    expect(
      grammarPresetLine(preset('mn-preset-starter', 'Starter'), snapshot(50)).warning,
    ).toBeNull();
  });

  it('says nothing about vocabulary before a snapshot exists', () => {
    expect(grammarPresetLine(preset('mn-preset-literary', 'Literary'), null).warning).toBeNull();
  });
});
