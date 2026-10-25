import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCount } from '../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { ListRowComponent } from '../../shared-ui/list-row/list-row.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';
import { HELP_TOPICS } from './help-topics';

/** Local, static guidance: reading the guide never invokes an AI provider. */
@Component({
  selector: 'mn-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, ListRowComponent, PageHeaderComponent],
  template: `
    <div class="mn-page">
      <mn-page-header heading="Help" backTo="/library" backLabel="Back to library">
        <!-- Named, not drawn: no icon in the set reads as GitHub rather than a branch. -->
        <a
          class="mn-button mn-button--ghost"
          href="https://github.com/tobiaslrn/monosai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub (opens in a new tab)"
          title="GitHub (opens in a new tab)"
        >
          GitHub
        </a>
      </mn-page-header>

      <div class="mn-prose">
        <p class="mn-prose__lead">
          Monosai writes short Japanese stories out of the words you have already studied, so you
          can read a paragraph instead of looking one up every few seconds.
        </p>

        <section aria-labelledby="help-what">
          <h2 id="help-what">What Monosai does</h2>
          <p>
            Tell it which words you know, most easily by pointing it at the cards you have reviewed
            in Anki. From {{ minimumWords }} words upwards it writes stories that stay inside them,
            and underlines anything it could not avoid.
          </p>
          <p>
            It also reads Japanese you bring yourself. Paste text from anywhere and Monosai adds
            readings above the kanji, spacing between words, and a dictionary a tap away. That side
            needs no account and no AI key.
          </p>
        </section>

        <section aria-labelledby="help-scope">
          <h2 id="help-scope">What it is not</h2>
          <p>
            Monosai is for the first few months, and it is meant to be outgrown. Once you can get
            through a page of real Japanese with a dictionary and some patience, read things people
            wrote.
          </p>
        </section>

        <section aria-labelledby="help-topics">
          <h2 id="help-topics">Topics</h2>
          <ul class="mn-list-group">
            @for (topic of topics; track topic.slug) {
              <li>
                <mn-list-row [routerLink]="['/help', topic.slug]" [testId]="'help-topic'">
                  <span mn-list-row-leading class="mn-icon-badge" aria-hidden="true">
                    <mn-icon [name]="topic.icon" [size]="18" />
                  </span>
                  <span mn-list-row-title>{{ topic.title }}</span>
                  <span mn-list-row-meta>{{ topic.summary }}</span>
                  <mn-icon mn-list-row-trailing name="chevron-right" />
                </mn-list-row>
              </li>
            }
          </ul>
        </section>

        <section aria-labelledby="help-more">
          <h2 id="help-more">When something fails</h2>
          <p>
            Failure screens show a short code, such as <code>ai/credit-exhausted</code>.
            <a routerLink="/help/questions" fragment="q-failed">Common questions</a> covers the ones
            you are most likely to meet and links the full list.
          </p>
          <p>
            Monosai is in alpha and built by one person in the open, so bugs are expected. Reports
            are welcome.
          </p>
        </section>
      </div>
    </div>
  `,
})
export class HelpPageComponent {
  /** Read from the rule, so the screens that state it cannot disagree. */
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
  protected readonly topics = HELP_TOPICS;
}
