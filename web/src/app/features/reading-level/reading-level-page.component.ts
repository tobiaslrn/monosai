import { ChangeDetectionStrategy, Component, computed, effect, inject, input } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute } from '@angular/router';
import { GrammarProfileStore } from '../../application/grammar/grammar-profile.store';
import { LanguageStore } from '../../application/language/language.store';
import {
  NavigationHistoryService,
  navigationOriginState,
} from '../../core/routing/navigation-history.service';
import { DisclosureComponent } from '../../shared-ui/disclosure/disclosure.component';
import { ExampleComponent } from '../../shared-ui/example/example.component';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { StackComponent } from '../../shared-ui/layout/layout';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { conventionalLevel } from '../grammar/preset-level';
import { StructuralBaselineSectionComponent } from '../grammar/structural-baseline-section.component';

/** Appended to every confirmation; changing the profile is what makes analyses stale. */
const STALE_NOTICE = 'Existing grammar notes are out of date.';

/**
 * The fragments callers may deep link to.
 *
 * Each is the id of the element it names; the page resolves it once the
 * language bundle has arrived, because nothing below the heading exists before.
 */
const FRAGMENT_TARGETS: readonly string[] = ['forms'];

/**
 * The grammar Monosai assumes the learner knows: the reading level, with an
 * example of it, and the forms that always count as known.
 *
 * Words and grammar were one page; they are two, each named after what it holds
 * ([ADR 0093](../../../../../docs/decisions/0093-words-and-grammar-are-two-pages.md)).
 * The file keeps the combined page's path because the composition allowlist,
 * which may only shrink, is keyed by path.
 */
@Component({
  selector: 'mn-grammar-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DisclosureComponent,
    ExampleComponent,
    SectionComponent,
    StackComponent,
    IconComponent,
    ListRowComponent,
    PageHeaderComponent,
    StructuralBaselineSectionComponent,
  ],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Grammar" [backTo]="backTarget()" [backLabel]="backLabel()" />

      <!-- The group gap the cards had when this was a section of a longer page. -->
      <mn-stack [gap]="2">
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
            <h3>Levels could not be loaded</h3>
            <p class="mn-hint">Your level is unchanged.</p>
            <button type="button" class="mn-button" (click)="retryLanguage()">Try again</button>
          </div>
        } @else {
          <div class="mn-card level-card">
            <mn-list-row
              [inCard]="true"
              [routerLink]="'/grammar/level'"
              [state]="levelOriginState"
              [testId]="'reading-level-link'"
            >
              <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
                <mn-icon name="reading-level" />
              </span>
              <span mn-list-row-title>Reading level</span>
              <span mn-list-row-meta>
                <span data-testid="grammar-standing">{{ grammarValue() }}</span>
                @if (grammarLevel(); as level) {
                  <span>{{ level }}</span>
                }
              </span>
              <span mn-list-row-trailing>
                <mn-icon name="chevron-right" />
              </span>
            </mn-list-row>
            @if (profile.selectedPreset(); as preset) {
              <mn-example [ja]="preset.exampleJa" [en]="preset.exampleEn" />
            }
          </div>

          <mn-section label="Always-known forms" [rows]="true">
            <mn-disclosure id="forms" heading="Always-known forms" [value]="formsSummary()">
              <mn-structural-baseline-section />
            </mn-disclosure>
          </mn-section>
        }

        @if (profile.lastError()) {
          <p class="mn-notice mn-notice--danger" role="alert">
            Could not save. Your level is unchanged.
          </p>
        }
      </mn-stack>
    </div>
  `,
  styles: `
    /* The row spans the card, so its words keep the same edge as every other row. */
    .level-card {
      display: grid;
      gap: 0;
      padding: 0 0 var(--surface-inset);
      overflow: clip;
    }

    /* The sample sits under the row's words, on their edge. */
    .level-card > mn-example {
      margin-inline: calc(var(--surface-inset) + var(--badge-size) + var(--glyph-gap))
        var(--surface-inset);
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
export class GrammarPageComponent {
  protected readonly profile = inject(GrammarProfileStore);
  protected readonly language = inject(LanguageStore);
  private readonly route = inject(ActivatedRoute);

  /** The level page's Back and Save return here through history. */
  protected readonly levelOriginState = navigationOriginState('/grammar');

  /** The deep link's target, which survives a navigation within this route. */
  private readonly fragment = toSignal(this.route.fragment, { initialValue: null });

  /** `generate` when the story form sent the learner here, so Back returns to it. */
  readonly from = input<string | undefined>();

  /**
   * Where this page goes back to: the story form says so in a query parameter,
   * Settings marks the navigation with its origin, and anything else returns to
   * the Library. Read once at construction, because the history entry does not
   * change under the page.
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

  protected readonly grammarValue = computed(
    () => this.profile.selectedPreset()?.nameEn ?? 'Not loaded yet',
  );

  protected readonly grammarLevel = computed(() => {
    const preset = this.profile.selectedPreset();
    return preset === null ? null : conventionalLevel(preset);
  });

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
      : `Level set to ${this.presetName(change.presetId)}. ${STALE_NOTICE}`;
  });

  constructor() {
    void this.language.initialize();
    void this.profile.load();

    // A deep link names a part of the page, which does not exist until the
    // language bundle has arrived, so it is resolved once the bundle settles.
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
    // A disclosure carries the fragment on its host, and folds in its own `details`.
    const fold = target.localName === 'mn-disclosure' ? target.querySelector('details') : null;
    if (fold !== null) {
      fold.open = true;
    }
    target.scrollIntoView({ block: 'start' });
  }

  private presetName(presetId: string): string {
    return this.profile.presets().find((preset) => preset.id === presetId)?.nameEn ?? presetId;
  }
}
