import { aiError, type AiError, type AiErrorCode } from './ai-error';
import type { AiTask } from './ai-task';

export interface FailedConfigurationTest {
  readonly fingerprint: string;
  readonly testedAt: number;
  readonly code: AiErrorCode;
  readonly message: string;
}

export function configurationTestFailure(
  tests: readonly FailedConfigurationTest[] | undefined,
  fingerprint: string,
  task: AiTask,
): AiError | null {
  const failed = tests?.find((test) => test.fingerprint === fingerprint);
  return failed === undefined ? null : aiError(failed.code, task, failed.message);
}

export function recordConfigurationFailure(
  tests: readonly FailedConfigurationTest[] | undefined,
  fingerprint: string,
  testedAt: number,
  error: AiError,
): readonly FailedConfigurationTest[] {
  return [
    ...(tests ?? []).filter((test) => test.fingerprint !== fingerprint).slice(-19),
    { fingerprint, testedAt, code: error.code, message: error.message },
  ];
}
