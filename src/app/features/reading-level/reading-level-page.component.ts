import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LanguageStore } from '../../application/language/language.store';
import { AutomaticAnkiSyncCoordinator } from '../../application/vocabulary/automatic-anki-sync.coordinator';
import { PackageImportStore } from '../../application/vocabulary/package-import.store';
import { SnapshotHistoryStore } from '../../application/vocabulary/snapshot-history.store';
import { SourceMappingStore } from '../../application/vocabulary/source-mapping.store';
import { VocabularyRefreshStore } from '../../application/vocabulary/vocabulary-refresh.store';
import { CLOCK } from '../../application/shared/repository-tokens';
import { NavigationHistoryService } from '../../core/routing/navigation-history.service';
import { technicalCode } from '../../domain/shared/errors';
import { ErrorScreenComponent } from '../../shared-ui/error-screen/error-screen.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { GuidanceSectionComponent } from '../grammar/guidance-section.component';
import { PresetPickerComponent } from '../grammar/preset-picker.component';
import { REGISTER_LABELS } from '../grammar/register-labels';
import { StructuralBaselineSectionComponent } from '../grammar/structural-baseline-section.component';
import { copyForFailure } from '../vocabulary/anki-error-copy';
import { MappingEditorComponent } from '../vocabulary/mapping-editor.component';
import { PackageImportComponent } from '../vocabulary/package-import.component';
import { ProviderSelectionComponent } from '../vocabulary/provider-selection.component';
import {
  generationShortfallLabel,
  vocabularyCountLabel,
  vocabularyProvenanceLabel,
} from '../../shared-ui/vocabulary-standing/vocabulary-standing';

/** Appended to every confirmation; changing the profile is what makes analyses stale. */
const STALE_NOTICE = 'Existing grammar analyses are now out of date.';

/**
 * The fragments callers may deep link to.
 *
 * Each is the id of the element it names, so the router's own anchor scrolling
 * finds it as well; the page re-resolves it afterwards because the grammar half
 * does not exist until the language bundle has arrived.
 */
const FRAGMENT_TARGETS: readonly string[] = ['words', 'grammar', 'wording', 'forms'];

/**
 * What the learner can read: two facts, and the plumbing behind each.
 *
 * Vocabulary and grammar used to be two routes reachable only from inside
 * Settings, which filed the one thing that makes Monosai different under a
 * gear. They describe a single subject — how hard a reading may be before it
 * stops being readable — so they are one screen, ordered as the facts a learner
 * checks and then the things set once and never touched again.
 */
