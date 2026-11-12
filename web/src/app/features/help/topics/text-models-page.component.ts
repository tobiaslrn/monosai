import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { FactsComponent } from '../../../shared-ui/facts/facts.component';
import { StackComponent } from '../../../shared-ui/layout/layout';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-text-models',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CardComponent,
    FactsComponent,
    HelpArticleComponent,
    NoticeComponent,
    StackComponent,
  ],
  template: `
    <mn-help-article slug="text-models">
      <p mn-lead>
        Pick a mid-size model. The smallest make mistakes beginners cannot catch; flagships cost a
        lot to write simple Japanese.
      </p>

      <section aria-labelledby="models-small">
        <h2 id="models-small">What small models get wrong</h2>
        <ul>
          <li>Invented words</li>
          <li>Wrong particles and conjugation</li>
          <li>Ignoring your word list</li>
          <li>Failing the required structure (<code>ai/malformed-response</code>)</li>
        </ul>
        <p>Free models are a false economy.</p>
      </section>

      <section aria-labelledby="models-large">
        <h2 id="models-large">Why not a flagship model</h2>
        <p>
          Flagships write excellent Japanese, but your whole word list goes in every request, so a
          story can cost tens of cents, and they are slower.
        </p>
      </section>

      <section aria-labelledby="models-reasoning">
        <h2 id="models-reasoning">Reasoning effort</h2>
        <p>
          Leave Reasoning on Automatic or low. High effort can take minutes and cut the story off
          (<code>ai/context-budget-exceeded</code>).
        </p>
      </section>

      <section aria-labelledby="models-pick">
        <h2 id="models-pick">What to use today</h2>
        <p>
          In <a routerLink="/settings/text-models">Settings</a>, open the Model row under Text model
          and search for the name.
        </p>
        <mn-stack [gap]="4">
          <mn-card heading="GLM 5.3 Flash">
            <p><code>z-ai/glm-5.3-flash</code></p>
            <mn-facts
              [facts]="[
                { label: 'Price', value: '$0.075 per million input tokens, $0.25 per million out' },
                { label: 'A story', value: 'A fraction of a cent' },
              ]"
            />
            <p>The everyday choice. About a tenth of the price.</p>
          </mn-card>
          <mn-card heading="Gemini 3.8 Flash">
            <p><code>google/gemini-3.8-flash</code></p>
            <mn-facts
              [facts]="[
                { label: 'Price', value: '$0.75 per million input tokens, $3.75 per million out' },
                { label: 'A story', value: 'A few cents' },
              ]"
            />
            <p>The best Japanese and the most reliable at staying inside your words.</p>
          </mn-card>
        </mn-stack>
        <p mn-checked>Prices and names checked on Sep 17, 2026.</p>
      </section>

      <section aria-labelledby="models-cost">
        <h2 id="models-cost">What it costs</h2>
        <p>
          OpenRouter bills every request, including tests and retries. Check its activity page after
          your first few stories.
        </p>
      </section>

      <section aria-labelledby="models-openrouter">
        <h2 id="models-openrouter">Why OpenRouter only</h2>
        <p>
          OpenRouter reaches nearly every model with one key. Local models and other providers are
          not supported.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class TextModelsPageComponent {}
