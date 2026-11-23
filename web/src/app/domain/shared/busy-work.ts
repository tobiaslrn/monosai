/**
 * Work in progress that reloading the tab would destroy, by what it is rather
 * than in words: each surface that names it says it in its own form, a short
 * phrase beside a waiting Reload and a sentence in a confirmation.
 */
export type BusyWork =
  /** Stories still being written. */
  | { readonly kind: 'story-generation'; readonly count: number }
  /** Written stories whose save failed and can still be retried from memory. */
  | { readonly kind: 'unsaved-story'; readonly count: number }
  | { readonly kind: 'package-import' }
  | { readonly kind: 'import-draft' };
