import type { Token } from '../reading/token';

export type EntityKind = 'name' | 'number' | 'date' | 'time' | 'symbol';

export interface EntityMatch {
  readonly startTokenIndex: number;
  readonly endTokenIndex: number;
  readonly kind: EntityKind;
}

const DIGITS = /^[0-9\uff10-\uff19]+$/;
const DATE_UNITS = new Set(['年', '月', '日']);
const TIME_UNITS = new Set(['時', '分', '秒', '時間']);
/**
 * Units that continue a numeric expression whatever the tokenizer calls them.
 *
 * IPADIC tags the same character differently by context: the month marker in a
 * date is an ordinary noun while the day marker is a counter suffix. Both
 * continue a date, so here the surface decides and the part of speech does not.
 */
const NUMERIC_UNITS = new Set([...DATE_UNITS, ...TIME_UNITS]);

function isNumeric(token: Token): boolean {
  return token.partOfSpeech === 'number' || DIGITS.test(token.surface);
}

/**
 * Recognizes the deterministic entity classes the specification allows to count
 * as readable: proper names the tokenizer marks, numbers, dates, times, and
 * non-punctuation symbols.
 *
 * Matches never overlap and are returned left to right, with the longest match
 * taken at each position so `\u4e09\u6708\u4e00\u65e5` is one date rather than two numbers.
 */
export function recognizeEntities(tokens: readonly Token[]): readonly EntityMatch[] {
  const matches: EntityMatch[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index];
    if (isNumeric(token)) {
      let end = index;
      let kind: EntityKind = 'number';
      while (end + 1 < tokens.length) {
        const next = tokens[end + 1];
        if (isNumeric(next)) {
          end += 1;
          continue;
        }
        if (
          next.partOfSpeech === 'counter' ||
          next.partOfSpeech === 'suffix' ||
          NUMERIC_UNITS.has(next.surface)
        ) {
          if (DATE_UNITS.has(next.surface)) {
            kind = 'date';
          } else if (TIME_UNITS.has(next.surface)) {
            kind = 'time';
          }
          end += 1;
          continue;
        }
        break;
      }
      matches.push({ startTokenIndex: index, endTokenIndex: end, kind });
      index = end + 1;
      continue;
    }
    if (token.partOfSpeech === 'proper-noun') {
      matches.push({ startTokenIndex: index, endTokenIndex: index, kind: 'name' });
      index += 1;
      continue;
    }
    if (token.partOfSpeech === 'symbol' && !token.isPunctuation) {
      matches.push({ startTokenIndex: index, endTokenIndex: index, kind: 'symbol' });
      index += 1;
      continue;
    }
    index += 1;
  }
  return matches;
}
