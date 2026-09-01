import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { Router } from '@angular/router';
import { ImportStore } from '../../application/reading/import.store';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { openConfirmDialog } from '../../shared-ui/confirm-dialog/confirm-dialog.component';
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
  imports: [TextInputStepComponent, PageHeaderComponent],
  providers: [ImportStore],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Add text" backTo="/library" backLabel="Back to library" />

      <p class="mn-hint">Paste Japanese text to create a reading.</p>

      <!-- Plain: a panel wrapping the whole of a page separates it from nothing. -->
      <section class="mn-panel mn-panel--plain">
        <mn-text-input-step />

        @if (busyMessage(); as message) {
          <p class="busy" role="status">
            <span class="spinner" aria-hidden="true"></span>
            <span>{{ message }}</span>
          </p>
        }

        @if (store.languageFailure(); as failure) {
          <div class="mn-error" role="alert">
            <p><strong>Japanese analysis is not ready.</strong> {{ failure.message }}</p>
            <p>Your text has not been changed and nothing was saved.</p>
            <button type="button" class="mn-button" (click)="retry()">Try again</button>
          </div>
        }

        @if (store.storageFailure(); as failure) {
          <div class="mn-error" role="alert">
            <p><strong>The reading could not be saved.</strong> {{ failure.message }}</p>
            <p>Your text is still here, so you can try saving again.</p>
          </div>
        }

        @if (store.duplicates().length > 0) {
          <div class="duplicate" role="alert">
            <p>
              <strong>This text is already in your library.</strong>
              Adding it again will save a separate copy named “{{ store.resolvedTitle() }} (copy
              {{ store.duplicates().length + 1 }})”.
            </p>
          </div>
        }

        <div class="actions">
          <button
            type="button"
            class="mn-button mn-button--primary"
            [disabled]="!store.canSave()"
            (click)="save()"
          >
            {{ store.duplicates().length > 0 ? 'Add another copy' : 'Add reading' }}
          </button>
        </div>
      </section>

      <p class="mn-visually-hidden" role="status" aria-live="polite">{{ store.announcement() }}</p>
    </div>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      justify-content: flex-end;
    }

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
      border-radius: 50%;
      animation: mn-spin 800ms linear infinite;
    }

    @keyframes mn-spin {
      to {
        transform: rotate(360deg);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .spinner {
        animation: none;
      }
    }

    .mn-error {
      display: flex;
      flex-direction: column;
      gap: var(--space-2);
      align-items: flex-start;
      padding: var(--space-3);
      border: 1px solid var(--status-danger);
      border-radius: var(--radius-control);
      background: var(--status-danger-soft);
    }

    .mn-error p {
      margin: 0;
    }

    .duplicate {
      padding: var(--space-3);
      border: 1px solid var(--status-warning);
      border-radius: var(--radius-control);
      background: var(--status-warning-soft);
    }

    .duplicate p {
      margin: 0;
    }
  `,
})
export class AddTextPageComponent {
  protected readonly store = inject(ImportStore);
  private readonly router = inject(Router);
  private readonly navigation = inject(NavigationHistoryService);
  private readonly dialog = inject(Dialog);

  protected readonly busyMessage = computed(() => {
    const busy = this.store.busy();
    switch (busy.kind) {
      case 'idle':
        return null;
      case 'preparing-language':
        return 'Preparing Japanese analysis. This happens once per device.';
      case 'segmenting':
        return 'Dividing the text into sentences…';
      case 'analyzing':
        return `Analysing sentences… ${String(busy.completed)} of ${String(busy.total)}`;
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
      window.removeEventListener('beforeunload', warnOnUnload);
    });
  }

  protected retry(): void {
    void this.save();
  }

  protected async save(): Promise<void> {
    const id = await this.store.save();
    if (id !== null) {
      await this.router.navigate(['/reader', id], {
        replaceUrl: true,
        state: this.navigation.preservedOriginState('/library'),
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
      confirmLabel: 'Leave and lose it',
      cancelLabel: 'Stay here',
      tone: 'danger',
    });
  }
}
