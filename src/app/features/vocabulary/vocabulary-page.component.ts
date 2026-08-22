import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { canRefreshMappings } from '../../domain/anki/mapping-validation';
import { technicalCode } from '../../domain/shared/errors';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { copyForFailure } from './anki-error-copy';
import { MappingEditorComponent } from './mapping-editor.component';
import { ProviderSelectionComponent } from './provider-selection.component';
import { RefreshStepperComponent } from './refresh-stepper.component';
import { RefreshSummaryComponent } from './refresh-summary.component';
import { SnapshotHistoryComponent } from './snapshot-history.component';
import { TextListSourceComponent } from './text-list-source.component';

@Component({
  selector: 'mn-vocabulary-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Provided here rather than at the root, so leaving the page discards any
  // refresh in flight and releases the provider it was reading from.
  providers: [VocabularyRefreshStore],
  imports: [
    ErrorScreenComponent,
    PageHeaderComponent,
    MappingEditorComponent,
    ProviderSelectionComponent,
    RefreshStepperComponent,
    RefreshSummaryComponent,
    SnapshotHistoryComponent,
    TextListSourceComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Vocabulary" backTo="/settings" backLabel="Back to settings" />

      <p class="mn-hint">
        Combine vocabulary you already know from Anki or your own pasted lists. Sources stay on this
        device, and Monosai only ever reads from Anki.
      </p>

      <p
        class="mn-visually-hidden"
        role="status"
        aria-live="polite"
        data-testid="vocabulary-status"
      >
        {{ refresh.announcement() }}
      </p>

      <section class="mn-panel" aria-labelledby="mn-vocab-source-heading">
        <h2 id="mn-vocab-source-heading">Add a vocabulary source</h2>
        <mn-provider-selection />
        <div class="source-divider"></div>
        <mn-text-list-source />
      </section>

      @if (failure(); as copy) {
        <mn-error-screen
          [heading]="copy.heading"
          [description]="copy.whatFailed"
          [dataStatus]="copy.whatDidNot"
          [code]="failureCode()"
        >
          <div data-actions class="recovery">
            <p>{{ copy.primaryAction }}</p>
            <p class="mn-hint">{{ copy.escape }}</p>
          </div>
        </mn-error-screen>
      }

      <section class="mn-panel" aria-labelledby="mn-vocab-mapping-heading">
        <h2 id="mn-vocab-mapping-heading">Anki decks and fields</h2>
        <mn-mapping-editor />
      </section>

      <section class="mn-panel" aria-labelledby="mn-vocab-refresh-heading">
        <h2 id="mn-vocab-refresh-heading">Refresh</h2>

        @if (automaticStatus(); as status) {
          <div class="automatic-status" [class.needs-attention]="status.attention">
            <span>{{ status.message }}</span>
            @if (status.retry) {
              <button type="button" class="mn-button" (click)="retryAutomaticSync()">
                Retry now
              </button>
            }
          </div>
        }

        @if (refresh.isBusy() || isFinished()) {
          <mn-refresh-stepper />
        }

        @if (state().kind === 'awaiting-confirmation') {
          <mn-refresh-summary [stats]="pendingStats()!" />
        } @else {
          <div class="actions">
            <button
              type="button"
              class="mn-button mn-button--primary"
              [disabled]="!canRefresh()"
              (click)="startRefresh()"
              data-testid="start-refresh"
            >
              Refresh vocabulary
            </button>
            @if (refresh.canCancel()) {
              <button
                type="button"
                class="mn-button"
                (click)="cancel()"
                data-testid="cancel-refresh"
              >
                Cancel
              </button>
            }
          </div>

          @if (!canRefresh() && !refresh.isBusy()) {
            <p class="mn-hint" data-testid="refresh-blocked">{{ blockedReason() }}</p>
          }
        }
      </section>

      <section class="mn-panel" aria-labelledby="mn-vocab-current-heading">
        <h2 id="mn-vocab-current-heading">Current vocabulary</h2>
        <mn-snapshot-history />
      </section>
    </div>
  `,
  styles: `
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .recovery p {
      margin: 0 0 var(--space-1);
    }

    .source-divider {
      height: 1px;
      margin: var(--space-4) 0;
      background: var(--border-subtle);
    }

    .automatic-status {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-2);
      margin-bottom: var(--space-3);
      padding: var(--space-2);
      border-radius: var(--radius-control);
      background: var(--surface-raised);
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .automatic-status.needs-attention {
      background: var(--status-warning-soft);
      color: var(--text-primary);
    }
  `,
})
export class VocabularyPageComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);
  protected readonly mappings = inject(SourceMappingStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly automatic = inject(AutomaticAnkiSyncCoordinator, { optional: true });

  protected readonly state = this.refresh.state;
  protected readonly automaticStatus = computed(() => {
    const status = this.automatic?.status();
    switch (status?.kind) {
      case undefined:
      case 'idle':
        return null;
      case 'checking':
        return {
          message: 'Checking Anki for reviewed vocabulary…',
          attention: false,
          retry: false,
        };
      case 'updated':
        return {
          message: `Automatic sync updated the combined vocabulary to ${String(status.snapshot.uniqueEntryCount)} unique expressions.`,
          attention: false,
          retry: false,
        };
      case 'waiting':
        return { message: status.message, attention: false, retry: true };
      case 'attention':
        return { message: status.message, attention: true, retry: true };
    }
  });

  protected readonly isFinished = computed(() =>
    ['complete', 'cancelled'].includes(this.state().kind),
  );

  protected readonly pendingStats = computed(() => {
    const state = this.state();
    return state.kind === 'awaiting-confirmation' ? state.summary.stats : null;
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? copyForFailure(state.error) : null;
  });

  protected readonly failureCode = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? technicalCode(state.error) : null;
  });

  /**
   * Refresh is available only once every enabled mapping resolves.
   *
   * A stale mapping blocks it rather than being skipped, because skipping would
   * quietly build a snapshot from less than the learner configured.
   */
  protected readonly canRefresh = computed(() => {
    if (this.refresh.isBusy() || !this.refresh.mappingEditorEnabled()) {
      return false;
    }
    const resolution = this.refresh.resolution();
    return resolution !== null && canRefreshMappings(resolution);
  });

  protected readonly blockedReason = computed(() => {
    if (!this.refresh.mappingEditorEnabled()) {
      return 'Connect to a vocabulary source to refresh.';
    }
    const resolution = this.refresh.resolution();
    if (resolution !== null && resolution.stale.length > 0) {
      return 'Repair, switch off, or remove the sources marked above before refreshing.';
    }
    return 'Add and enable at least one source to refresh.';
  });

  constructor() {
    void this.mappings.load();
    void this.history.load();

    // The history is a read model of what has been committed, so it is reloaded
    // whenever a refresh finishes rather than being patched in place.
    effect(() => {
      if (this.state().kind === 'complete') {
        void this.history.load();
      }
    });
  }

  protected startRefresh(): void {
    void this.refresh.refresh();
  }

  protected cancel(): void {
    this.refresh.cancel();
  }

  protected retryAutomaticSync(): void {
    void this.automatic?.trigger(true);
  }
}
