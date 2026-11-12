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
      <section aria-labelledby="q-cost">
        <h2 id="q-cost">Does Monosai cost anything?</h2>
        <p>
          Monosai is free. Stories, translations, notes and audio use your own OpenRouter account.
          Check your balance after your first few stories.
          <a routerLink="/help/text-models">Choosing a text model</a> has figures.
        </p>
      </section>

      <section aria-labelledby="q-wait">
        <h2 id="q-wait">Do I have to wait while a story is written?</h2>
        <p>No. Generation keeps running when you leave. Most models take under a minute.</p>
      </section>

      <section aria-labelledby="q-private">
        <h2 id="q-private">Is my data private?</h2>
        <p>
          Stories, words and settings stay on this device. Requests to OpenRouter carry only what
          they need. No analytics. <a routerLink="/help/install">Installing and offline</a> has the
          detail.
        </p>
      </section>

      <section aria-labelledby="q-anki">
        <h2 id="q-anki">Do I have to use Anki?</h2>
        <p>
          No, but it is easiest. Otherwise paste a list.
          <a routerLink="/help/your-words">Your words</a> has the options.
        </p>
      </section>

      <section aria-labelledby="q-safe">
        <h2 id="q-safe">Can Monosai damage my Anki collection?</h2>
        <p>No. Monosai only reads.</p>
      </section>

      <section aria-labelledby="q-provider">
        <h2 id="q-provider">Can I use a local model, or another provider's key?</h2>
        <p>Not today. OpenRouter only.</p>
      </section>

      <section aria-labelledby="q-reading">
        <h2 id="q-reading">Why does the audio say a word oddly?</h2>
        <p>
          Cheap speech models read each word alone, so some kanji are wrong. Tap the word for the
          right reading. <a routerLink="/help/voice">Voice and audio</a> has the detail.
        </p>
      </section>

      <section aria-labelledby="q-unknown">
        <h2 id="q-unknown">Why does a story contain words I do not know?</h2>
        <p>
          Monosai repairs what it can and underlines the rest. A few is normal; many means the model
          is too small or your list too short. Vocabulary strictness and Vocabulary exceptions on
          Generate help.
        </p>
      </section>

      <section aria-labelledby="q-short">
        <h2 id="q-short">Why is my story so short and plain?</h2>
        <p>
          Usually too few known words. Below a few hundred there is little to build on. Review more
          and refresh.
        </p>
      </section>

      <section aria-labelledby="q-minimum">
        <h2 id="q-minimum">How many words do I need?</h2>
        <p>Generation needs {{ minimumWords }}. Pasted text needs none.</p>
      </section>

      <section aria-labelledby="q-edit">
        <h2 id="q-edit">Can I edit a story after saving it?</h2>
        <p>You can rename or delete a story, not edit its text.</p>
      </section>

      <section aria-labelledby="q-language">
        <h2 id="q-language">Can I use it for another language?</h2>
        <p>No. Everything is built for Japanese.</p>
      </section>

      <section aria-labelledby="q-failed">
        <h2 id="q-failed">What does an error code mean?</h2>
        <ul>
          <li>
            <code>ai/credit-exhausted</code>: the OpenRouter account is out of credit. Top it up.
          </li>
          <li>
            <code>ai/authentication</code>: the key was rejected. Check it at openrouter.ai and save
            it again.
          </li>
          <li><code>ai/rate-limited</code>: too many requests. Wait and try again.</li>
          <li>
            <code>ai/malformed-response</code> or <code>ai/capability-unsupported</code>: the model
            cannot answer in the structure Monosai needs. Choose another model.
          </li>
          <li><code>anki/not-running</code>: Anki is not open on this computer. Open it.</li>
          <li>
            <code>anki/origin-not-allowed</code>: AnkiConnect has not been told to answer this page.
            <a routerLink="/help/your-words">Your words</a> has the config line.
          </li>
          <li><code>ai/offline</code>: no connection. Reading and your library still work.</li>
          <li>
            <code>language/assets-unavailable</code>: the Japanese data could not be downloaded.
            Check your connection and retry.
          </li>
        </ul>
        <p>
          <a routerLink="/help/error-codes">Error codes</a> lists every code, with its cause and
          fix.
        </p>
      </section>

      <section aria-labelledby="q-report">
        <h2 id="q-report">How do I report a bug?</h2>
        <p>
          Open a
          <a
            href="https://github.com/tobiaslrn/monosai/issues"
            target="_blank"
            rel="noopener noreferrer"
            >GitHub issue</a
          >
          with Copy diagnostics from Settings, About. It contains no key, prompt or text.
        </p>
      </section>

      <section aria-labelledby="q-outgrow">
        <h2 id="q-outgrow">When should I stop using Monosai?</h2>
        <p>When you can read things written for people.</p>
      </section>
    </mn-help-article>
  `,
})
export class QuestionsPageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
