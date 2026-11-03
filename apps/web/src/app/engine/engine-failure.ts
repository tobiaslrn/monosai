import type { ErrorDto } from './api/ErrorDto';

/** An engine error thrown where a caller needs an exception, such as a startup step. */
export class EngineFailure extends Error {
  constructor(readonly error: ErrorDto) {
    super(error.message);
    this.name = 'EngineFailure';
  }
}
