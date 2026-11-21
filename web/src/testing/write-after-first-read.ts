import Dexie from 'dexie';
import type { MonosaiDatabase } from '../app/infrastructure/persistence/monosai-db';

/**
 * Lands a competing write between two reads of the operation under test, for
 * a test that a read and what depends on it happen in one transaction.
 *
 * Starts `write` the moment the first read of one of `tables` returns,
 * outside whatever transaction that read belongs to, and holds the read's
 * answer back until the write has asked for its own transaction. Holding
 * waits on microtasks only, so the read's transaction stays open. Any later
 * request outside that transaction then waits for the write and sees what it
 * wrote; a request inside it does not.
 *
 * Dexie builds its middleware stack when the database opens, so this reopens
 * the database. `written` settles with the write's own result.
 */
export async function writeAfterFirstRead<T>(
  db: MonosaiDatabase,
  tables: readonly string[],
  write: () => Promise<T>,
): Promise<{ readonly written: Promise<T> }> {
  let started = false;
  let resolveWritten!: (value: Promise<T>) => void;
  const written = new Promise<T>((resolve) => {
    resolveWritten = resolve;
  });
  const afterRead = async <R>(read: Promise<R>): Promise<R> => {
    const answer = await read;
    if (!started) {
      started = true;
      resolveWritten(Dexie.ignoreTransaction(write));
      for (let tick = 0; tick < 50; tick += 1) await Promise.resolve();
    }
    return answer;
  };
  db.use({
    stack: 'dbcore',
    name: 'write-after-first-read',
    create: (down) => ({
      ...down,
      table: (name) => {
        const table = down.table(name);
        if (!tables.includes(name)) return table;
        return {
          ...table,
          get: (request) => afterRead(table.get(request)),
          getMany: (request) => afterRead(table.getMany(request)),
          query: (request) => afterRead(table.query(request)),
          openCursor: (request) => afterRead(table.openCursor(request)),
        };
      },
    }),
  });
  db.close();
  await db.open();
  return { written };
}
