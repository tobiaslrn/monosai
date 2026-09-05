import type { Dexie, Transaction } from 'dexie';
import { supportsTtsSpeed } from '../../domain/ai/tts-configuration';

interface SchemaVersion {
  readonly version: number;
  readonly stores: Record<string, string | null>;
  readonly upgrade?: (transaction: Transaction) => void | PromiseLike<void>;
}

/**
 * Schema history. One entry per monotonic version; a version's stores and its
 * upgrade function are declared together so transitions stay reviewable.
 *
 * Published entries are immutable. Add a new entry for every table, primary-key,
 * or index change, and an upgrade function when stored records need transforming.
 *
 * Indexes exist only for queries the specification requires. Large text, token
 * arrays, blobs, credentials, and policy text are never indexed.
 */
const V2_STORES: Readonly<Record<string, string | null>> = {
  settings: '&key',
  credentials: '&key',
  sourceMappings: '&id, providerKind, [deckName+noteTypeName]',
  // One current row; the repository replaces it atomically on refresh.
  vocabularySnapshots: '&id, createdAt, uniqueEntryCount',
  vocabularyItems: '&id, snapshotId, [snapshotId+expressionHash]',
  vocabularyProvenance: '++id, vocabularyItemId, sourceMappingId',
  // Single row: the live profile is one difficulty preset, not a selection.
  grammarProfile: '&key',
  grammarProfileSnapshots: '&id, profileHash',
  readings: '&id, kind, createdAt, lastOpenedAt, [kind+createdAt]',
  paragraphs: '&id, readingId, [readingId+position]',
  sentences: '&id, readingId, paragraphId, [readingId+positionInReading]',
  tokenAnalyses: '&[sentenceId+analyzerVersion], sentenceId, readingId',
  frozenValidations: '&sentenceId, readingId, snapshotId',
  translations: '&cacheKey, sentenceId, readingId',
  grammarAnalyses: '&cacheKey, sentenceId, readingId, profileHash',
  audioAssets: '&cacheKey, id, sentenceId, readingId',
  assetJobs: '&id, readingId, kind, state, [readingId+kind]',
  generationProvenance: '&id, readingId',
};

const V3_STORES: Readonly<Record<string, string | null>> = {
  ...V2_STORES,
  vocabularySources: '&id, kind, providerKind',
  vocabularySourceCaches: '&sourceId, refreshedAt',
};

const V4_STORES: Readonly<Record<string, string | null>> = {
  ...V3_STORES,
  sourceMappings: null,
  vocabularyProvenance: '++id, vocabularyItemId, sourceId',
};

const V5_STORES = V4_STORES;
const V6_STORES = V5_STORES;
const V7_STORES = V6_STORES;
const V8_STORES = V7_STORES;

