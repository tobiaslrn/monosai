import type { Result } from '../shared/result';
import type { AnalyzeTextRequest, AnalyzedText } from './analyzed-text';
import type { LanguageError } from './language-error';

/**
 * Port for morphological analysis. The concrete tokenizer library is wrapped by
 * an infrastructure adapter, so no domain or feature file sees its types.
 */
export interface Tokenizer {
  analyzeText(
    input: AnalyzeTextRequest,
    signal?: AbortSignal,
  ): Promise<Result<AnalyzedText, LanguageError>>;
}
