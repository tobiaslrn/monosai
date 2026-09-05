import { Injectable, computed, inject, signal } from '@angular/core';
import type { LanguageError } from '../../domain/language/language-error';
import type { LanguageAssetAttribution } from '../../domain/language/language-assets';
import { allAttributions } from '../../domain/language/language-assets';
import type { LanguageRuntimeInfo } from '../../domain/language/language-runtime';
import type { GrammarPreset, RegisterGuidance } from '../../domain/grammar/presets';
import type {
  StructuralBaselineEntry,
  StructuralBaselineMatcher,
} from '../../domain/language/structural-baseline';
import { compileStructuralBaseline } from '../../domain/language/structural-baseline';
import { LANGUAGE_ASSET_SOURCE, LANGUAGE_RUNTIME } from '../shared/language-tokens';
import { SETTINGS_REPOSITORY } from '../shared/repository-tokens';
import { LOGGER, NOOP_LOGGER, type Logger } from '../shared/diagnostics';
import { safeErrorTypeOf } from '../../domain/shared/errors';

export type LanguageStatus = 'idle' | 'initializing' | 'ready' | 'failed';

/**
 * Owns language-asset initialization and activation.
 *
 * Initialization is deliberately lazy: navigation and the library must render
 * without waiting for a multi-megabyte tokenizer. A version becomes active only
 * after every asset has been verified against the manifest, so a failed or
 * tampered download leaves the previously recorded versions untouched and
 * surfaces a typed error instead of a silent fallback.
 */
@Injectable({ providedIn: 'root' })
export class LanguageStore {
  private readonly source = inject(LANGUAGE_ASSET_SOURCE);
  private readonly runtime = inject(LANGUAGE_RUNTIME);
  private readonly settings = inject(SETTINGS_REPOSITORY);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  private readonly statusSignal = signal<LanguageStatus>('idle');
  private readonly infoSignal = signal<LanguageRuntimeInfo | null>(null);
  private readonly attributionsSignal = signal<readonly LanguageAssetAttribution[]>([]);
  private readonly errorSignal = signal<LanguageError | null>(null);
  private inFlight: Promise<boolean> | null = null;

  readonly status = this.statusSignal.asReadonly();
  readonly info = this.infoSignal.asReadonly();
  readonly attributions = this.attributionsSignal.asReadonly();
  readonly lastError = this.errorSignal.asReadonly();

  readonly versions = computed(() => this.infoSignal()?.versions ?? null);
  readonly structuralBaseline = computed<readonly StructuralBaselineEntry[]>(
    () => this.infoSignal()?.structuralBaselineEntries ?? [],
  );
  /**
   * The baseline compiled for matching a token against it.
   *
   * Compiled from whichever bundle is active rather than once at startup, and
   * memoized, because a word can be opened many times while reading.
   */
  readonly structuralBaselineMatcher = computed<StructuralBaselineMatcher | null>(() => {
    const info = this.infoSignal();
    return info === null
      ? null
      : compileStructuralBaseline({
          version: info.versions.structuralBaselineVersion,
          entries: info.structuralBaselineEntries,
        });
  });

  readonly grammarPresets = computed<readonly GrammarPreset[]>(
    () => this.infoSignal()?.grammarPresets ?? [],
  );
  readonly registerGuidance = computed<RegisterGuidance | null>(
    () => this.infoSignal()?.registerGuidance ?? null,
  );

  /**
   * Loads, verifies, and activates the language bundle. Concurrent callers share
   * one attempt; a failed attempt can be retried.
   */
  initialize(): Promise<boolean> {
    if (this.statusSignal() === 'ready') {
      return Promise.resolve(true);
    }
    this.inFlight ??= this.run().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async run(): Promise<boolean> {
    this.logger.info('language.operation.started', { operation: 'initialize' });
    this.statusSignal.set('initializing');
    this.errorSignal.set(null);

    const manifest = await this.source.loadManifest();
    if (!manifest.ok) {
      return this.reportFailure(manifest.error);
    }

    const initialized = await this.runtime.initialize(this.source.baseUrl, manifest.value);
    if (!initialized.ok) {
      return this.reportFailure(initialized.error);
    }

    const activated = await this.settings.updateLanguageAssetSettings(initialized.value.versions);
    if (!activated.ok) {
      return this.reportFailure({
        domain: 'language',
        code: 'unknown',
        message: 'The verified language assets could not be recorded as active.',
        cause: activated.error.code,
      });
    }

    try {
      await this.source.pruneSupersededBundles(initialized.value.bundleVersion);
    } catch (thrown) {
      return this.reportFailure({
        domain: 'language',
        code: 'unknown',
        message: 'The verified language assets could not be activated.',
        cause: safeErrorTypeOf(thrown),
      });
    }
    this.infoSignal.set(initialized.value);
    this.attributionsSignal.set(allAttributions(manifest.value));
    this.statusSignal.set('ready');
    this.logger.info('language.operation.succeeded', {
      operation: 'initialize',
      assetVersion: initialized.value.bundleVersion,
    });
    return true;
  }

  private reportFailure(error: LanguageError): boolean {
    this.logger.error('language.asset.failed', {
      operation: 'initialize',
      errorCode: error.code,
    });
    this.errorSignal.set(error);
    this.statusSignal.set('failed');
    return false;
  }
}
