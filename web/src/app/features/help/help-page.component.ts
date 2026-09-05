import { formatCount } from '../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';

/** Local, static guidance: reading the guide never invokes an AI provider. */
@Component({
  selector: 'mn-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, PageHeaderComponent],
  template: `
    <div class="mn-page help-page">
      <mn-page-header heading="Help" backTo="/library" backLabel="Back to library" />
      <p class="lead">Japanese reading, from the words you know.</p>
      <section aria-labelledby="help-start">
        <h2 id="help-start">Start here</h2>
        <h3>Bring your own text</h3>
        <p>
          <a routerLink="/add">Add text</a> by pasting Japanese from something you want to read.
          Save it as a story and tap words to look them up. No AI key is needed.
        </p>
        <h3>Tell Monosai which words you know</h3>
        <p>
          Open <a routerLink="/reading-level" fragment="words">What you can read</a> and add a word
          source: connect Anki, import an Anki package, or paste a list of your own. For Anki,
          choose the decks and fields containing Japanese; Monosai takes the words you have reviewed
          and never changes your cards.
        </p>
        <h3>Make a story for your level</h3>
        <p>
          Choose your <a routerLink="/reading-level" fragment="grammar">grammar level</a>, set up
          and test a text model in <a routerLink="/settings">Settings</a>, then
          <a routerLink="/generate">Generate a story</a> about a topic you enjoy. The more words you
          have added, the more room the model has to write a useful story. Stories are written from
          at least {{ minimumWords }} words.
        </p>
        <h3>Add optional reading aids</h3>
        <p>
          Translation, grammar notes, and audio are optional. Choose them when adding or generating
          a story, or open Story options in the reader to prepare them later. These aids need
          configured AI models; local word lookup does not.
        </p>
      </section>
      <section aria-labelledby="help-reader">
        <h2 id="help-reader">Reader basics</h2>
        <ul>
          <li>
            <strong>Word lookup:</strong> tap or click a word for its dictionary meaning and word
            form. Close the details to return to reading.
          </li>
          <li>
            <strong>Furigana and spacing:</strong> open Story options to show readings above kanji,
            add space between words, or change the text size. These preferences apply to every story
            on this device.
          </li>
          <li>
            <strong>Markers:</strong> underlines flag words that are not in your lists, and grammar
            beyond your level. They are guidance, not proof that a sentence is wrong. You can hide
            them in Story options.
          </li>
          <li>
            <strong>Translation and grammar:</strong> select a sentence to open its details; on a
            phone, tap it twice. English stays in the details so the page stays Japanese. Use
            Translate story or Add notes in Story options to prepare missing aids.
          </li>
          <li>
            <strong>Audio:</strong> open the reader's Audio control for the playback controls, or
            press Listen in Story options. Generate the audio there first if it is missing. Leaving
            the reader stops playback.
          </li>
        </ul>
      </section>
      <section aria-labelledby="help-ai">
        <h2 id="help-ai">AI models, cost, and failures</h2>
        <p>
          AI features need your own OpenRouter API key, internet access, and available credit.
          OpenRouter bills your account directly for requests, including model tests and retries.
          Text sent for generation or reading aids goes to the provider. Keep private material out
          of requests you do not want to share.
        </p>
        <p>
          In <a routerLink="/settings">Settings</a>, choose and test each model before using it. Use
          exact model IDs from the model picker, not a display name or a guessed spelling. A
          successful test checks compatibility; it cannot guarantee every later response.
        </p>
        <p>
          Some models fail to return the structured output Monosai needs, even when they can answer
          an ordinary chat message. If a request fails, read the error, check your key, credit, and
          connection, then retry or change model settings and test again. Changing the model or its
          settings can require another test.
        </p>
        <p>
          AI can make mistakes in Japanese, translations, and grammar explanations. Treat these as
          reading aids and check anything that seems wrong.
        </p>
      </section>
      <section aria-labelledby="help-audio">
        <h2 id="help-audio">Getting useful audio</h2>
        <p>You can try other speech models, but Gemini TTS works by far the best in Monosai.</p>
        <p>
          Some speech models return unusable audio or ignore speed settings. Test the speech model
          in <a routerLink="/settings">Settings</a> and listen to the result before preparing a long
          story. After changing the voice or model, you may need to regenerate audio in Story
          options. Previously generated clips may no longer match your settings.
        </p>
      </section>
      <section aria-labelledby="help-tips">
        <h2 id="help-tips">Practical tips</h2>
        <p>
          Basic grammar patterns remain available at every level because Japanese needs them to form
          working sentences. Your grammar level guides the difficulty; it is not a ban on the
          building blocks of Japanese.
        </p>
        <p>
          Review more Anki vocabulary and refresh it in Monosai to improve generated stories. Start
          with a concrete topic and a little room to develop it. Very short stories can be rough,
          and story length is a guideline rather than an exact promise.
        </p>
        <p>
          Your stories and settings live in this browser on this device. Saved text and local lookup
          can be used offline once the app and language assets are ready. Creating AI aids needs the
          internet. Clearing all Monosai data removes your local library and settings, and shows the
          first-use introduction again.
        </p>
      </section>
    </div>
  `,
  styles: `
    /*
     * Prose is held to a readable measure by the paragraphs themselves rather
     * than by narrowing the page: narrowing it indented every heading 121px
     * past the wordmark above them.
     */
    .help-page p,
    .help-page li {
      max-width: 44rem;
    }
    .lead {
      margin: 0;
      color: var(--text-secondary);
      font-size: 1.125rem;
    }
    section {
      border-top: 1px solid var(--border-subtle);
      padding-top: var(--space-5);
    }
    h2 {
      margin: 0 0 var(--space-4);
      font-size: 1.25rem;
    }
    h3 {
      margin: var(--space-4) 0 var(--space-2);
      font-size: 1rem;
    }
    p,
    li {
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    p {
      margin: 0 0 var(--space-3);
    }
    p:last-child {
      margin-bottom: 0;
    }
    ul {
      margin: 0;
      padding-inline-start: var(--space-5);
    }
    li + li {
      margin-top: var(--space-3);
    }
    a {
      color: var(--action-primary);
      text-underline-offset: 0.15em;
    }
  `,
})
export class HelpPageComponent {
  /** Read from the rule, so the three screens that state it cannot disagree. */
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
