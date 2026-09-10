import { normalizeLookupKey } from '../language/kana';
import { difficultyPercent } from '../anki/scheduling-signals';
import type { VocabularySourceId } from '../shared/ids';
import type { VocabularyEntry } from './vocabulary-repository';

export interface BrowseQuery {
  readonly search: string;
  readonly sourceId: VocabularySourceId | null;
  readonly difficulty: { readonly min: number; readonly max: number };
  readonly firstStudied: 'any' | 'last-7-days' | 'last-30-days' | 'last-90-days';
  readonly sort:
    | 'first-studied-desc'
    | 'first-studied-asc'
    | 'difficulty-desc'
    | 'difficulty-asc'
    | 'expression';
}

export const DEFAULT_BROWSE_QUERY: BrowseQuery = {
  search: '',
  sourceId: null,
  difficulty: { min: 0, max: 100 },
  firstStudied: 'any',
  sort: 'first-studied-desc',
};

const DAY_MS = 86_400_000;
const BROWSE_COLLATOR = new Intl.Collator('ja', { sensitivity: 'variant', usage: 'sort' });

/** Applies all browser filters without changing the input order or array. */
export function applyBrowseQuery(
  entries: readonly VocabularyEntry[],
  query: BrowseQuery,
  now: number,
): readonly VocabularyEntry[] {
  const search = normalizeLookupKey(query.search.trim()).toLowerCase();
  const filtered = entries.filter((entry) => {
    if (search !== '' && !matchesSearch(entry, search)) {
      return false;
    }
    if (query.sourceId !== null && !entry.sourceIds.includes(query.sourceId)) {
      return false;
    }
    if (!matchesDifficulty(entry, query.difficulty)) {
      return false;
    }
    return matchesFirstStudied(entry, query.firstStudied, now);
  });

  return [...filtered].sort((left, right) => compareEntries(left, right, query.sort));
}

function matchesSearch(entry: VocabularyEntry, search: string): boolean {
  return [
    entry.visibleExpression,
    entry.canonicalExpression,
    entry.readingHiragana,
    entry.meaning,
  ].some(
    (value) => value !== undefined && normalizeLookupKey(value).toLowerCase().includes(search),
  );
}

function matchesDifficulty(
  entry: VocabularyEntry,
  difficulty: { readonly min: number; readonly max: number },
): boolean {
  // The full 0–100 range means "any difficulty", including entries Anki did
  // not provide a difficulty for. A narrower range asks for measured values.
  if (difficulty.min === 0 && difficulty.max === 100) {
    return true;
  }
  const percent = difficultyPercent(entry.fsrsDifficulty);
  return percent !== null && percent >= difficulty.min && percent <= difficulty.max;
}

function matchesFirstStudied(
  entry: VocabularyEntry,
  firstStudied: BrowseQuery['firstStudied'],
  now: number,
): boolean {
  if (firstStudied === 'any') {
    return true;
  }
  if (entry.firstReviewedAt === undefined) {
    return false;
  }
  const days = firstStudied === 'last-7-days' ? 7 : firstStudied === 'last-30-days' ? 30 : 90;
  if (entry.firstReviewedPrecision === 'anki-day') {
    return entry.firstReviewedAt >= localDayStart(now, days - 1) && entry.firstReviewedAt <= now;
  }
  return entry.firstReviewedAt >= now - days * DAY_MS && entry.firstReviewedAt <= now;
}

function localDayStart(now: number, daysAgo: number): number {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function compareEntries(
  left: VocabularyEntry,
  right: VocabularyEntry,
  sort: BrowseQuery['sort'],
): number {
  const primary =
    sort === 'expression'
      ? compareStableText(left.canonicalExpression, right.canonicalExpression)
      : sort.startsWith('first-studied')
        ? compareOptionalNumber(left.firstReviewedAt, right.firstReviewedAt, sort.endsWith('desc'))
        : compareDifficulty(left, right, sort.endsWith('desc'));
  if (primary !== 0) {
    return primary;
  }
  const canonical = compareStableText(left.canonicalExpression, right.canonicalExpression);
  if (canonical !== 0) {
    return canonical;
  }
  const visible = compareStableText(left.visibleExpression, right.visibleExpression);
  if (visible !== 0) {
    return visible;
  }
  const meaning = compareStableText(left.meaning ?? '', right.meaning ?? '');
  return meaning !== 0 ? meaning : compareStableText(left.itemId, right.itemId);
}

/** Use one Japanese collation policy, then code-unit order to make ties total. */
function compareStableText(left: string, right: string): number {
  const collated = BROWSE_COLLATOR.compare(left, right);
  if (collated !== 0) {
    return collated;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareDifficulty(
  left: VocabularyEntry,
  right: VocabularyEntry,
  descending: boolean,
): number {
  return compareOptionalNumber(
    difficultyPercent(left.fsrsDifficulty) ?? undefined,
    difficultyPercent(right.fsrsDifficulty) ?? undefined,
    descending,
  );
}

/** Missing measurements sort after measured values in either direction. */
function compareOptionalNumber(
  left: number | undefined,
  right: number | undefined,
  descending: boolean,
): number {
  if (left === undefined && right === undefined) {
    return 0;
  }
  if (left === undefined) {
    return 1;
  }
  if (right === undefined) {
    return -1;
  }
  return descending ? right - left : left - right;
}
