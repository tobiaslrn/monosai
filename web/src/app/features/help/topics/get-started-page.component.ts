import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCount } from '../../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../../domain/vocabulary/snapshot';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-get-started',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="get-started">
      <p mn-lead>
        You can read Japanese you already have straight away. To have Monosai write stories for you,
        set up three things once: your words, an OpenRouter account and a text model.
      </p>

      <section aria-labelledby="start-read">
        <h2 id="start-read">Read Japanese right away</h2>
        <p>
          In the Library, select <strong>Paste Japanese text</strong> on the
          <strong>Get started</strong> card, or <strong>Paste</strong> next to
          <strong>Write with AI</strong>. Paste any Japanese, then select
          <strong>Add story</strong>. You don't need an account or a key for this.
        </p>
      </section>

      <section aria-labelledby="start-need">
        <h2 id="start-need">What you need to write stories</h2>
        <ul>
          <li>At least {{ minimumWords }} known words, from Anki or from a list you enter.</li>
          <li>
            An account at
            <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer">OpenRouter</a
            >, a service that gives access to many AI models, with a few dollars of credit.
          </li>
          <li>A text model, chosen in Settings.</li>
        </ul>
        <p>
          Monosai itself is free. You pay OpenRouter directly for what the AI does, as
          <a routerLink="/help/write" fragment="write-cost">Write a story</a> explains. In the
          Library, the <strong>Get started</strong> card shows which steps you've done and takes you
          to the next one.
        </p>
      </section>

      <section aria-labelledby="start-words">
        <h2 id="start-words">Add your words</h2>
        <p>
          Open <a routerLink="/reading-level" fragment="words">What you can read</a> and select
          <strong>Add source</strong>. Choose <strong>Connect to Anki</strong>,
          <strong>Import from Anki</strong> or <strong>Add a word list</strong>.
          <a routerLink="/help/your-words">Add your words</a> explains each one, including what
          works on iPhone and Android.
        </p>
      </section>

      <section aria-labelledby="start-account">
        <h2 id="start-account">Create an OpenRouter account</h2>
        <ol>
          <li>Create an account at <code>openrouter.ai</code>.</li>
          <li>Add credit. A few dollars is enough for many stories.</li>
          <li>
            Open
            <a href="https://openrouter.ai/settings/keys" target="_blank" rel="noopener noreferrer"
              >OpenRouter's key settings</a
            >
            and create a key.
          </li>
          <li>Copy the key.</li>
        </ol>
        <p>
          You can give the key a credit limit on <code>openrouter.ai</code>, so it never spends more
          than you choose.
        </p>
      </section>

      <section aria-labelledby="start-key">
        <h2 id="start-key">Connect your key</h2>
        <ol>
          <li>Open <a routerLink="/settings">Settings</a>.</li>
          <li>Select <strong>OpenRouter key</strong>.</li>
          <li>Paste the key into <strong>API key</strong>.</li>
          <li>Select <strong>Connect</strong>.</li>
        </ol>
        <p>
          Monosai checks the key the first time it tests a model. Your key stays in this browser and
          is sent only to OpenRouter.
        </p>
      </section>

      <section aria-labelledby="start-model">
        <h2 id="start-model">Choose a text model</h2>
        <p>
          <a routerLink="/help/text-models">Choose a text model</a> recommends models and explains
          what they cost.
        </p>
        <ol>
          <li>Open <a routerLink="/settings/text-models">Settings > Text models</a>.</li>
          <li>Under <strong>Text model</strong>, select <strong>Model</strong>.</li>
          <li>Search for a model by name, and choose it.</li>
        </ol>
        <p>
          Monosai tests the model, and the status starts with <strong>Ready</strong> when it works.
        </p>
      </section>

      <section aria-labelledby="start-story">
        <h2 id="start-story">Write your first story</h2>
        <p>
          In the Library, select <strong>Write with AI</strong>. Choose your words, a direction and
          a plot, then select <strong>Generate story</strong>. Most models take under a minute.
          <a routerLink="/help/write">Write a story</a> explains each choice, and
          <a routerLink="/help/reading-level">Set your reading level</a> explains how to choose the
          grammar your stories use.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class GetStartedPageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
