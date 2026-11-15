import { inject, type Type } from '@angular/core';
import { Router } from '@angular/router';
import type { Route, RedirectFunction, Routes } from '@angular/router';
import { HELP_TOPICS, type HelpTopicSlug } from '../../features/help/help-topics';
import { unsavedImportGuard } from '../../features/add-text/unsaved-import.guard';
import { ModelCatalogView } from '../../features/settings/model-catalog-view';
import { firstUseRedirect } from './first-use.resolver';
import { wellFormedGenerationJobLink } from './generation-job-link.guard';
import { wellFormedReadingLink } from './reading-link.guard';

/**
 * Sends a retired route to the page that now holds what it meant.
 *
 * Links to the retired pages live in bookmarks, in the service worker's share
 * redirect of an older install, and in anything Android saved. A plain string
 * redirect cannot read the fragment, and the fragment is what says which half
 * of the old combined page a link meant: `#grammar` and `#forms` meant grammar,
 * anything else meant words. Query parameters (`from`, the share marker) are
 * carried across.
 */
const retiredLearnerPage: RedirectFunction = (redirect) => {
  const fragment = redirect.fragment;
  const grammar = fragment === 'grammar' || fragment === 'forms';
  return inject(Router).createUrlTree([grammar ? '/grammar' : '/words'], {
    queryParams: redirect.queryParams,
    ...(fragment === 'forms' ? { fragment } : {}),
  });
};

/**
 * The page behind each topic of the guide.
 *
 * Keyed by the slug union rather than by string, so a topic without a page and
 * a page without a topic are both compile errors. Each entry stays a dynamic
 * import, so a topic is still a chunk of its own that the hub does not load.
 */
const HELP_TOPIC_PAGES: Record<HelpTopicSlug, () => Promise<Type<unknown>>> = {
  'get-started': () =>
    import('../../features/help/topics/get-started-page.component').then(
      (m) => m.GetStartedPageComponent,
    ),
  'your-words': () =>
    import('../../features/help/topics/your-words-page.component').then(
      (m) => m.YourWordsPageComponent,
    ),
  'reading-level': () =>
    import('../../features/help/topics/reading-level-page.component').then(
      (m) => m.ReadingLevelHelpPageComponent,
    ),
  write: () =>
    import('../../features/help/topics/write-page.component').then((m) => m.WritePageComponent),
  reading: () =>
    import('../../features/help/topics/reading-page.component').then((m) => m.ReadingPageComponent),
  'text-models': () =>
    import('../../features/help/topics/text-models-page.component').then(
      (m) => m.TextModelsPageComponent,
    ),
  voice: () =>
    import('../../features/help/topics/voice-page.component').then((m) => m.VoicePageComponent),
  install: () =>
    import('../../features/help/topics/install-page.component').then((m) => m.InstallPageComponent),
  privacy: () =>
    import('../../features/help/topics/privacy-page.component').then((m) => m.PrivacyPageComponent),
  questions: () =>
    import('../../features/help/topics/questions-page.component').then(
      (m) => m.QuestionsPageComponent,
    ),
  troubleshooting: () =>
    import('../../features/help/topics/troubleshooting-page.component').then(
      (m) => m.TroubleshootingPageComponent,
    ),
};

/**
 * One route per topic, derived from the list the hub shelf reads. A topic is a
 * page rather than a heading so the guide can answer a question in full without
 * burying the next one below three screens of scrolling.
 */
const HELP_TOPIC_ROUTES: readonly Route[] = HELP_TOPICS.map((topic) => ({
  path: `help/${topic.slug}`,
  title: `${topic.title} · Monosai`,
  loadComponent: HELP_TOPIC_PAGES[topic.slug],
}));

export const APP_ROUTES: Routes = [
  {
    path: 'help',
    title: 'Help · Monosai',
    loadComponent: () =>
      import('../../features/help/help-page.component').then((m) => m.HelpPageComponent),
  },
  ...HELP_TOPIC_ROUTES,
  // Retired topic addresses, kept so a link written before the guide was reorganised still lands.
  { path: 'help/first-steps', redirectTo: 'help/get-started' },
  { path: 'help/error-codes', redirectTo: 'help/troubleshooting' },
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
    path: 'words',
    title: 'Words · Monosai',
    loadComponent: () =>
      import('../../features/vocabulary/words-page.component').then((m) => m.WordsPageComponent),
  },
  {
    // One source, and everything it can be configured to do. A page rather
    // than a row, because the list is for choosing what to open.
    path: 'words/source/:sourceId',
    title: 'Source · Monosai',
    loadComponent: () =>
      import('../../features/vocabulary/source-page.component').then((m) => m.SourcePageComponent),
  },
  {
    path: 'words/vocabulary',
    title: 'Your vocabulary · Monosai',
    loadComponent: () =>
      import('../../features/vocabulary/vocabulary-browse-page.component').then(
        (m) => m.VocabularyBrowsePageComponent,
      ),
  },
  {
    path: 'grammar',
    title: 'Grammar · Monosai',
    loadComponent: () =>
      import('../../features/reading-level/reading-level-page.component').then(
        (m) => m.GrammarPageComponent,
      ),
  },
  {
    // The ladder, on its own: choosing is a draft until Save level commits it,
    // so a learner can read each example before anything goes stale.
    path: 'grammar/level',
    title: 'Reading level · Monosai',
    loadComponent: () =>
      import('../../features/reading-level/level-choice-page.component').then(
        (m) => m.LevelChoicePageComponent,
      ),
  },
  // The routes these pages replaced. Each keeps working and lands where it
  // meant, carrying its query parameters across. The two page redirects match
  // only their own path: as prefixes they would also catch the retired
  // sub-routes below and send all of them to Words.
  { path: 'reading-level', pathMatch: 'full', redirectTo: retiredLearnerPage },
  { path: 'vocabulary', pathMatch: 'full', redirectTo: retiredLearnerPage },
  { path: 'reading-level/level', redirectTo: '/grammar/level' },
  { path: 'reading-level/source/:sourceId', redirectTo: '/words/source/:sourceId' },
  { path: 'reading-level/vocabulary', redirectTo: '/words/vocabulary' },
  {
    path: 'settings',
    // One catalogue fetch serves the overview's model names and both model pages.
    providers: [ModelCatalogView],
    children: [
      {
        path: '',
        title: 'Settings · Monosai',
        loadComponent: () =>
          import('../../features/settings/settings-page.component').then(
            (m) => m.SettingsPageComponent,
          ),
      },
      {
        path: 'text-models',
        title: 'Text models · Monosai',
        loadComponent: () =>
          import('../../features/settings/text-models-page.component').then(
            (m) => m.TextModelsPageComponent,
          ),
      },
      {
        path: 'voice',
        title: 'Voice · Monosai',
        loadComponent: () =>
          import('../../features/settings/voice-page.component').then((m) => m.VoicePageComponent),
      },
      {
        path: 'technical',
        title: 'Technical details · Monosai',
        loadComponent: () =>
          import('../../features/settings/technical-details-page.component').then(
            (m) => m.TechnicalDetailsPageComponent,
          ),
      },
    ],
  },
  // Root always resolves to the Library, which shows its own way in when it is
  // empty.
  { path: '', pathMatch: 'full', canActivate: [firstUseRedirect], children: [] },
  { path: '**', redirectTo: '' },
];
