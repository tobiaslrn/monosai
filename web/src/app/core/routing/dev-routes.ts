import type { Routes } from '@angular/router';

/**
 * Routes that exist only in a development or gallery build. The shipped build
 * has none: `angular.json` swaps this file for `dev-routes.gallery.ts` in the
 * `development` and `gallery` configurations, so nothing the learner downloads
 * can reach, or even contain, the primitive gallery. `npm run verify-dist`
 * checks that the Pages build holds no trace of it.
 */
export const DEV_ROUTES: Routes = [];
