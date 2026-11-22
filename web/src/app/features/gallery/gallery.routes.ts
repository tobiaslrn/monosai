import type { Type } from '@angular/core';
import type { Routes } from '@angular/router';
import { GalleryIndexComponent } from './gallery-index.component';
import { GALLERY_PAGES, type GalleryPageSlug } from './gallery-pages';
import { GalleryButtonsComponent } from './pages/buttons-page.component';
import { GalleryFieldsComponent } from './pages/fields-page.component';
import { GalleryFrameComponent } from './pages/frame-page.component';
import { GalleryIconsComponent } from './pages/icons-page.component';
import { GalleryListsComponent } from './pages/lists-page.component';
import { GalleryOverlaysComponent } from './pages/overlays-page.component';
import { GalleryProgressComponent } from './pages/progress-page.component';
import { GalleryProseComponent } from './pages/prose-page.component';
import { GalleryRowsComponent } from './pages/rows-page.component';
import { GalleryStatesComponent } from './pages/states-page.component';
import { GalleryStatusComponent } from './pages/status-page.component';

/** Keyed by the slug union, so a listed page without a component is a compile error. */
const PAGE_COMPONENTS: Record<GalleryPageSlug, Type<unknown>> = {
  rows: GalleryRowsComponent,
  buttons: GalleryButtonsComponent,
  fields: GalleryFieldsComponent,
  overlays: GalleryOverlaysComponent,
  status: GalleryStatusComponent,
  lists: GalleryListsComponent,
  states: GalleryStatesComponent,
  progress: GalleryProgressComponent,
  frame: GalleryFrameComponent,
  prose: GalleryProseComponent,
  icons: GalleryIconsComponent,
};

/** The gallery, one lazy chunk: reached only through `dev-routes.gallery.ts`. */
export const GALLERY_ROUTES: Routes = [
  { path: '', title: 'Gallery · Monosai', component: GalleryIndexComponent },
  ...GALLERY_PAGES.map((page) => ({
    path: page.slug,
    title: `${page.title} · Gallery · Monosai`,
    component: PAGE_COMPONENTS[page.slug],
  })),
];