@Component({
  selector: 'mn-reading-level-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Provided here rather than at the root, so leaving the page discards any
  // refresh in flight and releases the provider it was reading from.
  providers: [VocabularyRefreshStore, PackageImportStore],
  imports: [
    ErrorScreenComponent,
    PageHeaderComponent,
    MappingEditorComponent,
    PackageImportComponent,
    ProviderSelectionComponent,
    PresetPickerComponent,
    GuidanceSectionComponent,
    StructuralBaselineSectionComponent,
  ],
  template: `
    <div class="mn-page">
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

      <dl class="standing" data-testid="reading-level-standing">
        <div class="fact">
          <dt>Words</dt>
          <dd class="value" data-testid="words-standing">{{ wordsValue() }}</dd>
          <dd class="detail">{{ wordsDetail() }}</dd>
        </div>
        <div class="fact fact--end">
          <dt>Grammar</dt>
          <dd class="value" data-testid="grammar-standing">{{ grammarValue() }}</dd>
          <dd class="detail">{{ grammarDetail() }}</dd>
        </div>
      </dl>

      <section id="words" class="mn-panel" aria-labelledby="mn-words-heading">
        <div class="section-heading">
          <h2 id="mn-words-heading">Words</h2>
          @if (syncStatus(); as status) {
            <span class="sync-status" [class.needs-attention]="status.attention">
              {{ status.message }}
            </span>
          }
          <mn-provider-selection />
        </div>

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

        <div class="source-groups">
          <mn-package-import />
          <mn-mapping-editor />
        </div>
      </section>

      <section id="grammar" class="mn-panel" aria-labelledby="mn-grammar-heading">
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
          <div class="assets-failed" role="alert">
            <h3>Language assets are unavailable</h3>
            <p class="mn-hint">
              The reading levels ship with the language bundle, which could not be loaded. Your
              saved profile is unchanged.
            </p>
            <button type="button" class="mn-button" (click)="retryLanguage()">Try again</button>
          </div>
        } @else {
          <mn-preset-picker />

          <details id="wording" class="mn-disclosure">
            <summary>
              <span class="summary-label">Register and wording</span>
              <span class="summary-value">{{ wordingSummary() }}</span>
            </summary>
            <mn-guidance-section />
          </details>

          <details id="forms" class="mn-disclosure">
            <summary>
              <span class="summary-label">Always-known forms</span>
              <span class="summary-value">{{ formsSummary() }}</span>
            </summary>
            <mn-structural-baseline-section />
          </details>
        }

        @if (profile.lastError(); as error) {
          <p class="mn-error" role="alert">Your change could not be saved: {{ error.code }}</p>
        }
      </section>
    </div>
  `,
  styles: `
    /*
     * A deep link used to put a section heading flush at y=0, scrolling the page
     * title, the back link, and the standing summary out of view — so a learner
     * arriving from Generate could not tell what page they had landed on. The
     * margin is the height of that chrome.
     */
    #words,
    #grammar {
      scroll-margin-top: 12rem;
    }

    .standing {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-4);
      margin: 0;
    }

    .fact {
      display: flex;
      flex-direction: column;
      gap: var(--space-1);
      min-width: 0;
    }

    .fact dt {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .fact dd {
      min-width: 0;
      margin: 0;
    }

    .fact .value {
      font-family: var(--font-ui);
      font-size: 26px;
      font-weight: 700;
      letter-spacing: -0.02em;
      line-height: 1.2;
    }

    .fact .detail {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    /* Two facts read as a pair on a wide screen and as two lines below that. */
    @media (min-width: 720px) {
      .fact--end {
        align-items: flex-end;
        text-align: end;
      }
    }

    @media (max-width: 719px) {
      .standing {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-3);
      }
    }

    .section-heading {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2);
      align-items: center;
      justify-content: space-between;
    }

    .section-heading h2 {
      margin: 0;
    }

    .section-heading mn-provider-selection {
      margin-left: auto;
    }

    /*
     * The heading and its Add source control share a line only while there is
     * nothing to put below them. An open editor asks for a full row of its own
     * (flex-basis: 100%), which nowrap silently refused — so opening
     * Add source → Pasted list drew the editor over the "Words" heading.
     */
    @media (min-width: 560px) {
      .section-heading:not(:has(mn-provider-selection.is-editor)) {
        flex-wrap: nowrap;
        align-items: flex-start;
      }
    }

    .sync-status {
      margin: 0;
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }

    .sync-status.needs-attention {
      color: var(--status-warning);
    }

    .source-groups {
      display: grid;
      gap: var(--space-3);
      min-width: 0;
    }

    .recovery p {
      margin: 0 0 var(--space-1);
    }

    .assets-failed {
      display: grid;
      justify-items: start;
      gap: var(--space-2);
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

    /*
     * A closed disclosure still answers the question it is hiding, so the
     * current value sits opposite its label rather than inside the fold.
     */
    .mn-disclosure {
      border-top: 1px solid var(--border-subtle);
    }

    .mn-disclosure > summary .summary-label {
      flex: 1;
      min-width: 0;
    }

    .mn-disclosure > summary .summary-value {
      color: var(--text-secondary);
      font-size: var(--text-sm);
      font-weight: 400;
      text-align: end;
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
  private readonly automatic = inject(AutomaticAnkiSyncCoordinator, { optional: true });
  private readonly clock = inject(CLOCK);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

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

  /** The words fact, in every state the snapshot read can be in. */
  protected readonly wordsValue = computed(() => {
    if (this.history.lastFailure() !== null) {
      return 'Words unavailable';
    }
    const snapshot = this.history.active();
    return snapshot === null ? 'No words yet' : vocabularyCountLabel(snapshot.uniqueEntryCount);
  });

  protected readonly wordsDetail = computed(() => {
    if (this.history.lastFailure() !== null) {
      return 'Your saved words could not be read. Nothing was changed.';
    }
    const snapshot = this.history.active();
    if (snapshot === null) {
      return 'Add a source below and Monosai reads your words from it.';
    }
    if (snapshot.uniqueEntryCount === 0) {
      return 'A source is connected but has no words in it yet.';
    }
    const provenance = vocabularyProvenanceLabel(snapshot, this.clock.now());
    const shortfall = generationShortfallLabel(snapshot.uniqueEntryCount);
    return shortfall === null ? provenance : `${provenance} · ${shortfall}`;
  });

  protected readonly grammarValue = computed(
    () => this.profile.selectedPreset()?.nameEn ?? 'Not loaded yet',
  );

  protected readonly grammarDetail = computed(() => {
    const preset = this.profile.selectedPreset();
    if (preset === null) {
      return 'Reading levels arrive with the language bundle.';
    }
    return this.profile.isCustomGuidance()
      ? `${preset.descriptionEn} Written in your own wording.`
      : preset.descriptionEn;
  });

  /** A closed disclosure states its current value rather than hiding it. */
  protected readonly wordingSummary = computed(() => {
    const register = REGISTER_LABELS[this.profile.selection().registerPreference];
    return this.profile.isCustomGuidance() ? `${register} · your own wording` : register;
  });

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
    if (change === null) {
      return '';
    }
    switch (change.kind) {
      case 'preset':
        return `Reading level set to ${this.presetName(change.presetId)}. ${STALE_NOTICE}`;
      case 'register':
        return `Register set to ${REGISTER_LABELS[change.registerPreference]}. ${STALE_NOTICE}`;
      case 'custom-guidance':
        return `Your own wording saved. ${STALE_NOTICE}`;
      case 'reset-to-preset':
        return `Wording reset to ${this.presetName(change.presetId)}. ${STALE_NOTICE}`;
    }
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

    // A deep link names the half of the page the caller had in mind. Landing at
    // the top of a page longer than either half used to be would make the merge
    // worse than the split, so the target is opened and then scrolled to — and
    // re-resolved when the bundle arrives, because the grammar half does not
    // exist until it has.
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
