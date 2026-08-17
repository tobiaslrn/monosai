import type { Routes } from '@angular/router';

export const APP_ROUTES: Routes = [
  {
    path: 'settings',
    title: 'Settings · Monosai',
    loadComponent: () =>
      import('../../features/settings/settings-page.component').then(
        (m) => m.SettingsPageComponent,
      ),
  },
  { path: '', pathMatch: 'full', redirectTo: 'settings' },
  { path: '**', redirectTo: 'settings' },
];
