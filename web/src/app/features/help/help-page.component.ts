import { formatCount } from '../../domain/shared/locale';
import { GENERATION_SNAPSHOT_MINIMUM } from '../../domain/vocabulary/snapshot';
import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../shared-ui/icon/icon.component';
import { PageHeaderComponent } from '../../shared-ui/page-header/page-header.component';

/**
 * Local, static guidance: reading the guide never invokes an AI provider.
 *
 * It is two documents in one surface. The first five minutes is what a stranger
 * needs ten seconds after arriving, and it stays open: three steps, one line
 * each, each leading to the screen that does it. Everything under it is
 * reference, and it is folded — as a single run of prose it was seven hundred
 * words offered to someone who had not yet read a sentence of Japanese here.
 *
 * Every path is named exactly as the controls name it. Four names for two
 * things is what "Add text", "Bring your own text" and "Paste text" were.
 */
@Component({
  selector: 'mn-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, PageHeaderComponent],
  template: `
    <div class="mn-page help-page">
      <mn-page-header heading="Help" backTo="/library" backLabel="Back to library">
        <!-- Named, not drawn: no icon in the set reads as GitHub rather than a branch. -->
        <a
          class="mn-button mn-button--ghost"
          href="https://github.com/tobiaslrn/monosai"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="GitHub (opens in a new tab)"
          title="GitHub (opens in a new tab)"
        >
          GitHub
        </a>
      </mn-page-header>
      <p class="lead">Japanese reading, from the words you know.</p>

      <section aria-labelledby="help-start">
        <h2 id="help-start">First five minutes</h2>
        <ol class="first-steps">
          <li>
            <a routerLink="/add">Paste Japanese text</a> from something you want to read, save it,
            and tap words to look them up. Nothing to set up.
          </li>
          <li>
            Add a word source in
            <a routerLink="/reading-level" fragment="words">What you can read</a>: connect Anki,
            import an Anki package, or paste a list of your own.
          </li>
          <li>
            Add an OpenRouter key in <a routerLink="/settings">Settings</a>, then
            <a routerLink="/generate">Write with AI</a> — Monosai writes stories from your own
            words, at your own level.
          </li>
        </ol>
      </section>

      <!--
        The boundary a learner most needs and the application says least about:
        which half of Monosai is free and local, and which half spends money.
        The sparkle marks the spending half here exactly as it does on the
        controls themselves.
      -->
      <section aria-labelledby="help-cost">
        <h2 id="help-cost">What is free, and what needs your key</h2>
        <div class="split">
          <div>
            <h3>On this device, free</h3>
            <ul>
              <li>The reader, furigana, and word spacing</li>
              <li>Dictionary lookup and word forms</li>
              <li>Anki import, word lists, and your reading level</li>
              <li>Saved stories, and reading them offline</li>
            </ul>
          </div>
          <div>
            <h3><mn-icon name="generate" [size]="16" aria-hidden="true" /> Needs your key</h3>
            <ul>
              <li>Writing a story with AI</li>
              <li>Translation into English</li>
              <li>Grammar notes</li>
              <li>Audio</li>
            </ul>
          </div>
        </div>
        <p class="mn-hint">
          Anything marked with the sparkle sends a request to OpenRouter and is billed to your
          account. Nothing else ever does.
        </p>
      </section>

      <details class="mn-disclosure fold">
        <summary>Reader basics</summary>
        <ul>
          <li>
            <strong>Word lookup:</strong> tap or click a word for its dictionary meaning and word
            form. Tap elsewhere in the text, or press Escape, to return to reading.
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
            <strong>Translation and grammar:</strong> click a sentence to open its details; on a
            phone, press and hold it. The arrow beside a word also leads there. English stays in the
            details so the page stays Japanese. Use Translate story or Add notes in Story options to
            prepare missing aids.
          </li>
          <li>
            <strong>Audio:</strong> open the reader's Audio control for the playback controls, or
            press Listen in Story options. Generate the audio there first if it is missing. Leaving
            the reader stops playback.
          </li>
        </ul>
      </details>

      <details class="mn-disclosure fold">
        <summary>Your words and your level</summary>
        <p>
          Open <a routerLink="/reading-level" fragment="words">What you can read</a> and add a word
          source: connect Anki, import an Anki package, or paste a list of your own. For Anki,
          choose the decks and fields containing Japanese; Monosai takes the words you have reviewed
          and never changes your cards.
        </p>
        <p>
          Stories are written from at least {{ minimumWords }} words. The more you add, the more
          room the model has to write something useful. Your
          <a routerLink="/reading-level" fragment="grammar">grammar level</a> guides the difficulty.
        </p>
        <p>
          Basic grammar patterns remain available at every level because Japanese needs them to form
          working sentences. Your grammar level guides the difficulty; it is not a ban on the
          building blocks of Japanese.
        </p>
      </details>

      <details class="mn-disclosure fold">
        <summary>AI models, cost, and failures</summary>
        <p>
          AI features need your own OpenRouter API key, internet access, and available credit.
          OpenRouter bills your account directly for requests, including model tests and retries.
          Text sent for generation or reading aids goes to the provider. Keep private material out
          of requests you do not want to share.
        </p>
        <p>
          In <a routerLink="/settings">Settings</a>, choose and test each model before using it. The
          picker leads with a short <strong>Suggested</strong> group — models that have answered
          Monosai's structured-output test — because model choice is what decides whether generation
          works at all. Anything else in OpenRouter's catalogue stays one search away.
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
      </details>

      <details class="mn-disclosure fold">
        <summary>Getting useful audio</summary>
        <p>
          Some speech models return unusable audio or ignore speaking-style instructions. Test the
          speech model in <a routerLink="/settings">Settings</a> and listen to the result before
          preparing a long story. Choose a named pace for the voice model; reading speed is adjusted
          locally during playback. After changing the voice, pace, style, or model, you may need to
          regenerate audio in Story options. Previously generated clips may no longer match your
          settings.
        </p>
      </details>

      <details class="mn-disclosure fold">
        <summary>Practical tips</summary>
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
      </details>
    </div>
  `,
  styles: `
    @use '../../../styles/breakpoints' as breakpoints;

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
      font-size: var(--text-lg);
    }
    section {
      border-top: 1px solid var(--border-subtle);
      padding-top: var(--space-5);
    }
    h2 {
      margin: 0 0 var(--space-4);
      font-size: var(--text-xl);
    }
    h3 {
      display: flex;
      gap: var(--space-2);
      align-items: center;
      margin: 0 0 var(--space-2);
      font-size: var(--text-md);
    }
    h3 mn-icon {
      color: var(--accent-secondary);
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
    ul,
    ol {
      margin: 0;
      padding-inline-start: var(--space-5);
    }
    li + li {
      margin-top: var(--space-3);
    }

    /*
     * The one block that is not reference: it stays open, leads the page, and
     * is numbered, because it is a sequence rather than a set. The reset drops
     * the marker from any list carrying a class.
     */
    .first-steps {
      list-style: decimal;
    }

    .first-steps li {
      margin-top: var(--space-2);
      padding-inline-start: var(--space-1);
    }

    .first-steps li::marker {
      color: var(--text-secondary);
      font-weight: var(--weight-semibold);
    }

    .split {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--space-5);
      margin-bottom: var(--space-4);
    }

    .split li + li {
      margin-top: var(--space-1);
    }

    /*
     * Reference behind a fold. Each is its own row rather than one long page,
     * so the first thing a stranger meets is three steps and not seven hundred
     * words.
     */
    .fold {
      border-top: 1px solid var(--border-subtle);
      padding-block: var(--space-2) var(--space-4);
    }
    .fold > summary {
      font-size: var(--text-lg);
    }
    .fold > :not(summary) {
      margin-top: var(--space-3);
    }

    a:not(.mn-button) {
      color: var(--action-primary);
      text-underline-offset: 0.15em;
    }

    @media (max-width: breakpoints.$narrow-max) {
      .split {
        grid-template-columns: minmax(0, 1fr);
        gap: var(--space-4);
      }
    }
  `,
})
export class HelpPageComponent {
  /** Read from the rule, so the three screens that state it cannot disagree. */
  protected readonly minimumWords = formatCount(GENERATION_SNAPSHOT_MINIMUM);
}
