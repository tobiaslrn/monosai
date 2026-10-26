import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { aiError } from '../../domain/ai/ai-error';
import { applyDecisions, type ExceptionDecision } from '../../domain/ai/exception-review';
import { PROMPT_VERSIONS } from '../../domain/ai/prompt-versions';
import type { StoryGenerationRequest } from '../../domain/ai/story-request';
import type { StructureIssue } from '../../domain/ai/story-structure';
import type { TextTaskConfig } from '../../domain/ai/text-generation-provider';
import type { Token } from '../../domain/reading/token';
import type { TokenStatusAssignment, TokenValidation } from '../../domain/reading/validation';
import { snapshotId } from '../../domain/shared/ids';
import { err, ok } from '../../domain/shared/result';
import { StubTextProvider, modelTest } from '../../../testing/ai-fakes';
import { story, strictStory } from '../../../testing/generation-fakes';
import { TEXT_GENERATION_PROVIDER } from '../shared/ai-tokens';
import {
  RepairMemory,
  StoryRepairService,
  candidateKey,
  type AnalyzedUnit,
  type StoryRepairInput,
} from './story-repair.service';

const CONFIG: TextTaskConfig = { modelId: 'vendor/text-model', structuredOutput: 'native-schema' };

const REQUEST: StoryGenerationRequest = {
  form: 'micro',
  requestedSentenceCount: 5,
  premise: 'ねこが一日をすごす話。',
  allowedVocabulary: ['ねこ'],
  suggestedVocabulary: [],
  structuralBaseline: [],
  grammarGuidance: '',
  registerPreference: 'either',
  snapshotId: snapshotId('00000000-0000-4000-8000-00000000aaaa'),
  grammarProfileHash: 'profile-hash',
  promptVersion: 'story/test',
};

const KNOWN: TokenValidation = { category: 'structural-baseline', ruleId: 'particle' };
const UNKNOWN: TokenValidation = { category: 'unknown', reason: 'not-in-vocabulary' };

function token(id: string, surface: string, lemma?: string): Token {
  return {
    id,
    startUtf16: 0,
    endUtf16: surface.length,
    surface,
    ...(lemma === undefined ? {} : { lemma }),
    dictionaryKeys: [],
    isPunctuation: false,
  };
}

/** A unit whose tokens carry the given validations, in order. */
function unit(
  key: string,
  sentenceIndex: number | null,
  textJa: string,
  words: readonly (readonly [Token, TokenValidation])[],
): AnalyzedUnit {
  const statuses: TokenStatusAssignment[] = words.map(([word, validation]) => ({
    tokenId: word.id,
    validation,
  }));
  return { key, sentenceIndex, textJa, tokens: words.map(([word]) => word), statuses };
}

const LIBRARY = token('s1-0', '図書館', '図書館');
const STATION = token('s2-0', '駅', '駅');

