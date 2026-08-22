import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { technicalCode } from '../../domain/shared/errors';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { copyForFailure } from './anki-error-copy';
import { MappingEditorComponent } from './mapping-editor.component';
import { ProviderSelectionComponent } from './provider-selection.component';
import { SnapshotHistoryComponent } from './snapshot-history.component';

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
    SnapshotHistoryComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Vocabulary" backTo="/settings" backLabel="Back to settings" />

      <p
        class="mn-visually-hidden"
        role="status"
        aria-live="polite"
        data-testid="vocabulary-status"
      >
        {{ refresh.announcement() }}
      </p>

      <section class="overview mn-panel" aria-labelledby="mn-vocab-current-heading">
        <div class="section-heading">
          <div>
            <h2 id="mn-vocab-current-heading">Current</h2>
          </div>
          @if (syncStatus(); as status) {
            <span class="sync-status" [class.needs-attention]="status.attention">
              {{ status.message }}
            </span>
          }
        </div>
        <mn-snapshot-history />
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

      <section class="sources-panel mn-panel" aria-labelledby="mn-vocab-source-heading">
        <div class="section-heading">
          <div>
            <h2 id="mn-vocab-source-heading">Sources</h2>
          </div>
          <mn-provider-selection />
        </div>

        <div class="source-groups">
          <mn-mapping-editor />
        </div>
      </section>
    </div>
  `,
  styles: `
    .recovery p {
      margin: 0 0 var(--space-1);
    }

    .overview {
      display: grid;
      gap: var(--space-3);
    }

    .section-heading {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: var(--space-2);
    }

    .section-heading h2 {
      margin: 0;
    }

    .sync-status {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .sync-status.needs-attention {
      color: var(--status-warning);
    }

    .sources-panel,
    .source-groups {
      display: grid;
      gap: var(--space-3);
    }

    @media (min-width: 560px) {
      .sources-panel > .section-heading {
        align-items: flex-start;
        flex-wrap: nowrap;
      }
    }

    .source-groups {
      min-width: 0;
    }

    .section-heading mn-provider-selection {
      margin-left: auto;
    }
  `,
})
export class VocabularyPageComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);
  protected readonly mappings = inject(SourceMappingStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly automatic = inject(AutomaticAnkiSyncCoordinator, { optional: true });

  protected readonly state = this.refresh.state;
  protected readonly syncStatus = computed(() => {
    if (this.refresh.isBusy()) {
      return { message: 'Updating…', attention: false };
    }
    const status = this.automatic?.status();
    switch (status?.kind) {
      case undefined:
      case 'idle':
        return null;
      case 'checking':
        return { message: 'Checking Anki…', attention: false };
      case 'updated':
        return { message: 'Up to date', attention: false };
      case 'waiting':
        return { message: 'Anki is unavailable · current words kept', attention: false };
      case 'attention':
        return { message: 'A source needs attention', attention: true };
    }
  });

  protected readonly failure = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? copyForFailure(state.error) : null;
  });

  protected readonly failureCode = computed(() => {
    const state = this.state();
    return state.kind === 'failed' ? technicalCode(state.error) : null;
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
}
