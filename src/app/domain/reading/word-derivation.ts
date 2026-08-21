import type {
  StructuralBaselineEntry,
  StructuralBaselineMatcher,
} from '../language/structural-baseline';
import { matchEndingCombination } from './ending-combinations';
import { PART_OF_SPEECH_LABELS, type InflectionForm, type PartOfSpeech, type Token } from './token';
import type { WordGroup } from './token-grouping';

/**
 * How a word was built from its dictionary form.
 *
 * The analyzer emits stems, and a stem on its own is not a word: the なかっ of
 * 分からなかった exists only because た follows it, and a learner shown なかっ has
 * been shown a string they can never look up. So a step names the ending in the
 * ending's own dictionary form — ない — and says what the word looks like once
 * that ending is on, which is a form they can read, say, and search.
 */
export interface DerivationStep {
  /** The tokens this step covers, so the headword can tint what it is about. */
  readonly tokenIds: readonly string[];
  /** The ending in its own dictionary form: ない, not なかっ. */
  readonly attached: string;
  /** How it is written inside this particular word: なかっ. */
  readonly surface: string;
  /** What the ending does, in a few words: "negation". */
  readonly effectEn: string;
  /** The fuller explanation, which the reader asks for rather than is given. */
  readonly detailEn: string | null;
  /** The word as it stands once this step is applied. */
  readonly resultingSurface: string;
}

export interface WordDerivation {
  /** The dictionary form everything is built from. */
  readonly baseSurface: string;
  /** What that form is: "dictionary form" for a verb, a word class otherwise. */
  readonly baseLabel: string;
  /** The whole form in a line: ['Plain', 'negative', 'past']. */
  readonly summaryEn: readonly string[];
  readonly steps: readonly DerivationStep[];
}

/** Word classes that attach to the word in front of them rather than open one. */
const ENDING_CLASSES: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'auxiliary',
  'suffix',
  'counter',
]);

/** Classes whose uninflected shape is what a dictionary lists them under. */
const CONJUGATING_CLASSES: ReadonlySet<PartOfSpeech> = new Set<PartOfSpeech>([
  'verb',
  'adjective-i',
  'auxiliary',
]);

/**
 * Inflections that add no ending of their own.
 *
 * 行け is the whole imperative, and the 行け of 行けば is a stem whose ば is a
 * separate word. Neither has a token to hang a step on, so the form itself is
 * the step. Without the analyzer's inflection form there is no evidence for
 * either, which is why these were unexplainable before it was exposed.
 */
const STEM_ONLY_STEPS: Partial<Record<InflectionForm, { effectEn: string; detailEn: string }>> = {
  imperative: {
    effectEn: 'imperative',
    detailEn: 'A direct order. The verb itself changes shape and nothing is added.',
  },
  hypothetical: {
    effectEn: 'conditional stem',
    detailEn: 'The shape a verb takes before ば, which follows as a word of its own.',
  },
  'irrealis-volitional': {
    effectEn: 'volitional stem',
    detailEn: 'The shape a verb takes before the volitional う.',
  },
};

/**
 * Splits a baseline name into the form and what it does.
 *
 * Every entry in the shipped dataset is written as `ない (negation)`, so the two
 * halves are taken rather than duplicated in a second table that could drift.
 */
function splitBaselineName(nameEn: string): { form: string; effectEn: string } {
  const open = nameEn.lastIndexOf(' (');
  if (open < 0 || !nameEn.endsWith(')')) {
    return { form: nameEn, effectEn: nameEn };
  }
  return {
    form: nameEn.slice(0, open),
    effectEn: nameEn.slice(open + 2, -1),
  };
}

/**
 * The dictionary form of one ending, as the step should name it.
 *
 * The baseline's own display form wins when it names a single ending, because
 * ている says more than the いる the analyzer tagged. A name covering several
 * forms — `う / よう` — would be noise in a column about this word, so the
 * analyzer's dictionary form is used instead.
 */
function attachedFormFor(token: Token, entry: StructuralBaselineEntry | null): string {
  const lemma = token.lemma ?? token.surface;
  if (entry === null) {
    return lemma;
  }
  const { form } = splitBaselineName(entry.nameEn);
  return form.includes('/') ? lemma : form;
}

/** The ending written as it stands alone, for the running form of a step. */
function standaloneEnding(token: Token): string {
  return token.inflectionForm === 'dictionary' ? token.surface : (token.lemma ?? token.surface);
}

function labelForBase(head: Token): string {
  const partOfSpeech = head.partOfSpeech;
  if (partOfSpeech === undefined) {
    return 'Base form';
  }
  return CONJUGATING_CLASSES.has(partOfSpeech)
    ? 'dictionary form'
    : PART_OF_SPEECH_LABELS[partOfSpeech];
}

const POLITE = new Set(['ます', 'です']);
const CAUSATIVE = new Set(['せる', 'させる']);
const PASSIVE = new Set(['れる', 'られる']);
const ONGOING = new Set(['いる', 'おる']);
const DESIDERATIVE = new Set(['たい', 'たがる']);
const NEGATIVE = new Set(['ない', 'ぬ', 'ん', 'まい']);
const VOLITIONAL = new Set(['う', 'よう']);
const REQUEST = new Set(['くださる']);

