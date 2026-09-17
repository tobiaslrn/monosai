import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-text-models',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="text-models">
      <p class="mn-prose__lead">
        The model you choose decides whether a story is worth reading and what it costs you. The
        useful range is narrower than it looks: the smallest models make mistakes a beginner cannot
        catch, and the largest ones are an expensive way to write simple Japanese.
      </p>

      <section aria-labelledby="models-how">
        <h2 id="models-how">What the model is asked to do</h2>
        <p>
          When you generate a story, Monosai sends the model your premise, your grammar level, and
          the words you know, and asks for the story back in a fixed structure, not as ordinary
          chat. Monosai then checks the result against your vocabulary itself, spends a repair
          budget on the words that fall outside it, and marks anything it could not fix instead of
          hiding it.
        </p>
        <p>
          So the model has two jobs, not one: write correct, simple Japanese, and stay inside a list
          of words while doing it. The second is the harder one, and it is where models differ.
        </p>
      </section>

      <section aria-labelledby="models-small">
        <h2 id="models-small">Where small models fail</h2>
        <p>
          Below roughly the mid-size tier, quality drops in ways that are bad for a beginner
          specifically, because you are not yet in a position to notice them:
        </p>
        <ul>
          <li>Words that do not exist, assembled out of plausible kanji.</li>
          <li>Wrong particles, broken conjugation, and sentences that no one would say.</li>
          <li>
            Ignoring your vocabulary list, which is the whole point of the exercise, so the story
            comes back full of underlined words.
          </li>
          <li>
            Failing to answer in the structure Monosai requires at all, which shows up as
            <code>ai/malformed-response</code> or <code>ai/capability-unsupported</code>. A model
            that chats well can still fail this.
          </li>
        </ul>
        <p>
          A free or near-free model is tempting and usually a false economy. The mid-size models
          below already cost so little per story that saving on top of them is not worth the
          Japanese you get.
        </p>
      </section>

      <section aria-labelledby="models-large">
        <h2 id="models-large">Where the largest models are wasted</h2>
        <p>
          The flagship models write excellent Japanese, and they are the wrong tool here. Your whole
          word list goes into every story request, so input is never small, and the strongest models
          can turn a single story into tens of cents. At one story a day that is a subscription you
          did not mean to take out.
        </p>
        <p>
          They are also slower. Writing a few hundred words of deliberately simple Japanese is not a
          task that rewards the extra capability.
        </p>
      </section>

      <section aria-labelledby="models-reasoning">
        <h2 id="models-reasoning">Reasoning effort</h2>
        <p>
          Where a model supports it, Settings offers a Reasoning setting. Turning it up makes the
          model think before it writes, at the price of time and tokens you also pay for. On high
          effort a story can take minutes, and the reasoning can eat so much of the reply budget
          that the story is cut off, which arrives as
          <code>ai/context-budget-exceeded</code>.
        </p>
        <p>
          Leave it on Automatic or low to begin with. Raise it only if a particular model keeps
          producing stories that drift outside your words, and see whether the wait is worth it.
        </p>
      </section>

      <section aria-labelledby="models-pick">
        <h2 id="models-pick">What to use today</h2>
        <p>
          Start from one of these two. In <a routerLink="/settings">Settings</a>, open the model
          picker under Text and search for the name. Choosing a model runs the test by itself, so
          there is nothing else to press.
        </p>
        <div class="mn-prose__options">
          <div class="mn-card">
            <h3>Gemini 3.8 Flash</h3>
            <p class="mn-prose__id"><code>google/gemini-3.8-flash</code></p>
            <dl class="mn-facts">
              <div>
                <dt>Price</dt>
                <dd>$0.75/M in, $3.75/M out</dd>
              </div>
              <div>
                <dt>A story</dt>
                <dd>A few cents</dd>
              </div>
            </dl>
            <p>
              The best Japanese of anything tried here, and reliable at staying inside a word list.
              Pick it when the quality of one story matters more than what a month of them costs.
            </p>
          </div>
          <div class="mn-card">
            <h3>GLM 5.3 Flash</h3>
            <p class="mn-prose__id"><code>z-ai/glm-5.3-flash</code></p>
            <dl class="mn-facts">
              <div>
                <dt>Price</dt>
                <dd>$0.075/M in, $0.25/M out</dd>
              </div>
              <div>
                <dt>A story</dt>
                <dd>A fraction of a cent</dd>
              </div>
            </dl>
            <p>
              Roughly a tenth of the price and close enough in quality to be the everyday choice.
              Start here unless you have a reason not to.
            </p>
          </div>
        </div>
        <p>
          Avoid the very small open models, anything under a few billion parameters, and models sold
          on speed alone. They are the ones that invent vocabulary. Skip the flagship reasoning
          models too: they do this job no better and cost many times as much.
        </p>
        <p class="mn-prose__checked">Prices and names checked on Sep 17, 2026.</p>
      </section>

      <section aria-labelledby="models-style">
        <h2 id="models-style">Every model writes differently</h2>
        <p>
          The same premise and the same word list give noticeably different stories from model to
          model. Sentence length, how much dialogue appears, how willing a model is to repeat a word
          you know rather than reach for one you do not: all of it varies, and none of it shows up
          in a benchmark.
        </p>
        <p>
          Generate the same premise on two or three models when you start, then stay with whichever
          you enjoy reading. You can keep several as favourites in Settings and switch between them.
        </p>
      </section>

      <section aria-labelledby="models-cost">
        <h2 id="models-cost">Watching what it costs</h2>
        <p>
          OpenRouter bills your account for every request, including tests and retries. Its
          dashboard shows your remaining credit, and its activity page lists each request with what
          it cost. That is the only way to find out what your own settings cost per story. Look at
          it after your first few.
        </p>
        <p>
          Buying credit in small amounts is a reasonable safety net. Monosai sends nothing that you
          have not asked for, but a model you chose badly is a cost you find out about afterwards.
        </p>
      </section>

      <section aria-labelledby="models-openrouter">
        <h2 id="models-openrouter">Why OpenRouter, and only OpenRouter</h2>
        <p>
          One account reaches nearly every model worth trying, with one key, one bill, and one
          request format. That is what makes the advice on this page possible: you can switch model
          in a dropdown and compare the results the same afternoon.
        </p>
        <p>
          A local model on your own machine, or another provider's endpoint, is not supported today.
          Running Japanese generation locally at a quality worth reading needs hardware most people
          do not have, and every extra endpoint is another set of quirks to test against. It may
          come later. It is not a priority.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class TextModelsPageComponent {}
