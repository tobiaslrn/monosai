import { InjectionToken } from '@angular/core';
import type { MarkupTextExtractor } from '../../domain/anki/markup-text';

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
