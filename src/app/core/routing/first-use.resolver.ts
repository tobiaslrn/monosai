import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';

/**
 * Sends the root route to the Library.
 *
 * There is no first-use branch any more: an empty library states what it is and
 * offers the one button that fills it, which is a truer first screen than a
 * form the learner never asked for.
 */
export const firstUseRedirect: CanActivateFn = () => inject(Router).parseUrl('/library');
