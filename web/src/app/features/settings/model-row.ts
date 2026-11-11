/** The words of a model row: its name, and its id in the monospace face when the name is not already it. */
export interface ModelRowWords {
  readonly summary: string;
  readonly code: string | null;
}

/**
 * What a model row says. The model's own name comes from the catalogue, or from
 * the name saved with it while the catalogue has not loaded, or is its id; the
 * id follows the name when they differ. With no model chosen the row says what
 * stands in its place.
 */
export function modelRowWords(
  chosen: {
    readonly id: string;
    readonly catalogName: string | null;
    readonly savedName: string | null;
  },
  whenNone: string,
): ModelRowWords {
  if (chosen.id === '') {
    return { summary: whenNone, code: null };
  }
  const name = chosen.catalogName ?? chosen.savedName ?? chosen.id;
  return name === chosen.id ? { summary: name, code: null } : { summary: name, code: chosen.id };
}
