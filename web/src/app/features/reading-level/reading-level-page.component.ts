import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LanguageStore } from '../../application/language/language.store';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import {
  NavigationHistoryService,
  navigationOriginState,
} from '../../core/routing/navigation-history.service';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { conventionalLevel } from '../grammar/preset-level';
import { StructuralBaselineSectionComponent } from '../grammar/structural-baseline-section.component';
import { AddWordsComponent } from '../vocabulary/add-words.component';
import { PackageImportComponent } from '../vocabulary/package-import.component';
import { SourceListComponent } from '../vocabulary/source-list.component';
import { VocabularyCardComponent } from '../vocabulary/vocabulary-card.component';
import { generationShortfallLabel } from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/** Appended to every confirmation; changing the profile is what makes analyses stale. */
const STALE_NOTICE = 'Existing grammar analyses are now out of date.';

/**
 * The fragments callers may deep link to.
 *
 * Each is the id of the element it names, so the router's own anchor scrolling
 * finds it as well; the page re-resolves it afterwards because the grammar half
 * does not exist until the language bundle has arrived.
 */
const FRAGMENT_TARGETS: readonly string[] = ['words', 'grammar', 'forms'];

/**
 * What the learner can read: two facts, and the plumbing behind each.
 *
 * Vocabulary and grammar describe a single subject — how hard a reading may be
 * before it stops being readable — so they are one screen, composed like the
 * Library: quiet cards on the canvas, each fact leading to the page that holds
 * all of it, and the things set once and never touched again folded beneath.
 */
