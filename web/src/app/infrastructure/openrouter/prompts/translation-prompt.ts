import type { TranslationBatchRequest } from '../../../domain/ai/translation-request';
import type {
  FrozenGlossaryEntry,
  TranslationCandidate,
} from '../../../domain/enrichment/translation-plan';
import {
  PROTOCOL_LAYER,
  asConfig,
  asData,
  assemble,
  markdownDocument,
  markdownField,
  markdownHeading,
  markdownLineValue,
  type AssembledPrompt,
} from './prompt-layers';

/** Versioned task instructions for translating sentences into English. */
const TASK_LAYER = [
  'Role: Translate Japanese reading material into English for a beginner learning Japanese.',
  'Context: the learner reads the Japanese sentence and looks at your English beside it to check whether they understood. The translation is a reading aid, not a literary rendering.',
  'Goal: Translate every TARGET entry faithfully, preserving its meaning, tone, and register.',
  'Success criteria:',
  '- Return exactly one translation for each TARGET ordinal, and use every one of them exactly once.',
  '- Keep the Japanese sentence recoverable: follow its order of information wherever English allows it, and keep one Japanese sentence as one English sentence.',
  '- Produce natural English without notes, explanations, invented details, or word-for-word literalness. Where naturalness and recoverable order conflict, choose natural English.',
  '- CONTEXT entries are only for resolving ambiguity; never translate or return them.',
  '- A CONTEXT entry with existing English is a fixed rendering for this reading. Render names, invented terms, and recurring nouns exactly as it does.',
  '- Established renderings, when supplied, show how a recurring Japanese surface was rendered earlier. Reuse that English rendering whenever the same surface has the same referent.',
  '- The Frozen glossary, when supplied, is immutable. Apply a rendering only for the same meaning or referent and do not add or revise entries.',
  '- For an opening request, make the translations consistent with every glossary entry you return. Omit a candidate when no confident stable rendering can be established; an empty glossary is valid.',
  '- For a glossary-repair request, return no translations. Use the saved opening translations as constraints and do not contradict them.',
  'Output semantics: `translations` contains `{ id, textEn }`, where id is the TARGET ordinal. Never modify, correct, or echo the Japanese.',
] as const;

const OPENING_JSON_CONTRACT =
  'Return {"translations":[{"id":string,"textEn":string}],"glossary":[{"surfaceJa":string,"renderingEn":string}]}. Include no other fields.';
const TAIL_JSON_CONTRACT =
  'Return {"translations":[{"id":string,"textEn":string}]}. Include no other fields.';
const GLOSSARY_REPAIR_JSON_CONTRACT =
  'Return {"glossary":[{"surfaceJa":string,"renderingEn":string}]}. Include no other fields.';

/**
 * Ids on the wire are the entry's position in the window, not the sentence's
 * generated id. Domain ids therefore never become prompt data.
 */
export function translationWireId(index: number): string {
  return String(index);
}

export function translationJsonContract(kind: TranslationBatchRequest['kind'] | undefined): string {
  switch (kind ?? 'tail') {
    case 'opening':
      return OPENING_JSON_CONTRACT;
    case 'glossary-repair':
      return GLOSSARY_REPAIR_JSON_CONTRACT;
    case 'tail':
      return TAIL_JSON_CONTRACT;
  }
}