export const SCHEMA_VERSIONS: readonly SchemaVersion[] = [
  {
    version: 1,
    stores: V2_STORES,
  },
  {
    version: 2,
    // Earlier development builds changed v1 in place. Advancing to v2 makes
    // Dexie reconcile each installed v1's actual schema with this canonical one.
    stores: V2_STORES,
  },
  {
    version: 3,
    stores: V3_STORES,
    upgrade: async (transaction) => {
      const mappings = (await transaction.table('sourceMappings').toArray()) as Record<
        string,
        unknown
      >[];
      const sources = mappings.map((mapping) => migrateMapping(mapping));
      await transaction.table('vocabularySources').bulkPut(sources);
      const sourcesById = new Map(sources.map((source) => [source['id'], source]));

      await transaction
        .table('vocabularySnapshots')
        .toCollection()
        .modify((row: unknown) => {
          const snapshot = requireRecord(row, 'vocabulary snapshot');
          if (!Array.isArray(snapshot['mappingIds']) || !Array.isArray(snapshot['providerKinds'])) {
            throw new Error('A stored vocabulary snapshot has an unsupported source shape.');
          }
          const stats = requireRecord(snapshot['stats'], 'vocabulary snapshot statistics');
          snapshot['sourceIds'] = snapshot['mappingIds'];
          snapshot['sourceKinds'] = snapshot['providerKinds'].map((kind) =>
            kind === 'package' ? 'anki-package' : 'anki-connect',
          );
          stats['sourcesQueried'] = stats['mappingsQueried'];
          stats['entriesRead'] = stats['reviewedEligibleNotes'];
          stats['sourceWarnings'] = stats['providerWarnings'];
          delete snapshot['mappingIds'];
          delete snapshot['providerKinds'];
          delete stats['mappingsQueried'];
          delete stats['reviewedEligibleNotes'];
          delete stats['providerWarnings'];
        });

      await transaction
        .table('vocabularyProvenance')
        .toCollection()
        .modify((row: unknown) => {
          const provenance = requireRecord(row, 'vocabulary provenance');
          const sourceId = provenance['sourceMappingId'];
          if (typeof sourceId !== 'string') {
            throw new Error('Stored vocabulary provenance has no source identifier.');
          }
          const source = sourcesById.get(sourceId);
          provenance['sourceId'] = sourceId;
          provenance['sourceKind'] = source?.['kind'] ?? 'anki-connect';
          provenance['sourceLabel'] = source?.['label'] ?? 'Anki source';
          if (typeof provenance['sourceNoteId'] === 'string') {
            provenance['sourceRecordId'] = provenance['sourceNoteId'];
          }
          delete provenance['sourceMappingId'];
          delete provenance['sourceNoteId'];
        });
    },
  },
  {
    version: 4,
    stores: V4_STORES,
  },
  {
    version: 5,
    stores: V5_STORES,
    upgrade: async (transaction) => {
      const settings = transaction.table('settings');
      const textRow = (await settings.get('text-model')) as Record<string, unknown> | undefined;
      if (textRow !== undefined) {
        const value = requireRecord(textRow['value'], 'text model settings');
        const presets = Array.isArray(value['presets']) ? value['presets'] : [];
        const activeId =
          typeof value['activePresetId'] === 'string' ? value['activePresetId'] : null;
        value['grammarPresetId'] = null;
        value['presets'] = presets.map((entry) => {
          const preset = requireRecord(entry, 'text model preset');
          return {
            ...preset,
            lastTestFingerprint:
              preset['id'] === activeId ? (value['lastTestFingerprint'] ?? null) : null,
            lastTestedAt: preset['id'] === activeId ? (value['lastTestedAt'] ?? null) : null,
            structuredOutput:
              preset['id'] === activeId ? (value['structuredOutput'] ?? null) : null,
          };
        });
        await settings.put(textRow);
      }

      const ttsRow = (await settings.get('tts')) as Record<string, unknown> | undefined;
      if (ttsRow !== undefined) {
        const value = requireRecord(ttsRow['value'], 'voice model settings');
        const presets = Array.isArray(value['presets']) ? value['presets'] : [];
        const activeId =
          typeof value['activePresetId'] === 'string' ? value['activePresetId'] : null;
        value['presets'] = presets.map((entry) => {
          const preset = requireRecord(entry, 'voice model preset');
          return {
            ...preset,
            lastTestFingerprint:
              preset['id'] === activeId ? (value['lastTestFingerprint'] ?? null) : null,
            lastTestedAt: preset['id'] === activeId ? (value['lastTestedAt'] ?? null) : null,
          };
        });
        await settings.put(ttsRow);
      }
    },
  },
  {
    version: 6,
    stores: V6_STORES,
    upgrade: async (transaction) => {
      const settings = transaction.table('settings');
      const ttsRow = (await settings.get('tts')) as Record<string, unknown> | undefined;
      if (ttsRow === undefined) {
        return;
      }
      const value = requireRecord(ttsRow['value'], 'voice model settings');
      value['speechInstructions'] = 'unsupported';
      const presets = Array.isArray(value['presets']) ? value['presets'] : [];
      value['presets'] = presets.map((entry) => ({
        ...requireRecord(entry, 'voice model preset'),
        speechInstructions: 'unsupported',
      }));
      await settings.put(ttsRow);
    },
  },
  {
    version: 7,
    stores: V7_STORES,
    /**
     * Adds the measured `speedSupported` field beside `speechInstructions`.
     *
     * Purely additive: the seeded value is what the code already assumed for
     * that model, so no row loses anything and nothing is reset. The real value
     * is written by the next configuration test, which every stored row is due
     * for anyway because `TTS_TEST_VERSION` moved with this release.
     */
    upgrade: async (transaction) => {
      const settings = transaction.table('settings');
      const ttsRow = (await settings.get('tts')) as Record<string, unknown> | undefined;
      if (ttsRow === undefined) {
        return;
      }
      const value = requireRecord(ttsRow['value'], 'voice model settings');
      value['speedSupported'] = seededSpeedSupport(value['modelId']);
      const presets = Array.isArray(value['presets']) ? value['presets'] : [];
      value['presets'] = presets.map((entry) => {
        const preset = requireRecord(entry, 'voice model preset');
        return { ...preset, speedSupported: seededSpeedSupport(preset['modelId']) };
      });
      await settings.put(ttsRow);
    },
  },
  {
    version: 8,
    stores: V8_STORES,
    upgrade: async (transaction) => {
      await transaction
        .table('readings')
        .toCollection()
        .modify((row: unknown) => {
          const reading = requireRecord(row, 'reading');
          const sentenceCount = reading['sentenceCount'];
          if (typeof sentenceCount !== 'number' || sentenceCount === 0) {
            reading['preparationTargets'] = [];
            return;
          }
          const translation = requireRecord(reading['translationSummary'], 'translation summary');
          const grammar = requireRecord(reading['grammarSummary'], 'grammar summary');
          const audio = requireRecord(reading['audioSummary'], 'audio summary');
          reading['preparationTargets'] = [
            ...(typeof translation['completed'] === 'number' && translation['completed'] > 0
              ? ['english']
              : []),
            ...(grammar['state'] === 'complete' || grammar['state'] === 'partial'
              ? ['grammar']
              : []),
            ...(typeof audio['completed'] === 'number' && audio['completed'] > 0 ? ['audio'] : []),
          ];
        });
    },
  },
  {
    version: 9,
    stores: V8_STORES,
    upgrade: async (transaction) => {
      const settings = transaction.table('settings');
      const row = (await settings.get('app')) as Record<string, unknown> | undefined;
      if (row === undefined) {
        return;
      }
      const value = requireRecord(row['value'], 'app settings');
      value['helpIntroSeen'] = false;
      await settings.put(row);
    },
  },
  {
    version: 10,
    stores: V8_STORES,
    upgrade: async (transaction) => {
      const settings = transaction.table('settings');
      for (const key of ['text-model', 'tts']) {
        const row = (await settings.get(key)) as Record<string, unknown> | undefined;
        if (row === undefined) continue;
        const value = requireRecord(row['value'], 'model settings');
        value['failedTests'] = [];
        await settings.put(row);
      }
    },
  },
];

