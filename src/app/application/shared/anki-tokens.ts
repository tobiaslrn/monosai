import { InjectionToken } from '@angular/core';
import type { AnkiVocabularyProvider, PackageSource } from '../../domain/anki/anki-provider';
import type { MarkupTextExtractor } from '../../domain/anki/markup-text';

/**
 * Creates a provider for one local-connection source kind.
 *
 * The package provider is deliberately absent: it needs the file the learner
 * chose, which no injectable factory can supply, so it is built where that file
 * exists. What both have in common is that they are made per refresh rather
 * than injected as singletons.
 */
export type AnkiProviderFactory = (
  kind: 'desktop-connect' | 'android-connect',
) => AnkiVocabularyProvider;

export const ANKI_PROVIDER_FACTORY = new InjectionToken<AnkiProviderFactory>(
  'monosai.anki-provider-factory',
);

/**
 * Creates a provider for one chosen package file.
 *
 * Separate from the connection factory because it needs the file, and a
 * feature must be able to ask for one without reaching into infrastructure to
 * start a worker itself.
 */
export type PackageProviderFactory = (source: PackageSource) => AnkiVocabularyProvider;

export const PACKAGE_PROVIDER_FACTORY = new InjectionToken<PackageProviderFactory>(
  'monosai.package-provider-factory',
);

/**
 * Turns Anki field markup into visible text.
 *
 * Application code depends on this token rather than on the DOM implementation,
 * which keeps the one place that parses untrusted provider markup replaceable
 * and out of the domain.
 */
export const MARKUP_TEXT_EXTRACTOR = new InjectionToken<MarkupTextExtractor>(
  'monosai.markup-text-extractor',
);
