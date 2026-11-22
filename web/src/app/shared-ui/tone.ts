/**
 * The tones, each with exactly one meaning, app-wide (R45 in the design rules):
 *
 * - `action`: press this. The sage action colour.
 * - `success`: it worked.
 * - `warning`: it can go ahead but may be wrong.
 * - `danger`: it failed, or pressing it destroys something.
 * - `setup`: something must be set up first.
 * - `info`: a fact worth knowing.
 *
 * Every primitive that takes a tone takes this type or a subset of it
 * (`Extract<Tone, …>`), limited to the tones it can draw. The lavender
 * highlight is not a tone: it marks no status and nothing pressable.
 */
export type Tone = 'action' | 'success' | 'warning' | 'danger' | 'setup' | 'info';

/** The tones that say where something stands; `action` is not a status. */
export type StatusTone = Exclude<Tone, 'action'>;
