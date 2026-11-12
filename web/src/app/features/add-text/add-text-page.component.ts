import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { ImportStore } from '../../application/reading/import.store';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
import { ActionBarComponent } from '../../shared-ui/action-bar/action-bar.component';
import { ButtonDirective } from '../../shared-ui/button/button';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { TextInputStepComponent } from './text-input-step.component';

/**
 * The Add text workflow.
 *
 * This is the first useful screen: it asks for no Anki connection, no API key,
 * and no network. The only thing it waits for is the local language bundle, and
 * that wait is an explicit state rather than a blocked screen.
 */
@Component({
  selector: 'mn-add-text-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ActionBarComponent, ButtonDirective, TextInputStepComponent, PageHeaderComponent],
  providers: [ImportStore],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Add text" backTo="/library" backLabel="Back to library" />

      <!--
        A card, like every other surface a learner types into: the Generate
        composer cards its textareas, and this one sat bare on the page
        background beside it.
      -->
      <section class="mn-card">
        <mn-text-input-step />

        @if (busyMessage(); as message) {
          <p class="busy" role="status">
            <span class="spinner" aria-hidden="true"></span>
            <span>{{ message }}</span>
          </p>
        }

        @if (store.languageFailure(); as failure) {
          <div class="mn-notice mn-notice--error" role="alert">
            <div>
              <p><strong>Japanese analysis is not ready</strong> {{ failure.message }}</p>
              <p>Your text is unchanged.</p>
            </div>
            <button type="button" class="mn-button" (click)="retry()">Try again</button>
          </div>
        }

        @if (store.storageFailure(); as failure) {
          <div class="mn-notice mn-notice--error" role="alert">
            <div>
              <p><strong>Could not save the story.</strong> {{ failure.message }}</p>
              <p>Your text is still here.</p>
            </div>
          </div>
        }

        @if (store.duplicates().length > 0) {
          <p class="mn-notice mn-notice--warning" role="alert">
            <span>
              <strong>Already in your library</strong>
            </span>
          </p>
        }
      </section>

      <!-- The commit sits below the form and spans it, as Generate's does. -->
      <mn-action-bar>
        <button
          type="button"
          mnButton="primary"
          [disabled]="!store.canSave()"
          [attr.aria-busy]="store.isBusy() ? 'true' : null"
          (click)="save()"
        >
          {{ store.duplicates().length > 0 ? 'Add another copy' : 'Add story' }}
        </button>
      </mn-action-bar>

      <p class="mn-visually-hidden" role="status" aria-live="polite">{{ store.announcement() }}</p>
    </div>
  `,
  styles: `
    @use '../../../styles/motion' as motion;

    .busy {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      margin: 0;
      color: var(--text-secondary);
    }

    .spinner {
      width: 1em;
      height: 1em;
      border: 2px solid var(--border-strong);
      border-block-start-color: var(--action-primary);
      border-radius: var(--radius-pill);
      @include motion.spin;
    }
  `,
})
export class AddTextPageComponent {
  protected readonly store = inject(ImportStore);
  private readonly router = inject(Router);
  private readonly navigation = inject(NavigationHistoryService);
  private readonly dialog = inject(Dialog);
  private destroyed = false;

  protected readonly busyMessage = computed(() => {
    const busy = this.store.busy();
    switch (busy.kind) {
      case 'idle':
        return null;
      case 'preparing-language':
        return 'Preparing…';
      case 'segmenting':
        return 'Splitting sentences…';
      case 'analyzing':
        return `Analysing ${String(busy.completed)} of ${String(busy.total)}`;
      case 'saving':
        return 'Saving…';
    }
  });

  constructor() {
    // Reloading or closing the tab bypasses the router, so the browser's own
    // prompt is the only guard available for it.
    const warnOnUnload = (event: BeforeUnloadEvent): void => {
      if (this.store.isDirty()) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', warnOnUnload);
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      window.removeEventListener('beforeunload', warnOnUnload);
    });
  }

  protected retry(): void {
    void this.save();
  }

  protected async save(): Promise<void> {
    const id = await this.store.save();
    if (id !== null && !this.destroyed) {
      await this.router.navigate(['/reader', id], {
        replaceUrl: true,
        ...this.navigation.preservedOrigin('/library'),
      });
    }
  }

  /**
   * Route guard hook. Confirmation is only asked for while work would be lost;
   * after a successful save the workflow is clean and navigation is silent.
   */
  async confirmLeave(): Promise<boolean> {
    if (!this.store.isDirty()) {
      return true;
    }
    return openConfirmDialog(this.dialog, {
      title: 'Leave without saving?',
      message: 'Your text and title will be lost.',
      confirmLabel: 'Leave',
      cancelLabel: 'Cancel',
      tone: 'danger',
    });
  }
}
