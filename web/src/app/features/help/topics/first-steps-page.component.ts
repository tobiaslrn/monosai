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
        Four steps from an empty library to a story written out of your own vocabulary. Nothing here
        takes long, and you can stop after step one if all you want is a dictionary.
      </p>

      <section aria-labelledby="first-steps-need">
        <h2 id="first-steps-need">What you need</h2>
        <p>
          To read Japanese you already have, you need nothing at all. Paste it into
          <a routerLink="/add">Add text</a> and Monosai gives you readings above the kanji, spacing
          between words, and word lookup. No account, no key, no setup.
        </p>
        <p>
          To have Monosai write stories for you, you need two more things: a record of the words you
          have studied, usually an Anki collection, and an
          <a href="https://openrouter.ai/" target="_blank" rel="noopener noreferrer"
            >OpenRouter account</a
          >
          with a few dollars of credit on it. Monosai has no AI of its own and no shared key. You
          pay the provider directly for what you use, and a story costs a fraction of a cent on a
          sensible model.
        </p>
      </section>

      <section aria-labelledby="first-steps-words">
        <h2 id="first-steps-words">1. Tell Monosai which words you know</h2>
        <p>
          Open <a routerLink="/reading-level" fragment="words">What you can read</a> and add a word
          source. If you study with Anki, point Monosai at your collection and it takes the words on
          cards you have actually reviewed. If you do not use Anki, paste a list of words instead.
        </p>
        <p>
          Monosai only ever reads from Anki. It does not change a card, a tag, or your review
          history. <a routerLink="/help/your-words">Your words</a> explains each way of connecting,
          including the Android bridge.
        </p>
      </section>

      <section aria-labelledby="first-steps-level">
        <h2 id="first-steps-level">2. Set your grammar level</h2>
        <p>
          Knowing your words is not enough on its own, because a sentence also has grammar in it. On
          the same page, choose a
          <a routerLink="/reading-level" fragment="grammar">grammar level</a> and read the example
          under each one. Pick the highest level whose example you can follow without effort.
        </p>
        <p>
          The basic patterns that hold a Japanese sentence together stay available at every level.
          The level guides how hard the grammar gets, it does not forbid the building blocks.
        </p>
      </section>

      <section aria-labelledby="first-steps-model">
        <h2 id="first-steps-model">3. Connect OpenRouter and choose a model</h2>
        <p>
          In <a routerLink="/settings">Settings</a>, under AI, paste your OpenRouter key and save
          it. The key is kept in this browser on this device and is never shown again after saving.
        </p>
        <p>
          Then choose a text model and press Test now. The test spends a few tokens proving that the
          model can answer in the exact shape Monosai needs, and it saves nothing to your library.
          If you have no idea which model to pick,
          <a routerLink="/help/text-models">Choosing a text model</a> names the ones that work well
          today and explains what goes wrong with the rest.
        </p>
      </section>

      <section aria-labelledby="first-steps-story">
        <h2 id="first-steps-story">4. Generate a story</h2>
        <p>
          Open <a routerLink="/generate">Generate</a>, write a premise in a sentence or two, and
          start it. A premise like "two friends miss the last train home" gives a model something to
          work with. Leaving it empty is allowed, and the model picks a topic itself.
        </p>
        <p>
          Stories are written from {{ minimumWords }} words upwards. With a small vocabulary expect
          short, plain stories, because there is little else the model can do. The more reviewed
          words Monosai has, the more room it has to write something worth reading.
        </p>
        <p>
          Translation, grammar notes, and audio are optional extras you can ask for while generating
          or add later from Story options in the reader. They cost extra requests, so leave them off
          until you want them.
        </p>
      </section>

      <section aria-labelledby="first-steps-next">
        <h2 id="first-steps-next">Then what</h2>
        <p>
          Read the story. Tap a word you are unsure of. Come back and generate another one when you
          have reviewed more cards, and refresh your words so Monosai sees them.
        </p>
        <p>
          Keep an eye on your OpenRouter balance for the first few days until you know what your own
          settings cost. After that it stops being interesting.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class FirstStepsPageComponent {
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
