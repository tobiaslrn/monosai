import { InjectionToken } from '@angular/core';
import type { LanguageAssetSource, LanguageRuntime } from '../../domain/language/language-runtime';

/**
 * Injection tokens for the language ports. Application and feature code depends
 * on these, never on the worker client or the asset loader.
 */
export const LANGUAGE_RUNTIME = new InjectionToken<LanguageRuntime>('monosai.language-runtime');

export const LANGUAGE_ASSET_SOURCE = new InjectionToken<LanguageAssetSource>(
  'monosai.language-asset-source',
);
