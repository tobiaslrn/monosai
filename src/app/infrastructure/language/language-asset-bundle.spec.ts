import { describe, expect, it } from 'vitest';
import { readBundleFile, readBundleManifest } from '../../../testing/language-runtime';
import {
  GRAMMAR_PRESET_IDS_EASIEST_FIRST,
  MAXIMUM_GUIDANCE_LENGTH,
} from '../../domain/grammar/presets';
import { LANGUAGE_ASSET_COMPONENT_NAMES } from '../../domain/language/language-assets';
import { digestHex } from './asset-integrity';
import {
  dictionaryAssetHeaderSchema,
  findInvalidDictionaryEntry,
  grammarPresetsAssetSchema,
  languageAssetManifestSchema,
  structuralBaselineAssetSchema,
} from './language-asset.schema';

function readJson(path: string): unknown {
  return JSON.parse(new TextDecoder().decode(readBundleFile(path)));
}

/**
 * Guards the shipped bundle itself.
 *
 * These assertions are what make the manifest trustworthy at runtime: if a
 * dataset is rebuilt without refreshing the manifest, or an artifact is edited by
 * hand, the digests stop matching here rather than in a user's browser.
 */
describe('committed language bundle', () => {
  const manifest = readBundleManifest();

  it('matches the manifest schema', () => {
    expect(languageAssetManifestSchema.safeParse(manifest).success).toBe(true);
  });

  it('records a digest that matches every shipped file', async () => {
    for (const name of LANGUAGE_ASSET_COMPONENT_NAMES) {
      for (const file of manifest.components[name].files) {
        const bytes = readBundleFile(file.path);
        expect(bytes.byteLength, `${name}/${file.path} size`).toBe(file.bytes);
        expect(await digestHex(bytes), `${name}/${file.path} digest`).toBe(file.sha256);
      }
    }
  });

  it('ships redistribution attribution for every component', () => {
    for (const name of LANGUAGE_ASSET_COMPONENT_NAMES) {
      const attribution = manifest.components[name].attribution;
      expect(attribution.licences.length, name).toBeGreaterThan(0);
      expect(attribution.noticeEn.length, name).toBeGreaterThan(20);
      for (const licence of attribution.licences) {
        expect(licence.spdx, `${name} licence`).toMatch(/^[A-Za-z0-9.\-+]+$/);
        expect(licence.url, `${name} licence url`).toMatch(/^https:\/\//);
      }
    }
  });

  it('ships a dictionary that matches its schema and its recorded entry count', () => {
    const dictionary = readJson('dictionary.json') as { entries: unknown };
    expect(dictionaryAssetHeaderSchema.safeParse(dictionary).success).toBe(true);
    expect(findInvalidDictionaryEntry(dictionary.entries)).toBeNull();
    expect((dictionary.entries as unknown[]).length).toBe(
      manifest.components.dictionary.entryCount,
    );
  });

  it('ships every difficulty preset in ladder order, contiguous from zero', () => {
    const parsed = grammarPresetsAssetSchema.safeParse(readJson('grammar-presets.json'));
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    const { presets, presetCount } = parsed.data;
    expect(presets.map((preset) => preset.id)).toEqual([...GRAMMAR_PRESET_IDS_EASIEST_FIRST]);
    expect(presets.map((preset) => preset.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(presetCount).toBe(presets.length);
    expect(presetCount).toBe(manifest.components.grammarPresets.presetCount);
  });

  it('ships preset guidance that is bounded, plain, and never names a JLPT level', () => {
    const { presets } = grammarPresetsAssetSchema.parse(readJson('grammar-presets.json'));

    for (const preset of presets) {
      // The name states the grammar the learner commands; only the caption may
      // record where those patterns are conventionally taught.
      expect(preset.nameEn, preset.id).not.toMatch(/\bN[1-5]\b/);
      expect(preset.promptGuidance.trim().length, preset.id).toBeGreaterThan(0);
      expect(preset.promptGuidance.length, preset.id).toBeLessThanOrEqual(MAXIMUM_GUIDANCE_LENGTH);
      for (const text of [
        preset.promptGuidance,
        preset.descriptionEn,
        preset.captionEn,
        preset.exampleEn,
      ]) {
        expect(text, preset.id).not.toMatch(/[<>]|&[a-z]+;/i);
      }
      expect(preset.exampleJa.trim().length, preset.id).toBeGreaterThan(0);
      expect(preset.exampleEn.trim().length, preset.id).toBeGreaterThan(0);
    }
  });

  it('ships register guidance with an empty line for the neutral choice', () => {
    const parsed = grammarPresetsAssetSchema.parse(readJson('grammar-presets.json'));

    expect(parsed.registerGuidance.either).toBe('');
    expect(parsed.registerGuidance.spoken.length).toBeGreaterThan(0);
    expect(parsed.registerGuidance.written.length).toBeGreaterThan(0);
  });

  it('ships a structural baseline of sentence-building forms only', () => {
    const parsed = structuralBaselineAssetSchema.safeParse(readJson('structural-baseline.json'));
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    const baseline = parsed.data;
    expect(baseline.entries.length).toBe(manifest.components.structuralBaseline.entryCount);
    expect(new Set(baseline.entries.map((entry) => entry.id)).size).toBe(baseline.entries.length);
    for (const entry of baseline.entries) {
      // Content-word categories must never appear; only formal nouns may use the
      // noun part of speech.
      expect(entry.partsOfSpeech, entry.id).not.toContain('verb');
      expect(entry.partsOfSpeech, entry.id).not.toContain('adjective-i');
      expect(entry.partsOfSpeech, entry.id).not.toContain('adjective-na');
      expect(entry.partsOfSpeech, entry.id).not.toContain('proper-noun');
      if (entry.partsOfSpeech.includes('noun')) {
        expect(entry.category, entry.id).toBe('formal-noun');
      }
    }
  });

  it('documents every form that more than one baseline entry claims', () => {
    const baseline = structuralBaselineAssetSchema.parse(readJson('structural-baseline.json'));
    const ids = new Set(baseline.entries.map((entry) => entry.id));
    for (const overlap of baseline.overlappingForms) {
      expect(ids.has(overlap.resolvesTo), overlap.form).toBe(true);
      for (const other of overlap.alsoDeclaredBy) {
        expect(ids.has(other), overlap.form).toBe(true);
      }
    }
  });
});
