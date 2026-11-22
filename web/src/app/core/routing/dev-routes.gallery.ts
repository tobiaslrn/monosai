import type { Routes } from '@angular/router';

/**
 * The development and gallery builds' stand-in for `dev-routes.ts`: the
 * primitive gallery at `#/gallery`. Never imported by name; `angular.json`
 * swaps it in with `fileReplacements`.
 */
export const DEV_ROUTES: Routes = [
  {
    path: 'gallery',
    loadChildren: () =>
      import('../../features/gallery/gallery.routes').then((m) => m.GALLERY_ROUTES),
  },
];
