import type { OnChanges, SimpleChanges } from '@angular/core';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import {
  LOGGER,
  NOOP_LOGGER,
  reportRejection,
  type Logger,
} from '../../application/shared/diagnostics';
import { AnkiConnectionStore } from '../../application/vocabulary/anki-connection.store';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { StackComponent } from '../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { SettingsSectionComponent } from '../../shared-ui/settings-section/settings-section.component';
import { generationShortfallLabel } from '../../shared-ui/vocabulary-standing/vocabulary-standing';
import { AddWordsComponent } from './add-words.component';
import { AnkiMappingDraftComponent } from './anki-mapping-draft.component';
import { PackageImportComponent } from './package-import.component';
import { SourceListComponent } from './source-list.component';
import { TextListSourceComponent } from './text-list-source.component';
import { VocabularyCardComponent } from './vocabulary-card.component';

/**
 * The words Monosai writes from: how many there are, and where they come from.
 *
 * Words and grammar were one page; they are two, each named after what it holds
 * ([ADR 0093](../../../../../docs/decisions/0093-words-and-grammar-are-two-pages.md)).
 * This one is composed like the Library: the vocabulary as a card that leads to
 * the list, then the sources, each leading to its own page.
 */
@Component({
  selector: 'mn-words-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Provided here rather than at the root, so leaving the page discards any
  // refresh in flight, and the uncommitted Anki draft with it, and releases the
  // provider it was reading from. The draft is a card in this section rather
  // than a part of the control that started it, so the page owns it.
  providers: [VocabularyRefreshStore, PackageImportStore, AnkiConnectionStore],
  imports: [
    PageHeaderComponent,
    SettingsSectionComponent,
    StackComponent,
    AddWordsComponent,
    AnkiMappingDraftComponent,
    PackageImportComponent,
    SourceListComponent,
    TextListSourceComponent,
    VocabularyCardComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Words" [backTo]="backTarget()" [backLabel]="backLabel()" />

      <p
        class="mn-visually-hidden"
        role="status"
        aria-live="polite"
        data-testid="vocabulary-status"
      >
        {{ announcement() }}
      </p>

      <mn-settings-section sectionId="sources" heading="Word sources">
        <mn-add-words mn-settings-section-action (textListChosen)="textDraft.set(true)" />
        <!--
          Whatever is being drafted stands at the head of the section, full
          width, above the vocabulary it has not changed yet. Both drafts used
          to render inside the section's action slot beside the heading, which
          squeezed a form into the space a button asks for and pushed the rest
          of the page down the screen.
        -->
        @if (textDraft()) {
          <section aria-labelledby="mn-text-draft-heading">
            <mn-stack [gap]="2">
              <h3 id="mn-text-draft-heading">Your own list</h3>
              <mn-text-list-source (saved)="closeTextDraft()" (cancelled)="closeTextDraft()" />
            </mn-stack>
          </section>
        }
        <mn-anki-mapping-draft />
        <mn-vocabulary-card />
        @if (shortfall(); as note) {
          <p class="mn-hint" data-testid="words-shortfall">{{ note }}</p>
        }

        <mn-source-list />
        <mn-package-import />
      </mn-settings-section>
    </div>
  `,
})
export class WordsPageComponent implements OnChanges {
  private readonly mappings = inject(SourceMappingStore);
  private readonly refresh = inject(VocabularyRefreshStore);
  private readonly packageImport = inject(PackageImportStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly logger = inject<Logger>(LOGGER, { optional: true }) ?? NOOP_LOGGER;

  /**
   * Set by the service worker's redirect after Android hands Monosai a file.
   *
   * Route parameters reach the page as inputs, so nothing here has to read the
   * URL itself; the marker is removed again as soon as it has been acted on so
   * a reload or a back navigation cannot replay the share.
   */
  readonly shared = input<string | undefined>();
  readonly reason = input<string | undefined>();
  readonly from = input<string | undefined>();

  /**
   * Where this page goes back to.
   *
   * Three screens lead here and each expects to get its own place back: the
   * generate form says so in a query parameter, Settings marks the navigation
   * with its origin, and everything else came from the Library. Read once at
   * construction, because the history entry does not change under the page.
   */
  private readonly origin = inject(NavigationHistoryService).currentOrigin();

  protected readonly backTarget = computed(() => {
    if (this.from() === 'generate') {
      return '/generate';
    }
    return this.origin === '/settings' ? '/settings' : '/library';
  });

  protected readonly backLabel = computed(() => {
    if (this.from() === 'generate') {
      return 'Back to story';
    }
    return this.origin === '/settings' ? 'Back to settings' : 'Back to library';
  });

  /** Whether the section is drafting a pasted list. Nothing is saved until Add source. */
  protected readonly textDraft = signal(false);
  private readonly addWords = viewChild(AddWordsComponent);

  /**
   * One live region for what the page's work is doing. An import in progress
   * owns it, because it is the thing the learner just started; otherwise the
   * refresh does.
   */
  protected readonly announcement = computed(() =>
    this.packageImport.state().kind === 'idle'
      ? this.refresh.announcement()
      : this.packageImport.announcement(),
  );

  /**
   * What a learner below the generation floor needs to know.
   *
   * The only thing the section says about the vocabulary beyond the card's own
   * count, and it disappears the moment there are enough words rather than
   * congratulating anyone for passing a threshold they never saw.
   */
  protected readonly shortfall = computed(() => {
    const snapshot = this.history.active();
    return snapshot === null ? null : generationShortfallLabel(snapshot.uniqueEntryCount);
  });

  constructor() {
    void this.mappings.load();
    void this.history.load();

    // The history is a read model of what has been committed, so it is reloaded
    // whenever a commit finishes rather than being patched in place. A refresh
    // is confirmed through the Anki connection store, which reloads it itself.
    // A package import commits on its own, outside anything this page awaits,
    // so its completed state is the key: each import reloads once, and the
    // loader runs untracked.
    resource({
      params: () => {
        const state = this.packageImport.state();
        return state.kind === 'complete' ? state : undefined;
      },
      loader: () =>
        this.history.load().catch((error: unknown) => {
          reportRejection(this.logger, error);
        }),
    });
  }

  /** A shared file arrives as a route input, and is taken once per arrival. */
  ngOnChanges(changes: SimpleChanges): void {
    const marker = this.shared();
    if ('shared' in changes && marker !== undefined) {
      void this.consumeShare(marker, this.reason());
    }
  }

  protected closeTextDraft(): void {
    this.textDraft.set(false);
    this.addWords()?.focusToggle();
  }

  private async consumeShare(marker: string, reason: string | undefined): Promise<void> {
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
    await this.packageImport.receiveShared(marker, reason);
  }
}
