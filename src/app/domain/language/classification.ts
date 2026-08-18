import type { Token } from '../reading/token';
import type { TokenStatusAssignment, TokenValidation } from '../reading/validation';
import { recognizeEntities, type EntityMatch } from './entity-recognition';
import type { StructuralBaselineMatcher } from './structural-baseline';
import type { VocabularyMatcher } from './vocabulary-matcher';

/**
 * Imported readings report `not-in-snapshot` for words the learner has not
 * reviewed; generated stories must report `unknown`, because an accepted story
 * may never contain a word outside its captured snapshot.
 */
export type ClassificationMode = 'imported' | 'generated';

export interface ClassificationContext {
  readonly mode: ClassificationMode;
  readonly vocabulary: VocabularyMatcher;
  readonly baseline: StructuralBaselineMatcher;
}

/**
 * No snapshot is an explicit state, not "everything is unknown": the reader must
 * say that vocabulary is not configured instead of marking every word red.
 */
export type ClassificationOutcome =
  | { readonly kind: 'vocabulary-not-configured' }
  | { readonly kind: 'classified'; readonly statuses: readonly TokenStatusAssignment[] };

function entityAt(entities: readonly EntityMatch[], index: number): EntityMatch | undefined {
  return entities.find(
    (entity) => index >= entity.startTokenIndex && index <= entity.endTokenIndex,
  );
}

function unmatchedValidation(mode: ClassificationMode): TokenValidation {
  return mode === 'imported'
    ? { category: 'not-in-snapshot' }
    : { category: 'unknown', reason: 'not-in-vocabulary' };
}

/**
 * Assigns one validation to every token, in the specified precedence order:
 *
 * 1. punctuation and symbol formatting;
 * 2. longest exact or normalized reviewed phrase;
 * 3. exact single-token reviewed form;
 * 4. normalized or inflected reviewed form;
 * 5. structural baseline;
 * 6. deterministic recognized entity;
 * 7. candidate unknown.
 *
 * Phrases are resolved before single tokens so a shorter reviewed entry can
 * never mask a longer reviewed phrase that literally occurs in the text.
 */
export function classifyTokens(
  tokens: readonly Token[],
  context: ClassificationContext,
): readonly TokenStatusAssignment[] {
  const entities = recognizeEntities(tokens);
  const statuses: TokenStatusAssignment[] = [];
  let index = 0;

  while (index < tokens.length) {
    const token = tokens[index];

    if (token.isPunctuation) {
      statuses.push({ tokenId: token.id, validation: { category: 'punctuation' } });
      index += 1;
      continue;
    }

    const phrase = context.vocabulary.findPhraseAt(tokens, index);
    if (phrase !== null) {
      for (let cursor = phrase.startTokenIndex; cursor <= phrase.endTokenIndex; cursor += 1) {
        statuses.push({
          tokenId: tokens[cursor].id,
          validation: {
            category: 'anki-phrase',
            vocabularyItemId: phrase.vocabularyItemId,
            tokenSpan: {
              startTokenIndex: phrase.startTokenIndex,
              endTokenIndex: phrase.endTokenIndex,
            },
          },
        });
      }
      index = phrase.endTokenIndex + 1;
      continue;
    }

    const exact = context.vocabulary.findExact(token);
    if (exact.length > 0) {
      statuses.push({
        tokenId: token.id,
        validation: { category: 'anki-exact', vocabularyItemIds: exact },
      });
      index += 1;
      continue;
    }

    const normalized = context.vocabulary.findNormalized(token);
    if (normalized !== null) {
      statuses.push({
        tokenId: token.id,
        validation: {
          category: 'anki-normalized',
          vocabularyItemIds: normalized.vocabularyItemIds,
          basis: normalized.basis,
        },
      });
      index += 1;
      continue;
    }

    const baselineEntry = context.baseline.match(token);
    if (baselineEntry !== null) {
      statuses.push({
        tokenId: token.id,
        validation: { category: 'structural-baseline', ruleId: baselineEntry.id },
      });
      index += 1;
      continue;
    }

    const entity = entityAt(entities, index);
    if (entity !== undefined) {
      statuses.push({
        tokenId: token.id,
        validation: { category: 'entity', entityKind: entity.kind },
      });
      index += 1;
      continue;
    }

    statuses.push({ tokenId: token.id, validation: unmatchedValidation(context.mode) });
    index += 1;
  }

  return statuses;
}

/**
 * Classifies against the active snapshot, or reports that vocabulary is not
 * configured when there is none.
 */
export function classifyAgainstSnapshot(
  tokens: readonly Token[],
  context: ClassificationContext | null,
): ClassificationOutcome {
  if (context === null) {
    return { kind: 'vocabulary-not-configured' };
  }
  return { kind: 'classified', statuses: classifyTokens(tokens, context) };
}
