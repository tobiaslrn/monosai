/**
 * Every AnkiConnect action Monosai is permitted to send.
 *
 * This list is the enforcement point for the rule that all Anki access is
 * read-only. `AnkiConnectClient.invoke` is private and its `action` parameter is
 * typed as `AllowedAction`, so sending anything outside this list is a compile
 * error rather than something a review has to notice. Adding an entry here is
 * the only way to widen what Monosai can ask Anki to do, and every one of these
 * nine only reads.
 *
 * Never add an action that creates, changes, deletes, schedules, syncs, imports,
 * exports, stores media, or opens a window in the Anki UI.
 */
export const ALLOWED_ACTIONS = [
  'version',
  'requestPermission',
  'deckNames',
  'modelNames',
  'modelFieldNames',
  'findCards',
  'cardsInfo',
  'notesInfo',
  // Reads the review log so a word can be weighted by when it was learned.
  // AnkiDroid's content provider has no review log, so the bridge answers this
  // as an unsupported action and the caller falls back to the card interval.
  'getReviewsOfCards',
] as const;

export type AllowedAction = (typeof ALLOWED_ACTIONS)[number];

/**
 * Verbs that appear in AnkiConnect's mutating actions.
 *
 * Checked by a test against the allowlist so a future addition that reads as
 * harmless — `storeMediaFile`, `guiBrowse`, `reloadCollection` — cannot slip in
 * without the check failing.
 */
export const MUTATING_VERBS = [
  'add',
  'create',
  'update',
  'set',
  'delete',
  'remove',
  'clear',
  'replace',
  'change',
  'insert',
  'store',
  'save',
  'sync',
  'import',
  'export',
  'media',
  'gui',
  'reload',
  'suspend',
  'unsuspend',
  'bury',
  'forget',
  'relearn',
  'answer',
  'reposition',
  'reset',
] as const;
