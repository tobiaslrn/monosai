import { aiError, type AiError } from '../../domain/ai/ai-error';
import type { ExceptionCandidate, ExceptionReviewOutcome } from '../../domain/ai/exception-review';
import type { StoryCandidate } from '../../domain/ai/story-request';
import { orderedSentences } from '../../domain/ai/story-structure';
import type { UnknownSpan } from '../../domain/ai/text-generation-provider';
import type { LanguageError } from '../../domain/language/language-error';
import type { LanguageRuntime, SentenceTokens } from '../../domain/language/language-runtime';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment } from '../../domain/reading/validation';
import type { SnapshotId } from '../../domain/shared/ids';
import { defined } from '../../domain/shared/invariant';
import type { VocabularyClassificationService } from '../reading/vocabulary-classification.service';

/** Title and sentences carry the same analysis; only the title has no row. */
export interface AnalyzedUnit {
  readonly key: string;
  /** Null for the title, which is validated but is not a sentence. */
  readonly sentenceIndex: number | null;
  readonly textJa: string;
  readonly tokens: readonly Token[];
  statuses: readonly TokenStatusAssignment[];
}

/** What analysing a candidate needs, narrowed to the calls it makes. */
export interface AnalysisPorts {
  readonly runtime: Pick<LanguageRuntime, 'analyzeSentences'>;
  readonly classification: Pick<VocabularyClassificationService, 'classifyGenerated'>;
}

/**
 * Identity of one candidate unknown.
 *
 * Surface and lemma together, so two different words that happen to share a
 * surface are asked about separately. The separator is a character Japanese
 * text does not contain, so it cannot be produced by a surface itself.
 */
export function candidateKey(token: Token): string {
  return `${token.surface}|${token.lemma ?? ''}`;
}

/** Tokenizes the title and every sentence, then classifies them together. */
export async function analyzeStory(
  ports: AnalysisPorts,
  snapshotId: SnapshotId,
  candidate: StoryCandidate,
  signal: AbortSignal,
): Promise<
  | { readonly ok: true; readonly value: AnalyzedUnit[] }
  | { readonly ok: false; readonly error: AiError | LanguageError }
> {
  const sentences = orderedSentences(candidate);
  const texts = [candidate.titleJa, ...sentences];

  const tokenized = await ports.runtime.analyzeSentences(texts, signal);
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
    // Same length as `texts`, checked above.
    tokens: defined(tokenized.value[index], 'analyze tokenized unit').tokens,
    statuses: [],
  }));

  const input: readonly SentenceTokens[] = units.map((unit) => ({
    sentenceId: unit.key,
    tokens: unit.tokens,
  }));
  const classified = await ports.classification.classifyGenerated(snapshotId, input, signal);
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

/**
 * One candidate per distinct word, not per occurrence.
 *
 * The policy is asked about a word, and asking twice would let the same word
 * be approved in one sentence and refused in the next.
 */
export function collectCandidates(units: readonly AnalyzedUnit[]): readonly ExceptionCandidate[] {
  const byKey = new Map<string, ExceptionCandidate>();

  for (const unit of units) {
    const tokenById = new Map(unit.tokens.map((token) => [token.id, token]));
    for (const status of unit.statuses) {
      if (status.validation.category !== 'unknown') {
        continue;
      }
      const token = tokenById.get(status.tokenId);
      if (token === undefined) {
        continue;
      }
      const key = candidateKey(token);
      const existing = byKey.get(key);
      if (existing !== undefined) {
        if (!existing.contextsJa.includes(unit.textJa) && existing.contextsJa.length < 3) {
          byKey.set(key, { ...existing, contextsJa: [...existing.contextsJa, unit.textJa] });
        }
        continue;
      }
      byKey.set(key, {
        id: key,
        surface: token.surface,
        contextsJa: [unit.textJa],
        ...(token.lemma === undefined ? {} : { lemma: token.lemma }),
        ...(token.readingHiragana === undefined ? {} : { readingHiragana: token.readingHiragana }),
        ...(token.partOfSpeech === undefined ? {} : { partOfSpeech: token.partOfSpeech }),
      });
    }
  }

  return [...byKey.values()];
}

/** Replaces the statuses of approved words, and only those. */
export function applyApprovals(units: AnalyzedUnit[], review: ExceptionReviewOutcome): void {
  if (review.approvals.size === 0) {
    return;
  }
  for (const unit of units) {
    const tokenById = new Map(unit.tokens.map((token) => [token.id, token]));
    unit.statuses = unit.statuses.map((status) => {
      if (status.validation.category !== 'unknown') {
        return status;
      }
      const token = tokenById.get(status.tokenId);
      const approval = token === undefined ? undefined : review.approvals.get(candidateKey(token));
      return approval === undefined ? status : { tokenId: status.tokenId, validation: approval };
    });
  }
}

/**
 * Re-labels the words repair could not replace, on the way into the library.
 *
 * A story is saved with these still marked unknown rather than being thrown
 * away: the reader underlines them and the learner decides what to do about
 * them. The reason distinguishes them from a word that was merely never
 * looked at, so a saved story records that repair was spent and lost.
 */
export function markUnresolved(units: AnalyzedUnit[], remaining: ReadonlySet<string>): void {
  if (remaining.size === 0) {
    return;
  }
  for (const unit of units) {
    const tokenById = new Map(unit.tokens.map((token) => [token.id, token]));
    unit.statuses = unit.statuses.map((status) => {
      if (status.validation.category !== 'unknown') {
        return status;
      }
      const token = tokenById.get(status.tokenId);
      if (token === undefined || !remaining.has(candidateKey(token))) {
        return status;
      }
      return {
        tokenId: status.tokenId,
        validation: { category: 'unknown', reason: 'unresolved-after-repair' },
      };
    });
  }
}

/** Each remaining unknown once per sentence, in the form a repair request names it. */
export function unknownSpans(
  units: readonly AnalyzedUnit[],
  candidates: readonly ExceptionCandidate[],
  remaining: ReadonlySet<string>,
): readonly UnknownSpan[] {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const spans: UnknownSpan[] = [];
  const seen = new Set<string>();

  for (const unit of units) {
    const tokenById = new Map(unit.tokens.map((token) => [token.id, token]));
    for (const status of unit.statuses) {
      if (status.validation.category !== 'unknown') {
        continue;
      }
      const token = tokenById.get(status.tokenId);
      if (token === undefined) {
        continue;
      }
      const key = candidateKey(token);
      if (!remaining.has(key) || seen.has(`${unit.key}:${key}`)) {
        continue;
      }
      seen.add(`${unit.key}:${key}`);
      spans.push({
        sentenceIndex: unit.sentenceIndex,
        surface: byId.get(key)?.surface ?? token.surface,
      });
    }
  }
  return spans;
}