@Component({
  selector: 'mn-reading-level-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Provided here rather than at the root, so leaving the page discards any
  // refresh in flight and releases the provider it was reading from.
  providers: [VocabularyRefreshStore, PackageImportStore],
  imports: [
    IconComponent,
    ListRowComponent,
    PageHeaderComponent,
    AddWordsComponent,
    PackageImportComponent,
    SourceListComponent,
    VocabularyCardComponent,
    StructuralBaselineSectionComponent,
  ],
  template: `
    <div class="mn-page level-page">
      <mn-page-header
        heading="What you can read"
        [backTo]="backTarget()"
        [backLabel]="backLabel()"
      />

      <p
        class="mn-visually-hidden"
        role="status"
        aria-live="polite"
        data-testid="vocabulary-status"
      >
        {{ announcement() }}
      </p>

      <section id="words" class="group" aria-labelledby="mn-words-heading">
        <mn-vocabulary-card />
        @if (shortfall(); as note) {
          <p class="note">{{ note }}</p>
        }

        <div class="section-heading">
          <h2 id="mn-words-heading">Word sources</h2>
          <mn-add-words />
        </div>

        <mn-source-list />
        <p class="draft-status mn-hint" role="status">This list is not saved yet.</p>
        <mn-package-import />
      </section>

      <section id="grammar" class="group" aria-labelledby="mn-grammar-heading">
        <h2 id="mn-grammar-heading">Grammar</h2>

        <!--
          Announced rather than shown as a toast: the change has already been
          saved, so this confirms what happened without asking for an
          acknowledgement.
        -->
        <p class="confirmation" role="status" aria-live="polite" data-testid="grammar-confirmation">
          {{ confirmation() }}
        </p>

        @if (language.status() === 'failed') {
          <div class="mn-card assets-failed" role="alert">
            <h3>Language assets are unavailable</h3>
            <p class="mn-hint">
              Reading levels could not be loaded. Your saved profile is unchanged.
            </p>
            <button type="button" class="mn-button" (click)="retryLanguage()">Try again</button>
          </div>
        } @else {
          <div class="mn-card level-card">
            <mn-list-row
              variant="plain"
              [routerLink]="'/reading-level/level'"
              [state]="levelOriginState"
              [testId]="'reading-level-link'"
            >
              <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
                <mn-icon name="reading-level" [size]="24" />
              </span>
              <span mn-list-row-title>Reading level</span>
              <span mn-list-row-meta>{{ grammarDetail() }}</span>
              <span mn-list-row-trailing>
                <span class="mn-status-pill mn-status-pill--accent">
                  <span data-testid="grammar-standing">{{ grammarValue() }}</span>
                  @if (grammarLevel(); as level) {
                    <span> · {{ level }}</span>
                  }
                </span>
                <mn-icon name="chevron-right" />
              </span>
            </mn-list-row>
            @if (profile.selectedPreset(); as preset) {
              <div class="example">
                <p class="example-ja" lang="ja">{{ preset.exampleJa }}</p>
                <p class="gloss" lang="en">{{ preset.exampleEn }}</p>
              </div>
            }
          </div>

          <details id="forms" class="mn-card fold">
            <summary>
              <mn-icon class="fold-icon" name="file" [size]="22" />
              <span class="summary-label">Always-known forms</span>
              <span class="summary-value">{{ formsSummary() }}</span>
              <mn-icon class="fold-chevron" name="chevron-right" />
            </summary>
            <div class="fold-body">
              <mn-structural-baseline-section />
            </div>
          </details>
        }

        @if (profile.lastError()) {
          <p class="mn-notice mn-notice--error" role="alert">
            Your change could not be saved. Your saved level is unchanged.
          </p>
        }
      </section>
    </div>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

    .level-page {
      gap: var(--space-5);
    }

    /*
     * A deep link used to put a section heading flush at y=0, scrolling the page
     * title and the back link out of view — so a learner arriving from Generate
     * could not tell what page they had landed on. The margin is that chrome.
     */
    #words,
    #grammar {
      scroll-margin-top: 8rem;
    }

    .group {
      display: flex;
      flex-direction: column;
      gap: var(--space-3);
      min-width: 0;
    }

    .group h2 {
      margin: 0;
      font-size: var(--text-xl);
      letter-spacing: -0.01em;
    }

    .section-heading {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      justify-content: space-between;
      margin-top: var(--space-3);
    }

    .section-heading mn-add-words {
      margin-left: auto;
    }

    .note {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .sources-note {
      margin-top: calc(var(--space-1) * -1);
    }

    .draft-status {
      display: none;
      margin: 0;
    }

    #words:has(mn-add-words.is-editor) mn-source-list,
    #words:has(mn-add-words.is-editor) .sources-note {
      display: none;
    }

    #words:has(mn-add-words.is-editor) .draft-status {
      display: block;
    }

    /*
     * The heading and its Add source control share a line only while there is
     * nothing to put below them. An open editor asks for a full row of its own
     * (flex-basis: 100%), which nowrap silently refused — so opening
     * Add source → Pasted list drew the editor over the heading.
     */
    @media (min-width: breakpoints.$narrow) {
      .section-heading:not(:has(mn-add-words.is-editor)) {
        flex-wrap: nowrap;
      }
    }

    .level-card {
      display: grid;
      gap: var(--space-2);
      padding: var(--space-3);
    }

    .example {
      padding: var(--space-3);
      border-radius: var(--radius-control);
      background: var(--surface-sunken-example);
    }

    .example-ja {
      margin: 0;
      font-family: var(--font-japanese);
      font-size: var(--text-lg);
      line-height: 1.6;
    }

    .gloss {
      margin: var(--space-1) 0 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    /*
     * Set once and left alone, so each is folded; a closed fold still names its
     * current value opposite its label.
     */
    .fold {
      overflow: clip;
    }

    .fold > summary {
      display: flex;
      gap: var(--space-3);
      align-items: center;
      min-height: 3.5rem;
      padding: var(--space-2) var(--space-3);
      list-style: none;
      cursor: pointer;
      font-weight: var(--weight-medium);
    }

    .fold > summary::-webkit-details-marker {
      display: none;
    }

    .fold > summary:hover {
      background: var(--surface-sunken);
    }

    .fold-icon {
      flex: none;
    }

    .summary-label {
      flex: 1;
      min-width: 0;
    }

    .summary-value {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      text-align: end;
    }

    .fold-chevron {
      flex: none;
      color: var(--text-secondary);
      transition: transform var(--motion-fast) ease-out;
    }

    .fold[open] .fold-chevron {
      transform: rotate(90deg);
    }

    @media (prefers-reduced-motion: reduce) {
      .fold-chevron {
        transition: none;
      }
    }

    .fold-body {
      padding: var(--space-4);
      border-top: 1px solid var(--border-subtle);
    }

    .assets-failed {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
      padding: var(--space-4);
    }

    .assets-failed h3,
    .assets-failed p {
      margin: 0;
    }

    .confirmation:empty {
      display: none;
    }

    .confirmation {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
  `,
})
export class ReadingLevelPageComponent {
  protected readonly refresh = inject(VocabularyRefreshStore);
  protected readonly profile = inject(GrammarProfileStore);
  protected readonly language = inject(LanguageStore);
  private readonly mappings = inject(SourceMappingStore);
  private readonly packageImport = inject(PackageImportStore);
  private readonly history = inject(SnapshotHistoryStore);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** The level page's Back and Save return here through history. */
  protected readonly levelOriginState = navigationOriginState('/reading-level');

