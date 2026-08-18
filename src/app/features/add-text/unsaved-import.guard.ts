import type { CanDeactivateFn } from '@angular/router';
import type { AddTextPageComponent } from './add-text-page.component';

/**
 * Blocks navigation away from an unsaved import until the learner confirms.
 *
 * The page owns the question because it owns the workflow state; the guard only
 * asks. A successful save clears the state, so leaving for the reader is never
 * challenged.
 */
export const unsavedImportGuard: CanDeactivateFn<AddTextPageComponent> = (component) =>
  component.confirmLeave();
