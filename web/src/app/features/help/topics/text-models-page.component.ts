import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { FactsComponent } from '../../../shared-ui/facts/facts.component';
import { StackComponent } from '../../../shared-ui/layout/layout';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-text-models',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, CardComponent, FactsComponent, HelpArticleComponent, StackComponent],
  template: `
    <mn-help-article slug="text-models">
      <p mn-lead>
        The text model is the AI that writes your stories, translations and grammar notes, and a
        mid-size model gives you the best Japanese for the money.
      </p>

      <section aria-labelledby="models-choose">
        <h2 id="models-choose">Choose a model</h2>
        <p>
          You need an OpenRouter key first, as
          <a routerLink="/help/get-started">Get started</a> describes.
        </p>
        <ol>
          <li>Open <a routerLink="/settings/text-models">Settings > Text models</a>.</li>
          <li>Under <strong>Text model</strong>, select <strong>Model</strong>.</li>
          <li>Search for the model's name or ID.</li>
          <li>Choose the model.</li>
        </ol>
        <p>
          Monosai tests the model straight away with a short request. When the test passes, the
          status starts with <strong>Ready</strong>.
        </p>
      </section>

      <section aria-labelledby="models-pick">
        <h2 id="models-pick">Recommended models</h2>
        <mn-stack [gap]="4">
          <mn-card heading="GLM 5.3 Flash">
            <p><code>z-ai/glm-5.3-flash</code></p>
            <mn-facts
              [facts]="[
                {
                  label: 'Price',
                  value: '$0.075 per million input tokens, $0.25 per million output tokens',
                },
                { label: 'A story', value: 'A fraction of a cent' },
              ]"
            />
            <p>
              GLM 5.3 Flash is a good everyday choice, at about a tenth of the price of Gemini 3.8
              Flash.
            </p>
          </mn-card>
          <mn-card heading="Gemini 3.8 Flash">
            <p><code>google/gemini-3.8-flash</code></p>
            <mn-facts
              [facts]="[
                {
                  label: 'Price',
                  value: '$0.75 per million input tokens, $3.75 per million output tokens',
                },
                { label: 'A story', value: 'A few cents' },
              ]"
            />
            <p>
              Gemini 3.8 Flash writes the most natural Japanese of the two, and keeps to your known
              words most reliably.
            </p>
          </mn-card>
        </mn-stack>
        <p mn-checked>Prices and names checked on Sep 17, 2026.</p>
      </section>

      <section aria-labelledby="models-small">
        <h2 id="models-small">Small and free models</h2>
        <p>
          Small and free models make mistakes that a beginner can't spot. They often invent words,
          get particles and conjugations wrong, ignore your known words, or answer in a form Monosai
          can't use, which shows as <strong>The reply could not be used</strong>. They make too many
          mistakes to be worth the savings.
        </p>
      </section>

      <section aria-labelledby="models-large">
        <h2 id="models-large">The largest models</h2>
        <p>
          The largest models write excellent Japanese, but they're slower, and every story request
          includes all your known words. With them, one story can cost tens of cents.
        </p>
      </section>

      <section aria-labelledby="models-reasoning">
        <h2 id="models-reasoning">Reasoning and the token limit</h2>
        <p>
          Some models can think through a task before they answer. When you choose a model, Monosai
          sets <strong>Reasoning</strong> to the model's own default, or to
          <strong>Automatic</strong>. If stories take minutes, or you see
          <strong>The reply was cut off</strong>, choose a lower setting. Changing it runs a new
          test.
        </p>
        <p>
          A token is a small piece of text, often a single Japanese character. The
          <strong>Token limit</strong> caps how long a reply can be. The default is enough for a
          story, so raise it only if replies are cut off.
        </p>
      </section>

      <section aria-labelledby="models-tasks">
        <h2 id="models-tasks">Use other models for translation and grammar</h2>
        <p>
          Translations and grammar notes use the text model unless you choose another. To use a
          different one, such as a cheaper model, select <strong>Model</strong> under
          <strong>Translation</strong> or <strong>Grammar</strong> on the same page.
        </p>
      </section>

      <section aria-labelledby="models-cost">
        <h2 id="models-cost">What it costs</h2>
        <p>
          OpenRouter charges your credit for every request, including model tests and retries. The
          model list in Monosai doesn't show prices, so compare them on
          <code>openrouter.ai</code>. After your first few stories, check the activity page there to
          see what you actually spend.
        </p>
      </section>

      <section aria-labelledby="models-openrouter">
        <h2 id="models-openrouter">Why Monosai uses OpenRouter</h2>
        <p>
          One OpenRouter key reaches almost every model, so you can switch models without a new
          account. Monosai doesn't support local models or keys from other providers.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class TextModelsPageComponent {}
