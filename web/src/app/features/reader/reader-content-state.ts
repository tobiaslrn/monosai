import type { LayerProgress } from '../../application/enrichment/layer-progress';
import type { ConfigurationReadiness } from '../../domain/ai/configuration-readiness';
import type { PreparationLayer } from '../../domain/enrichment/preparation';
import type { Reading } from '../../domain/reading/reading';
import { formatCount } from '../../domain/shared/locale';
import { aiFailureMessage } from '../../shared-ui/ai-error/ai-error-copy';

export interface ReaderContentState {
  readonly layer: PreparationLayer;
  readonly name: string;
  readonly status: string;
  readonly action: 'prepare' | 'cancel' | 'settings' | null;
  readonly label: string;
  readonly disabled: boolean;
  readonly busy: boolean;
  readonly error: string | null;
  /** The status is a setup step in Settings, which rows may share. */
  readonly setup: boolean;
}

const NAMES: Record<PreparationLayer, string> = {
  english: 'English translation',
  grammar: 'Grammar notes',
  audio: 'Audio',
};
const ACTIONS: Record<PreparationLayer, string> = {
  english: 'Translate story',
  grammar: 'Add notes',
  audio: 'Generate audio',
};

/** UI projection only. Counts describe completed sentences, never a selected target. */
export function readerContentState(
  reading: Reading,
  layer: PreparationLayer,
  progress: LayerProgress,
  readiness: ConfigurationReadiness,
  online: boolean,
): ReaderContentState {
  const state = layerState(reading, layer, progress, readiness, online);
  // Audio reports here and is run from the transport: generating, stopping,
  // retrying and voice setup all live on the card that plays it, and a second
  // copy of them in this list was the same run described twice.
  // What went wrong stays: it is a report, and the transport carries the retry.
  return layer === 'audio' ? { ...state, action: null, label: '', disabled: false } : state;
}

function layerState(
  reading: Reading,
  layer: PreparationLayer,
  progress: LayerProgress,
  readiness: ConfigurationReadiness,
  online: boolean,
): ReaderContentState {
  const grammar = reading.grammarSummary;
  const summary = layer === 'english' ? reading.translationSummary : reading.audioSummary;
  let completed =
    layer === 'grammar'
      ? grammar.state === 'complete'
        ? reading.sentenceCount
        : grammar.state === 'partial'
          ? grammar.analyzedSentenceCount
          : 0
      : summary.completed;
  if ('counts' in progress) {
    completed = Math.max(
      completed,
      progress.counts.total - progress.counts.requested + progress.counts.completed,
    );
  }
  completed = Math.min(completed, reading.sentenceCount);
  const completionNoun = layer === 'grammar' ? 'sentences analyzed' : 'sentences saved';
  const completedDescription = `${formatCount(completed)} of ${formatCount(reading.sentenceCount)} ${completionNoun}`;
  const base = {
    layer,
    name: NAMES[layer],
    disabled: false,
    busy: false,
    error: null,
    setup: false,
  };
  switch (progress.kind) {
    case 'queued':
    case 'preparing':
    case 'running':
    case 'paused':
      return {
        ...base,
        busy: true,
        status:
          progress.kind === 'running'
            ? layer === 'grammar' && completed === 0
              ? progress.phase === 'requesting'
                ? 'Analyzing…'
                : progress.phase === 'saving'
                  ? 'Working…'
                  : completedDescription
              : completedDescription
            : progress.kind === 'preparing'
              ? 'Preparing…'
              : online
                ? 'Waiting to continue'
                : 'Waiting for connection',
        action: 'cancel',
        label: 'Stop',
      };
    case 'failed':
      return {
        ...base,
        status: `${completedDescription} · Stopped`,
        action: progress.canRetry && readiness === 'ready' ? 'prepare' : 'settings',
        label: progress.canRetry && readiness === 'ready' ? 'Retry remaining' : 'Check settings',
        disabled: progress.canRetry && readiness === 'ready' && !online,
        error:
          progress.error.source === 'storage'
            ? `Saving failed: ${progress.error.error.message}`
            : aiFailureMessage(progress.error.error, 'reader'),
      };
    case 'cancelled':
      return {
        ...base,
        status: `${completedDescription} · Stopped`,
        action: readiness === 'ready' ? 'prepare' : 'settings',
        label: readiness === 'ready' ? 'Continue' : 'Check settings',
        disabled: readiness === 'ready' && !online,
      };
    case 'idle':
    case 'deleted':
    case 'complete':
      break;
  }
  if (reading.sentenceCount > 0 && completed >= reading.sentenceCount) {
    // A count is what is still missing, said as a fraction. Nothing is missing
    // here, and "14 of 14" made the learner read two numbers to find that out.
    return {
      ...base,
      status: 'Ready',
      action: null,
      label: '',
    };
  }
  if (reading.sentenceCount === 0)
    return { ...base, status: 'No sentences', action: null, label: '' };
  if (readiness !== 'ready') {
    const subject = layer === 'audio' ? 'voice' : 'text model';
    const messages = {
      'no-credential': 'Add an OpenRouter key.',
      incomplete: `Set up a ${subject}.`,
      untested: `Test your ${subject}.`,
      stale: `Retest your changed ${subject}.`,
      failed: `Fix and test your ${subject}.`,
    };
    return {
      ...base,
      setup: true,
      status: messages[readiness],
      action: 'settings',
      label: layer === 'audio' ? 'Voice settings' : 'Model settings',
    };
  }
  const failed = layer === 'grammar' ? grammar.state === 'unavailable' : summary.failed > 0;
  return {
    ...base,
    status: !online
      ? `${completed > 0 ? completedDescription : 'Not added'} · Offline`
      : completed > 0
        ? completedDescription
        : failed
          ? 'Could not finish'
          : 'Not added',
    action: 'prepare',
    label: failed ? 'Retry remaining' : completed > 0 ? 'Continue' : ACTIONS[layer],
    disabled: !online,
  };
}
