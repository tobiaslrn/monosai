import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatCount } from '../../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../../domain/vocabulary/snapshot';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-first-steps',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="first-steps">
      <p mn-lead>Four steps to your first story.</p>

      <section aria-labelledby="first-steps-need">
        <h2 id="first-steps-need">Before you start</h2>
        <p>
          Reading Japanese you already have needs nothing: paste it into
          <a routerLink="/add">Add text</a>. To have Monosai write stories you need your words
          (usually an Anki collection) and an
          <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer"
            >OpenRouter account</a
          >
          with a few dollars of credit. You pay OpenRouter directly.
        </p>
      </section>

      <section aria-labelledby="first-steps-words">
        <h2 id="first-steps-words">1. Add your words</h2>
        <p>
          Open <a routerLink="/reading-level" fragment="words">What you can read</a> and add a word
          source: Anki, an Anki package, or a pasted list.
          <a routerLink="/help/your-words">Your words</a> covers each way.
        </p>
      </section>

      <section aria-labelledby="first-steps-level">
        <h2 id="first-steps-level">2. Set your grammar level</h2>
        <p>
          Open the <a routerLink="/reading-level" fragment="grammar">Reading level</a> row and pick
          the highest level you can follow without effort. Nothing changes until you press Save
          level.
        </p>
      </section>

      <section aria-labelledby="first-steps-model">
        <h2 id="first-steps-model">3. Connect OpenRouter</h2>
        <ol>
          <li>
            In <a routerLink="/settings">Settings</a>, open the OpenRouter key row, paste your key,
            press Connect.
          </li>
          <li>
            Open the model picker under Text and choose a model. Choosing tests it.
            <a routerLink="/help/text-models">Choosing a text model</a> names what works.
          </li>
        </ol>
      </section>

      <section aria-labelledby="first-steps-story">
        <h2 id="first-steps-story">4. Generate a story</h2>
        <p>
          Open <a routerLink="/generate">Generate</a>: pick your words, a direction and a plot, then
          start. Translation, grammar notes and audio are optional; each is an extra request.
        </p>
        <p>Stories need {{ minimumWords }} words.</p>
      </section>
    </mn-help-article>
  `,
})
export class FirstStepsPageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
