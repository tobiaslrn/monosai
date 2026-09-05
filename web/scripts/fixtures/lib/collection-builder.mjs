import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const FIELD_SEPARATOR = '\u001f';

/**
 * Builds a collection database and returns its bytes.
 *
 * `node:sqlite` writes to a file rather than to memory, so the database is
 * created in a temporary directory and read back; the directory is removed
 * before this returns, so nothing is left behind between runs.
 */
function withDatabase(build) {
  const directory = mkdtempSync(join(tmpdir(), 'monosai-fixture-'));
  const path = join(directory, 'collection.sqlite');
  const database = new DatabaseSync(path);
  try {
    build(database);
    database.close();
    return readFileSync(path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** Deck ids are assigned in declaration order, starting after Anki's Default deck. */
function deckIds(deckNames) {
  const ids = new Map([['Default', 1]]);
  deckNames.forEach((name, index) => {
    ids.set(name, 1700000000000 + index);
  });
  return ids;
}

function noteTypeIds(noteTypes) {
  const ids = new Map();
  noteTypes.forEach((noteType, index) => {
    ids.set(noteType.name, 1600000000000 + index);
  });
  return ids;
}

/**
 * The modern layout: decks, note types, and fields each have their own table.
 *
 * Only the columns Monosai reads are populated. A real collection carries far
 * more, but a fixture that filled them in would be asserting Anki's schema
 * rather than Monosai's use of it.
 */
export function buildSchema18(collection, { separator = FIELD_SEPARATOR } = {}) {
  const decks = deckIds(collection.deckNames);
  const models = noteTypeIds(collection.noteTypes);

  return withDatabase((database) => {
    database.exec(`
      create table col (id integer primary key, ver integer not null, decks text, models text);
      create table decks (id integer primary key, name text not null);
      create table notetypes (id integer primary key, name text not null);
      create table fields (ntid integer not null, ord integer not null, name text not null);
      create table templates (ntid integer not null, ord integer not null, name text not null);
      create table notes (id integer primary key, guid text, mid integer not null, flds text not null, sfld text);
      create table cards (id integer primary key, nid integer not null, did integer not null,
                          ord integer, odid integer not null default 0, queue integer default 0,
                          type integer default 0, reps integer not null default 0, lapses integer default 0,
                          factor integer default 0);
      create table revlog (id integer primary key, cid integer not null, ease integer);
    `);
    database
      .prepare('insert into col (id, ver, decks, models) values (1, 18, ?, ?)')
      .run('{}', '{}');

    for (const [name, id] of decks) {
      // Schema 18 separates nested deck components with the unit separator.
      database
        .prepare('insert into decks (id, name) values (?, ?)')
        .run(id, name.split('::').join(separator));
    }
    for (const noteType of collection.noteTypes) {
      const ntid = models.get(noteType.name);
      database.prepare('insert into notetypes (id, name) values (?, ?)').run(ntid, noteType.name);
      noteType.fieldNames.forEach((fieldName, ord) => {
        database
          .prepare('insert into fields (ntid, ord, name) values (?, ?, ?)')
          .run(ntid, ord, fieldName);
      });
      database
        .prepare('insert into templates (ntid, ord, name) values (?, ?, ?)')
        .run(ntid, 0, 'Card 1');
    }

    let noteRowId = 1;
    let cardRowId = 1;
    let revlogId = 1;
    for (const note of collection.notes) {
      const id = noteRowId++;
      database
        .prepare('insert into notes (id, guid, mid, flds, sfld) values (?, ?, ?, ?, ?)')
        .run(
          id,
          note.id,
          models.get(note.noteTypeName),
          note.fieldValues.join(separator),
          note.fieldValues[0] ?? '',
        );

      for (const card of note.cards) {
        const cardId = cardRowId++;
        database
          .prepare(
            'insert into cards (id, nid, did, ord, odid, queue, type, reps, lapses, factor) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            cardId,
            id,
            decks.get(card.deckName) ?? 1,
            0,
            card.filteredFrom === undefined ? 0 : (decks.get(card.filteredFrom) ?? 0),
            card.suspended ? -1 : 2,
            card.reps > 0 ? 2 : 0,
            card.reps,
            card.lapses ?? 0,
            card.factor ?? 0,
          );
        for (let review = 0; review < card.reps; review += 1) {
          database
            .prepare('insert into revlog (id, cid, ease) values (?, ?, ?)')
            .run(revlogId++, cardId, 3);
        }
      }
    }
  });
}

/** The pre-18 layout, where decks and note types live as JSON in the `col` row. */
export function buildSchema11(collection) {
  const decks = deckIds(collection.deckNames);
  const models = noteTypeIds(collection.noteTypes);

  const decksJson = {};
  for (const [name, id] of decks) {
    decksJson[String(id)] = { id, name };
  }
  const modelsJson = {};
  for (const noteType of collection.noteTypes) {
    const ntid = models.get(noteType.name);
    modelsJson[String(ntid)] = {
      id: ntid,
      name: noteType.name,
      flds: noteType.fieldNames.map((name, ord) => ({ name, ord })),
    };
  }

  return withDatabase((database) => {
    database.exec(`
      create table col (id integer primary key, ver integer not null, decks text not null, models text not null);
      create table notes (id integer primary key, guid text, mid integer not null, flds text not null, sfld text);
      create table cards (id integer primary key, nid integer not null, did integer not null,
                          ord integer, odid integer not null default 0, queue integer default 0,
                          type integer default 0, reps integer not null default 0, lapses integer default 0,
                          factor integer default 0);
      create table revlog (id integer primary key, cid integer not null, ease integer);
    `);
    database
      .prepare('insert into col (id, ver, decks, models) values (1, 11, ?, ?)')
      .run(JSON.stringify(decksJson), JSON.stringify(modelsJson));

    let noteRowId = 1;
    let cardRowId = 1;
    for (const note of collection.notes) {
      const id = noteRowId++;
      database
        .prepare('insert into notes (id, guid, mid, flds, sfld) values (?, ?, ?, ?, ?)')
        .run(
          id,
          note.id,
          models.get(note.noteTypeName),
          note.fieldValues.join(FIELD_SEPARATOR),
          note.fieldValues[0] ?? '',
        );
      for (const card of note.cards) {
        database
          .prepare(
            'insert into cards (id, nid, did, ord, odid, queue, type, reps, lapses, factor) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            cardRowId++,
            id,
            decks.get(card.deckName) ?? 1,
            0,
            0,
            card.suspended ? -1 : 2,
            card.reps > 0 ? 2 : 0,
            card.reps,
            card.lapses ?? 0,
            card.factor ?? 0,
          );
      }
    }
  });
}

/** A collection whose `cards` table cannot prove anything was ever reviewed. */
export function buildWithoutRepsColumn(collection) {
  const models = noteTypeIds(collection.noteTypes);
  return withDatabase((database) => {
    database.exec(`
      create table col (id integer primary key, ver integer not null, decks text, models text);
      create table decks (id integer primary key, name text not null);
      create table notetypes (id integer primary key, name text not null);
      create table fields (ntid integer not null, ord integer not null, name text not null);
      create table notes (id integer primary key, guid text, mid integer not null, flds text not null, sfld text);
      create table cards (id integer primary key, nid integer not null, did integer not null);
    `);
    database
      .prepare('insert into col (id, ver, decks, models) values (1, 18, ?, ?)')
      .run('{}', '{}');
    for (const noteType of collection.noteTypes) {
      const ntid = models.get(noteType.name);
      database.prepare('insert into notetypes (id, name) values (?, ?)').run(ntid, noteType.name);
      noteType.fieldNames.forEach((fieldName, ord) => {
        database
          .prepare('insert into fields (ntid, ord, name) values (?, ?, ?)')
          .run(ntid, ord, fieldName);
      });
    }
  });
}

/** The legacy stub a modern package carries so old clients report an upgrade. */
export function buildLegacyStub() {
  return withDatabase((database) => {
    database.exec(`
      create table col (id integer primary key, ver integer not null, decks text not null, models text not null);
      create table notes (id integer primary key, mid integer not null, flds text not null);
      create table cards (id integer primary key, nid integer not null, did integer not null, reps integer not null default 0);
    `);
    database
      .prepare('insert into col (id, ver, decks, models) values (1, 11, ?, ?)')
      .run('{}', '{}');
    database
      .prepare('insert into notes (id, mid, flds) values (1, 1, ?)')
      .run('Please upgrade to the latest Anki version, then import this file again.');
  });
}
