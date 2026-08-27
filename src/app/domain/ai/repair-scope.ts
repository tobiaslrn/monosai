import type { StoryCandidate } from './story-request';
import type { UnknownSpan } from './text-generation-provider';
import { err, ok, type Result } from '../shared/result';

/**
 * Planning and splicing for a repair that rewrites only the sentences at fault.
 *
 * A whole-story rewrite is not needed to keep the result trustworthy: every
 * pass re-tokenizes, re-classifies, and re-reviews the returned Japanese from
 * scratch, so a spliced story is checked exactly as hard as a rewritten one.
 * What a whole-story rewrite does add is risk — forty untouched sentences get
 * forty fresh chances to acquire a new unknown, and catching that spends the
 * repair budget the original problem was supposed to use. Scoping the edit
 * keeps the blast radius at the sentences that actually failed.
 *
 * Structure repairs are deliberately not planned here: a wrong sentence count
 * is a property of the whole story and cannot be fixed one sentence at a time.
 */

/** The title's stand-in index, so one ordered list can carry it. */
export const TITLE_INDEX = -1;

export interface ScopedRepairEntry {
  /** The sentence's index, or `TITLE_INDEX` for the title. */
  readonly index: number;
  readonly textJa: string;
  /** Disallowed surfaces in this entry. Empty means the entry is context only. */
  readonly surfaces: readonly string[];
}

export interface ScopedRepairPatch {
  readonly titleJa: string | null;
  readonly replacements: readonly { readonly index: number; readonly textJa: string }[];
}

/**
 * The candidate's sentences in reading order, keeping their declared indexes.
 *
 * A scoped repair only runs when the structure already checked out, so the
 * declared index and the reading position are the same number — and it is the
 * declared one the patch has to answer with.
 */
function byIndex(candidate: StoryCandidate): readonly StoryCandidate['sentences'][number][] {
  return [...candidate.sentences].sort((left, right) => left.index - right.index);
}

/** How many untouched neighbours travel with each rewritten sentence. */
export const SCOPED_REPAIR_NEIGHBOURS = 1;

/**
 * The ordered window a scoped repair sends: every faulty entry, plus enough
 * untouched neighbours that a replacement can stay connected to what surrounds
 * it. Entries are deduplicated, so overlapping windows never send a sentence
 * twice.
 */
export function planScopedRepair(
  candidate: StoryCandidate,
  spans: readonly UnknownSpan[],
  neighbours: number = SCOPED_REPAIR_NEIGHBOURS,
): readonly ScopedRepairEntry[] {
  const sentences = byIndex(candidate);
  const surfacesByIndex = new Map<number, string[]>();
  for (const span of spans) {
    const index = span.sentenceIndex ?? TITLE_INDEX;
    const existing = surfacesByIndex.get(index) ?? [];
    if (!existing.includes(span.surface)) {
      existing.push(span.surface);
    }
    surfacesByIndex.set(index, existing);
  }

  const included = new Set<number>();
  for (const index of surfacesByIndex.keys()) {
    if (index === TITLE_INDEX) {
      included.add(TITLE_INDEX);
      continue;
    }
    for (let offset = -neighbours; offset <= neighbours; offset += 1) {
      const neighbour = index + offset;
      if (neighbour >= 0 && neighbour < sentences.length) {
        included.add(neighbour);
      }
    }
  }

  const entries: ScopedRepairEntry[] = [];
  if (included.has(TITLE_INDEX)) {
    entries.push({
      index: TITLE_INDEX,
      textJa: candidate.titleJa,
      surfaces: surfacesByIndex.get(TITLE_INDEX) ?? [],
    });
  }
  for (const sentence of sentences) {
    if (!included.has(sentence.index)) {
      continue;
    }
    entries.push({
      index: sentence.index,
      textJa: sentence.textJa,
      surfaces: surfacesByIndex.get(sentence.index) ?? [],
    });
  }
  return entries;
}

/** The entries the model must rewrite, in the order they were sent. */
export function scopedRepairTargets(
  entries: readonly ScopedRepairEntry[],
): readonly ScopedRepairEntry[] {
  return entries.filter((entry) => entry.surfaces.length > 0);
}

/**
 * Splices a patch into the candidate, or refuses it.
 *
 * The patch has to answer exactly what was asked: every target rewritten, no
 * index that was not a target, none twice, and a title only when the title was
 * one. Anything else is a reply to a different question, and accepting the
 * usable part of it would silently leave a disallowed word in the story.
 */
export function applyScopedRepair(
  candidate: StoryCandidate,
  entries: readonly ScopedRepairEntry[],
  patch: ScopedRepairPatch,
): Result<StoryCandidate, string> {
  const targets = scopedRepairTargets(entries);
  const wantsTitle = targets.some((target) => target.index === TITLE_INDEX);
  const expected = new Set(
    targets.filter((target) => target.index !== TITLE_INDEX).map((target) => target.index),
  );

  if (wantsTitle !== (patch.titleJa !== null && patch.titleJa.trim() !== '')) {
    return err('story-repair-title-mismatch');
  }

  const replaced = new Map<number, string>();
  for (const replacement of patch.replacements) {
    if (!expected.has(replacement.index)) {
      return err('story-repair-extra-sentence');
    }
    if (replaced.has(replacement.index)) {
      return err('story-repair-duplicate-sentence');
    }
    if (replacement.textJa.trim() === '') {
      return err('story-repair-blank-sentence');
    }
    replaced.set(replacement.index, replacement.textJa.trim());
  }
  if (replaced.size !== expected.size) {
    return err('story-repair-missing-sentence');
  }

  return ok({
    titleJa: patch.titleJa === null ? candidate.titleJa : patch.titleJa.trim(),
    sentences: byIndex(candidate).map((sentence) => ({
      index: sentence.index,
      textJa: replaced.get(sentence.index) ?? sentence.textJa,
    })),
  });
}
