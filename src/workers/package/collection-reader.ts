import { ankiError, type AnkiError } from '../../app/domain/anki/anki-error';
import { err, ok, type Result } from '../../app/domain/shared/result';
import type { DeckScope } from '../../app/domain/vocabulary/source-mapping';
import type { CollectionDatabase, SqliteRow, SqliteValue } from './sqlite-runtime';

/** Anki separates a note's fields with the unit separator inside one column. */
export const FIELD_SEPARATOR = '\u001f';

/** Schema 18 stores nested deck names with the unit separator; older ones use `::`. */
const MODERN_DECK_SEPARATOR = '\u001f';
export const DECK_SEPARATOR = '::';

export interface CollectionDeck {
  readonly id: number;
  readonly name: string;
  /** True when cards sit in this deck itself, ignoring its subdecks. */
  readonly hasCards: boolean;
}

export interface CollectionNoteType {
  readonly id: number;
  readonly name: string;
  readonly fieldNames: readonly string[];
}

export interface ReviewedNote {
  readonly noteId: string;
  readonly fieldValues: readonly string[];
  readonly reps?: number;
  readonly lapseRatio?: number;
  readonly easeFactor?: number;
}

export interface CollectionReader {
  readonly schemaVersion: number;
  readonly layout: 'normalized' | 'legacy-json';
  readonly decks: readonly CollectionDeck[];
  readonly noteTypes: readonly CollectionNoteType[];
  /** True when the collection carries no review history at all. */
  readonly hasAnyReviewEvidence: boolean;
  reviewedNotes(selection: NoteSelection): readonly ReviewedNote[];
}

export interface NoteSelection {
  readonly deckName: string;
  readonly deckScope: DeckScope;
  readonly noteTypeName: string;
}

function text(value: SqliteValue): string {
  return typeof value === 'string' ? value : String(value ?? '');
}

function integer(value: SqliteValue): number {
  return typeof value === 'number' ? value : Number(value ?? 0);
}

function tableNames(database: CollectionDatabase): ReadonlySet<string> {
  const rows = database.query("select name from sqlite_master where type = 'table'");
  return new Set(rows.map((row) => text(row[0])));
}

function columnNames(database: CollectionDatabase, table: string): ReadonlySet<string> {
  const rows = database.query(`pragma table_info(${table})`);
  return new Set(rows.map((row) => text(row[1])));
}

function normalizeDeckName(name: string): string {
  return name.split(MODERN_DECK_SEPARATOR).join(DECK_SEPARATOR);
}

/** Deck ids covered by one mapping's selection. */
function scopedDeckIds(
  decks: readonly CollectionDeck[],
  deckName: string,
  scope: DeckScope,
): readonly number[] {
  const prefix = `${deckName}${DECK_SEPARATOR}`;
  return decks
    .filter(
      (deck) =>
        deck.name === deckName || (scope === 'deck-and-subdecks' && deck.name.startsWith(prefix)),
    )
    .map((deck) => deck.id);
}

function parseJsonObject(value: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(value);
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : {};
}

/** Reads the deck and note-type catalog out of the `col` row's JSON blobs. */
function readLegacyCatalog(database: CollectionDatabase): {
  decks: CollectionDeck[];
  noteTypes: CollectionNoteType[];
} {
  const rows = database.query('select decks, models from col limit 1');
  const decks: CollectionDeck[] = [];
  const noteTypes: CollectionNoteType[] = [];
  if (rows.length === 0) {
    return { decks, noteTypes };
  }

  for (const [id, value] of Object.entries(parseJsonObject(text(rows[0][0])))) {
    const deck = value as { name?: unknown };
    if (typeof deck.name === 'string') {
      decks.push({ id: Number(id), name: normalizeDeckName(deck.name), hasCards: false });
    }
  }

  for (const [id, value] of Object.entries(parseJsonObject(text(rows[0][1])))) {
    const model = value as { name?: unknown; flds?: unknown };
    if (typeof model.name !== 'string' || !Array.isArray(model.flds)) {
      continue;
    }
    const fields = model.flds as { name?: unknown; ord?: unknown }[];
    const ordered = [...fields].sort(
      (left, right) => Number(left.ord ?? 0) - Number(right.ord ?? 0),
    );
    noteTypes.push({
      id: Number(id),
      name: model.name,
      fieldNames: ordered.map((field) => (typeof field.name === 'string' ? field.name : '')),
    });
  }

  return { decks, noteTypes };
}

function readNormalizedCatalog(database: CollectionDatabase): {
  decks: CollectionDeck[];
  noteTypes: CollectionNoteType[];
} {
  const decks = database.query('select id, name from decks').map((row) => ({
    id: integer(row[0]),
    name: normalizeDeckName(text(row[1])),
    hasCards: false,
  }));

  const fieldsByNoteType = new Map<number, { ord: number; name: string }[]>();
  for (const row of database.query('select ntid, ord, name from fields')) {
    const ntid = integer(row[0]);
    const list = fieldsByNoteType.get(ntid) ?? [];
    list.push({ ord: integer(row[1]), name: text(row[2]) });
    fieldsByNoteType.set(ntid, list);
  }

  const noteTypes = database.query('select id, name from notetypes').map((row) => {
    const id = integer(row[0]);
    const fields = [...(fieldsByNoteType.get(id) ?? [])].sort(
      (left, right) => left.ord - right.ord,
    );
    return { id, name: text(row[1]), fieldNames: fields.map((field) => field.name) };
  });

  return { decks, noteTypes };
}

