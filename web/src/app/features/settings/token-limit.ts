import { isValidStoryTokenBudget, MIN_STORY_TOKEN_BUDGET } from '../../domain/settings/settings';
import { formatCount } from '../../domain/shared/locale';

/** A whole number written plainly or grouped (`16,384`); NaN for anything else. */
export function parseTokenLimit(text: string): number {
  const digits = text.replace(/[,\s]/g, '');
  return /^\d+$/.test(digits) ? Number(digits) : Number.NaN;
}

/** What a token limit row says: what it is now, and the most it may be. */
export function tokenLimitSummary(value: number, max: number): string {
  return `${formatCount(value)} · up to ${formatCount(max)}`;
}

/** Why an entry cannot be a token limit, as the one line under its field, or null when it can. */
export function tokenLimitProblem(entry: string, max: number): string | null {
  return isValidStoryTokenBudget(parseTokenLimit(entry), max)
    ? null
    : `Use a whole number between ${formatCount(MIN_STORY_TOKEN_BUDGET)} and ${formatCount(max)}.`;
}

/** The hint under the field: the most the model allows. */
export function tokenLimitHint(max: number): string {
  return `Up to ${formatCount(max)} tokens`;
}
