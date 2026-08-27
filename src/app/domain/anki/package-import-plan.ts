import { ankiError, type AnkiError } from './anki-error';
import type { AnkiCatalog, AnkiDeck, AnkiNoteType } from './catalog';
import { err, ok, type Result } from '../shared/result';
import type { VocabularySourceId } from '../shared/ids';
import type { DeckScope, SourceMapping } from '../vocabulary/source-mapping';

/** Nested decks are named `Parent::Child`, in every schema Monosai reads. */
const DECK_SEPARATOR = '::';

/**
 * Field names that mean "the word being learned" across the shared decks
 * beginners start from. Matched case-insensitively, and only when exactly one
 * of them is present: two candidates are a real ambiguity, not a tie to break.
 */
const EXPRESSION_FIELD_NAMES = ['expression', 'word', 'vocabulary', 'vocab'];

export interface PackageImportSelection {
  readonly deckName: string;
  readonly deckScope: DeckScope;
  readonly noteTypeName: string;
  readonly expressionFieldName: string;
}

/**
 * What Monosai intends to import from an opened package, and how much of it it
 * had to guess.
 *
 * The plan is a value, not a screen: the store derives one from the catalog,
 * the learner's choices replace parts of it, and the UI only has to appear when
 * `needsReview` is true.
 */
export interface PackageImportPlan {
  readonly selection: PackageImportSelection;
  /** Top-level decks the package offers, in catalog order. */
  readonly deckOptions: readonly AnkiDeck[];
  readonly noteTypeOptions: readonly AnkiNoteType[];
  /** The stored package source this import replaces, or `null` for a new one. */
  readonly replaces: SourceMapping | null;
  /** Stored package sources for the chosen deck, when more than one matches. */
  readonly replaceOptions: readonly SourceMapping[];
  /** True when a guess is load-bearing, so the learner has to confirm it. */
  readonly needsReview: boolean;
}

/**
 * Works out what a package should be imported as.
 *
 * Exported decks are shared as a whole — a parent brings its subdecks — so the
 * choices are the package's top-level decks, and a single one is taken without
 * asking. An existing package source for the same deck is a re-import of a deck
 * the learner already keeps: reusing its identity is what keeps repeated
 * imports from stacking up duplicate sources, and reusing its note type and
 * field is what keeps a deliberate choice from being guessed away.
 */
export function planPackageImport(
  catalog: AnkiCatalog,
  storedPackageSources: readonly SourceMapping[],
): Result<PackageImportPlan, AnkiError> {
  const decks = rootDecks(catalog);
  if (decks.length === 0) {
    return err(
      ankiError(
        'deck-discovery-failed',
        'This package has no deck with cards in it. Export the deck you study from and share it again.',
      ),
    );
  }
  if (catalog.noteTypes.length === 0) {
    return err(
      ankiError('note-type-discovery-failed', 'This package has no note types Monosai can read.'),
    );
  }
  return derive(catalog, storedPackageSources, decks, { deckName: decks[0].name });
}

/** The same plan with one deck chosen; everything below it is derived again. */
export function withDeck(
  catalog: AnkiCatalog,
  storedPackageSources: readonly SourceMapping[],
  deckName: string,
): Result<PackageImportPlan, AnkiError> {
  return derive(catalog, storedPackageSources, rootDecks(catalog), { deckName });
}

/** The same plan with one note type chosen; the field is derived again. */
export function withNoteType(
  catalog: AnkiCatalog,
  storedPackageSources: readonly SourceMapping[],
  plan: PackageImportPlan,
  noteTypeName: string,
): Result<PackageImportPlan, AnkiError> {
  return derive(catalog, storedPackageSources, plan.deckOptions, {
    deckName: plan.selection.deckName,
    noteTypeName,
    ...(plan.replaces === null ? {} : { replacesId: plan.replaces.id }),
  });
}

/** The same plan with one expression field chosen. */
export function withExpressionField(
  catalog: AnkiCatalog,
  storedPackageSources: readonly SourceMapping[],
  plan: PackageImportPlan,
  expressionFieldName: string,
): Result<PackageImportPlan, AnkiError> {
  return derive(catalog, storedPackageSources, plan.deckOptions, {
    deckName: plan.selection.deckName,
    noteTypeName: plan.selection.noteTypeName,
    expressionFieldName,
    ...(plan.replaces === null ? {} : { replacesId: plan.replaces.id }),
  });
}

/** The same plan aimed at one of several sources holding the same deck. */
export function withReplacement(
  catalog: AnkiCatalog,
  storedPackageSources: readonly SourceMapping[],
  plan: PackageImportPlan,
  replacesId: VocabularySourceId,
): Result<PackageImportPlan, AnkiError> {
  return derive(catalog, storedPackageSources, plan.deckOptions, {
    deckName: plan.selection.deckName,
    replacesId,
  });
}

/** The same plan with the subdeck choice flipped. */
export function withDeckScope(plan: PackageImportPlan, deckScope: DeckScope): PackageImportPlan {
  return { ...plan, selection: { ...plan.selection, deckScope } };
}

