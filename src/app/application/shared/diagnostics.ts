import { InjectionToken } from '@angular/core';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Field names that are safe to include in diagnostics. */
export type DiagnosticFieldName =
  | 'action'
  | 'assetVersion'
  | 'attempt'
  | 'cache'
  | 'count'
  | 'correlationId'
  | 'durationMs'
  | 'errorCode'
  | 'errorDomain'
  | 'errorType'
  | 'from'
  | 'issueCode'
  | 'kind'
  | 'modelId'
  | 'online'
  | 'operation'
  | 'phase'
  | 'protocolVersion'
  | 'providerKind'
  | 'recovery'
  | 'retryCount'
  | 'route'
  | 'schemaVersion'
  | 'sourceKind'
  | 'status'
  | 'step'
  | 'task'
  | 'to'
  | 'voiceId'
  | 'worker';

export type DiagnosticFieldValue = string | number | boolean | null;
export type DiagnosticFields = Readonly<Partial<Record<DiagnosticFieldName, DiagnosticFieldValue>>>;

/** Stable event names used by the application and its infrastructure. */
export type LogEventName =
  | 'app.bootstrap.failed'
  | 'app.initialization.failed'
  | 'app.initialization.started'
  | 'app.initialization.succeeded'
  | 'app.initialization.step.failed'
  | 'app.initialization.step.started'
  | 'app.initialization.step.succeeded'
  | 'app.route.navigation.failed'
  | 'anki.operation.failed'
  | 'anki.operation.started'
  | 'anki.operation.succeeded'
  | 'ai.request.cancelled'
  | 'ai.request.failed'
  | 'ai.request.retry'
  | 'ai.request.started'
  | 'ai.request.succeeded'
  | 'diagnostics.copy.failed'
  | 'diagnostics.copy.succeeded'
  | 'diagnostics.cleared'
  | 'language.asset.failed'
  | 'language.operation.failed'
  | 'language.operation.started'
  | 'language.operation.succeeded'
  | 'pwa.update.available'
  | 'pwa.update.failed'
  | 'pwa.update.unsupported'
  | 'runtime.angular-error'
  | 'runtime.network.changed'
  | 'runtime.unhandled-rejection'
  | 'runtime.window-error'
  | 'storage.operation.failed'
  | 'storage.operation.started'
  | 'storage.operation.succeeded'
  | 'worker.failed'
  | 'worker.operation.failed'
  | 'worker.operation.started'
  | 'worker.operation.succeeded'
  | 'job.cancelled'
  | 'job.failed'
  | 'job.paused'
  | 'job.started'
  | 'job.succeeded';

export interface LogEntry {
  readonly level: LogLevel;
  readonly event: LogEventName;
  readonly timestamp: string;
  readonly appVersion: string;
  readonly buildCommit: string;
  readonly fields: DiagnosticFields;
}

export interface Logger {
  debug(event: LogEventName, fields?: DiagnosticFields): void;
  info(event: LogEventName, fields?: DiagnosticFields): void;
  warn(event: LogEventName, fields?: DiagnosticFields): void;
  error(event: LogEventName, fields?: DiagnosticFields): void;
  snapshot(): readonly LogEntry[];
  clear(): void;
}

export const LOGGER = new InjectionToken<Logger>('monosai.logger');

/** Safe fallback for focused unit tests that do not configure the app shell. */
export const NOOP_LOGGER: Logger = {
  debug: () => undefined,
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  snapshot: () => [],
  clear: () => undefined,
};

export function serializeDiagnostics(entries: readonly LogEntry[]): string {
  return entries.map((entry) => JSON.stringify(entry)).join('\n');
}
