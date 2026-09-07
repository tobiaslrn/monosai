import type { TranslationBatchRequest } from '../../../domain/ai/translation-request';
import {
  PROTOCOL_LAYER,
  asData,
  assemble,
  jsonConfigBlock,
  jsonDataBlock,
  type AssembledPrompt,
} from './prompt-layers';

/** Versioned task instructions for translating sentences into English. */
const TASK_LAYER = [
  'Role: Translate Japanese reading material into English for a beginner learning Japanese.',
  'Context: the learner reads the Japanese sentence and looks at your English beside it to check whether they understood. The translation is a reading aid, not a literary rendering.',
  'Goal: Translate every target sentence faithfully, preserving its meaning, tone, and register.',
  'Success criteria:',
  '- Return exactly one translation for each id listed in `targetIds`, and use every one of them exactly once.',
  '- Keep the Japanese sentence recoverable: follow its order of information wherever English allows it, and keep one Japanese sentence as one English sentence.',
  '- Produce natural English without notes, explanations, invented details, or word-for-word literalness. Where naturalness and recoverable order conflict, choose natural English.',
  '- Entries not listed in `targetIds` are context. Use them only to resolve ambiguity; never translate or return them.',
  '- Some context entries carry a `textEn` already produced for this same reading. Render names, invented terms, and recurring nouns exactly as those do.',
  '- `establishedRenderings`, when supplied, shows how a recurring Japanese surface was rendered earlier. Reuse that English rendering whenever the same surface has the same referent.',
  '- `frozenGlossary`, when supplied, is immutable. Apply a rendering only for the same meaning or referent and do not add or revise entries.',
  '- For an opening request, make the translations consistent with every glossary entry you return. Omit a candidate when no confident stable rendering can be established; an empty glossary is valid.',
  '- For a glossary-repair request, return no translations. Use the saved opening translations as constraints and do not contradict them.',
  'Output semantics: `translations` contains `{ id, textEn }`. Never modify, correct, or echo the Japanese.',
] as const;

const JSON_CONTRACT =
  'Return {"translations":[{"id":string,"textEn":string}],"glossary":[{"surfaceJa":string,"renderingEn":string}]}. Omit glossary only for tail requests. Include no other fields.';

/**
 * Ids on the wire are the entry's position in the window, not the sentence's
 * generated id.
 *
 * Ten UUIDs is real token spend on strings that carry no information, and every
 * character of one is a chance to mistranscribe an id — which rejects the whole
 * batch, not one sentence. Ordinals are short, ordered, and restored in the
 * adapter.
 */
export function translationWireId(index: number): string {
  return String(index);
}

export function buildTranslationPrompt(request: TranslationBatchRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);

  const targetIds = request.window.flatMap((entry, index) =>
    entry.targetId === null ? [] : [translationWireId(index)],
  );

  const user = assemble([
    jsonConfigBlock('translation requirements', {
      targetIds,
      ...(request.titleJa === undefined ? {} : { readingTitleJa: request.titleJa }),
      ...(request.registerPreference === undefined ? {} : { register: request.registerPreference }),
      ...(request.establishedRenderings === undefined
        ? {}
        : { establishedRenderings: request.establishedRenderings }),
      ...(request.glossaryCandidates === undefined
        ? {}
        : { glossaryCandidates: request.glossaryCandidates }),
      ...(request.frozenGlossary === undefined ? {} : { frozenGlossary: request.frozenGlossary }),
      ...(request.openingTranslations === undefined
        ? {}
        : { savedOpeningTranslations: request.openingTranslations }),
      requestKind: request.kind ?? 'tail',
    }),
    request.premiseJa === undefined ? '' : asData('story premise', request.premiseJa),
    jsonDataBlock(
      'reading window',
      request.window.map((entry, index) => ({
        id: translationWireId(index),
        textJa: entry.textJa,
        ...(entry.textEn === undefined ? {} : { textEn: entry.textEn }),
      })),
    ),
  ]);

  return { system, user, jsonContract: JSON_CONTRACT };
}