export function buildTranslationPrompt(request: TranslationBatchRequest): AssembledPrompt {
  const kind = request.kind ?? 'tail';
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const user = assemble([
    asConfig('translation settings', translationSettings(request, kind)),
    request.premiseJa === undefined || request.premiseJa === ''
      ? ''
      : asData(
          'story premise',
          markdownDocument([
            markdownHeading(1, 'Story premise'),
            markdownLineValue(request.premiseJa),
          ]),
        ),
    request.frozenGlossary === undefined || request.frozenGlossary.length === 0
      ? ''
      : asConfig('frozen glossary', frozenGlossarySection(request.frozenGlossary)),
    request.establishedRenderings === undefined || request.establishedRenderings.length === 0
      ? ''
      : asData(
          'established renderings',
          establishedRenderingsSection(request.establishedRenderings),
        ),
    request.glossaryCandidates === undefined || request.glossaryCandidates.length === 0
      ? ''
      : asData('glossary candidates', glossaryCandidatesSection(request.glossaryCandidates)),
    request.openingTranslations === undefined || request.openingTranslations.length === 0
      ? ''
      : asData(
          'saved opening translations',
          openingTranslationsSection(request.openingTranslations),
        ),
    asData('reading window', readingWindowSection(request)),
  ]);

  return { system, user, jsonContract: translationJsonContract(request.kind) };
}

function translationSettings(
  request: TranslationBatchRequest,
  kind: Exclude<TranslationBatchRequest['kind'], undefined> | 'tail',
): string {
  return markdownDocument([
    markdownHeading(1, 'Translation'),
    markdownField('Request kind', kind),
    ...(request.registerPreference === undefined
      ? []
      : [markdownField('Register', request.registerPreference)]),
    ...(request.titleJa === undefined
      ? []
      : [
          markdownDocument([
            markdownHeading(2, 'Reading title'),
            markdownLineValue(request.titleJa),
          ]),
        ]),
  ]);
}

function frozenGlossarySection(entries: readonly FrozenGlossaryEntry[]): string {
  return markdownDocument([
    markdownHeading(1, 'Frozen glossary'),
    entries
      .map((entry) => markdownLineValue(`${entry.surfaceJa} → ${entry.renderingEn}`))
      .join('\n'),
  ]);
}

function establishedRenderingsSection(
  entries: readonly {
    readonly surfaceJa: string;
    readonly exampleJa: string;
    readonly exampleEn: string;
  }[],
): string {
  const renderings = entries.map((entry) =>
    markdownDocument([
      markdownHeading(2, `${entry.surfaceJa} → ${entry.exampleEn}`),
      markdownField('Japanese example', entry.exampleJa),
      markdownField('English example', entry.exampleEn),
    ]),
  );
  return markdownDocument([markdownHeading(1, 'Established renderings'), ...renderings]);
}

function glossaryCandidatesSection(entries: readonly TranslationCandidate[]): string {
  const candidates = entries.map((candidate, index) =>
    markdownDocument([
      markdownHeading(2, `[${String(index)}] ${candidate.surfaceJa}`),
      ...(candidate.readingHiragana === undefined
        ? []
        : [markdownField('Reading', candidate.readingHiragana)]),
      markdownField('Kind', candidate.kind === 'proper-noun' ? 'proper noun' : 'recurring term'),
      markdownDocument([
        markdownHeading(3, 'Examples'),
        candidate.examples.map((example) => markdownLineValue(example.textJa)).join('\n'),
      ]),
    ]),
  );
  return markdownDocument([markdownHeading(1, 'Glossary candidates'), ...candidates]);
}

function openingTranslationsSection(
  entries: readonly { readonly textJa: string; readonly textEn: string }[],
): string {
  const translations = entries.map((entry, index) =>
    markdownDocument([
      markdownHeading(2, `Translation ${String(index + 1)}`),
      markdownField('Japanese', entry.textJa),
      markdownField('English', entry.textEn),
    ]),
  );
  return markdownDocument([markdownHeading(1, 'Saved opening translations'), ...translations]);
}

function readingWindowSection(request: TranslationBatchRequest): string {
  const entries = request.window.map((entry, index) => {
    const kind = entry.targetId === null ? 'CONTEXT' : 'TARGET';
    return markdownDocument([
      `[${translationWireId(index)}] ${kind}: ${markdownLineValue(entry.textJa)}`,
      ...(entry.textEn === undefined ? [] : [markdownField('English', entry.textEn)]),
    ]);
  });
  return markdownDocument([markdownHeading(1, 'Reading window'), ...entries]);
}