export const CURRENT_SCHEMA_VERSION = SCHEMA_VERSIONS[SCHEMA_VERSIONS.length - 1].version;

/** Declares every schema version on the database instance, in order. */
export function applySchema(db: Dexie): void {
  for (const entry of SCHEMA_VERSIONS) {
    const version = db.version(entry.version).stores(entry.stores);
    if (entry.upgrade !== undefined) {
      version.upgrade(entry.upgrade);
    }
  }
}

function seededSpeedSupport(modelId: unknown): boolean {
  return typeof modelId === 'string' && modelId !== '' && supportsTtsSpeed(modelId);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`The stored ${label} is not an object.`);
  }
  return value as Record<string, unknown>;
}

function migrateMapping(mapping: Record<string, unknown>): Record<string, unknown> {
  const providerKind = mapping['providerKind'];
  const id = mapping['id'];
  const deckName = mapping['deckName'];
  const fieldName = mapping['expressionFieldName'];
  if (
    typeof id !== 'string' ||
    typeof deckName !== 'string' ||
    typeof fieldName !== 'string' ||
    !['desktop-connect', 'android-connect', 'package'].includes(String(providerKind))
  ) {
    throw new Error('A stored Anki source cannot be migrated safely.');
  }
  const isPackage = providerKind === 'package';
  return {
    ...mapping,
    kind: isPackage ? 'anki-package' : 'anki-connect',
    label: `Anki · ${deckName} · ${fieldName}`,
    automaticSync: !isPackage,
    lastSyncedAt: null,
  };
}
