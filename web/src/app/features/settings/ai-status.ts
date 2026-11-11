import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { SettingsRowStatus } from '../../shared-ui/settings-row/settings-row.component';

/** Where an AI configuration stands, as the tone and words that lead a row's summary. */
export interface AiStatus {
  readonly tone: SettingsRowStatus | null;
  readonly text: string;
}

/** The states an audio configuration can be in beyond readiness: a test that is running or stopped. */
export type AudioStatus = ConfigurationReadiness | 'testing' | 'cancelled';

/**
 * Readiness as words. Each tone has one meaning: success, it worked; warning,
 * it can go ahead but has not been vouched for; danger, it failed. A state that
 * only waits for a choice has no tone.
 */
export function readinessStatus(
  readiness: ConfigurationReadiness,
  subject: string | null = null,
): AiStatus {
  const named = (words: string): string => (subject === null ? words : `${subject} ${words}`);
  switch (readiness) {
    case 'ready':
      return { tone: 'success', text: 'Ready' };
    case 'untested':
      return { tone: 'warning', text: 'Not tested' };
    case 'stale':
      return { tone: 'warning', text: 'Needs testing' };
    case 'failed':
      return { tone: 'danger', text: named(subject === null ? 'Test failed' : 'test failed') };
    case 'no-credential':
      return { tone: null, text: 'Needs a key' };
    case 'incomplete':
      return { tone: null, text: 'No model' };
  }
}

export function audioStatus(status: AudioStatus): AiStatus {
  switch (status) {
    case 'testing':
      return { tone: 'info', text: 'Playing the sample' };
    case 'cancelled':
      return { tone: 'warning', text: 'Sample stopped' };
    case 'stale':
      return { tone: 'warning', text: 'Settings changed' };
    case 'failed':
      return { tone: 'danger', text: 'Test failed' };
    case 'ready':
    case 'untested':
    case 'no-credential':
    case 'incomplete':
      return readinessStatus(status);
  }
}

/** A word list written as one line, skipping what is not there. */
export function joinSummary(parts: readonly (string | null | undefined)[]): string | null {
  const present = parts.filter(
    (part): part is string => part !== null && part !== undefined && part !== '',
  );
  return present.length === 0 ? null : present.join(' · ');
}
