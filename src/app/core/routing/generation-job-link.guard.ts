import type { CanMatchFn } from '@angular/router';
import { isUuid } from '../../domain/shared/ids';

/**
 * Lets `generate/:jobId` match only a segment that could name a job.
 *
 * Job ids are UUIDs by construction (`IdGenerator`), so anything else never
 * named a run. Matching is refused rather than redirected, so the segment falls
 * through to the wildcard instead of the Generate screen having to explain a
 * link that was never one.
 */
export const wellFormedGenerationJobLink: CanMatchFn = (_route, segments, _snapshot) =>
  isUuid(segments[1]?.path ?? '');
