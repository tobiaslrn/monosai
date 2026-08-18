import { describe, expect, it } from 'vitest';
import { readBundleFile, readBundleManifest } from '../../../testing/language-runtime';
import { JLPT_LEVELS_EASIEST_FIRST } from '../../domain/grammar/rules';
import { LANGUAGE_ASSET_COMPONENT_NAMES } from '../../domain/language/language-assets';
import { digestHex } from './asset-integrity';
import {
  dictionaryAssetHeaderSchema,
  findInvalidDictionaryEntry,
  grammarCatalogAssetSchema,
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

  it('ships a grammar catalog covering every level with unique stable ids', () => {
    const parsed = grammarCatalogAssetSchema.safeParse(readJson('grammar-catalog.json'));
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    const catalog = parsed.data;
    expect(catalog.rules.length).toBe(manifest.components.grammarCatalog.ruleCount);
    expect(new Set(catalog.rules.map((rule) => rule.id)).size).toBe(catalog.rules.length);
    for (const level of JLPT_LEVELS_EASIEST_FIRST) {
      const count = catalog.rules.filter((rule) => rule.level === level).length;
      expect(count, level).toBeGreaterThan(0);
      expect(count, level).toBe(manifest.components.grammarCatalog.countsByLevel[level]);
    }
  });

  it('ships grammar descriptions free of markup', () => {
    const parsed = grammarCatalogAssetSchema.parse(readJson('grammar-catalog.json'));
    for (const rule of parsed.rules) {
      expect(rule.descriptionEn, rule.id).not.toMatch(/[<>]|&[a-z]+;/i);
      expect(rule.nameEn, rule.id).not.toMatch(/[<>]|&[a-z]+;/i);
    }
  });

  it('ships the difficulty presets in ladder order without JLPT levels as names', () => {
    const parsed = grammarCatalogAssetSchema.safeParse(readJson('grammar-catalog.json'));
    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    const { presets } = parsed.data;
    expect(presets.length).toBe(manifest.components.grammarCatalog.presetCount);
    expect(presets.map((preset) => preset.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(new Set(presets.map((preset) => preset.id)).size).toBe(presets.length);
    for (const preset of presets) {
      // The name states the grammar the learner commands; only the caption may
      // record where those patterns are conventionally taught.
      expect(preset.nameEn, preset.id).not.toMatch(/\bN[1-5]\b/);
      expect(preset.promptGuidance.length, preset.id).toBeLessThanOrEqual(1000);
      expect(preset.promptGuidance, preset.id).not.toMatch(/[<>]|&[a-z]+;/i);
      expect(preset.descriptionEn, preset.id).not.toMatch(/[<>]|&[a-z]+;/i);
    }
  });

  it('ships register guidance with an empty line for the neutral choice', () => {
    const parsed = grammarCatalogAssetSchema.parse(readJson('grammar-catalog.json'));

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
