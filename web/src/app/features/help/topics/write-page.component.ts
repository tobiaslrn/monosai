import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCount } from '../../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../../domain/vocabulary/snapshot';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-write',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NoticeComponent, HelpArticleComponent],
  template: `
    <mn-help-article slug="write">
      <p mn-lead>
        Select <strong>Write with AI</strong> in the Library, and Monosai takes you through three
        steps: your words, a direction and a plot.
      </p>

      <section aria-labelledby="write-before">
        <h2 id="write-before">Before you start</h2>
        <p>
          You need at least {{ minimumWords }} known words, an OpenRouter key and a tested text
          model, as <a routerLink="/help/get-started">Get started</a> describes. If something is
          missing, <strong>Before you can write</strong> lists it, with a button that takes you to
          where you fix it.
        </p>
      </section>

      <section aria-labelledby="write-words">
        <h2 id="write-words">Choose your words</h2>
        <p>
          Every known word may appear in every story. These settings decide which words the story
          leans on, and how strictly it keeps to your words:
        </p>
        <ul>
          <li>
            <strong>Word selection</strong> favours your words evenly, the ones you learned most
            recently, or the ones you find difficult. With <strong>Recently learned</strong>,
            <strong>Focus</strong> sets how many of your newest words count as recent. Word lists
            have no learning dates, so this choice uses only Anki words.
          </li>
          <li>
            <strong>Length</strong> runs from about 5 to 800 sentences. Very long stories may stray
            from your words.
          </li>
          <li>
            <strong>Vocabulary strictness</strong> decides how often Monosai rewrites sentences that
            use words you don't know: <strong>Relaxed</strong> never, <strong>Standard</strong> once
            and <strong>Strict</strong> twice. Each rewrite is another request.
          </li>
          <li>
            <strong>Exceptions (optional)</strong> lists names and words the story may use anyway,
            such as a character's name. Select <strong>Save exceptions</strong> to keep them; they
            apply to every story until you change them.
          </li>
        </ul>
        <p>Monosai remembers these choices for your next story.</p>
      </section>

      <section aria-labelledby="write-direction">
        <h2 id="write-direction">Choose a direction</h2>
        <p>
          Pick a genre, a topic, a setting, a mood, a cast and a format, or leave any of them on
          <strong>Any</strong>. <strong>Custom</strong> lets you type your own, and
          <strong>Surprise me</strong> picks everything at random. Use
          <strong>Instructions (optional)</strong> for anything else, such as the tone or who tells
          the story.
        </p>
      </section>

      <section aria-labelledby="write-plot">
        <h2 id="write-plot">Choose a plot</h2>
        <p>
          When you continue, Monosai drafts three plots. Choose one, or select
          <strong>Edit</strong> to change its text. <strong>Regenerate</strong> drafts new plots and
          keeps the ones you edited. Each draft is a request to OpenRouter.
        </p>
        <p>
          Under <strong>Prepare after generation</strong>, choose what to add once the story is
          written: <strong>English translation</strong>, <strong>Grammar notes</strong> or
          <strong>Audio</strong>. Translation and notes are on unless you turn them off, and each
          one costs extra. <strong>Audio</strong> is available once you've set up a voice.
        </p>
      </section>

      <section aria-labelledby="write-generate">
        <h2 id="write-generate">Generate the story</h2>
        <p>
          Select <strong>Generate story</strong>. Most models take under a minute. You can go back
          to the Library while the story is written; it appears under <strong>Writing</strong>
          until it's saved. Up to three stories can be written at once.
        </p>
        <mn-notice tone="warning" icon="warning">
          <p>
            Keep this tab open until the story is saved. Reloading or closing it stops the story,
            and nothing is saved.
          </p>
        </mn-notice>
      </section>

      <section aria-labelledby="write-cost">
        <h2 id="write-cost">What a story costs</h2>
        <p>
          With the recommended models, a story with its translation and notes costs from a fraction
          of a cent to a few cents. Each of these is a separate request:
        </p>
        <ul>
          <li>Drafting plots, each time you draft or regenerate them.</li>
          <li>Writing the story. Long stories are written in several parts.</li>
          <li>Each rewrite set by <strong>Vocabulary strictness</strong>.</li>
          <li>Checking unknown words against your exceptions.</li>
          <li>The translation, notes and audio you chose.</li>
        </ul>
        <p>
          <a routerLink="/help/text-models">Choose a text model</a> has the prices of the
          recommended models.
        </p>
      </section>

      <section aria-labelledby="write-unknown">
        <h2 id="write-unknown">When a story uses words you don't know</h2>
        <p>
          Monosai replaces the unknown words it can and underlines the rest in orange. A few are
          normal. Many usually mean the model is too small or you know too few words for your level;
          a stricter setting or a larger model helps.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class WritePageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
