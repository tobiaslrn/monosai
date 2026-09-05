import type {
  AnalyzedSentence,
  AnalyzeTextRequest,
  AnalyzedText,
} from '../app/domain/language/analyzed-text';
import type { ClassificationMode } from '../app/domain/language/classification';
import type { DictionaryLookup, DictionaryQuery } from '../app/domain/language/dictionary';
import type { LanguageError } from '../app/domain/language/language-error';
import { languageError } from '../app/domain/language/language-error';
import type { LanguageAssetManifest } from '../app/domain/language/language-assets';
import type {
  ClassificationResult,
  CompiledSnapshotInfo,
  LanguageRuntime,
  LanguageRuntimeInfo,
  SentenceTokens,
} from '../app/domain/language/language-runtime';
import { segmentParagraph, type SentenceSegment } from '../app/domain/language/segmentation';
import type { Token } from '../app/domain/reading/token';
import { err, ok, type Result } from '../app/domain/shared/result';
import type { VocabularyItem } from '../app/domain/vocabulary/snapshot';

/**
 * A `LanguageRuntime` with no worker and no WebAssembly.
 *
 * Segmentation uses the real domain rules, so tests exercise genuine sentence
 * boundaries; tokenization is a deliberate stand-in that splits on Japanese
 * punctuation, because component and store tests care about how tokens flow
 * through the application, not about morphological accuracy. The golden corpus
 * covers the real tokenizer.
 */
export class FakeLanguageRuntime implements LanguageRuntime {
  /** Set to make the next call of any analysis method fail. */
  failWith: LanguageError | null = null;

  readonly calls = { segment: 0, analyzeSentences: 0, lookup: 0, classify: 0, compile: 0 };
  lookupResult: DictionaryLookup = { matchedBy: 'none', entries: [] };
  classification: ClassificationResult | null = null;

  initialize(
    _baseUrl: string,
    _manifest: LanguageAssetManifest,
  ): Promise<Result<LanguageRuntimeInfo, LanguageError>> {
    return Promise.resolve(
      err(languageError('not-initialized', 'The fake runtime does not initialize assets.')),
    );
  }

  segment(text: string): Promise<Result<readonly SentenceSegment[], LanguageError>> {
    this.calls.segment += 1;
    return this.answer(() => segmentParagraph(text));
  }

  analyzeSentences(
    texts: readonly string[],
  ): Promise<Result<readonly AnalyzedSentence[], LanguageError>> {
    this.calls.analyzeSentences += 1;
    return this.answer(() =>
      texts.map((text) => ({
        startUtf16: 0,
        endUtf16: text.length,
        text,
        tokens: tokenize(text),
      })),
    );
  }

  analyzeText(input: AnalyzeTextRequest): Promise<Result<AnalyzedText, LanguageError>> {
    return this.answer(() => ({
      analyzerVersion: 'fake',
      segmentationRulesVersion: 'fake',
      sentences: [
        {
          startUtf16: 0,
          endUtf16: input.text.length,
          text: input.text,
          tokens: tokenize(input.text),
        },
      ],
    }));
  }

  lookup(_query: DictionaryQuery): Promise<Result<DictionaryLookup, LanguageError>> {
    this.calls.lookup += 1;
    return this.answer(() => this.lookupResult);
  }

  compileSnapshot(
    snapshotId: string,
    items: readonly VocabularyItem[],
  ): Promise<Result<CompiledSnapshotInfo, LanguageError>> {
    this.calls.compile += 1;
    return this.answer(() => ({ snapshotId, itemCount: items.length }));
  }

  classify(
    snapshotId: string,
    _mode: ClassificationMode,
    sentences: readonly SentenceTokens[],
  ): Promise<Result<ClassificationResult, LanguageError>> {
    this.calls.classify += 1;
    return this.answer(
      () =>
        this.classification ?? {
          snapshotId,
          validatorVersion: 'fake',
          sentences: sentences.map((sentence) => ({
            sentenceId: sentence.sentenceId,
            statuses: sentence.tokens.map((token) => ({
              tokenId: token.id,
              validation: { category: 'not-in-snapshot' as const },
            })),
          })),
        },
    );
  }

  dispose(): void {
    // Nothing to release.
  }

  private answer<T>(produce: () => T): Promise<Result<T, LanguageError>> {
    if (this.failWith !== null) {
      const failure = this.failWith;
      this.failWith = null;
      return Promise.resolve(err(failure));
    }
    return Promise.resolve(ok(produce()));
  }
}

const PUNCTUATION = new Set(['。', '、', '！', '？', '「', '」', '\n']);

/** Splits into runs of punctuation and runs of everything else. */
function tokenize(text: string): readonly Token[] {
  const tokens: Token[] = [];
  let start = 0;

  const push = (end: number, isPunctuation: boolean): void => {
    if (end <= start) {
      return;
    }
    const surface = text.slice(start, end);
    tokens.push({
      id: `t${String(tokens.length)}`,
      startUtf16: start,
      endUtf16: end,
      surface,
      dictionaryKeys: [surface],
      isPunctuation,
    });
    start = end;
  };

  for (let index = 0; index < text.length; index += 1) {
    if (PUNCTUATION.has(text[index])) {
      push(index, false);
      push(index + 1, true);
    }
  }
  push(text.length, false);
  return tokens;
}

/** Sequential ids, so tests can assert exact identity. */
export function sequentialIdGenerator(prefix = 'id'): { nextId: () => string } {
  let counter = 0;
  return {
    nextId: () => {
      counter += 1;
      return `${prefix}-${String(counter)}`;
    },
  };
}
