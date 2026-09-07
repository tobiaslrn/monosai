import { estimateTokens, FIXED_PROMPT_OVERHEAD_TOKENS } from '../ai/context-budget';
import type { TranslationWindowEntry } from '../ai/translation-request';
import type { Sentence } from '../reading/text-hierarchy';
import type { TokenAnalysis } from '../reading/token';
import type { Hasher } from '../shared/hashing';
import { hashCanonical } from '../shared/hashing';
import type { ReadingId, SentenceId } from '../shared/ids';
import { err, ok, type Result } from '../shared/result';

export const TRANSLATION_CANDIDATE_POLICY_VERSION = 'translation-candidates/1';
export const TRANSLATION_CONTEXT_POLICY_VERSION = 'translation-context/1';
export const MAX_TRANSLATION_CANDIDATES = 20;
export const MAX_CANDIDATE_EXAMPLES = 2;
export const MAX_CANDIDATE_EXAMPLE_CHARS = 240;
export const MAX_CANDIDATE_CONTEXT_CHARS = 6_000;
export const TRANSLATION_INPUT_BUDGET_TOKENS = 12_000;
export const MAX_GLOSSARY_RENDERING_CHARS = 160;

export interface TranslationCandidateExample {
  readonly sentenceId: SentenceId;
  readonly textJa: string;
}

export interface TranslationCandidate {
  readonly surfaceJa: string;
  readonly readingHiragana?: string;
  readonly kind: 'proper-noun' | 'recurring-term';
  readonly examples: readonly TranslationCandidateExample[];
}

export interface FrozenGlossaryEntry {
  readonly surfaceJa: string;
  readonly renderingEn: string;
}

interface TranslationPlanBase {
  readonly readingId: ReadingId;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly title: string;
  readonly premise: string;
  readonly register: string;
  readonly contextFingerprint: string;
  readonly sourceContentFingerprint: string;
  readonly candidatePolicyVersion: string;
  readonly contextPolicyVersion: string;
  readonly candidates: readonly TranslationCandidate[];
  readonly inputFingerprint: string;
  readonly createdAt: number;
}

export interface PendingTranslationPlan extends TranslationPlanBase {
  readonly state: 'opening-pending';
}

export interface RepairTranslationPlan extends TranslationPlanBase {
  readonly state: 'glossary-repair-required';
  readonly provisionalOpeningSentenceIds: readonly SentenceId[];
}

export interface ReadyTranslationPlan extends TranslationPlanBase {
  readonly state: 'ready';
  readonly glossary: readonly FrozenGlossaryEntry[];
  readonly planFingerprint: string;
}

export type TranslationPlan = PendingTranslationPlan | RepairTranslationPlan | ReadyTranslationPlan;

export interface TranslationPlanInput {
  readonly readingId: ReadingId;
  readonly modelId: string;
  readonly promptVersion: string;
  readonly title: string;
  readonly premise: string;
  readonly register: string;
  readonly sentences: readonly Sentence[];
  readonly analyses: readonly TokenAnalysis[];
}

