import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../shared-ui/button/button';
import { ClusterComponent, PageComponent } from '../../shared-ui/layout/layout';
import { PagerComponent, type PagerLink } from '../../shared-ui/pager/pager.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { ProseComponent } from '../../shared-ui/prose/prose.component';
import { adjacentHelpTopics, HELP_TOPICS } from './help-topics';

/**
 * The frame every topic page wears: the shared page header with Back to Help,
 * one prose column at a reading measure for the topic's own words, and the
 * way to the previous and next topic.
 */
@Component({
  selector: 'mn-help-article',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonDirective,
    ClusterComponent,
    PageComponent,
    PageHeaderComponent,
    ProseComponent,
    PagerComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header [heading]="topic().title" backTo="/help" backLabel="Back to Help" />
      <mn-prose [measure]="true">
        <ng-content />
        <mn-pager label="More topics" [previous]="previous()" [next]="next()" />
        <mn-cluster>
          <a mnButton="ghost" edge="start" routerLink="/help">All topics</a>
        </mn-cluster>
      </mn-prose>
    </mn-page>
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

  private readonly adjacent = computed(() => adjacentHelpTopics(this.slug()));

  protected readonly previous = computed<PagerLink | null>(() => {
    const topic = this.adjacent().previous;
    return topic
      ? { title: topic.title, link: ['/help', topic.slug], testId: 'help-previous' }
      : null;
  });

  protected readonly next = computed<PagerLink | null>(() => {
    const topic = this.adjacent().next;
    return topic ? { title: topic.title, link: ['/help', topic.slug], testId: 'help-next' } : null;
  });
}
