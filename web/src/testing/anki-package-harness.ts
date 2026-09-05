import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import type { PackageResponseMessage } from '../app/infrastructure/anki/package/package-protocol';
import type { PackageWorkerChannel } from '../app/infrastructure/anki/package/package-worker.client';
import { PackageWorkerHost } from '../workers/package/package-worker-host';
import type { PackageResourceLimits } from '../workers/package/resource-limits';
import type {
  CollectionDatabase,
  CollectionDatabaseFactory,
} from '../workers/package/sqlite-runtime';

const FIXTURE_DIR = join(process.cwd(), 'src', 'testing', 'fixtures', 'anki');
const WASM_PATH = join(process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm');

export type AnkiFixtureName =
  | 'contract-schema18-zstd.apkg'
  | 'contract-schema18-deflate.apkg'
  | 'contract-schema11.apkg'
  | 'contract-schema18-zstd.colpkg'
  | 'no-review-evidence.apkg'
  | 'filtered-deck.apkg'
  | 'nested-decks.apkg'
  | 'missing-reps-column.apkg'
  | 'no-collection.apkg'
  | 'not-a-database.apkg'
  | 'unsupported-compression.apkg'
  | 'unsafe-path.apkg'
  | 'encrypted.apkg'
  | 'decompression-bomb.apkg'
  | 'truncated.apkg';

/** Reads a committed fixture package as transferable bytes. */
export function readAnkiFixture(name: AnkiFixtureName): ArrayBuffer {
  const bytes = readFileSync(join(FIXTURE_DIR, name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

interface SqlJsStatementLike {
  bind(params: readonly (string | number)[]): boolean;
  step(): boolean;
  get(): (string | number | Uint8Array | null)[];
  free(): boolean;
}

interface SqlJsDatabaseLike {
  prepare(sql: string): SqlJsStatementLike;
  close(): void;
}

let modulePromise: Promise<{ Database: new (bytes: Uint8Array) => SqlJsDatabaseLike }> | null =
  null;

/**
 * Loads SQLite for tests without a network fetch.
 *
 * Production passes a URL and lets the runtime fetch it; under Vitest there is
 * no server to fetch from, so the binary is read off disk and handed straight
 * to the module. The rest of the runtime — and everything the host does with
 * it — is identical.
 */
async function testSqlModule(): Promise<{
  Database: new (bytes: Uint8Array) => SqlJsDatabaseLike;
}> {
  const wasm = readFileSync(WASM_PATH);
  const config = {
    wasmBinary: wasm.buffer.slice(wasm.byteOffset, wasm.byteOffset + wasm.byteLength),
  };
  modulePromise ??= initSqlJs(config) as unknown as Promise<{
    Database: new (bytes: Uint8Array) => SqlJsDatabaseLike;
  }>;
  return modulePromise;
}

export const testDatabaseFactory: CollectionDatabaseFactory = async (bytes) => {
  const sql = await testSqlModule();
  const database = new sql.Database(bytes);
  const wrapped: CollectionDatabase = {
    query(statementSql, params = []) {
      const statement = database.prepare(statementSql);
      try {
        if (params.length > 0) {
          statement.bind(params);
        }
        const rows = [];
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
  return wrapped;
};

export interface PackageHarness {
  readonly host: PackageWorkerHost;
  readonly channel: PackageWorkerChannel;
  readonly responses: readonly PackageResponseMessage[];
  /** Number of times a database was opened, so cleanup can be asserted. */
  readonly openedDatabases: () => number;
  readonly closedDatabases: () => number;
}

export interface PackageHarnessOptions {
  readonly limits?: PackageResourceLimits;
  readonly createDatabase?: CollectionDatabaseFactory;
}

/**
 * Drives `PackageWorkerHost` directly, with no Worker global.
 *
 * The channel it exposes is the same one `PackageWorkerClient` expects, so the
 * client, the protocol, and the host can all be exercised together in one
 * process while remaining exactly the code that ships.
 */
export function createPackageHarness(options: PackageHarnessOptions = {}): PackageHarness {
  const responses: PackageResponseMessage[] = [];
  const listeners = new Set<(data: unknown) => void>();
  let opened = 0;
  let closed = 0;

  const factory: CollectionDatabaseFactory = async (bytes) => {
    const inner = await (options.createDatabase ?? testDatabaseFactory)(bytes);
    opened += 1;
    return {
      query: (sql, params) => inner.query(sql, params),
      close: () => {
        closed += 1;
        inner.close();
      },
    };
  };

  const host = new PackageWorkerHost({
    post: (message) => {
      responses.push(message);
      for (const listener of listeners) {
        listener(message);
      }
    },
    createDatabase: () => factory,
    loadZstd: async () => {
      const { decompress } = await import('fzstd');
      return (input) => decompress(input);
    },
    ...(options.limits === undefined ? {} : { limits: options.limits }),
  });

  const channel: PackageWorkerChannel = {
    post: (message) => {
      void host.handleMessage(message);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    terminate: () => {
      listeners.clear();
    },
  };

  return {
    host,
    channel,
    responses,
    openedDatabases: () => opened,
    closedDatabases: () => closed,
  };
}
