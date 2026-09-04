import { inject } from '@angular/core';
import { Router } from '@angular/router';
import type { RedirectFunction, Routes } from '@angular/router';
import { unsavedImportGuard } from '../../features/add-text/unsaved-import.guard';
import { firstUseRedirect } from './first-use.resolver';
import { wellFormedGenerationJobLink } from './generation-job-link.guard';
import { wellFormedReadingLink } from './reading-link.guard';

/**
 * Sends a retired learner-profile route to its half of the merged page.
 *
 * A plain string redirect cannot carry a fragment, and the fragment is the
 * whole point: the two screens became one longer screen, and a link that used
 * to arrive at what it meant must still arrive there.
 */
function readingLevelSection(fragment: 'words' | 'grammar'): RedirectFunction {
  return (redirect) =>
    inject(Router).createUrlTree(['/reading-level'], {
      queryParams: redirect.queryParams,
      fragment,
    });
}

export const APP_ROUTES: Routes = [
  {
    path: 'library',
    title: 'Library · Monosai',
    loadComponent: () =>
      import('../../features/library/library-page.component').then((m) => m.LibraryPageComponent),
  },
  {
    path: 'add',
    title: 'Add text · Monosai',
    canDeactivate: [unsavedImportGuard],
    loadComponent: () =>
      import('../../features/add-text/add-text-page.component').then((m) => m.AddTextPageComponent),
  },
  {
    path: 'generate',
    title: 'Generate · Monosai',
    loadComponent: () =>
      import('../../features/generate/generate-page.component').then(
        (m) => m.GeneratePageComponent,
      ),
  },
  {
    // A generation the learner left running. Same screen, addressed by job, so
    // a row in the library can lead back to the run it started.
    path: 'generate/:jobId',
    title: 'Generate · Monosai',
    canMatch: [wellFormedGenerationJobLink],
    loadComponent: () =>
      import('../../features/generate/generate-page.component').then(
        (m) => m.GeneratePageComponent,
      ),
  },
  {
    path: 'reader/:id',
    title: 'Reading · Monosai',
    // Only ids that could name a reading reach the reader. Anything else falls
    // through to the route below, which says so without claiming a deletion.
    canMatch: [wellFormedReadingLink],
    loadComponent: () =>
      import('../../features/reader/reader-page.component').then((m) => m.ReaderPageComponent),
  },
  {
    path: 'reader/:id',
    title: 'Link not recognised · Monosai',
    loadComponent: () =>
      import('../../features/reader/broken-reading-link.component').then(
        (m) => m.BrokenReadingLinkComponent,
      ),
  },
  {
    path: 'reading-level',
    title: 'What you can read · Monosai',
    loadComponent: () =>
      import('../../features/reading-level/reading-level-page.component').then(
        (m) => m.ReadingLevelPageComponent,
      ),
  },
  // The two routes this screen replaced. Links live in bookmarks, in the
  // service worker's share redirect, and in anything Android saved, so each
  // keeps working and lands on the half of the merged page it meant, carrying
  // its query parameters — `from`, and the share marker — across.
  { path: 'vocabulary', redirectTo: readingLevelSection('words') },
  { path: 'grammar', redirectTo: readingLevelSection('grammar') },
  {
    path: 'settings',
    title: 'Settings · Monosai',
    loadComponent: () =>
      import('../../features/settings/settings-page.component').then(
        (m) => m.SettingsPageComponent,
      ),
  },
  // Root always resolves to the Library, which shows its own way in when it is
  // empty.
  { path: '', pathMatch: 'full', canActivate: [firstUseRedirect], children: [] },
  { path: '**', redirectTo: '' },
];