export function selectTranslationCandidates(
  sentences: readonly Sentence[],
  analyses: readonly TokenAnalysis[],
): readonly TranslationCandidate[] {
  const ordered = [...sentences].sort((a, b) => a.positionInReading - b.positionInReading);
  const sentenceById = new Map(ordered.map((sentence) => [sentence.id, sentence]));
  const occurrences = new Map<
    string,
    {
      readonly surfaceJa: string;
      readingHiragana?: string;
      proper: boolean;
      count: number;
      first: number;
      examples: TranslationCandidateExample[];
    }
  >();

  for (const analysis of [...analyses].sort(
    (a, b) =>
      (sentenceById.get(a.sentenceId)?.positionInReading ?? Number.MAX_SAFE_INTEGER) -
      (sentenceById.get(b.sentenceId)?.positionInReading ?? Number.MAX_SAFE_INTEGER),
  )) {
    const sentence = sentenceById.get(analysis.sentenceId);
    if (sentence === undefined) continue;
    for (const token of analysis.tokens) {
      if (token.isPunctuation || token.surface.trim() === '') continue;
      if (token.partOfSpeech !== 'proper-noun' && token.partOfSpeech !== 'noun') continue;
      const current = occurrences.get(token.surface) ?? {
        surfaceJa: token.surface,
        proper: false,
        count: 0,
        first: sentence.positionInReading,
        examples: [],
      };
      current.count += 1;
      current.proper ||= token.partOfSpeech === 'proper-noun';
      current.readingHiragana ??= token.readingHiragana;
      if (
        current.examples.length < MAX_CANDIDATE_EXAMPLES &&
        sentence.japaneseText.length <= MAX_CANDIDATE_EXAMPLE_CHARS &&
        !current.examples.some((example) => example.sentenceId === sentence.id)
      ) {
        current.examples.push({ sentenceId: sentence.id, textJa: sentence.japaneseText });
      }
      occurrences.set(token.surface, current);
    }
  }

  const ranked = [...occurrences.values()]
    .filter((entry) => entry.proper || entry.count >= 2)
    .sort(
      (a, b) =>
        Number(b.proper) - Number(a.proper) ||
        b.count - a.count ||
        a.first - b.first ||
        a.surfaceJa.localeCompare(b.surfaceJa, 'ja'),
    );

  const selected: TranslationCandidate[] = [];
  let contextChars = 0;
  for (const entry of ranked) {
    if (selected.length >= MAX_TRANSLATION_CANDIDATES) break;
    const candidate: TranslationCandidate = {
      surfaceJa: entry.surfaceJa,
      ...(entry.readingHiragana === undefined ? {} : { readingHiragana: entry.readingHiragana }),
      kind: entry.proper ? 'proper-noun' : 'recurring-term',
      examples: entry.examples,
    };
    const size = JSON.stringify(candidate).length;
    if (contextChars + size > MAX_CANDIDATE_CONTEXT_CHARS) continue;
    selected.push(candidate);
    contextChars += size;
  }
  return selected;
}

export function createPendingTranslationPlan(
  hasher: Hasher,
  input: TranslationPlanInput,
  createdAt: number,
): PendingTranslationPlan {
  const sentences = [...input.sentences].sort((a, b) => a.positionInReading - b.positionInReading);
  const candidates = selectTranslationCandidates(sentences, input.analyses);
  const sourceContentFingerprint = hashCanonical(hasher, 'translation-source', {
    sentences: sentences.map((sentence) => ({
      id: sentence.id,
      contentHash: sentence.contentHash,
      position: sentence.positionInReading,
    })),
  });
  const contextFingerprint = hashCanonical(hasher, 'translation-story-context', {
    title: input.title,
    premise: input.premise,
    register: input.register,
  });
  const identity = {
    readingId: input.readingId,
    modelId: input.modelId,
    promptVersion: input.promptVersion,
    contextFingerprint,
    sourceContentFingerprint,
    candidatePolicyVersion: TRANSLATION_CANDIDATE_POLICY_VERSION,
    contextPolicyVersion: TRANSLATION_CONTEXT_POLICY_VERSION,
    candidates: candidates.map((candidate) => ({
      surfaceJa: candidate.surfaceJa,
      readingHiragana: candidate.readingHiragana,
      kind: candidate.kind,
      examples: candidate.examples.map((example) => ({
        sentenceId: example.sentenceId,
        textJa: example.textJa,
      })),
    })),
  } as const;
  return {
    state: 'opening-pending',
    ...identity,
    title: input.title,
    premise: input.premise,
    register: input.register,
    inputFingerprint: hashCanonical(hasher, 'translation-plan-input', identity),
    createdAt,
  };
}

export function freezeTranslationPlan(
  hasher: Hasher,
  plan: PendingTranslationPlan | RepairTranslationPlan,
  glossary: readonly FrozenGlossaryEntry[],
): ReadyTranslationPlan {
  const stableGlossary = [...glossary].sort((a, b) => a.surfaceJa.localeCompare(b.surfaceJa, 'ja'));
  const { state: _state, ...base } = plan;
  const withoutRepair =
    'provisionalOpeningSentenceIds' in base
      ? (({ provisionalOpeningSentenceIds: _ids, ...rest }) => rest)(base)
      : base;
  return {
    ...withoutRepair,
    state: 'ready',
    glossary: stableGlossary,
    planFingerprint: hashCanonical(hasher, 'translation-plan', {
      inputFingerprint: plan.inputFingerprint,
      glossary: stableGlossary.map((entry) => ({
        surfaceJa: entry.surfaceJa,
        renderingEn: entry.renderingEn,
      })),
    }),
  };
}

