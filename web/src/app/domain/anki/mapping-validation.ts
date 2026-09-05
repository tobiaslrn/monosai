import type { SourceMapping } from '../vocabulary/source-mapping';
import { findDeck, findNoteType, type AnkiCatalog } from './catalog';

/** Which part of a mapping no longer exists in the provider's catalog. */
export type StaleReason = 'deck-missing' | 'note-type-missing' | 'field-missing';

export interface StaleMapping {
  readonly mapping: SourceMapping;
  readonly reason: StaleReason;
}

export interface MappingResolution {
  readonly resolved: readonly SourceMapping[];
  readonly stale: readonly StaleMapping[];
}

function staleReasonOf(mapping: SourceMapping, catalog: AnkiCatalog): StaleReason | null {
  if (findDeck(catalog, mapping.deckName) === null) {
    return 'deck-missing';
  }
  const noteType = findNoteType(catalog, mapping.noteTypeName);
  if (noteType === null) {
    return 'note-type-missing';
  }
  if (!noteType.fieldNames.includes(mapping.expressionFieldName)) {
    return 'field-missing';
  }
  return null;
}

/**
 * Splits the enabled mappings into those the provider can still answer and
 * those whose deck, note type, or field has disappeared.
 *
 * Disabled mappings are ignored entirely: a mapping the learner switched off is
 * not something they have to repair before refreshing.
 */
export function resolveMappings(
  mappings: readonly SourceMapping[],
  catalog: AnkiCatalog,
): MappingResolution {
  const resolved: SourceMapping[] = [];
  const stale: StaleMapping[] = [];

  for (const mapping of mappings) {
    if (!mapping.enabled) {
      continue;
    }
    const reason = staleReasonOf(mapping, catalog);
    if (reason === null) {
      resolved.push(mapping);
    } else {
      stale.push({ mapping, reason });
    }
  }

  return { resolved, stale };
}

/** Refresh stays blocked while any enabled mapping is unresolvable. */
export function canRefreshMappings(resolution: MappingResolution): boolean {
  return resolution.stale.length === 0 && resolution.resolved.length > 0;
}
