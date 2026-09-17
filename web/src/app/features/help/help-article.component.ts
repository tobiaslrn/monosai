import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { adjacentHelpTopics, HELP_TOPICS } from './help-topics';

/**
 * The frame every topic page wears: the shared page header with Back to Help,
 * one readable prose column, and the way on to the next topic.
 *
 * The topic's own words are projected into `.mn-prose`, which is a global class
 * because projected content is not reached by this component's styles. What
 * stays here is the frame itself.
 */
@Component({
  selector: 'mn-help-article',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent],
  template: `
    <div class="mn-page">
      <mn-page-header [heading]="topic().title" backTo="/help" backLabel="Back to Help" />
      <div class="mn-prose">
        <ng-content />
      </div>
      <nav class="onward" aria-label="More help">
        @if (adjacent().previous; as previous) {
          <a class="step" [routerLink]="['/help', previous.slug]" rel="prev">
            <mn-icon name="back" [size]="18" />
            <span class="step__text">
              <span class="step__kind">Previous</span>
              <span class="step__title">{{ previous.title }}</span>
            </span>
          </a>
        }
        @if (adjacent().next; as next) {
          <a class="step step--next" [routerLink]="['/help', next.slug]" rel="next">
            <span class="step__text">
              <span class="step__kind">Next</span>
              <span class="step__title">{{ next.title }}</span>
            </span>
            <mn-icon name="chevron-right" [size]="18" />
          </a>
        }
      </nav>
      <p class="hub">
        <a routerLink="/help">All help topics</a>
      </p>
    </div>
  `,
  styles: `
    .onward {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-3);
      border-top: 1px solid var(--border-subtle);
      padding-top: var(--space-5);
    }
    .step {
      display: flex;
      flex: 1 1 14rem;
      gap: var(--space-3);
      align-items: center;
      min-height: var(--touch-target);
      padding: var(--space-3) var(--space-4);
      border: 1px solid var(--border-subtle-faint);
      border-radius: var(--radius-card);
      background: var(--surface-raised);
      color: inherit;
      text-decoration: none;
    }
    .step--next {
      justify-content: space-between;
      text-align: end;
    }
    .step__text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: var(--space-1);
    }
    .step__kind {
      color: var(--text-secondary);
      font-size: var(--text-sm);
    }
    .step__title {
      font-weight: var(--weight-semibold);
    }
    .step mn-icon {
      flex: none;
      color: var(--text-secondary);
    }
    .hub {
      margin: 0;
    }
    .hub a {
      color: var(--action-primary);
      text-underline-offset: 0.15em;
    }
  `,
})
export class HelpArticleComponent {
  /** The topic this page is, named by its slug so the list stays the source. */
  readonly slug = input.required<string>();

  protected readonly topic = computed(() => {
    const slug = this.slug();
    const topic = HELP_TOPICS.find((candidate) => candidate.slug === slug);
    if (!topic) {
      throw new Error(`Unknown help topic: ${slug}`);
    }
    return topic;
  });

  protected readonly adjacent = computed(() => adjacentHelpTopics(this.slug()));
}
