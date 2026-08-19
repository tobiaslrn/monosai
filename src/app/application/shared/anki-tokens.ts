import { InjectionToken } from '@angular/core';
import type { AnkiVocabularyProvider } from '../../domain/anki/anki-provider';
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
 * Turns Anki field markup into visible text.
 *
 * Application code depends on this token rather than on the DOM implementation,
 * which keeps the one place that parses untrusted provider markup replaceable
 * and out of the domain.
 */
export const MARKUP_TEXT_EXTRACTOR = new InjectionToken<MarkupTextExtractor>(
  'monosai.markup-text-extractor',
);
