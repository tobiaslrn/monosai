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
          Monosai itself is free, and reading, importing text, the dictionary, and your word lists
          cost nothing and need no key. Generating stories, translations, grammar notes, and audio
          go through your own OpenRouter account, which you pay directly. On a sensible model a
          story is a fraction of a cent; see
          <a routerLink="/help/text-models">Choosing a text model</a>.
        </p>
      </section>

      <section aria-labelledby="q-anki">
        <h2 id="q-anki">Do I have to use Anki?</h2>
        <p>
          No, but it is the easiest path. Anki knows which cards you have actually reviewed, which
          is what Monosai wants. Without it, paste a list of the words you know. Other flashcard
          applications are not supported and are not planned.
        </p>
      </section>

      <section aria-labelledby="q-provider">
        <h2 id="q-provider">Can I use a local model, or a key from another provider?</h2>
        <p>
          Not today. OpenRouter is the only supported service, because one key reaching every model
          is what makes trying models and switching between them practical. Local models may come
          later and are not being worked on.
        </p>
      </section>

      <section aria-labelledby="q-safe">
        <h2 id="q-safe">Can Monosai damage my Anki collection?</h2>
        <p>
          No. It reads and never writes, and the code that talks to Anki has no write operation in
          it at all. Your cards, tags, decks, and review history are untouched.
        </p>
      </section>

      <section aria-labelledby="q-unknown">
        <h2 id="q-unknown">Why does a generated story contain words I do not know?</h2>
        <p>
          Sometimes the model cannot say what it set out to say inside your vocabulary. Monosai
          tries to repair those places, and where it cannot, it keeps the story and underlines the
          word rather than pretending the story is clean. A handful of marked words is normal, and a
          page full of them usually means the model is too small or your word list is too short.
        </p>
      </section>

      <section aria-labelledby="q-short">
        <h2 id="q-short">Why is my story so short and plain?</h2>
        <p>
          Usually because there is not much to build with. Below a few hundred known words there are
          few verbs to move a plot along, and a model has no choice but to repeat itself. Review
          more, refresh your words, and ask for a concrete premise with something happening in it.
          Length is a guideline rather than a promise, and very short stories tend to be the rough
          ones.
        </p>
      </section>

      <section aria-labelledby="q-minimum">
        <h2 id="q-minimum">How many words do I need?</h2>
        <p>
          Generation needs {{ minimumWords }}. It becomes genuinely enjoyable somewhere in the
          hundreds. Reading text you paste yourself needs no words at all.
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
        <h2 id="q-failed">Something failed and showed a code</h2>
        <p>The code names the cause. A few of them come up often enough to learn:</p>
        <ul>
          <li>
            <code>ai/authentication</code>: the key was rejected, or the account is out of credit.
            Check both at openrouter.ai and save the key again.
          </li>
          <li>
            <code>ai/model-not-found</code>: the model ID is not exactly right. IDs are
            case-sensitive and look like <code>vendor/model-name</code>.
          </li>
          <li>
            <code>ai/malformed-response</code> or <code>ai/capability-unsupported</code>: the model
            cannot answer in the structure Monosai needs. Try again once, then choose another model.
          </li>
          <li>
            <code>anki/origin-not-allowed</code>: AnkiConnect has not been told to answer this page.
            <a routerLink="/help/your-words">Your words</a> has the config line to add.
          </li>
          <li><code>ai/offline</code>: no connection. Reading and your library still work.</li>
        </ul>
        <p>
          Nothing saved is lost when one of these appears. A failed request writes nothing, so your
          library, your words, and your settings are exactly as they were.
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
          >. Settings has a Copy diagnostics button under About whose output is worth attaching: it
          records what failed and when, and contains no key, no prompt, and none of your text.
        </p>
      </section>

      <section aria-labelledby="q-outgrow">
        <h2 id="q-outgrow">When should I stop using Monosai?</h2>
        <p>
          When you can read something written for people. Generated stories are practice material
          for the stage where real Japanese is still solid wall, and they are not an end in
          themselves. Graded readers, then manga, then whatever you actually wanted to read: that is
          the direction, and Monosai is meant to get you to the first step faster.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class QuestionsPageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