/**
 * Opens a collection database behind one reader regardless of its layout.
 *
 * Anki moved decks and note types out of JSON blobs in the `col` row and into
 * their own tables at schema 18, and packages of both shapes are still in
 * circulation, so the layout is detected from the tables that exist rather than
 * assumed from the version number.
 */
export function openCollectionReader(
  database: CollectionDatabase,
): Result<CollectionReader, AnkiError> {
  let tables: ReadonlySet<string>;
  let schemaVersion: number;
  try {
    tables = tableNames(database);
    const versionRows = database.query('select ver from col limit 1');
    schemaVersion = versionRows.length > 0 ? integer(versionRows[0][0]) : 0;
  } catch (thrown) {
    return err(
      ankiError(
        'package-unreadable',
        'The collection inside this package could not be read.',
        thrown instanceof Error ? thrown.message : 'query failed',
      ),
    );
  }

  if (!tables.has('notes') || !tables.has('col')) {
    return err(
      ankiError(
        'package-schema-unsupported',
        'The collection inside this package is missing the tables Monosai needs.',
        `tables: ${[...tables].sort().join(', ')}`,
      ),
    );
  }

  if (!tables.has('cards') || !columnNames(database, 'cards').has('reps')) {
    return err(
      ankiError(
        'package-review-data-missing',
        'This package does not record which cards were reviewed, so Monosai cannot tell which vocabulary you already know.',
        tables.has('cards') ? 'cards table has no reps column' : 'no cards table',
      ),
    );
  }

  const cardsColumns = columnNames(database, 'cards');
  const hasLapses = cardsColumns.has('lapses');
  const hasFactor = cardsColumns.has('factor');

  const layout = tables.has('notetypes') && tables.has('fields') ? 'normalized' : 'legacy-json';
  let catalog: { decks: CollectionDeck[]; noteTypes: CollectionNoteType[] };
  try {
    catalog =
      layout === 'normalized' ? readNormalizedCatalog(database) : readLegacyCatalog(database);
  } catch (thrown) {
    return err(
      ankiError(
        'package-unreadable',
        'The deck and note type list inside this package could not be read.',
        thrown instanceof Error ? thrown.message : 'catalog read failed',
      ),
    );
  }

  const reviewedCards = integer(
    database.query('select count(*) from cards where reps > 0')[0]?.[0] ?? 0,
  );

  // Which decks actually hold cards, so an export's empty scaffolding — the
  // default deck a collection always carries, or a parent that only groups
  // subdecks — is not offered as something to import. A card studied through a
  // filtered deck still belongs to its home deck, exactly as during extraction.
  const deckIdsWithCards = new Set<number>(
    database
      .query('select distinct case when odid != 0 then odid else did end from cards')
      .map((row) => integer(row[0])),
  );
  const decks = catalog.decks.map((deck) => ({
    ...deck,
    hasCards: deckIdsWithCards.has(deck.id),
  }));

  return ok({
    schemaVersion,
    layout,
    decks,
    noteTypes: catalog.noteTypes,
    hasAnyReviewEvidence: reviewedCards > 0,

    reviewedNotes(selection) {
      const noteType = catalog.noteTypes.find((type) => type.name === selection.noteTypeName);
      if (noteType === undefined) {
        return [];
      }
      const deckIds = scopedDeckIds(decks, selection.deckName, selection.deckScope);
      if (deckIds.length === 0) {
        return [];
      }

      // A card sitting in a filtered deck keeps its home deck in `odid`, so
      // studying a card in Custom Study must not move it out of its mapping.
      const placeholders = deckIds.map(() => '?').join(', ');
      const rows: readonly SqliteRow[] = database.query(
        `select n.id, n.flds,
                min(c.reps) as reps,
                ${hasLapses ? 'max(case when c.lapses >= 0 then cast(c.lapses as real) / c.reps end)' : 'null'} as lapseRatio,
                ${hasFactor ? 'min(case when c.factor > 0 then c.factor end)' : 'null'} as easeFactor
         from notes n
         join cards c on c.nid = n.id
         where n.mid = ?
           and c.reps > 0
           and (case when c.odid != 0 then c.odid else c.did end) in (${placeholders})
         group by n.id, n.flds
         order by n.id`,
        [noteType.id, ...deckIds],
      );

      return rows.map((row) => {
        const reps = integer(row[2]);
        const lapseRatio = Number(row[3]);
        const easeFactor = integer(row[4]);
        return {
          noteId: text(row[0]),
          fieldValues: text(row[1]).split(FIELD_SEPARATOR),
          ...(reps > 0 ? { reps } : {}),
          ...(row[3] !== null && Number.isFinite(lapseRatio) && lapseRatio >= 0 && lapseRatio <= 1
            ? { lapseRatio }
            : {}),
          ...(easeFactor > 0 ? { easeFactor } : {}),
        };
      });
    },
  });
}
