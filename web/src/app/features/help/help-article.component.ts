import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../shared-ui/button/button';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ClusterComponent, PageComponent, StackComponent } from '../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { ProseComponent } from '../../shared-ui/prose/prose.component';
import { RowComponent } from '../../shared-ui/row/row.component';
import { adjacentHelpTopics, HELP_TOPICS } from './help-topics';

/**
 * The frame every topic page wears: the shared page header with Back to Help,
 * one prose column for the topic's own words, and the way on to the next
 * topic as rows, the same shape as the topic list they come from.
 */
@Component({
  selector: 'mn-help-article',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonDirective,
    ClusterComponent,
    IconComponent,
    PageComponent,
    PageHeaderComponent,
    ProseComponent,
    RowComponent,
    StackComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header [heading]="topic().title" backTo="/help" backLabel="Back to Help" />
      <mn-prose>
        <ng-content />
      </mn-prose>
      <nav aria-label="More topics">
        <mn-stack [gap]="2">
          @if (adjacent().previous; as previous) {
            <mn-row
              surface="card"
              [link]="['/help', previous.slug]"
              [heading]="previous.title"
              testId="help-previous"
            >
              <mn-icon mn-row-leading name="back" [size]="18" />
              <span mn-row-meta>Previous topic</span>
            </mn-row>
          }
          @if (adjacent().next; as next) {
            <mn-row
              surface="card"
              [link]="['/help', next.slug]"
              [heading]="next.title"
              testId="help-next"
            >
              <span mn-row-meta>Next topic</span>
              <mn-icon name="chevron-right" [size]="18" />
            </mn-row>
          }
          <mn-cluster>
            <a mnButton="ghost" routerLink="/help">All topics</a>
          </mn-cluster>
        </mn-stack>
      </nav>
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

  protected readonly adjacent = computed(() => adjacentHelpTopics(this.slug()));
}
