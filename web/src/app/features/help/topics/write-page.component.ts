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
          You need at least {{ minimumWords }} known words, an OpenRouter key, a tested text model
          and an internet connection, as
          <a routerLink="/help/get-started">Get started</a> describes. If something is missing,
          <strong>Before you can write</strong> lists it, with a button that takes you to where you
          fix it.
        </p>
      </section>

      <section aria-labelledby="write-words">
        <h2 id="write-words">Choose your words</h2>
        <p>
          Every known word may appear in every story. These settings decide which words the story
          favours, and how closely it keeps to your words:
        </p>
        <ul>
          <li>
            <strong>Word selection</strong> decides which words the story favours.
            <strong>Evenly</strong> treats all your words alike,
            <strong>Recently learned</strong> favours your newest words, and
            <strong>Difficult</strong> favours the words you struggle with in Anki. With
            <strong>Recently learned</strong>, <strong>Focus</strong>
            sets how many of your newest words count as recent. Words from a word list have no
            learning dates, so only Anki words count towards these two.
          </li>
          <li>
            <strong>Length</strong> runs from about 5 to 800 sentences. Very long stories may stray
            from your words.
          </li>
          <li>
            <strong>Vocabulary strictness</strong> sets how many times Monosai may rewrite the story
            to remove words you don't know. <strong>Relaxed</strong> keeps the first draft,
            <strong>Standard</strong> allows one rewrite and <strong>Strict</strong> allows two.
            Each rewrite is another request.
          </li>
          <li>
            <strong>Exceptions (optional)</strong> lists names and words the story may use anyway,
            such as a character's name. Select <strong>Save exceptions</strong> to keep them. They
            apply to every story until you change them.
          </li>
        </ul>
        <p>
          Monosai keeps <strong>Word selection</strong>, <strong>Focus</strong>,
          <strong>Vocabulary strictness</strong> and <strong>Prepare after generation</strong> for
          every story until you change them. <strong>Length</strong> and the direction stay the same
          until you close Monosai.
        </p>
      </section>

      <section aria-labelledby="write-direction">
        <h2 id="write-direction">Choose a direction</h2>
        <p>
          Pick a genre, a topic, a setting, a mood, a cast and a format, or leave any of them on
          <strong>Any</strong>. <strong>Custom</strong> lets you enter your own, and
          <strong>Surprise me</strong> picks everything at random. Use
          <strong>Instructions (optional)</strong> for anything else, such as the tone or who tells
          the story.
        </p>
      </section>

      <section aria-labelledby="write-plot">
        <h2 id="write-plot">Choose a plot</h2>
        <p>
          When you select <strong>Next</strong>, Monosai drafts three plots. Choose one. To change
          its text, select <strong>Edit</strong>. <strong>Regenerate</strong> drafts new plots and
          keeps the one you edited.
        </p>
        <p>
          Drafting the plots is one request to OpenRouter. Each <strong>Regenerate</strong>, and
          each change of direction, is another.
        </p>
        <p>
          Under <strong>Prepare after generation</strong>, choose what to add once the story is
          written: <strong>English translation</strong>, <strong>Grammar notes</strong> or
          <strong>Audio</strong>. Translation and notes are on unless you turn them off, and each
          one costs extra. <strong>Audio</strong> is available once a voice is set up and its sample
          has played, as <a routerLink="/help/voice">Set up audio</a> describes.
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
          With the recommended text models, a story with its translation and notes costs from a
          fraction of a cent to a few cents. Each of these is a separate request:
        </p>
        <ul>
          <li>Drafting plots, each time they're drafted.</li>
          <li>Writing the story. Long stories are written in several parts.</li>
          <li>Each rewrite that <strong>Vocabulary strictness</strong> allows.</li>
          <li>Checking unknown words against your exceptions, when you've entered any.</li>
          <li>The translation, notes and audio you chose.</li>
        </ul>
        <p>
          Audio costs from well under a cent to about 20 cents per story, depending on the speech
          model. <a routerLink="/help/text-models">Choose a text model</a> and
          <a routerLink="/help/voice">Set up audio</a> have the prices.
        </p>
      </section>

      <section aria-labelledby="write-unknown">
        <h2 id="write-unknown">If a story uses words you don't know</h2>
        <p>
          Unless strictness is <strong>Relaxed</strong>, Monosai replaces the unknown words it can
          and underlines the rest in orange. A few are normal. Many usually mean that the model is
          too small, or that your reading level needs more words than you know. Try a larger model
          or a stricter setting, or add words.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class WritePageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
