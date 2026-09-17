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
      <p class="mn-prose__lead">
        The questions that come up most often, and what to do when a screen shows a code instead of
        a story.
      </p>

      <section aria-labelledby="q-cost">
        <h2 id="q-cost">Does Monosai cost anything?</h2>
        <p>
          Monosai is free. Reading, importing text, the dictionary, and your word lists need no key
          and cost nothing. Generating stories, translations, grammar notes, and audio go through
          your own OpenRouter account, which you pay directly, and the model you pick decides the
          bill. <a routerLink="/help/text-models">Choosing a text model</a> has the figures and
          explains how to watch what you spend.
        </p>
      </section>

      <section aria-labelledby="q-wait">
        <h2 id="q-wait">Do I have to wait while a story is written?</h2>
        <p>
          No. Generation keeps running when you leave the screen, and the library shows the story
          being written. Most models take under a minute; a model with reasoning turned up can take
          several.
        </p>
      </section>

      <section aria-labelledby="q-private">
        <h2 id="q-private">Is my data private?</h2>
        <p>
          Your stories, words, and settings never leave this device, and Monosai collects no
          analytics. Requests to OpenRouter carry only what they need.
          <a routerLink="/help/install">Installing and offline</a> has the detail.
        </p>
      </section>

      <section aria-labelledby="q-anki">
        <h2 id="q-anki">Do I have to use Anki?</h2>
        <p>
          No, but it is the easiest path, because Anki knows which cards you have reviewed. Without
          it, paste a list of the words you know. See
          <a routerLink="/help/your-words">Your words</a>.
        </p>
      </section>

      <section aria-labelledby="q-safe">
        <h2 id="q-safe">Can Monosai damage my Anki collection?</h2>
        <p>
          No. It reads and never writes. Your cards, tags, decks, and review history are untouched.
        </p>
      </section>

      <section aria-labelledby="q-provider">
        <h2 id="q-provider">Can I use a local model, or another provider's key?</h2>
        <p>
          Not today. OpenRouter is the only supported service.
          <a routerLink="/help/text-models">Choosing a text model</a> explains why. Local models are
          not being worked on, though they may come later.
        </p>
      </section>

      <section aria-labelledby="q-local-tts">
        <h2 id="q-local-tts">Why is speech not generated on my device?</h2>
        <p>
          A small speech model could run in the browser for nothing, and it was considered and
          dropped. The cheap hosted model already costs well under a cent per story, and shipping a
          model into the app to save that is a lot of complexity for a saving nobody would notice.
        </p>
        <p>See <a routerLink="/help/voice">Voice and audio</a>.</p>
      </section>

      <section aria-labelledby="q-reading">
        <h2 id="q-reading">Why does the audio say a word oddly?</h2>
        <p>
          Cheap speech models look each word up in a fixed dictionary instead of reading the
          sentence, so some kanji come out with the wrong reading every time. Tap the word in the
          reader for the right one. <a routerLink="/help/voice">Voice and audio</a> has the detail.
        </p>
      </section>

      <section aria-labelledby="q-unknown">
        <h2 id="q-unknown">Why does a story contain words I do not know?</h2>
        <p>
          Sometimes the model cannot say what it set out to say inside your vocabulary. Monosai
          tries to repair those places, and where it cannot it keeps the story and underlines the
          word instead of hiding it. A handful of marked words is normal; a page full of them
          usually means the model is too small or your word list is too short.
        </p>
        <p>Two controls on the Generate screen change this:</p>
        <ul>
          <li>
            <strong>Vocabulary strictness</strong> decides how hard Monosai tries. Relaxed keeps the
            first draft, Standard tries once to replace unfamiliar words, Strict tries twice.
          </li>
          <li>
            <strong>Vocabulary exceptions</strong> lets you name words the story may use anyway,
            which is what names are for.
          </li>
        </ul>
      </section>

      <section aria-labelledby="q-short">
        <h2 id="q-short">Why is my story so short and plain?</h2>
        <p>
          Usually because there is not much to build with. Below a few hundred known words there are
          too few verbs to move a plot along, and the model has no choice but to repeat itself.
          Review more, refresh your words, and ask for a concrete premise with something happening
          in it.
        </p>
        <p>
          Length is a slider on the Generate screen, and it is a guideline rather than a promise.
          Very short stories tend to be the rough ones, and very long ones drift outside your
          vocabulary and grammar settings.
        </p>
      </section>

      <section aria-labelledby="q-minimum">
        <h2 id="q-minimum">How many words do I need?</h2>
        <p>
          Generation needs {{ minimumWords }}. It becomes enjoyable somewhere in the hundreds.
          Reading text you paste yourself needs no words at all.
        </p>
      </section>

      <section aria-labelledby="q-edit">
        <h2 id="q-edit">Can I edit a story after saving it?</h2>
        <p>
          You can rename it and delete it, but not rewrite the text. A saved story keeps its
          analysis and its aids together, and editing the text underneath them would invalidate
          both. Generate another one instead.
        </p>
      </section>

      <section aria-labelledby="q-language">
        <h2 id="q-language">Can I use it for another language?</h2>
        <p>
          No. Furigana, the tokenizer, the dictionary, and the grammar levels are all Japanese, and
          the application is built around them.
        </p>
      </section>

      <section aria-labelledby="q-failed">
        <h2 id="q-failed">What does an error code mean?</h2>
        <p>The code names the cause. A few come up often enough to learn:</p>
        <ul>
          <li>
            <code>ai/credit-exhausted</code>: the OpenRouter account is out of credit. Top it up.
            Saving the key again will not help, which is why this is its own code.
          </li>
          <li>
            <code>ai/authentication</code>: the key was rejected. Check it at openrouter.ai and save
            it again.
          </li>
          <li>
            <code>ai/rate-limited</code>: too many requests in a short time, which the cheaper
            models hit sooner. Wait and try again.
          </li>
          <li>
            <code>ai/malformed-response</code> or <code>ai/capability-unsupported</code>: the model
            cannot answer in the structure Monosai needs. Try once more, then choose another model.
          </li>
          <li><code>anki/not-running</code>: Anki is not open on this computer. Open it.</li>
          <li>
            <code>anki/origin-not-allowed</code>: AnkiConnect has not been told to answer this page.
            <a routerLink="/help/your-words">Your words</a> has the config line.
          </li>
          <li><code>ai/offline</code>: no connection. Reading and your library still work.</li>
          <li>
            <code>language/assets-unavailable</code>: the Japanese data could not be downloaded, so
            analysis cannot run. Check your connection and retry.
          </li>
        </ul>
        <p>
          Nothing you already have is lost when one of these appears. A model test and a failed
          generation write nothing at all. Translation, notes, and audio fill a story in order, so a
          failure part way through leaves the sentences it finished and you can ask for the rest
          again.
        </p>
        <p>
          The
          <a
            href="https://github.com/tobiaslrn/monosai/blob/main/docs/troubleshooting.md"
            target="_blank"
            rel="noopener noreferrer"
            >full list of codes</a
          >
          is in the repository, with the cause and the fix for each one.
        </p>
      </section>

      <section aria-labelledby="q-report">
        <h2 id="q-report">How do I report a bug?</h2>
        <p>
          Open an issue on
          <a
            href="https://github.com/tobiaslrn/monosai/issues"
            target="_blank"
            rel="noopener noreferrer"
            >GitHub</a
          >. Attach the output of Copy diagnostics, under About in Settings: it records what failed
          and when, and contains no key, no prompt, and none of your text.
        </p>
      </section>

      <section aria-labelledby="q-outgrow">
        <h2 id="q-outgrow">When should I stop using Monosai?</h2>
        <p>
          When you can read something written for people. Graded readers, then manga, then whatever
          you wanted to read in the first place. Generated stories are practice material for the
          stage where real Japanese is still a solid wall.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class QuestionsPageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
