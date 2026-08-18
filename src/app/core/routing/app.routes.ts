import type { Routes } from '@angular/router';
import { unsavedImportGuard } from '../../features/add-text/unsaved-import.guard';
import { firstUseRedirect } from './first-use.resolver';

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
    path: 'reader/:id',
    title: 'Reading · Monosai',
    // The reader supplies its own header and hides the bottom navigation.
    data: { chrome: 'focused' },
    loadComponent: () =>
      import('../../features/reader/reader-page.component').then((m) => m.ReaderPageComponent),
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
  // Root resolves to the Library or to Add text depending on whether this
  // profile has any saved readings.
  { path: '', pathMatch: 'full', canActivate: [firstUseRedirect], children: [] },
  { path: '**', redirectTo: '' },
];
