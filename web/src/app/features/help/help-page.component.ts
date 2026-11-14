import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonDirective } from '../../shared-ui/button/button';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PageComponent } from '../../shared-ui/layout/layout';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { ProseComponent } from '../../shared-ui/prose/prose.component';
import { RowComponent } from '../../shared-ui/row/row.component';
import { SectionComponent } from '../../shared-ui/section/section.component';
import { HELP_TOPICS } from './help-topics';

/** Local, static guidance: reading the guide never invokes an AI provider. */
@Component({
  selector: 'mn-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    ButtonDirective,
    IconComponent,
    PageComponent,
    PageHeaderComponent,
    ProseComponent,
    RowComponent,
    SectionComponent,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Help" backTo="/library" backLabel="Back to library">
        <!-- Named, not drawn: no icon in the set reads as GitHub rather than a branch. -->
        <a
          mnButton="ghost"
          href="https://github.com/tobiaslrn/monosai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub (opens in a new tab)"
          title="GitHub (opens in a new tab)"
        >
          GitHub
        </a>
      </mn-page-header>

      <mn-section heading="Topics" [rows]="true">
        @for (topic of topics; track topic.slug) {
          <mn-row
            [link]="['/help', topic.slug]"
            [heading]="topic.title"
            [icon]="topic.icon"
            testId="help-topic"
          >
            <span mn-row-meta>{{ topic.summary }}</span>
            <mn-icon name="chevron-right" />
          </mn-row>
        }
      </mn-section>

      <mn-prose>
        <section aria-labelledby="help-what">
          <h2 id="help-what">What Monosai does</h2>
          <p>
            Monosai writes short Japanese stories that use only the words you already know, so you
            can read without stopping at every line. You tell it which words you know, usually from
            your Anki reviews, and it underlines any word it couldn't avoid.
          </p>
          <p>
            You can also paste any Japanese text and read it with readings and a dictionary. That
            needs no account and no key.
          </p>
        </section>

        <section aria-labelledby="help-who">
          <h2 id="help-who">Who it's for</h2>
          <p>
            Monosai is for your first months of reading, while most real Japanese is still full of
            words you don't know. Once you can read a page written for native speakers with a
            dictionary, move on to books, manga and articles.
          </p>
        </section>

        <section aria-labelledby="help-fails">
          <h2 id="help-fails">When something goes wrong</h2>
          <p>
            Look up the message you see in
            <a routerLink="/help/troubleshooting">Fix a problem</a>. It explains what each one means
            and what to do next.
          </p>
        </section>
      </mn-prose>
    </mn-page>
  `,
})
export class HelpPageComponent {
  protected readonly topics = HELP_TOPICS;
}
