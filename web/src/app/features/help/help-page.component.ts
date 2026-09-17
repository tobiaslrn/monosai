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
        <section aria-labelledby="help-what">
          <h2 id="help-what">What Monosai is for</h2>
          <p>
            Reading Japanese as a beginner usually means stopping every few words to look one up.
            Monosai removes the stopping: it writes short stories out of the words you have already
            studied, so you can read a whole paragraph and understand it.
          </p>
          <p>
            Tell Monosai which words you know, most easily by pointing it at the cards you have
            reviewed in Anki. From {{ minimumWords }} words upwards it can write a story that stays
            inside them, and it marks anything it could not avoid. What you get is reading practice
            at the level you are actually at, not a page with ten new words in the first paragraph.
          </p>
          <p>
            You can also paste Japanese you found elsewhere and read it here with readings above the
            kanji, spacing between words, and a dictionary a tap away. That works without an AI key
            and without an account, but it is the smaller half of Monosai.
          </p>
        </section>

        <section aria-labelledby="help-scope">
          <h2 id="help-scope">And what it is not for</h2>
          <p>
            Monosai is for the first few months of reading, and it is meant to be outgrown. Stories
            written by a model are scaffolding: they exist so you can practise reading sentences
            instead of decoding them. Nobody really wants to read generated fiction, and Monosai is
            not trying to produce good literature.
          </p>
          <p>
            Once you can get through a page of real Japanese with a dictionary and some patience,
            the scaffolding has done its job. Move on to material written by people. That is the
            point of the exercise.
          </p>
        </section>

        <section aria-labelledby="help-topics">
          <h2 id="help-topics">Guides</h2>
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
            Failure screens in Monosai show a short code such as
            <code>ai/model-not-found</code>. <a routerLink="/help/questions">Common questions</a>
            covers the ones you are most likely to meet, and the repository has the full list along
            with a way to report anything this guide does not answer.
          </p>
          <p>
            Monosai is in alpha and built by one person in the open. Bugs and rough edges are
            expected, and reports are welcome.
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
