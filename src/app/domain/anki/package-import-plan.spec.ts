import { describe, expect, it } from 'vitest';
import type { AnkiCatalog } from './catalog';
import {
  planPackageImport,
  withDeck,
  withExpressionField,
  withNoteType,
  withReplacement,
} from './package-import-plan';
import { vocabularySourceId } from '../shared/ids';
import type { SourceMapping } from '../vocabulary/source-mapping';

function catalog(overrides: Partial<AnkiCatalog> = {}): AnkiCatalog {
  return {
    decks: [
      { name: 'Japanese', hasChildren: true },
      { name: 'Japanese::Verbs', hasChildren: false },
    ],
    noteTypes: [{ name: 'Basic', fieldNames: ['Expression', 'Meaning'] }],
    ...overrides,
  };
}

function packageSource(overrides: Partial<SourceMapping> = {}): SourceMapping {
  return {
    id: vocabularySourceId('11111111-1111-4111-8111-111111111111'),
    kind: 'anki-package',
    label: 'Anki · Japanese · Expression',
    providerKind: 'package',
    deckName: 'Japanese',
    deckScope: 'deck-and-subdecks',
    noteTypeName: 'Basic',
    expressionFieldName: 'Expression',
    enabled: true,
    createdAt: 1,
    updatedAt: 2,
    lastSyncedAt: 3,
    automaticSync: false,
    ...overrides,
  };
}

function planned(cat: AnkiCatalog, stored: readonly SourceMapping[] = []) {
  const plan = planPackageImport(cat, stored);
  if (!plan.ok) {
    throw new Error(`planning failed: ${plan.error.code}`);
  }
  return plan.value;
}

