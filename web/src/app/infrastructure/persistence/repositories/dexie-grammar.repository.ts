import type { Clock } from '../../../domain/shared/clock';
import { ok, type Result } from '../../../domain/shared/result';
import {
  DEFAULT_GRAMMAR_PROFILE_SELECTION,
  type GrammarProfileSelection,
  type GrammarProfileSnapshot,
} from '../../../domain/grammar/profile';
import type { GrammarRepository } from '../../../domain/grammar/grammar-repository';
import type { StorageError } from '../../../domain/storage/storage-error';
import type { MonosaiDatabase } from '../monosai-db';
import { parseRecord } from '../record-validation';
import { ROW_VERSION } from '../schemas/common.schema';
import {
  grammarProfileRowSchema,
  grammarProfileSnapshotRowSchema,
} from '../schemas/grammar.schema';
import { runStorage } from './storage-operation';

const PROFILE_KEY = 'profile';

/**
 * Live grammar profile storage.
 *
 * The profile is a single row holding one difficulty preset. A fresh install has
 * no row and reads the default preset, so the profile is never empty and
 * generation is never gated on it.
 */
export class DexieGrammarRepository implements GrammarRepository {
  constructor(
    private readonly db: MonosaiDatabase,
    private readonly clock: Clock,
  ) {}

  async getSelection(): Promise<Result<GrammarProfileSelection, StorageError>> {
    const loaded = await runStorage('grammarProfile.get', () =>
      this.db.grammarProfile.get(PROFILE_KEY),
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(DEFAULT_GRAMMAR_PROFILE_SELECTION);
    }
    const parsed = parseRecord(grammarProfileRowSchema, loaded.value, 'grammarProfile');
    if (!parsed.ok) {
      return parsed;
    }
    const { presetId, registerPreference, customGuidance } = parsed.value;
    return ok({
      presetId,
      registerPreference,
      ...(customGuidance === undefined ? {} : { customGuidance }),
    });
  }

  setSelection(selection: GrammarProfileSelection): Promise<Result<void, StorageError>> {
    return runStorage('grammarProfile.put', async () => {
      await this.db.grammarProfile.put({
        v: ROW_VERSION,
        key: PROFILE_KEY,
        presetId: selection.presetId,
        registerPreference: selection.registerPreference,
        ...(selection.customGuidance === undefined
          ? {}
          : { customGuidance: selection.customGuidance }),
        updatedAt: this.clock.now(),
      });
    });
  }

  async captureProfile(
    snapshot: GrammarProfileSnapshot,
  ): Promise<Result<GrammarProfileSnapshot, StorageError>> {
    const written = await runStorage('grammarProfileSnapshots.put', () =>
      this.db.grammarProfileSnapshots.put({ ...snapshot, v: ROW_VERSION }),
    );
    return written.ok ? ok(snapshot) : written;
  }

  async getProfileCapture(
    id: string,
  ): Promise<Result<GrammarProfileSnapshot | null, StorageError>> {
    const loaded = await runStorage('grammarProfileSnapshots.get', () =>
      this.db.grammarProfileSnapshots.get(id),
    );
    if (!loaded.ok) {
      return loaded;
    }
    if (!loaded.value) {
      return ok(null);
    }
    const parsed = parseRecord(
      grammarProfileSnapshotRowSchema,
      loaded.value,
      'grammarProfileSnapshots',
    );
    if (!parsed.ok) {
      return parsed;
    }
    const { v: _version, ...capture } = parsed.value;
    return ok(capture);
  }
}
