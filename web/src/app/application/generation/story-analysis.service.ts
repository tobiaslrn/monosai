import { Injectable, inject } from '@angular/core';
import { aiError } from '../../domain/ai/ai-error';
import type { StoryCandidate } from '../../domain/ai/story-request';
import { orderedSentences } from '../../domain/ai/story-structure';
import type { SentenceTokens } from '../../domain/language/language-runtime';
import { defined } from '../../domain/shared/invariant';
import { VocabularyClassificationService } from '../reading/vocabulary-classification.service';
import { LANGUAGE_RUNTIME } from '../shared/language-tokens';
import type { CapturedContext } from './generation-context.service';
import type { GenerationFailure } from './generation-state';
import type { AnalyzedUnit } from './story-repair.service';

/** Reads a candidate story the way validation needs it: tokens and statuses per unit. */
@Injectable({ providedIn: 'root' })
export class StoryAnalysisService {
  private readonly runtime = inject(LANGUAGE_RUNTIME);
  private readonly classification = inject(VocabularyClassificationService);

  /** Tokenizes the title and every sentence, then classifies them together. */
  async analyze(
    candidate: StoryCandidate,
    context: CapturedContext,
    signal: AbortSignal,
  ): Promise<
    | { readonly ok: true; readonly value: AnalyzedUnit[] }
    | { readonly ok: false; readonly error: GenerationFailure }
  > {
    const sentences = orderedSentences(candidate);
    const texts = [candidate.titleJa, ...sentences];

    const tokenized = await this.runtime.analyzeSentences(texts, signal);
    if (!tokenized.ok) {
      return { ok: false, error: tokenized.error };
    }
    if (tokenized.value.length !== texts.length) {
      return {
        ok: false,
        error: aiError(
          'unknown',
          'story-generation',
          'The analysis returned the wrong number of sentences.',
          {
            detail: { issueCode: 'analysis-length-mismatch' },
          },
        ),
      };
    }

    const units: AnalyzedUnit[] = texts.map((textJa, index) => ({
      key: index === 0 ? 'title' : `s${String(index - 1)}`,
      sentenceIndex: index === 0 ? null : index - 1,
      textJa,
      // One analysis per text, as the length check above proves.
      tokens: defined(tokenized.value[index], 'sentence analysis').tokens,
      statuses: [],
    }));

    const input: readonly SentenceTokens[] = units.map((unit) => ({
      sentenceId: unit.key,
      tokens: unit.tokens,
    }));
    const classified = await this.classification.classifyGenerated(
      context.snapshot.id,
      input,
      signal,
    );
    if (!classified.ok) {
      return { ok: false, error: classified.error };
    }

    const byKey = new Map(
      classified.value.sentences.map((sentence) => [sentence.sentenceId, sentence.statuses]),
    );
    for (const unit of units) {
      unit.statuses = byKey.get(unit.key) ?? [];
    }
    return { ok: true, value: units };
  }
}
