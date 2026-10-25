import { err, ok, type Result } from '../shared/result';
import type { PlotFrame } from './story-direction';
import { MAX_PREMISE_LENGTH, countCodePoints } from './story-request';

/** How many earlier stories a plot request is told to stay away from. */
export const RECENT_STORY_COUNT = 10;

/**
 * How much of the allowed vocabulary a plot request carries.
 *
 * Enough to show the plot model what kind of words the story will be written
 * in, so it does not draft something the learner's vocabulary cannot tell.
 * The whole list would cost as much as the story request and say no more.
 */
export const PLOT_VOCABULARY_SAMPLE_SIZE = 30;

/** The most focus words a plot request carries. */
export const PLOT_FOCUS_WORD_LIMIT = 30;

/** A drafted plot is two or three sentences; anything far longer is not one. */
export const MAX_DRAFTED_PLOT_LENGTH = 600;

/** An edited plot becomes the premise, so it has the premise's limit. */
export const MAX_PLOT_LENGTH = MAX_PREMISE_LENGTH;

/** One story the learner already has, which new plots should not repeat. */
export interface RecentStory {
  readonly titleJa: string;
  readonly premise: string;
}

/**
 * One request for plots, one per frame.
 *
 * Every plot comes from the same request, because three requests with the
 * same prompt would converge on the same story three times. Plots the learner
 * edited are not rewritten; they travel as plots the new ones must differ from.
 */
export interface StoryPlotRequest {
  readonly frames: readonly PlotFrame[];
  readonly keptPlots: readonly string[];
  readonly recentStories: readonly RecentStory[];
  /** The newest words, newest first; empty outside Recently learned. */
  readonly focusVocabulary: readonly string[];
  readonly vocabularySample: readonly string[];
  /** The learner's special instructions, as data. Absent when empty. */
  readonly learnerNotes?: string;
  readonly promptVersion: string;
}

/** One plot on offer: the frame it was drafted on and its current text. */
export interface PlotCard {
  /**
   * Names this card for as long as it is on offer. A card that is edited keeps
   * it and a rewritten one gets a new one, so a view can tell which card it is
   * looking at without counting. It is not persisted.
   */
  readonly id: string;
  readonly frame: PlotFrame;
  readonly text: string;
  /** What the model wrote, so an edit is visible and can be recorded. */
  readonly draftedText: string;
}

/**
 * Whether the learner changed the plot. Spacing at either end is not a change:
 * the premise is sent trimmed, and a stray newline must not make a plot the
 * learner's own for good.
 */
export function isEditedPlot(card: Pick<PlotCard, 'text' | 'draftedText'>): boolean {
  return card.text.trim() !== card.draftedText.trim();
}

/** Folds case, spacing, and punctuation, so a reworded copy still matches. */
function comparable(text: string): string {
  return text
    .toLocaleLowerCase('en')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/**
 * Checks what the plot model returned before any of it is shown.
 *
 * Exactly the plots that were asked for, none empty, none longer than a plot,
 * and no two the same — counting the kept plots — because a draft that repeats
 * itself defeats the reason it was asked for. A refusal names the step that
 * failed, never the content, so it can be logged.
 */
export function checkDraftedPlots(
  plots: readonly string[],
  expected: number,
  kept: readonly string[] = [],
): Result<readonly string[], string> {
  if (plots.length !== expected) {
    return err('plot-count');
  }
  const trimmed = plots.map((plot) => plot.trim().replace(/\s+/g, ' '));
  if (trimmed.some((plot) => plot === '')) {
    return err('plot-empty');
  }
  if (trimmed.some((plot) => countCodePoints(plot) > MAX_DRAFTED_PLOT_LENGTH)) {
    return err('plot-too-long');
  }
  const seen = new Set(kept.map(comparable));
  for (const plot of trimmed) {
    const key = comparable(plot);
    if (seen.has(key)) {
      return err('plot-duplicate');
    }
    seen.add(key);
  }
  return ok(trimmed);
}
