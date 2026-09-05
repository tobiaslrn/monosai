import type {
  DiagnosticFieldName,
  DiagnosticFields,
  DiagnosticFieldValue,
  LogEntry,
  LogEventName,
  Logger,
  LogLevel,
} from '../../application/shared/diagnostics';

export interface LoggerBuildInfo {
  readonly appVersion: string;
  readonly buildCommit: string;
}

export interface LoggerConsole {
  debug(message?: unknown, ...optionalParams: unknown[]): void;
  info(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface BrowserLoggerOptions {
  readonly development: boolean;
  readonly consoleRef: LoggerConsole;
  readonly build: LoggerBuildInfo;
  readonly now?: () => string;
  readonly maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 200;
const MAX_FIELD_STRING_LENGTH = 200;
const LEVEL_ORDER: Readonly<Record<LogLevel, number>> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Browser logger with a deliberately narrow, redaction-friendly input shape.
 * Logging is best-effort and must never become a new source of application
 * failures, so console and serialization errors are swallowed.
 */
export class BrowserLogger implements Logger {
  private readonly entries: LogEntry[] = [];
  private readonly minimumLevel: LogLevel;
  private readonly now: () => string;
  private readonly maxEntries: number;

  constructor(private readonly options: BrowserLoggerOptions) {
    this.minimumLevel = options.development ? 'debug' : 'info';
    this.now = options.now ?? (() => new Date().toISOString());
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES));
  }

  debug(event: LogEventName, fields?: DiagnosticFields): void {
    this.write('debug', event, fields);
  }

  info(event: LogEventName, fields?: DiagnosticFields): void {
    this.write('info', event, fields);
  }

  warn(event: LogEventName, fields?: DiagnosticFields): void {
    this.write('warn', event, fields);
  }

  error(event: LogEventName, fields?: DiagnosticFields): void {
    this.write('error', event, fields);
  }

  snapshot(): readonly LogEntry[] {
    return this.entries.slice();
  }

  clear(): void {
    this.entries.length = 0;
  }

  private write(level: LogLevel, event: LogEventName, fields?: DiagnosticFields): void {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[this.minimumLevel]) {
      return;
    }

    const entry: LogEntry = Object.freeze({
      level,
      event,
      timestamp: this.now(),
      appVersion: this.options.build.appVersion,
      buildCommit: this.options.build.buildCommit,
      fields: sanitizeFields(fields),
    });
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.splice(0, this.entries.length - this.maxEntries);
    }

    try {
      this.options.consoleRef[level](`[Monosai] ${event}`, entry);
    } catch {
      // Diagnostics must never affect the application when a host console is
      // unavailable or has been replaced by a test/browser extension.
    }
  }
}

const SAFE_FIELD_NAMES: ReadonlySet<DiagnosticFieldName> = new Set<DiagnosticFieldName>([
  'action',
  'assetVersion',
  'attempt',
  'cache',
  'count',
  'correlationId',
  'durationMs',
  'errorCode',
  'errorDomain',
  'errorType',
  'from',
  'issueCode',
  'kind',
  'modelId',
  'online',
  'operation',
  'phase',
  'protocolVersion',
  'providerKind',
  'recovery',
  'retryCount',
  'route',
  'schemaVersion',
  'sourceKind',
  'status',
  'step',
  'task',
  'to',
  'voiceId',
  'worker',
]);

function sanitizeFields(fields: DiagnosticFields | undefined): DiagnosticFields {
  if (fields === undefined) {
    return Object.freeze({});
  }

  const safe: Partial<Record<DiagnosticFieldName, DiagnosticFieldValue>> = {};
  for (const [name, value] of Object.entries(fields)) {
    if (!SAFE_FIELD_NAMES.has(name as DiagnosticFieldName)) {
      continue;
    }
    if (isDiagnosticFieldValue(value)) {
      safe[name as DiagnosticFieldName] = sanitizeValue(value);
    }
  }
  return Object.freeze(safe);
}

function isDiagnosticFieldValue(value: unknown): value is DiagnosticFieldValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function sanitizeValue(value: DiagnosticFieldValue): DiagnosticFieldValue {
  if (typeof value !== 'string') {
    return value;
  }
  return value.length > MAX_FIELD_STRING_LENGTH
    ? `${value.slice(0, MAX_FIELD_STRING_LENGTH)}…`
    : value;
}
