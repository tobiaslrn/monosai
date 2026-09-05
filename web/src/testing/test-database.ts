import Dexie from 'dexie';
import { MonosaiDatabase } from '../app/infrastructure/persistence/monosai-db';

let counter = 0;

/** Creates an isolated database per test so state never leaks between cases. */
export async function createTestDatabase(): Promise<MonosaiDatabase> {
  counter += 1;
  const db = new MonosaiDatabase(`monosai-test-${counter}-${Date.now()}`);
  await db.open();
  return db;
}

export async function destroyTestDatabase(db: MonosaiDatabase): Promise<void> {
  const { name } = db;
  db.close();
  await Dexie.delete(name);
}
