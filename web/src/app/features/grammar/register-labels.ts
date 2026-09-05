import type { RegisterPreference } from '../../domain/grammar/presets';

/** Shared by the register control and the change confirmation, so they agree. */
export const REGISTER_LABELS: Readonly<Record<RegisterPreference, string>> = {
  either: 'Either',
  spoken: 'Everyday spoken',
  written: 'Polite written',
};
