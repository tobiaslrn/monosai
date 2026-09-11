import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';

/**
 * Sends the root route to Home.
 *
 * There is no first-use branch: Home with nothing saved introduces Monosai and
 * offers both ways to start a story, which is a truer first screen than a form
 * the learner never asked for.
 */
export const firstUseRedirect: CanActivateFn = () => inject(Router).parseUrl('/home');
