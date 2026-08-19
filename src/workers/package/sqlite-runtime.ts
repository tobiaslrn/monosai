/**
 * Read-only access to a collection database held in memory.
 *
 * The surface is deliberately one method: the package pipeline only ever reads,
 * and a `run`/`exec` escape hatch would make "Monosai never writes to your Anki
 * collection" a review question instead of a type.
 */
export interface CollectionDatabase {
  query(sql: string, params?: readonly SqliteParameter[]): readonly SqliteRow[];
  close(): void;
}

export type SqliteParameter = string | number;
export type SqliteValue = string | number | Uint8Array | null;
export type SqliteRow = readonly SqliteValue[];

/** Opens collection bytes as a database. Injected so tests can supply a double. */
export type CollectionDatabaseFactory = (bytes: Uint8Array) => Promise<CollectionDatabase>;

interface SqlJsStatement {
  bind(params: readonly SqliteParameter[]): boolean;
  step(): boolean;
  get(): SqliteValue[];
  free(): boolean;
}

interface SqlJsDatabase {
  prepare(sql: string): SqlJsStatement;
  close(): void;
}

interface SqlJsModule {
  Database: new (bytes: Uint8Array) => SqlJsDatabase;
}

type SqlJsInitializer = (config: { locateFile: (file: string) => string }) => Promise<SqlJsModule>;

let modulePromise: Promise<SqlJsModule> | null = null;

/**
 * Loads the SQLite runtime once per worker.
 *
 * The import is dynamic so the WebAssembly binary is fetched only when a
 * package is actually opened — a learner who never uses the package provider
 * pays nothing for it — and the promise is memoized because a second
 * instantiation would allocate a second copy of the runtime.
 */
async function loadSqlJs(wasmUrl: string): Promise<SqlJsModule> {
  modulePromise ??= import('sql.js').then((imported) => {
    const initialize = imported.default as unknown as SqlJsInitializer;
    return initialize({ locateFile: () => wasmUrl });
  });
  return modulePromise;
}

/**
 * Creates the production database factory.
 *
 * `wasmUrl` is passed in rather than derived here because a worker cannot know
 * the application's base href, which changes between the dev server and the
 * deployed subpath.
 */
export function sqlJsDatabaseFactory(wasmUrl: string): CollectionDatabaseFactory {
  return async (bytes) => {
    const sql = await loadSqlJs(wasmUrl);
    const database = new sql.Database(bytes);
    return {
      query(statementSql, params = []) {
        const statement = database.prepare(statementSql);
        try {
          if (params.length > 0) {
            statement.bind(params);
          }
          const rows: SqliteRow[] = [];
          while (statement.step()) {
            rows.push(statement.get());
          }
          return rows;
        } finally {
          statement.free();
        }
      },
      close() {
        database.close();
      },
    };
  };
}

/** Test seam: forgets the memoized runtime so a fresh one can be loaded. */
export function resetSqlJsForTesting(): void {
  modulePromise = null;
}
