import type { StoryPlotRequest } from '../../../domain/ai/story-plot';
import {
  PROTOCOL_LAYER,
  asData,
  assemble,
  directionMarkdown,
  markdownDocument,
  markdownField,
  markdownHeading,
  markdownLineList,
  markdownLineValue,
  type AssembledPrompt,
} from './prompt-layers';

/**
 * Versioned task instructions for drafting plots.
 *
 * The plot is the topic decision the story prompt used to leave to the model,
 * where every run started from nothing and converged on the same few scenes.
 * Here code has already decided what each card is built on, and one request
 * writes all of them, so the model can see the other plots it must not repeat.
 */
const TASK_LAYER = [
  'Role: Draft story plots for one Japanese learner. The stories will be written later, in Japanese, using only words this learner already knows.',
  'Goal: Write one plot in plain English for every supplied frame, in the supplied order.',
  'Success criteria:',
  '- Write two or three plain English sentences per plot: who the story is about, where it happens, and the problem or wish that drives it.',
  '- Stop before the resolution. Never say how the story ends; the ending is decided when the story is written.',
  '- Build each plot on its own frame. Use its genre, mood, setting, and cast, and make its turning point the event that sets the problem in motion. When a frame names a format, an ending, or a time, keep the plot compatible with it, but do not narrate the ending.',
  '- Keep every plot concrete and everyday, so it can be told with simple words like those in the vocabulary sample. Prefer situations the focus words would fit. Avoid anything that needs specialist, technical, or fantastical vocabulary.',
  '- Make the plots clearly different from one another: each needs its own central problem, its own goal, and its own turning point. A plot must not be a rewording of another.',
  '- Make every plot clearly different from the stories already written and from the kept plots. Do not reuse their situations, problems, or characters.',
  '- When learner notes are supplied, keep every plot compatible with them where they fit the frame.',
  '- Write plain English prose only: no Japanese, no romaji, no title, no list, and no labels.',
  'Output semantics: `plots` holds exactly one string per frame, in frame order.',
] as const;

function jsonContract(count: number): string {
  return `Return {"plots":[string]} with exactly ${String(count)} entries, one per frame in frame order. Include no other fields.`;
}

/** Earlier stories and kept plots: what the new plots must not repeat. */
function alreadyWritten(request: StoryPlotRequest): string {
  if (request.recentStories.length === 0 && request.keptPlots.length === 0) {
    return '';
  }
  const stories = request.recentStories.map((story, index) =>
    markdownDocument([
      markdownHeading(2, `Story ${String(index + 1)}`),
      [
        markdownField('Title', story.titleJa),
        ...(story.premise === '' ? [] : [markdownField('Plot', story.premise)]),
      ].join('\n'),
    ]),
  );
  return asData(
    'already written',
    markdownDocument([
      stories.length === 0
        ? ''
        : markdownDocument([markdownHeading(1, 'Stories already written'), ...stories]),
      markdownLineList('Kept plots', request.keptPlots, 1),
    ]),
  );
}

function learnerNotes(notes: string | undefined): string {
  return notes === undefined
    ? ''
    : asData(
        'learner notes',
        markdownDocument([markdownHeading(1, 'Learner notes'), markdownLineValue(notes)]),
      );
}

function vocabularySample(request: StoryPlotRequest): string {
  return asData(
    'vocabulary sample',
    markdownDocument([
      markdownHeading(1, 'Vocabulary'),
      markdownLineList('Focus words', request.focusVocabulary),
      markdownLineList('Vocabulary sample', request.vocabularySample),
    ]),
  );
}

function frames(request: StoryPlotRequest): string {
  return asData(
    'plot frames',
    markdownDocument([
      markdownHeading(1, 'Plot frames'),
      ...request.frames.map((frame, index) =>
        directionMarkdown(frame, 2, `Frame ${String(index + 1)}`),
      ),
    ]),
  );
}

/**
 * Assembles one plot request.
 *
 * The user layers run from the slowest-changing to the fastest (ADR 0071): the
 * stories already written change once per story, the notes once per draft, the
 * vocabulary sample and the frames on every request.
 */
export function buildPlotPrompt(request: StoryPlotRequest): AssembledPrompt {
  const system = assemble([PROTOCOL_LAYER, TASK_LAYER.join('\n')]);
  const user = assemble([
    alreadyWritten(request),
    learnerNotes(request.learnerNotes),
    vocabularySample(request),
    frames(request),
  ]);
  return { system, user, jsonContract: jsonContract(request.frames.length) };
}
