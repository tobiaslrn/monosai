import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { languageError, type LanguageError } from '../../domain/language/language-error';
import type { LanguageAssetManifest } from '../../domain/language/language-assets';
import type {
  LanguageAssetSource,
  LanguageRuntime,
  LanguageRuntimeInfo,
} from '../../domain/language/language-runtime';
import type { LanguageAssetSettings } from '../../domain/settings/settings';
import { err, ok, type Result } from '../../domain/shared/result';
import { storageError } from '../../domain/storage/storage-error';
import { readBundleManifest } from '../../../testing/language-runtime';
import { LANGUAGE_ASSET_SOURCE, LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { LanguageStore } from './language.store';

const MANIFEST: LanguageAssetManifest = readBundleManifest();

function runtimeInfo(): LanguageRuntimeInfo {
  return {
    bundleVersion: MANIFEST.bundleVersion,
    versions: {
      tokenizerVersion: MANIFEST.components.tokenizer.version,
      dictionaryVersion: MANIFEST.components.dictionary.version,
      grammarCatalogVersion: MANIFEST.components.grammarCatalog.version,
      structuralBaselineVersion: MANIFEST.components.structuralBaseline.version,
    },
    analyzerVersion: 'analyzer/1',
    dictionaryEntryCount: 10,
    grammarRuleCount: 5,
    structuralBaselineEntries: [],
    grammarPresets: [],
    registerGuidance: { spoken: '', written: '', either: '' },
  };
}

interface Harness {
  readonly store: LanguageStore;
  readonly saved: Partial<LanguageAssetSettings>[];
  readonly pruned: string[];
  readonly initializeCalls: () => number;
}

function setup(options: {
  manifest?: Result<LanguageAssetManifest, LanguageError>;
  initialize?: Result<LanguageRuntimeInfo, LanguageError>;
  settingsFail?: boolean;
}): Harness {
  const saved: Partial<LanguageAssetSettings>[] = [];
  const pruned: string[] = [];
  const initialize = vi.fn(() => Promise.resolve(options.initialize ?? ok(runtimeInfo())));

  const source: LanguageAssetSource = {
    baseUrl: 'https://monosai.test/assets/language/1/',
    loadManifest: () => Promise.resolve(options.manifest ?? ok(MANIFEST)),
    pruneSupersededBundles: (version) => {
      pruned.push(version);
      return Promise.resolve();
    },
  };

  const runtime = { initialize } as unknown as LanguageRuntime;

  TestBed.configureTestingModule({
    providers: [
      { provide: LANGUAGE_ASSET_SOURCE, useValue: source },
      { provide: LANGUAGE_RUNTIME, useValue: runtime },
      {
        provide: SETTINGS_REPOSITORY,
        useValue: {
          updateLanguageAssetSettings: (patch: Partial<LanguageAssetSettings>) => {
            if (options.settingsFail === true) {
              return Promise.resolve(err(storageError('quota', 'no room')));
            }
            saved.push(patch);
            return Promise.resolve(ok(patch as LanguageAssetSettings));
          },
        },
      },
    ],
  });

  return {
    store: TestBed.inject(LanguageStore),
    saved,
    pruned,
    initializeCalls: () => initialize.mock.calls.length,
  };
}

describe('LanguageStore', () => {
  it('starts idle so navigation never waits for language assets', () => {
    const { store } = setup({});
    expect(store.status()).toBe('idle');
    expect(store.versions()).toBeNull();
  });

  it('activates the verified versions and prunes superseded bundles', async () => {
    const harness = setup({});

    await expect(harness.store.initialize()).resolves.toBe(true);

    expect(harness.store.status()).toBe('ready');
    expect(harness.store.versions()?.tokenizerVersion).toBe(MANIFEST.components.tokenizer.version);
    expect(harness.saved).toEqual([runtimeInfo().versions]);
    expect(harness.pruned).toEqual([MANIFEST.bundleVersion]);
    expect(harness.store.attributions().length).toBe(4);
  });

  it('shares one attempt between concurrent callers', async () => {
    const harness = setup({});
    await Promise.all([harness.store.initialize(), harness.store.initialize()]);
    expect(harness.initializeCalls()).toBe(1);
  });

  it('does nothing further once ready', async () => {
    const harness = setup({});
    await harness.store.initialize();
    await harness.store.initialize();
    expect(harness.initializeCalls()).toBe(1);
  });

  it('reports a typed error and stays inactive when the manifest is invalid', async () => {
    const harness = setup({
      manifest: err(languageError('asset-manifest-invalid', 'bad manifest')),
    });

    await expect(harness.store.initialize()).resolves.toBe(false);

    expect(harness.store.status()).toBe('failed');
    expect(harness.store.lastError()?.code).toBe('asset-manifest-invalid');
    expect(harness.store.versions()).toBeNull();
    expect(harness.saved).toEqual([]);
  });

  it('recovers from an integrity failure with a typed error rather than a crash', async () => {
    const harness = setup({
      initialize: err(languageError('asset-integrity-mismatch', 'digest mismatch')),
    });

    await expect(harness.store.initialize()).resolves.toBe(false);

    expect(harness.store.status()).toBe('failed');
    expect(harness.store.lastError()?.code).toBe('asset-integrity-mismatch');
    // Nothing was activated, so a previously recorded version stays untouched.
    expect(harness.saved).toEqual([]);
    expect(harness.pruned).toEqual([]);
  });

  it('allows a retry after a failure', async () => {
    const harness = setup({
      initialize: err(languageError('assets-unavailable', 'offline')),
    });
    await harness.store.initialize();
    await harness.store.initialize();
    expect(harness.initializeCalls()).toBe(2);
  });

  it('does not report ready when the activation cannot be persisted', async () => {
    const harness = setup({ settingsFail: true });

    await expect(harness.store.initialize()).resolves.toBe(false);

    expect(harness.store.status()).toBe('failed');
    expect(harness.store.lastError()?.code).toBe('unknown');
    expect(harness.store.versions()).toBeNull();
  });
});
