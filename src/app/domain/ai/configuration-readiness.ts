/**
 * Whether a configuration has been proved to work as it currently stands.
 *
 * `stale` exists separately from `untested` because they call for different
 * words: one says "you changed something since this last worked", the other
 * says "this has never been tried". Both block generation, and neither deletes
 * anything that was already produced.
 */
export type ConfigurationReadiness =
  'no-credential' | 'incomplete' | 'untested' | 'stale' | 'ready' | 'failed';

export interface ReadinessInput {
  /** Every field the configuration needs has a value. */
  readonly complete: boolean;
  /** A key is saved. Without one, no test result can mean anything. */
  readonly hasCredential: boolean;
  readonly savedFingerprint: string | null;
  /** Fingerprint of the configuration as it stands right now. */
  readonly currentFingerprint: string;
  /** The most recent test attempt failed and nothing has changed since. */
  readonly lastAttemptFailed: boolean;
}

export function readinessOf(input: ReadinessInput): ConfigurationReadiness {
  if (!input.hasCredential) return 'no-credential';
  if (!input.complete) return 'incomplete';
  if (input.lastAttemptFailed) {
    return 'failed';
  }
  if (input.savedFingerprint === null) {
    return 'untested';
  }
  return input.savedFingerprint === input.currentFingerprint ? 'ready' : 'stale';
}