/**
 * The whole form in one line, in the order the pieces stack.
 *
 * Bounded and derived: every entry comes from an ending the analyzer found or
 * an inflection it reported, never from free text. "Plain" is dropped when it
 * would be the only thing said, because a line reading `Plain` answers nothing.
 */
function summarize(endings: readonly Token[], finalForm: InflectionForm | undefined): string[] {
  const lemmas = new Set(endings.map((token) => token.lemma ?? token.surface));
  const has = (candidates: ReadonlySet<string>): boolean =>
    [...candidates].some((candidate) => lemmas.has(candidate));

  const summary = [has(POLITE) ? 'Polite' : 'Plain'];
  if (has(CAUSATIVE)) {
    summary.push('causative');
  }
  if (has(PASSIVE)) {
    summary.push('passive or potential');
  }
  if (has(ONGOING)) {
    summary.push('ongoing');
  }
  if (has(DESIDERATIVE)) {
    summary.push('want to');
  }
  if (has(NEGATIVE)) {
    summary.push('negative');
  }
  if (lemmas.has('た')) {
    summary.push('past');
  }
  if (has(VOLITIONAL) || finalForm === 'irrealis-volitional') {
    summary.push('volitional');
  }
  if (finalForm === 'hypothetical') {
    summary.push('conditional');
  }
  if (finalForm === 'imperative') {
    summary.push('imperative');
  }
  if (has(REQUEST)) {
    summary.push('request');
  }
  return summary.length === 1 && summary[0] === 'Plain' ? [] : summary;
}

function isEnding(token: Token): boolean {
  return token.partOfSpeech !== undefined && ENDING_CLASSES.has(token.partOfSpeech);
}

/**
 * Reads a word as a chain of steps from its dictionary form to what is written.
 *
 * Everything here is analyzer-derived: the dictionary forms, the endings, and
 * the order they stack in are all in the analysis already, so nothing is guessed
 * and nothing costs a request. Curation is limited to naming — the shipped
 * structural baseline says what each ending does, and a short table names the
 * few runs the analyzer splits finer than they are taught.
 *
 * `null` when there is nothing to explain: a word with no endings and no
 * inflection of its own is already fully described by the entry above it.
 */
export function deriveWord(
  word: WordGroup,
  baseline: StructuralBaselineMatcher | null,
): WordDerivation | null {
  const tokens = word.tokens;
  const headIndex = tokens.findIndex((token) => token.id === word.head.id);
  const steps: DerivationStep[] = [];

  let index = headIndex + 1;
  while (index < tokens.length) {
    const token = tokens[index];
    // The て of ている belongs to the word but is not a step of its own: it is
    // the seam the helper verb attaches through, and it travels with it.
    if (!isEnding(token)) {
      index += 1;
      continue;
    }

    const prefix = tokens
      .slice(0, index)
      .map((earlier) => earlier.surface)
      .join('');
    // Only an unbroken run may collapse: a combination must describe endings
    // that actually sit next to each other, never ones a seam separates.
    let end = index;
    while (end < tokens.length && isEnding(tokens[end])) {
      end += 1;
    }
    const run = tokens.slice(index, end);
    const combination = matchEndingCombination(run.map((each) => each.lemma ?? each.surface));

    if (combination !== null) {
      const covered = run.slice(0, combination.lemmas.length);
      steps.push({
        tokenIds: covered.map((each) => each.id),
        attached: combination.writtenForm,
        surface: covered.map((each) => each.surface).join(''),
        effectEn: combination.effectEn,
        detailEn: combination.detailEn,
        resultingSurface: prefix + combination.writtenForm,
      });
      index += covered.length;
      continue;
    }

    const entry = baseline?.match(token) ?? null;
    const { effectEn } = entry === null ? { effectEn: '' } : splitBaselineName(entry.nameEn);
    steps.push({
      tokenIds: [token.id],
      attached: attachedFormFor(token, entry),
      surface: token.surface,
      effectEn:
        effectEn.length > 0
          ? effectEn
          : token.partOfSpeech === undefined
            ? 'ending'
            : PART_OF_SPEECH_LABELS[token.partOfSpeech].toLowerCase(),
      detailEn: entry?.descriptionEn ?? null,
      resultingSurface: prefix + standaloneEnding(token),
    });
    index += 1;
  }

  const last = tokens[tokens.length - 1];
  const stemOnly =
    last.inflectionForm === undefined ? undefined : STEM_ONLY_STEPS[last.inflectionForm];
  if (stemOnly !== undefined) {
    steps.push({
      tokenIds: [last.id],
      attached: last.surface,
      surface: last.surface,
      effectEn: stemOnly.effectEn,
      detailEn: stemOnly.detailEn,
      resultingSurface: word.surface,
    });
  }

  if (steps.length === 0) {
    return null;
  }

  // The last step produces the word as it is written, by definition. Saying so
  // is both simpler and truer than projecting it from the pieces.
  steps[steps.length - 1] = { ...steps[steps.length - 1], resultingSurface: word.surface };

  return {
    baseSurface: word.head.lemma ?? word.head.surface,
    baseLabel: labelForBase(word.head),
    summaryEn: summarize(tokens.filter(isEnding), last.inflectionForm),
    steps,
  };
}
