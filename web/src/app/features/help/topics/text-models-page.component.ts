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
        The model you choose decides whether a story is worth reading and what it costs. The useful
        range is narrow: the smallest models make mistakes a beginner cannot catch, and the largest
        are an expensive way to write simple Japanese.
      </p>

      <section aria-labelledby="models-how">
        <h2 id="models-how">What the model has to do</h2>
        <p>
          Generating a story sends the model the plot you picked, your grammar level, and the words
          you know, and asks for the story back in a fixed structure rather than as chat. Monosai
          then checks the result against your vocabulary, spends a repair budget on words that fall
          outside it, and marks anything it could not fix.
        </p>
        <p>
          So there are two jobs: write correct, simple Japanese, and stay inside a word list. The
          second is the harder one, and it is where models differ.
        </p>
      </section>

      <section aria-labelledby="models-small">
        <h2 id="models-small">What small models get wrong</h2>
        <p>
          Below roughly the mid-size tier, quality drops in ways that are bad for a beginner
          specifically, because you are not yet able to notice them:
        </p>
        <ul>
          <li>Words that do not exist, assembled out of plausible kanji.</li>
          <li>Wrong particles, broken conjugation, and sentences nobody would say.</li>
          <li>Ignoring your vocabulary list, so the story comes back full of underlined words.</li>
          <li>
            Failing to answer in the structure Monosai requires, which shows up as
            <code>ai/malformed-response</code> or <code>ai/capability-unsupported</code>. A model
            that chats well can still fail this.
          </li>
        </ul>
        <p>
          A free model is a false economy here. The mid-size models below already cost so little per
          story that saving on top of them buys you nothing.
        </p>
      </section>

      <section aria-labelledby="models-large">
        <h2 id="models-large">Why not a flagship model</h2>
        <p>
          The flagship models write excellent Japanese and are the wrong tool for this. Your whole
          word list goes into every request, so input is never small, and the strongest models can
          turn one story into tens of cents. At a story a day that adds up.
        </p>
        <p>
          They are also slower, and a few hundred words of deliberately simple Japanese does not
          reward the extra capability.
        </p>
      </section>

      <section aria-labelledby="models-reasoning">
        <h2 id="models-reasoning">Reasoning effort</h2>
        <p>
          Where a model supports it, Settings offers a Reasoning setting. Turning it up makes the
          model think before it writes, at the price of time and tokens you also pay for.
        </p>
        <mn-notice tone="warning" icon="warning">
          <p>
            On high effort a story can take minutes, and the reasoning can eat enough of the reply
            budget that the story is cut off. That arrives as
            <code>ai/context-budget-exceeded</code>.
          </p>
        </mn-notice>
        <p>
          Leave it on Automatic or low. Raise it only if a particular model keeps drifting outside
          your words.
        </p>
      </section>

      <section aria-labelledby="models-pick">
        <h2 id="models-pick">What to use today</h2>
        <p>
          Start from one of these two. In <a routerLink="/settings">Settings</a>, open the model
          picker under Text and search for the name. Choosing a model runs the test by itself.
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
            <p>
              Roughly a tenth of the price of the other and close enough in quality to be the
              everyday choice.
            </p>
          </mn-card>
          <mn-card heading="Gemini 3.8 Flash">
            <p><code>google/gemini-3.8-flash</code></p>
            <mn-facts
              [facts]="[
                { label: 'Price', value: '$0.75 per million input tokens, $3.75 per million out' },
                { label: 'A story', value: 'A few cents' },
              ]"
            />
            <p>
              The best Japanese of anything tried here, and reliable at staying inside a word list.
              Pick it when you want the best a story can get.
            </p>
          </mn-card>
        </mn-stack>
        <p>
          Avoid the very small open models, anything under a few billion parameters, and models sold
          on speed alone: those are the ones that invent vocabulary. Skip the flagship reasoning
          models too, which do this job no better and cost many times as much.
        </p>
        <p mn-checked>Prices and names checked on Sep 17, 2026.</p>
      </section>

      <section aria-labelledby="models-style">
        <h2 id="models-style">Models differ in style</h2>
        <p>
          The same plot and the same word list give noticeably different stories from model to
          model: sentence length, how much dialogue appears, how willing a model is to repeat a word
          you know rather than reach for one you do not.
        </p>
        <p>
          Generate the same plot on two or three models when you start, then stay with whichever you
          enjoy reading. Settings keeps several as favourites so you can switch.
        </p>
      </section>

      <section aria-labelledby="models-cost">
        <h2 id="models-cost">What it costs</h2>
        <p>
          You pay OpenRouter directly. It bills your account for every request, including tests and
          retries, and its dashboard shows your remaining credit while its activity page lists each
          request with its cost.
        </p>
        <p>
          Check the activity page after your first few stories, so you know what your own settings
          cost. Buying credit in small amounts is a reasonable safety net: Monosai sends nothing you
          have not asked for, but a badly chosen model is a cost you find out about afterwards.
        </p>
      </section>

      <section aria-labelledby="models-openrouter">
        <h2 id="models-openrouter">Why OpenRouter only</h2>
        <p>
          One account reaches nearly every model worth trying, with a single key and a single bill.
          You can switch model in a dropdown and compare the results.
        </p>
        <p>
          A local model, or another provider's endpoint, is not supported today. Generating Japanese
          locally at a quality worth reading needs hardware most people do not have, and every extra
          endpoint is another set of quirks to test against. It may come later.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class TextModelsPageComponent {}
