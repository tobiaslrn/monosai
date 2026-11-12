import type { Injector } from '@angular/core';
import type { ConfirmDialogData } from './confirm-dialog.component';

/**
 * Asks the learner to confirm, loading the dialog only now. The application shell and the
 * start-up failure page can need a confirmation, but almost no session does, so the dialog code
 * stays out of the bundle every learner downloads before the first screen.
 */
export async function confirmLater(injector: Injector, data: ConfirmDialogData): Promise<boolean> {
  const [{ Dialog }, { openConfirmDialog }] = await Promise.all([
    import('@angular/cdk/dialog'),
    import('./confirm-dialog.component'),
  ]);
  return openConfirmDialog(injector.get(Dialog), data);
}
