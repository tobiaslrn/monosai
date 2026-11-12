import { DestroyRef, type Injector } from '@angular/core';
import type { ConfirmDialogData } from './confirm-dialog.component';

/**
 * Asks the learner to confirm, loading the dialog only now. The application shell and the
 * start-up failure page can need a confirmation, but almost no session does, so the dialog code
 * stays out of the bundle every learner downloads before the first screen.
 *
 * A caller that is gone by the time the dialog code arrives gets no dialog and no confirmation:
 * nothing is left on screen to confirm for.
 */
export async function confirmLater(injector: Injector, data: ConfirmDialogData): Promise<boolean> {
  const caller = injector.get(DestroyRef);
  const [{ Dialog }, { openConfirmDialog }] = await Promise.all([
    import('@angular/cdk/dialog'),
    import('./confirm-dialog.component'),
  ]);
  if (caller.destroyed) {
    return false;
  }
  return openConfirmDialog(injector.get(Dialog), data);
}