describe('StoryRepairService', () => {
  let provider: StubTextProvider;
  let service: StoryRepairService;

  beforeEach(() => {
    TestBed.resetTestingModule();
    provider = new StubTextProvider(ok(modelTest()));
    TestBed.configureTestingModule({
      providers: [StoryRepairService, { provide: TEXT_GENERATION_PROVIDER, useValue: provider }],
    });
    service = TestBed.inject(StoryRepairService);
  });

  function input(overrides: Partial<StoryRepairInput> = {}): StoryRepairInput {
    const units = overrides.units ?? [
      unit('title', null, 'ねこの一日', [[token('t-0', 'ねこ'), KNOWN]]),
      unit('s1', 1, 'ねこは図書館へいきます。', [[LIBRARY, UNKNOWN]]),
    ];
    const candidates = overrides.candidates ?? service.collectCandidates(units);
    return {
      request: REQUEST,
      candidate: strictStory(),
      units,
      candidates,
      remaining: new Set(candidates.map((candidate) => candidate.id)),
      structureIssues: [],
      attempt: 1,
      taskConfig: CONFIG,
      memory: new RepairMemory(),
      ...overrides,
    };
  }

  describe('collectCandidates', () => {
    it('asks about each distinct word once, however often it occurs', () => {
      const again = token('s3-0', '図書館', '図書館');
      const units = [
        unit('s1', 1, 'ねこは図書館へいきます。', [[LIBRARY, UNKNOWN]]),
        unit('s3', 3, '図書館はおおきいです。', [[again, UNKNOWN]]),
      ];

      const candidates = service.collectCandidates(units);

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toMatchObject({ id: '図書館|図書館', surface: '図書館' });
      expect(candidates[0].contextsJa).toEqual([
        'ねこは図書館へいきます。',
        '図書館はおおきいです。',
      ]);
    });

    it('keeps at most three distinct contexts for a word', () => {
      const units = [1, 2, 3, 4].map((index) =>
        unit(`s${String(index)}`, index, `図書館${String(index)}`, [
          [token(`s${String(index)}-0`, '図書館', '図書館'), UNKNOWN],
        ]),
      );

      expect(service.collectCandidates(units)[0].contextsJa).toHaveLength(3);
    });

    it('separates two words that share a surface but not a lemma', () => {
      const units = [
        unit('s1', 1, 'あ', [[token('a', 'いい', '良い'), UNKNOWN]]),
        unit('s2', 2, 'い', [[token('b', 'いい', '言う'), UNKNOWN]]),
      ];

      expect(service.collectCandidates(units).map((candidate) => candidate.id)).toEqual([
        'いい|良い',
        'いい|言う',
      ]);
    });

    it('leaves out words that are already readable', () => {
      const units = [unit('s1', 1, 'ねこ', [[token('a', 'ねこ'), KNOWN]])];

      expect(service.collectCandidates(units)).toEqual([]);
    });
  });

  describe('applyApprovals', () => {
    it('replaces the status of an approved word and no other', () => {
      const units = [
        unit('s1', 1, 'ねこは図書館へ。', [
          [LIBRARY, UNKNOWN],
          [STATION, UNKNOWN],
        ]),
      ];
      const decision: ExceptionDecision = {
        candidateId: '図書館|図書館',
        decision: 'approved',
        explanationEn: 'The premise names this place, and the policy allows places I name.',
      };
      const review = applyDecisions(service.collectCandidates(units), [decision]);

      service.applyApprovals(units, review);

      expect(units[0].statuses[0].validation.category).toBe('policy-exception');
      expect(units[0].statuses[1].validation).toEqual(UNKNOWN);
    });

    it('changes nothing when nothing was approved', () => {
      const units = [unit('s1', 1, '図書館', [[LIBRARY, UNKNOWN]])];
      const before = units[0].statuses;

      service.applyApprovals(units, applyDecisions(service.collectCandidates(units), []));

      expect(units[0].statuses).toBe(before);
    });
  });

  describe('markUnresolved', () => {
    it('marks the words repair could not replace, and only those', () => {
      const units = [
        unit('s1', 1, 'ねこは図書館へ。', [
          [LIBRARY, UNKNOWN],
          [STATION, UNKNOWN],
        ]),
      ];

      service.markUnresolved(units, new Set([candidateKey(LIBRARY)]));

      expect(units[0].statuses[0].validation).toEqual({
        category: 'unknown',
        reason: 'unresolved-after-repair',
      });
      expect(units[0].statuses[1].validation).toEqual(UNKNOWN);
    });

    it('changes nothing when every word was resolved', () => {
      const units = [unit('s1', 1, '図書館', [[LIBRARY, UNKNOWN]])];
      const before = units[0].statuses;

      service.markUnresolved(units, new Set());

      expect(units[0].statuses).toBe(before);
    });
  });

  describe('repair', () => {
    it('tells the provider exactly which word must go, and where', async () => {
      provider.repairQueue.push(ok(strictStory()));

      const result = await service.repair(input(), new AbortController().signal);

      expect(result).toEqual(ok(strictStory()));
      // The reason is stated once by the repair prompt, not repeated per span.
      expect(provider.repairRequests[0].unknownSpans).toEqual([
        { sentenceIndex: 1, surface: '図書館' },
      ]);
      expect(provider.repairRequests[0].previouslyAttempted).toEqual([]);
    });

    it('sends the original request, the candidate, the attempt, and the repair prompt version', async () => {
      provider.repairQueue.push(ok(strictStory()));
      const candidate = story(['ねこは図書館へいきます。']);
      const issue: StructureIssue = {
        code: 'sentence-empty',
        severity: 'format',
        message: 'A sentence is empty.',
      };

      await service.repair(
        input({ candidate, attempt: 2, structureIssues: [issue] }),
        new AbortController().signal,
      );

      expect(provider.repairRequests[0]).toMatchObject({
        original: REQUEST,
        candidate,
        structureIssues: [issue],
        attempt: 2,
        promptVersion: PROMPT_VERSIONS.repair,
      });
      expect(provider.configs[0]).toBe(CONFIG);
    });

    it('names the title with no sentence index', async () => {
      const titleWord = token('t-0', '図書館', '図書館');
      const units = [unit('title', null, '図書館', [[titleWord, UNKNOWN]])];
      provider.repairQueue.push(ok(strictStory()));

      await service.repair(input({ units }), new AbortController().signal);

      expect(provider.repairRequests[0].unknownSpans).toEqual([
        { sentenceIndex: null, surface: '図書館' },
      ]);
    });

    it('names a word once per sentence, and leaves out words that are not outstanding', async () => {
      const second = token('s1-1', '図書館', '図書館');
      const units = [
        unit('s1', 1, '図書館と図書館と駅', [
          [LIBRARY, UNKNOWN],
          [second, UNKNOWN],
          [token('s1-2', '駅', '駅'), UNKNOWN],
        ]),
        unit('s2', 2, '図書館', [[token('s2-1', '図書館', '図書館'), UNKNOWN]]),
      ];
      provider.repairQueue.push(ok(strictStory()));

      await service.repair(
        input({ units, remaining: new Set([candidateKey(LIBRARY)]) }),
        new AbortController().signal,
      );

      expect(provider.repairRequests[0].unknownSpans).toEqual([
        { sentenceIndex: 1, surface: '図書館' },
        { sentenceIndex: 2, surface: '図書館' },
      ]);
    });

    it('names a surface an earlier repair in the same run already failed to remove', async () => {
      provider.repairQueue.push(ok(strictStory()), ok(strictStory()));
      const memory = new RepairMemory();

      await service.repair(input({ memory }), new AbortController().signal);
      await service.repair(input({ memory, attempt: 2 }), new AbortController().signal);

      expect(provider.repairRequests[0].previouslyAttempted).toEqual([]);
      expect(provider.repairRequests[1].previouslyAttempted).toEqual(['図書館']);
    });

    it('returns the provider failure unchanged', async () => {
      const failure = aiError('provider-unavailable', 'story-repair', 'The provider is down.');
      provider.repairQueue.push(err(failure));

      const result = await service.repair(input(), new AbortController().signal);

      expect(result).toEqual(err(failure));
    });
  });
});