describe('planPackageImport', () => {
  it('takes the single top-level deck with its subdecks, without asking', () => {
    const plan = planned(catalog());

    expect(plan.selection).toEqual({
      deckName: 'Japanese',
      deckScope: 'deck-and-subdecks',
      noteTypeName: 'Basic',
      expressionFieldName: 'Expression',
    });
    expect(plan.needsReview).toBe(false);
    expect(plan.deckOptions.map((deck) => deck.name)).toEqual(['Japanese']);
  });

  it('keeps a deck without subdecks scoped to itself', () => {
    const plan = planned(catalog({ decks: [{ name: 'Core', hasChildren: false }] }));

    expect(plan.selection.deckScope).toBe('deck-only');
  });

  it('asks when a collection carries several top-level decks', () => {
    const plan = planned(
      catalog({
        decks: [
          { name: 'Japanese', hasChildren: false },
          { name: 'Spanish', hasChildren: false },
        ],
      }),
    );

    expect(plan.needsReview).toBe(true);
    expect(plan.deckOptions.map((deck) => deck.name)).toEqual(['Japanese', 'Spanish']);
    expect(plan.selection.deckName).toBe('Japanese');
  });

  it('takes the only field of a single-field note type', () => {
    const plan = planned(catalog({ noteTypes: [{ name: 'Word', fieldNames: ['Front'] }] }));

    expect(plan.selection.expressionFieldName).toBe('Front');
    expect(plan.needsReview).toBe(false);
  });

  it('recognises a named expression field whatever its casing', () => {
    const plan = planned(
      catalog({ noteTypes: [{ name: 'Basic', fieldNames: ['Reading', 'VOCAB', 'Meaning'] }] }),
    );

    expect(plan.selection.expressionFieldName).toBe('VOCAB');
    expect(plan.needsReview).toBe(false);
  });

  it('asks when two fields could both be the expression', () => {
    const plan = planned(
      catalog({ noteTypes: [{ name: 'Basic', fieldNames: ['Word', 'Vocabulary'] }] }),
    );

    expect(plan.needsReview).toBe(true);
    expect(plan.selection.expressionFieldName).toBe('Word');
  });

  it('asks when the package carries more than one note type', () => {
    const plan = planned(
      catalog({
        noteTypes: [
          { name: 'Basic', fieldNames: ['Expression'] },
          { name: 'Sentence', fieldNames: ['Front'] },
        ],
      }),
    );

    expect(plan.needsReview).toBe(true);
    expect(plan.noteTypeOptions).toHaveLength(2);
  });

  it('replaces the stored source that already holds that deck', () => {
    const stored = packageSource();
    const plan = planned(catalog(), [stored]);

    expect(plan.replaces).toBe(stored);
    expect(plan.needsReview).toBe(false);
  });

  it('matches a stored deck name case sensitively, as Anki does', () => {
    const plan = planned(catalog(), [packageSource({ deckName: 'japanese' })]);

    expect(plan.replaces).toBeNull();
  });

  it('never replaces a live Anki source that happens to share the deck', () => {
    // Only stored *package* sources are offered to this function; a connection
    // source for the same deck is left to keep syncing on its own.
    const plan = planned(catalog(), []);

    expect(plan.replaces).toBeNull();
  });

  it('reuses the stored note type and field instead of guessing again', () => {
    const stored = packageSource({ noteTypeName: 'Sentence', expressionFieldName: 'Back' });
    const plan = planned(
      catalog({
        noteTypes: [
          { name: 'Basic', fieldNames: ['Expression', 'Meaning'] },
          { name: 'Sentence', fieldNames: ['Front', 'Back'] },
        ],
      }),
      [stored],
    );

    expect(plan.selection.noteTypeName).toBe('Sentence');
    expect(plan.selection.expressionFieldName).toBe('Back');
    expect(plan.needsReview).toBe(false);
  });

  it('falls back to inference when the stored note type is gone', () => {
    const plan = planned(catalog(), [packageSource({ noteTypeName: 'Retired' })]);

    expect(plan.selection.noteTypeName).toBe('Basic');
    expect(plan.selection.expressionFieldName).toBe('Expression');
  });

  it('asks for the field when a stored field is gone and no replacement is obvious', () => {
    const plan = planned(
      catalog({ noteTypes: [{ name: 'Basic', fieldNames: ['Front', 'Back'] }] }),
      [packageSource({ expressionFieldName: 'Retired' })],
    );

    expect(plan.selection.expressionFieldName).toBe('Front');
    expect(plan.needsReview).toBe(true);
  });

  it('asks which source to replace when several hold the same deck', () => {
    const older = packageSource({ lastSyncedAt: 10 });
    const newer = packageSource({
      id: vocabularySourceId('22222222-2222-4222-8222-222222222222'),
      expressionFieldName: 'Meaning',
      lastSyncedAt: 20,
    });
    const plan = planned(catalog(), [older, newer]);

    expect(plan.needsReview).toBe(true);
    expect(plan.replaceOptions).toHaveLength(2);
    expect(plan.replaces).toBe(newer);

    const aimed = withReplacement(catalog(), [older, newer], plan, older.id);
    expect(aimed.ok && aimed.value.replaces).toBe(older);
    expect(aimed.ok && aimed.value.selection.expressionFieldName).toBe('Expression');
  });

  it('keeps the stored deck scope when replacing a source', () => {
    const plan = planned(catalog(), [packageSource({ deckScope: 'deck-only' })]);

    expect(plan.selection.deckScope).toBe('deck-only');
  });

  it('refuses a package with no deck holding cards', () => {
    const plan = planPackageImport(catalog({ decks: [] }), []);

    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.error.code).toBe('deck-discovery-failed');
  });

  it('refuses a package with no note types', () => {
    const plan = planPackageImport(catalog({ noteTypes: [] }), []);

    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.error.code).toBe('note-type-discovery-failed');
  });

  it('refuses a note type without fields', () => {
    const plan = planPackageImport(catalog({ noteTypes: [{ name: 'Empty', fieldNames: [] }] }), []);

    expect(plan.ok).toBe(false);
    expect(!plan.ok && plan.error.code).toBe('field-discovery-failed');
  });
});

describe('choosing parts of a plan', () => {
  const twoDecks = catalog({
    decks: [
      { name: 'Japanese', hasChildren: true },
      { name: 'Japanese::Verbs', hasChildren: false },
      { name: 'Spanish', hasChildren: false },
    ],
  });

  it('re-derives the scope when another deck is chosen', () => {
    const chosen = withDeck(twoDecks, [], 'Spanish');

    expect(chosen.ok && chosen.value.selection).toMatchObject({
      deckName: 'Spanish',
      deckScope: 'deck-only',
    });
  });

  it('picks a field again when the note type changes', () => {
    const many = catalog({
      noteTypes: [
        { name: 'Basic', fieldNames: ['Front', 'Back'] },
        { name: 'Vocab', fieldNames: ['Word', 'Meaning'] },
      ],
    });
    const plan = planned(many);

    const chosen = withNoteType(many, [], plan, 'Vocab');

    expect(chosen.ok && chosen.value.selection.noteTypeName).toBe('Vocab');
    expect(chosen.ok && chosen.value.selection.expressionFieldName).toBe('Word');
  });

  it('keeps a field the learner chose', () => {
    const plan = planned(catalog());

    const chosen = withExpressionField(catalog(), [], plan, 'Meaning');

    expect(chosen.ok && chosen.value.selection.expressionFieldName).toBe('Meaning');
  });

  it('ignores a field that is not in the chosen note type', () => {
    const plan = planned(catalog());

    const chosen = withExpressionField(catalog(), [], plan, 'Nonsense');

    expect(chosen.ok && chosen.value.selection.expressionFieldName).toBe('Expression');
  });
});
