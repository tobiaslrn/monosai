import { describe, expect, it } from 'vitest';
import { applyDecisions } from '../../domain/ai/exception-review';
import type { Token } from '../../domain/reading/token';
import type { TokenValidation } from '../../domain/reading/validation';
import {
  applyApprovals,
  candidateKey,
  collectCandidates,
  markUnresolved,
  unknownSpans,
  type AnalyzedUnit,
} from './analyzed-story';

function token(unit: string, index: number, surface: string, lemma?: string): Token {
  return {
    id: `${unit}#${String(index)}`,
    startUtf16: 0,
    endUtf16: surface.length,
    surface,
    ...(lemma === undefined ? {} : { lemma }),
    dictionaryKeys: [],
    isPunctuation: false,
  };
}

const KNOWN: TokenValidation = { category: 'anki-exact', vocabularyItemIds: [] };
const UNKNOWN: TokenValidation = { category: 'unknown', reason: 'not-in-vocabulary' };

/** A unit whose tokens are classified by whether `unknown` names their surface. */
function unit(
  key: string,
  sentenceIndex: number | null,
  words: readonly (string | readonly [surface: string, lemma: string])[],
  unknown: readonly string[],
): AnalyzedUnit {
  const tokens = words.map((word, index) =>
    typeof word === 'string' ? token(key, index, word) : token(key, index, word[0], word[1]),
  );
  return {
    key,
    sentenceIndex,
    textJa: words.map((word) => (typeof word === 'string' ? word : word[0])).join(''),
    tokens,
    statuses: tokens.map((entry) => ({
      tokenId: entry.id,
      validation: unknown.includes(entry.surface) ? UNKNOWN : KNOWN,
    })),
  };
}

function reasonsOf(analyzed: AnalyzedUnit): string[] {
  return analyzed.statuses.map((status) =>
    status.validation.category === 'unknown'
      ? `unknown:${status.validation.reason}`
      : status.validation.category,
  );
}

describe('candidateKey', () => {
  it('joins the surface and the lemma, and an absent lemma is empty', () => {
    expect(candidateKey(token('s0', 0, '走った', '走る'))).toBe('走った|走る');
    expect(candidateKey(token('s0', 0, 'ほん'))).toBe('ほん|');
  });

  it('keeps two words that share a surface apart', () => {
    expect(candidateKey(token('s0', 0, 'はし', '橋'))).not.toBe(
      candidateKey(token('s0', 1, 'はし', '箸')),
    );
  });
});

describe('collectCandidates', () => {
  it('names each distinct unknown once, however often it occurs', () => {
    const units = [
      unit('s0', 0, ['ほん', 'ねこ', 'ほん'], ['ほん']),
      unit('s1', 1, ['くるま'], ['くるま']),
    ];

    const candidates = collectCandidates(units);

    expect(candidates.map((candidate) => candidate.id)).toEqual(['ほん|', 'くるま|']);
  });

  it('collects up to three distinct sentences of context, and no repeats', () => {
    const units = [
      unit('s0', 0, ['ほん', 'あ'], ['ほん']),
      unit('s1', 1, ['ほん', 'あ'], ['ほん']),
      unit('s2', 2, ['ほん', 'い'], ['ほん']),
      unit('s3', 3, ['ほん', 'う'], ['ほん']),
      unit('s4', 4, ['ほん', 'え'], ['ほん']),
    ];

    const [candidate] = collectCandidates(units);

    expect(candidate?.contextsJa).toEqual(['ほんあ', 'ほんい', 'ほんう']);
  });

  it('carries the lemma when there is one, and ignores readable words', () => {
    const candidates = collectCandidates([unit('s0', 0, [['走った', '走る'], 'ねこ'], ['走った'])]);

    expect(candidates).toEqual([
      { id: '走った|走る', surface: '走った', contextsJa: ['走ったねこ'], lemma: '走る' },
    ]);
  });
});

describe('applyApprovals', () => {
  const approved = (id: string) =>
    applyDecisions(
      [{ id, surface: id.split('|')[0] ?? id, contextsJa: [] }],
      [
        {
          candidateId: id,
          decision: 'approved',
          explanationEn: 'The premise names this word, and the policy allows words I name.',
        },
      ],
    );

  it('re-labels only the approved word, in every sentence it occurs', () => {
    const units = [
      unit('s0', 0, ['ほん', 'ねこ'], ['ほん']),
      unit('s1', 1, ['くるま', 'ほん'], ['くるま', 'ほん']),
    ];

    applyApprovals(units, approved('ほん|'));

    expect(reasonsOf(units[0]!)).toEqual(['policy-exception', 'anki-exact']);
    expect(reasonsOf(units[1]!)).toEqual(['unknown:not-in-vocabulary', 'policy-exception']);
  });

  it('leaves the statuses untouched when nothing was approved', () => {
    const units = [unit('s0', 0, ['ほん'], ['ほん'])];
    const before = units[0]!.statuses;

    applyApprovals(units, applyDecisions([], []));

    expect(units[0]!.statuses).toBe(before);
  });
});

describe('markUnresolved', () => {
  it('marks only the remaining words as lost to repair', () => {
    const units = [unit('s0', 0, ['ほん', 'くるま', 'ねこ'], ['ほん', 'くるま'])];

    markUnresolved(units, new Set(['くるま|']));

    expect(reasonsOf(units[0]!)).toEqual([
      'unknown:not-in-vocabulary',
      'unknown:unresolved-after-repair',
      'anki-exact',
    ]);
  });

  it('does nothing when nothing remains', () => {
    const units = [unit('s0', 0, ['ほん'], ['ほん'])];
    const before = units[0]!.statuses;

    markUnresolved(units, new Set());

    expect(units[0]!.statuses).toBe(before);
  });
});

describe('unknownSpans', () => {
  it('names each remaining unknown once per sentence, with the title as a null index', () => {
    const units = [
      unit('title', null, ['ほん'], ['ほん']),
      unit('s0', 0, ['ほん', 'ほん', 'くるま'], ['ほん', 'くるま']),
      unit('s1', 1, ['ほん'], ['ほん']),
    ];
    const candidates = collectCandidates(units);

    const spans = unknownSpans(units, candidates, new Set(['ほん|', 'くるま|']));

    expect(spans).toEqual([
      { sentenceIndex: null, surface: 'ほん' },
      { sentenceIndex: 0, surface: 'ほん' },
      { sentenceIndex: 0, surface: 'くるま' },
      { sentenceIndex: 1, surface: 'ほん' },
    ]);
  });

  it('skips unknowns that are no longer remaining', () => {
    const units = [unit('s0', 0, ['ほん', 'くるま'], ['ほん', 'くるま'])];

    const spans = unknownSpans(units, collectCandidates(units), new Set(['くるま|']));

    expect(spans).toEqual([{ sentenceIndex: 0, surface: 'くるま' }]);
  });
});
