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
    path: 'help',
    title: 'Help · Monosai',
    loadComponent: () =>
      import('../../features/help/help-page.component').then((m) => m.HelpPageComponent),
  },
  {
    path: 'home',
    title: 'Home · Monosai',
    loadComponent: () =>
      import('../../features/home/home-page.component').then((m) => m.HomePageComponent),
  },
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
    title: 'Story · Monosai',
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
  {
    // The ladder, on its own: choosing is a draft until Save level commits it,
    // so a learner can read each example before anything goes stale.
    path: 'reading-level/level',
    title: 'Reading level · Monosai',
    loadComponent: () =>
      import('../../features/reading-level/level-choice-page.component').then(
        (m) => m.LevelChoicePageComponent,
      ),
  },
  {
    // One source, and everything it can be configured to do. A page rather
    // than a row, because the list is for choosing what to open.
    path: 'reading-level/source/:sourceId',
    title: 'Source · Monosai',
    loadComponent: () =>
      import('../../features/vocabulary/source-page.component').then((m) => m.SourcePageComponent),
  },
  {
    path: 'reading-level/vocabulary',
    title: 'Your vocabulary · Monosai',
    loadComponent: () =>
      import('../../features/vocabulary/vocabulary-browse-page.component').then(
        (m) => m.VocabularyBrowsePageComponent,
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
  // Root always resolves to Home, which introduces Monosai when nothing is saved.
  { path: '', pathMatch: 'full', canActivate: [firstUseRedirect], children: [] },
  { path: '**', redirectTo: '' },
];
