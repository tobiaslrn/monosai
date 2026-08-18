import type { JlptLevel } from '../grammar/rules';

export interface LanguageAssetLicence {
  readonly component: string;
  readonly spdx: string;
  readonly holder: string;
  readonly url: string;
}

/** Redistribution notice shipped with the bundle and shown in the app. */
export interface LanguageAssetAttribution {
  readonly name: string;
  readonly role: string;
  readonly licences: readonly LanguageAssetLicence[];
  readonly noticeEn: string;
  readonly redistribution: string;
}

export interface LanguageAssetFile {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export interface LanguageAssetComponent {
  readonly version: string;
  readonly files: readonly LanguageAssetFile[];
  readonly attribution: LanguageAssetAttribution;
}

export interface TokenizerComponent extends LanguageAssetComponent {
  readonly engine: string;
}

export interface DictionaryComponent extends LanguageAssetComponent {
  readonly entryCount: number;
}

export interface GrammarCatalogComponent extends LanguageAssetComponent {
  readonly ruleCount: number;
  readonly countsByLevel: Readonly<Record<JlptLevel, number>>;
}

export interface StructuralBaselineComponent extends LanguageAssetComponent {
  readonly entryCount: number;
}

/**
 * Describes one immutable language bundle. Every file carries its digest, so a
 * cached copy can be proven correct before it is used.
 */
export interface LanguageAssetManifest {
  readonly schemaVersion: number;
  readonly bundleVersion: string;
  readonly components: {
    readonly tokenizer: TokenizerComponent;
    readonly dictionary: DictionaryComponent;
    readonly grammarCatalog: GrammarCatalogComponent;
    readonly structuralBaseline: StructuralBaselineComponent;
  };
}

export type LanguageAssetComponentName = keyof LanguageAssetManifest['components'];

export const LANGUAGE_ASSET_COMPONENT_NAMES: readonly LanguageAssetComponentName[] = [
  'tokenizer',
  'dictionary',
  'grammarCatalog',
  'structuralBaseline',
];

/** Versions written to `LanguageAssetSettings` when a bundle is activated. */
export interface ActiveLanguageAssetVersions {
  readonly tokenizerVersion: string;
  readonly dictionaryVersion: string;
  readonly grammarCatalogVersion: string;
  readonly structuralBaselineVersion: string;
}

export function activeVersionsOf(manifest: LanguageAssetManifest): ActiveLanguageAssetVersions {
  return {
    tokenizerVersion: manifest.components.tokenizer.version,
    dictionaryVersion: manifest.components.dictionary.version,
    grammarCatalogVersion: manifest.components.grammarCatalog.version,
    structuralBaselineVersion: manifest.components.structuralBaseline.version,
  };
}

export function allAttributions(
  manifest: LanguageAssetManifest,
): readonly LanguageAssetAttribution[] {
  return LANGUAGE_ASSET_COMPONENT_NAMES.map((name) => manifest.components[name].attribution);
}
