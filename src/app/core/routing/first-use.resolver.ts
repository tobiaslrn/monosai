import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { READING_REPOSITORY } from '../../application/shared/repository-tokens';

/**
 * Decides where the root route lands.
 *
 * A profile with saved readings goes to the Library; a fresh or empty profile
 * goes to Add text, because the first useful action is reading, not setup. A
 * storage failure also lands on Add text: it is the one route that needs
 * nothing loaded, and the failure surfaces where it is actionable.
 */
export const firstUseRedirect: CanActivateFn = async () => {
  const readings = inject(READING_REPOSITORY);
  const router = inject(Router);

  const count = await readings.countReadings('all');
  const destination = count.ok && count.value > 0 ? '/library' : '/add';
  return router.parseUrl(destination);
};
