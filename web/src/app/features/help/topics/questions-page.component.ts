import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCount } from '../../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../../domain/vocabulary/snapshot';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-questions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="questions">
      <p mn-lead>
        Here are short answers to the questions learners ask most, each with a link to the full
        explanation.
      </p>

      <section aria-labelledby="q-who">
        <h2 id="q-who">Who is Monosai for?</h2>
        <p>
          Monosai is for your first months of reading, while most real Japanese is still full of
          words you don't know. Once you can read a page written for native speakers with a
          dictionary, move on to books, manga and articles.
        </p>
      </section>

      <section aria-labelledby="q-cost">
        <h2 id="q-cost">Does Monosai cost anything?</h2>
        <p>
          No. Monosai is free, but its AI features use your own OpenRouter credit. With the
          recommended models, a story with its translation and notes costs from a fraction of a cent
          to a few cents, and its audio from well under a cent to about 20 cents.
          <a routerLink="/help/write" fragment="write-cost">Write a story</a> lists what each
          request is for.
        </p>
      </section>

      <section aria-labelledby="q-without-ai">
        <h2 id="q-without-ai">Can I use Monosai without AI?</h2>
        <p>
          Yes. You can paste any Japanese text and read it with furigana and a dictionary, free and
          without a key. Only writing stories, translations, grammar notes and audio need
          OpenRouter.
        </p>
      </section>

      <section aria-labelledby="q-anki">
        <h2 id="q-anki">Do I have to use Anki?</h2>
        <p>
          No. With Anki, your words stay up to date as you review, but you can enter a list of words
          instead. <a routerLink="/help/your-words">Add your words</a> explains both.
        </p>
      </section>

      <section aria-labelledby="q-iphone">
        <h2 id="q-iphone">Does Monosai work on iPhone and iPad?</h2>
        <p>
          Monosai runs in Safari on iPhone and iPad, but it isn't tested there. To add your words,
          export an Anki package from AnkiMobile and import it, or use a word list. Monosai Bridge
          is for Android only.
        </p>
      </section>

      <section aria-labelledby="q-safe">
        <h2 id="q-safe">Can Monosai change my Anki collection?</h2>
        <p>No. Monosai only reads from Anki, and so does Monosai Bridge.</p>
      </section>

      <section aria-labelledby="q-private">
        <h2 id="q-private">Is my data private?</h2>
        <p>
          Yes. Your stories, words and settings stay in this browser, and Monosai collects no
          analytics. AI requests go to OpenRouter and contain only what each task needs.
          <a routerLink="/help/privacy">Privacy and your data</a> lists exactly what is sent.
        </p>
      </section>

      <section aria-labelledby="q-devices">
        <h2 id="q-devices">Can I use my stories on another device?</h2>
        <p>
          No. There's no account or sync, so each browser keeps its own stories and settings. You
          can add your Anki words on each device.
        </p>
      </section>

      <section aria-labelledby="q-minimum">
        <h2 id="q-minimum">How many words do I need?</h2>
        <p>
          You need at least {{ minimumWords }} known words to write a story, and more for harder
          levels, as <a routerLink="/help/reading-level">Set your reading level</a> shows. Pasted
          text needs none.
        </p>
      </section>

      <section aria-labelledby="q-short">
        <h2 id="q-short">Why are my stories short and plain?</h2>
        <p>
          Stories are short and plain while you know few words. With fewer than a few hundred,
          there's little to build a story from. Keep reviewing in Anki, and your stories grow with
          you.
        </p>
      </section>

      <section aria-labelledby="q-unknown">
        <h2 id="q-unknown">Why does a story contain words I don't know?</h2>
        <p>
          Monosai replaces the unknown words it can and underlines the rest. A few are normal.
          <a routerLink="/help/write" fragment="write-unknown">Write a story</a> explains what helps
          when there are many.
        </p>
      </section>

      <section aria-labelledby="q-wait">
        <h2 id="q-wait">Do I have to wait while a story is written?</h2>
        <p>
          No. You can read or browse elsewhere in Monosai, and the story appears in your library
          when it's ready. Keep the tab open, though: closing or reloading it stops the story.
        </p>
      </section>

      <section aria-labelledby="q-edit">
        <h2 id="q-edit">Can I edit a story after it's saved?</h2>
        <p>No. You can rename or delete a story, but you can't change its text.</p>
      </section>

      <section aria-labelledby="q-audio">
        <h2 id="q-audio">Why does the audio say a word oddly?</h2>
        <p>
          Cheaper speech models read each word on its own and sometimes pick the wrong reading.
          Select the word to check it. <a routerLink="/help/voice">Set up audio</a> explains the
          difference between models.
        </p>
      </section>

      <section aria-labelledby="q-provider">
        <h2 id="q-provider">Can I use a local model or another provider?</h2>
        <p>
          No. Monosai works only with OpenRouter, which reaches almost every model with one key.
        </p>
      </section>

      <section aria-labelledby="q-language">
        <h2 id="q-language">Can I use Monosai for another language?</h2>
        <p>No. Everything in Monosai is built for Japanese.</p>
      </section>

      <section aria-labelledby="q-report">
        <h2 id="q-report">How do I report a bug?</h2>
        <p>
          Open a GitHub issue with the diagnostics from Settings, as
          <a routerLink="/help/troubleshooting" fragment="trouble-report">Fix a problem</a>
          describes. The diagnostics never contain your key or your text.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class QuestionsPageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
