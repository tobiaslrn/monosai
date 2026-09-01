import type { Routes } from '@angular/router';
import { unsavedImportGuard } from '../../features/add-text/unsaved-import.guard';
import { firstUseRedirect } from './first-use.resolver';
import { wellFormedReadingLink } from './reading-link.guard';

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
    path: 'vocabulary',
    title: 'Vocabulary · Monosai',
    loadComponent: () =>
      import('../../features/vocabulary/vocabulary-page.component').then(
        (m) => m.VocabularyPageComponent,
      ),
  },
  {
    path: 'grammar',
    title: 'Grammar · Monosai',
    loadComponent: () =>
      import('../../features/grammar/grammar-page.component').then((m) => m.GrammarPageComponent),
  },
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
