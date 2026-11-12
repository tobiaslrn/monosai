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
            Tell Monosai which words you know, usually from Anki. It writes stories inside them and
            underlines anything it could not avoid. It also reads any Japanese you paste, with
            readings and a dictionary. No account or key.
          </p>
        </section>

        <section aria-labelledby="help-scope">
          <h2 id="help-scope">What it is not</h2>
          <p>
            Monosai is for the first few months. Once you can read a page of real Japanese with a
            dictionary, read things people wrote.
          </p>
        </section>

        <section aria-labelledby="help-more">
          <h2 id="help-more">When something fails</h2>
          <p>
            Failure screens show a code, such as <code>ai/credit-exhausted</code>.
            <a routerLink="/help/questions" fragment="q-failed">Common questions</a> covers the
            usual ones.
          </p>
        </section>
      </mn-prose>
    </mn-page>
  `,
})
export class HelpPageComponent {
  protected readonly topics = HELP_TOPICS;
}
