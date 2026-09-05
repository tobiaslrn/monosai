import { DestroyRef, Injectable, inject } from '@angular/core';
import { PRIMARY_OUTLET, Router } from '@angular/router';
import { LibraryStore } from '../../application/reading/library.store';
import { ReadingMutationsService } from '../../application/reading/reading-mutations.service';
import type { ReadingId } from '../../domain/shared/ids';

/**
 * Leaves the reader when the reading it is showing is deleted in another tab.
 *
 * Two tabs on one local database is ordinary in a local-first application, and
 * the losing tab used to go on rendering a reading that no longer existed:
 * heading, tokens, cached translations, all live, correcting itself only on a
 * navigation. There is nothing honest left to render, and the reader's own
 * not-found screen offers exactly one action — back to the library — so this
 * takes that action rather than staging it.
 *
 * The replacement is quiet: the URL is replaced rather than pushed, so Back
 * does not lead to a reader for a reading that is gone, and the Library says
 * what happened in the live region it already has.
 */
@Injectable({ providedIn: 'root' })
export class OpenReadingWatcher {
  private readonly router = inject(Router);
  private readonly library = inject(LibraryStore);
  private readonly mutations = inject(ReadingMutationsService);

  constructor() {
    const unsubscribe = this.mutations.onDeletedElsewhere((mutation) => {
      if (!this.isShowing(mutation.id)) {
        return;
      }
      this.library.noteExternalChange(`${mutation.title} was deleted in another tab.`);
      void this.router.navigate(['/library'], { replaceUrl: true });
    });
    inject(DestroyRef).onDestroy(unsubscribe);
  }

  /** True when this tab is on the reader route for that exact reading. */
  private isShowing(id: ReadingId): boolean {
    const segments = this.router
      .parseUrl(this.router.url)
      .root.children[PRIMARY_OUTLET].segments.map((segment) => segment.path);
    return segments.length === 2 && segments[0] === 'reader' && segments[1] === id;
  }
}
