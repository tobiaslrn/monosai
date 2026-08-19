import { InjectionToken } from '@angular/core';
import type { AnkiVocabularyProvider } from '../../domain/anki/anki-provider';
import type { MarkupTextExtractor } from '../../domain/anki/markup-text';
import type { AnkiProviderKind } from '../../domain/vocabulary/snapshot';

/**
 * Creates a provider for one source kind.
 *
 * Providers are made per refresh rather than injected as singletons because the
 * package provider owns a worker whose memory is only reclaimed by terminating
 * it, and a connection provider should not outlive the screen that opened it.
 */
export type AnkiProviderFactory = (kind: AnkiProviderKind) => AnkiVocabularyProvider;

export const ANKI_PROVIDER_FACTORY = new InjectionToken<AnkiProviderFactory>(
  'monosai.anki-provider-factory',
);

export const MARKUP_TEXT_EXTRACTOR = new InjectionToken<MarkupTextExtractor>(
  'monosai.markup-text-extractor',
);