export function validateGlossary(
  candidates: readonly TranslationCandidate[],
  entries: readonly FrozenGlossaryEntry[],
): Result<readonly FrozenGlossaryEntry[], string> {
  if (entries.length > MAX_TRANSLATION_CANDIDATES) return err('oversized');
  const allowed = new Set(candidates.map((candidate) => candidate.surfaceJa));
  const seen = new Set<string>();
  const accepted: FrozenGlossaryEntry[] = [];
  for (const entry of entries) {
    if (!allowed.has(entry.surfaceJa)) return err('invented-surface');
    if (seen.has(entry.surfaceJa)) return err('duplicate-surface');
    const renderingEn = entry.renderingEn.trim();
    if (renderingEn === '') return err('blank-rendering');
    if (renderingEn.length > MAX_GLOSSARY_RENDERING_CHARS) return err('oversized-rendering');
    seen.add(entry.surfaceJa);
    accepted.push({ surfaceJa: entry.surfaceJa, renderingEn });
  }
  return ok(accepted);
}

export function selectOpeningSentences(
  sentences: readonly Sentence[],
  suppliedContextTokens = 0,
): readonly Sentence[] {
  const ordered = [...sentences].sort((a, b) => a.positionInReading - b.positionInReading);
  if (ordered.length <= 3) return fitTranslationBudget(ordered, suppliedContextTokens);
  const firstParagraph = ordered.filter(
    (sentence) => sentence.paragraphId === ordered[0].paragraphId,
  );
  const selected =
    firstParagraph.length >= 3 && firstParagraph.length <= 5 ? firstParagraph : ordered.slice(0, 3);
  return fitTranslationBudget(selected, suppliedContextTokens);
}

function fitTranslationBudget(
  sentences: readonly Sentence[],
  suppliedContextTokens: number,
): readonly Sentence[] {
  const selected: Sentence[] = [];
  let tokens = FIXED_PROMPT_OVERHEAD_TOKENS + suppliedContextTokens;
  for (const sentence of sentences) {
    const next = estimateTokens(JSON.stringify({ id: sentence.id, textJa: sentence.japaneseText }));
    if (selected.length > 0 && tokens + next > TRANSLATION_INPUT_BUDGET_TOKENS) break;
    if (tokens + next > TRANSLATION_INPUT_BUDGET_TOKENS) return [];
    selected.push(sentence);
    tokens += next;
  }
  return selected;
}

/** Stable passage windows are based on source positions, never on the retry target subset. */
export function translationPassageWindow(
  sentences: readonly Sentence[],
  position: number,
  groupSize = 10,
): readonly Sentence[] {
  const ordered = [...sentences].sort((a, b) => a.positionInReading - b.positionInReading);
  const groupStart = Math.floor(position / groupSize) * groupSize;
  return ordered.slice(
    Math.max(0, groupStart - 1),
    Math.min(ordered.length, groupStart + groupSize + 1),
  );
}

export function translationWindowEntries(
  passage: readonly Sentence[],
  targetIds: ReadonlySet<SentenceId>,
): readonly TranslationWindowEntry[] {
  return passage.map((sentence) => ({
    textJa: sentence.japaneseText,
    targetId: targetIds.has(sentence.id) ? sentence.id : null,
  }));
}

export function passageContextFingerprint(hasher: Hasher, passage: readonly Sentence[]): string {
  return hashCanonical(hasher, 'translation-passage-context', {
    policyVersion: TRANSLATION_CONTEXT_POLICY_VERSION,
    sentences: passage.map((sentence) => ({
      position: sentence.positionInReading,
      contentHash: sentence.contentHash,
    })),
  });
}