interface Choices {
  readonly deckName: string;
  readonly noteTypeName?: string;
  readonly expressionFieldName?: string;
  readonly replacesId?: VocabularySourceId;
}

function derive(
  catalog: AnkiCatalog,
  storedPackageSources: readonly SourceMapping[],
  deckOptions: readonly AnkiDeck[],
  choices: Choices,
): Result<PackageImportPlan, AnkiError> {
  const deck =
    deckOptions.find((candidate) => candidate.name === choices.deckName) ?? deckOptions.at(0);
  if (deck === undefined) {
    return err(ankiError('deck-discovery-failed', 'That deck is not in this package.'));
  }

  // Anki deck names are case sensitive, so the same name is the same deck.
  const replaceOptions = storedPackageSources.filter((source) => source.deckName === deck.name);
  const replaces =
    replaceOptions.find((source) => source.id === choices.replacesId) ?? mostRecent(replaceOptions);
  const reused = reusableFrom(catalog, replaces);

  const noteType =
    findNoteType(catalog, choices.noteTypeName) ??
    findNoteType(catalog, reused?.noteTypeName) ??
    catalog.noteTypes[0];
  if (noteType.fieldNames.length === 0) {
    return err(
      ankiError(
        'field-discovery-failed',
        `The note type "${noteType.name}" in this package has no fields.`,
      ),
    );
  }

  const inferredField = inferExpressionField(noteType);
  const reusedField =
    reused?.noteTypeName === noteType.name && reused.expressionFieldName !== undefined
      ? reused.expressionFieldName
      : undefined;
  const expressionFieldName =
    pickField(noteType, choices.expressionFieldName) ??
    pickField(noteType, reusedField) ??
    inferredField ??
    noteType.fieldNames[0];

  const deckScope: DeckScope =
    replaces !== null && replaces.deckName === deck.name
      ? replaces.deckScope
      : deck.hasChildren
        ? 'deck-and-subdecks'
        : 'deck-only';

  const settledByReuse =
    reused !== null &&
    reused.noteTypeName === noteType.name &&
    reused.expressionFieldName !== undefined;
  const needsReview =
    deckOptions.length > 1 ||
    replaceOptions.length > 1 ||
    (!settledByReuse && (catalog.noteTypes.length > 1 || inferredField === null));

  return ok({
    selection: {
      deckName: deck.name,
      deckScope,
      noteTypeName: noteType.name,
      expressionFieldName,
    },
    deckOptions,
    noteTypeOptions: catalog.noteTypes,
    replaces,
    replaceOptions,
    needsReview,
  });
}

/**
 * The decks worth offering: the package's top level.
 *
 * A subdeck is reachable by editing the source afterwards; what an export means
 * is the deck that was shared, and its children come with it.
 */
function rootDecks(catalog: AnkiCatalog): readonly AnkiDeck[] {
  const roots: AnkiDeck[] = [];
  const seen = new Set<string>();
  for (const deck of catalog.decks) {
    const rootName = deck.name.split(DECK_SEPARATOR)[0];
    if (seen.has(rootName)) {
      continue;
    }
    seen.add(rootName);
    roots.push(
      catalog.decks.find((candidate) => candidate.name === rootName) ?? {
        name: rootName,
        hasChildren: true,
      },
    );
  }
  return roots;
}

/** The stored source's mapping, when the package still has what it points at. */
function reusableFrom(
  catalog: AnkiCatalog,
  replaces: SourceMapping | null,
): { readonly noteTypeName: string; readonly expressionFieldName?: string } | null {
  if (replaces === null) {
    return null;
  }
  const noteType = findNoteType(catalog, replaces.noteTypeName);
  if (noteType === null) {
    return null;
  }
  return {
    noteTypeName: noteType.name,
    ...(noteType.fieldNames.includes(replaces.expressionFieldName)
      ? { expressionFieldName: replaces.expressionFieldName }
      : {}),
  };
}

function mostRecent(sources: readonly SourceMapping[]): SourceMapping | null {
  return sources.length === 0
    ? null
    : [...sources].sort(
        (left, right) =>
          (right.lastSyncedAt ?? right.updatedAt) - (left.lastSyncedAt ?? left.updatedAt),
      )[0];
}

function findNoteType(catalog: AnkiCatalog, name: string | undefined): AnkiNoteType | null {
  return name === undefined
    ? null
    : (catalog.noteTypes.find((noteType) => noteType.name === name) ?? null);
}

function pickField(noteType: AnkiNoteType, name: string | undefined): string | null {
  return name !== undefined && noteType.fieldNames.includes(name) ? name : null;
}

/**
 * The field holding the expression, when the note type says so unambiguously:
 * it has one field, or exactly one field with a name that means "the word".
 */
function inferExpressionField(noteType: AnkiNoteType): string | null {
  if (noteType.fieldNames.length === 1) {
    return noteType.fieldNames[0];
  }
  const named = noteType.fieldNames.filter((field) =>
    EXPRESSION_FIELD_NAMES.includes(field.trim().toLowerCase()),
  );
  return named.length === 1 ? named[0] : null;
}
