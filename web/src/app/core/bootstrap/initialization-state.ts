import type { DomainErrorBase } from '../../domain/shared/errors';

/** Fatal startup failure surfaced by the recovery screen. */
export interface BootstrapFailure {
  readonly error: DomainErrorBase<string, string>;
  /** True when a full local-data reset is the documented recovery path. */
  readonly resetMayHelp: boolean;
}

export type InitializationState =
  | { readonly status: 'initializing' }
  | { readonly status: 'ready' }
  | { readonly status: 'failed'; readonly failure: BootstrapFailure };