  /** The deep link's target, which survives a navigation within this route. */
  private readonly fragment = toSignal(this.route.fragment, { initialValue: null });

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

  protected readonly state = this.refresh.state;

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

  protected readonly grammarValue = computed(
    () => this.profile.selectedPreset()?.nameEn ?? 'Not loaded yet',
  );

  protected readonly grammarLevel = computed(() => {
    const preset = this.profile.selectedPreset();
    return preset === null ? null : conventionalLevel(preset);
  });

  protected readonly grammarDetail = computed(
    () => this.profile.selectedPreset()?.descriptionEn ?? 'Reading levels are built in.',
  );

  /** A closed disclosure states its current value rather than hiding it. */
  protected readonly formsSummary = computed(() => {
    const categories = new Set(this.language.structuralBaseline().map((entry) => entry.category));
    return categories.size === 0 ? 'Not loaded yet' : `${String(categories.size)} categories`;
  });

  /**
   * One line naming what was saved.
   *
   * Empty until the learner changes something, so a screen reader is not handed
   * a stale announcement on arrival.
   */
  protected readonly confirmation = computed(() => {
    const change = this.profile.lastChange();
    return change === null
      ? ''
      : `Reading level set to ${this.presetName(change.presetId)}. ${STALE_NOTICE}`;
  });

  constructor() {
    void this.mappings.load();
    void this.history.load();
    void this.language.initialize();
    void this.profile.load();

    effect(() => {
      const marker = this.shared();
      if (marker === undefined) {
        return;
      }
      void this.consumeShare(marker, this.reason());
    });

    // The history is a read model of what has been committed, so it is reloaded
    // whenever a refresh finishes rather than being patched in place.
    effect(() => {
      if (this.state().kind === 'complete') {
        void this.history.load();
      }
    });

    // A package import commits on its own, so the history it produced is
    // reloaded the same way a refresh's is.
    effect(() => {
      if (this.packageImport.state().kind === 'complete') {
        void this.history.load();
      }
    });

    // A deep link names the half of the page the caller had in mind, so the
    // target is opened and then scrolled to — and re-resolved when the bundle
    // arrives, because the grammar half does not exist until it has.
    effect(() => {
      const fragment = this.fragment();
      const status = this.language.status();
      if (fragment === null || status === 'idle' || status === 'initializing') {
        return;
      }
      // A task rather than a frame: an animation frame never arrives in a
      // background tab, and a deep link opened there has to be right the moment
      // it is looked at.
      setTimeout(() => {
        this.revealFragment(fragment);
      });
    });
  }

  protected retryLanguage(): void {
    void this.language.initialize();
  }

  /** Opens the disclosure a fragment points into, then brings it into view. */
  private revealFragment(fragment: string): void {
    if (!FRAGMENT_TARGETS.includes(fragment)) {
      return;
    }
    const target = document.getElementById(fragment);
    if (target === null) {
      return;
    }
    // Walk up rather than consulting a list: a fragment naming something inside
    // a fold has to open every fold above it, however the page is later nested.
    for (let node: Element | null = target; node !== null; node = node.parentElement) {
      if (node instanceof HTMLDetailsElement) {
        node.open = true;
      }
    }
    target.scrollIntoView({ block: 'start' });
  }

  private presetName(presetId: string): string {
    return this.profile.presets().find((preset) => preset.id === presetId)?.nameEn ?? presetId;
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
