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
      <p class="mn-prose__lead">
        Four steps from an empty library to a story written out of your own vocabulary.
      </p>

      <section aria-labelledby="first-steps-need">
        <h2 id="first-steps-need">Before you start</h2>
        <p>
          To read Japanese text you already have, you need nothing. Paste it into
          <a routerLink="/add">Add text</a> and you get readings, spacing, and word lookup. No
          account, no key, no setup. Skip the rest of this page.
        </p>
        <p>To have Monosai write stories, you need two more things:</p>
        <ul>
          <li>A record of the words you have studied, usually an Anki collection.</li>
          <li>
            An
            <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer"
              >OpenRouter account</a
            >
            with a few dollars of credit. Monosai has no AI of its own and no shared key, so you pay
            the provider directly for what you use.
          </li>
        </ul>
      </section>

      <section aria-labelledby="first-steps-words">
        <h2 id="first-steps-words">1. Add your words</h2>
        <p>
          Open <a routerLink="/reading-level" fragment="words">What you can read</a> and add a word
          source. Point Monosai at your Anki collection and it takes the words on cards you have
          reviewed. Without Anki, paste a list instead.
        </p>
        <p>
          <a routerLink="/help/your-words">Your words</a> explains each way of connecting, including
          the Android bridge.
        </p>
      </section>

      <section aria-labelledby="first-steps-level">
        <h2 id="first-steps-level">2. Set your grammar level</h2>
        <p>
          A sentence has grammar in it as well as words. On the same page, the
          <a routerLink="/reading-level" fragment="grammar">Reading level</a> row opens the ladder.
          Tap through the levels, read the example each one shows, and pick the highest you can
          follow without effort. Nothing changes until you press Save level.
        </p>
        <p>
          Basic sentence patterns stay available at every level; the level only decides how hard the
          grammar gets.
        </p>
      </section>

      <section aria-labelledby="first-steps-model">
        <h2 id="first-steps-model">3. Connect OpenRouter and pick a model</h2>
        <ol>
          <li>
            In <a routerLink="/settings">Settings</a>, under AI, open the OpenRouter key row, paste
            your key, and press Connect. The key stays in this browser and is never shown again.
          </li>
          <li>
            The rest of the section appears once a key exists. Open the model picker under Text and
            search OpenRouter's catalogue.
          </li>
          <li>
            Choosing a model tests it immediately. The test spends a few tokens proving the model
            can answer in the shape Monosai needs, and saves nothing to your library.
          </li>
        </ol>
        <p>
          Model choice decides quality and cost.
          <a routerLink="/help/text-models">Choosing a text model</a> names what works today.
        </p>
      </section>

      <section aria-labelledby="first-steps-story">
        <h2 id="first-steps-story">4. Generate a story</h2>
        <p>
          Open <a routerLink="/generate">Generate</a>, write a premise in a sentence or two, and
          start it. Something like "two friends miss the last train home" gives the model enough to
          work with. You can leave it empty and let the model pick a topic.
        </p>
        <p>
          Stories need {{ minimumWords }} words. With a small vocabulary, expect short and plain
          ones, because there is little else the model can do with them.
        </p>
        <p>
          Translation, grammar notes, and audio are optional. Ask for them while generating, or add
          them later from Story options in the reader. Each one is an extra request, so leave them
          off until you want them.
        </p>
      </section>

      <section aria-labelledby="first-steps-next">
        <h2 id="first-steps-next">Then what</h2>
        <p>
          Read the story and tap any word you are unsure of. When you have reviewed more cards,
          refresh your words and generate another one.
        </p>
        <p>
          Check your OpenRouter balance for the first few days, until you know what your own
          settings cost per story.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class FirstStepsPageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
