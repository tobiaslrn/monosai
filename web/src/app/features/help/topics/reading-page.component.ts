import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-reading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NoticeComponent, HelpArticleComponent],
  template: `
    <mn-help-article slug="reading">
      <p mn-lead>
        Every story opens in the reader. There you can look up words, change how the text looks, and
        add translations, grammar notes and audio.
      </p>

      <section aria-labelledby="reading-lookup">
        <h2 id="reading-lookup">Look up a word</h2>
        <p>
          Select a word to see its reading, its meanings and the form it's in. On a computer,
          holding the pointer over a word shows a short preview. The dictionary is stored on your
          device, so looking words up is free and works offline.
        </p>
        <p>
          If Monosai marks a word as new but you already know it, select
          <strong>Add to word list</strong> in the word's details. Monosai adds the word's
          dictionary form to your first word list, or to a new list called Reader words, and counts
          it as known from then on. Your Anki collection doesn't change.
        </p>
      </section>

      <section aria-labelledby="reading-shape">
        <h2 id="reading-shape">Change how the text looks</h2>
        <p>
          Select <strong>Story options</strong> at the top of the reader. Under
          <strong>Reading appearance</strong>, you can change the <strong>Text size</strong> and
          turn these on or off:
        </p>
        <ul>
          <li><strong>Furigana</strong>, the small kana that show how kanji are read</li>
          <li><strong>Word spacing</strong>, a gap between words</li>
          <li><strong>Sentence per line</strong>, each sentence on its own line</li>
          <li><strong>Warning markers</strong>, the underlines described below</li>
        </ul>
        <p>These settings apply to everything you read on this device.</p>
      </section>

      <section aria-labelledby="reading-markers">
        <h2 id="reading-markers">Understand the underlines</h2>
        <p>
          An orange wavy underline marks a word that isn't among your known words. A blue wavy
          underline marks grammar above your reading level; it appears only once the story has
          grammar notes. Treat both as hints rather than errors.
        </p>
      </section>

      <section aria-labelledby="reading-sentence">
        <h2 id="reading-sentence">See a sentence in detail</h2>
        <p>
          To open a sentence's details on a touch screen, touch and hold the sentence. On a
          computer, click its punctuation or the space between two words, or select
          <strong>Sentence details</strong> in any word's details.
        </p>
        <p>
          The details show the sentence's translation, if it has one, its new words and any grammar
          above your level. From there you can select <strong>Copy</strong>,
          <strong>Translate</strong>, <strong>Grammar</strong> or <strong>Audio</strong>. Copying
          and playing saved audio are free. The others send a request to OpenRouter and use a little
          of your credit.
        </p>
      </section>

      <section aria-labelledby="reading-story">
        <h2 id="reading-story">Add a translation or grammar notes</h2>
        <p>
          New stories are translated and get grammar notes automatically, unless you turned that off
          under <strong>Prepare after generation</strong>. For a text you pasted, or a story without
          them, open <strong>Story options</strong> and select <strong>Translate story</strong> or
          <strong>Add notes</strong>.
        </p>
        <p>
          If this stops part of the way through, the same row offers <strong>Continue</strong> or
          <strong>Retry remaining</strong>. To remove a translation or notes, select
          <strong>Clear translation…</strong> or <strong>Clear grammar notes…</strong>. The Japanese
          text stays as it is.
        </p>
      </section>

      <section aria-labelledby="reading-audio">
        <h2 id="reading-audio">Listen to a story</h2>
        <p>
          Select the <strong>Audio</strong> button (the sound-wave icon) at the top of the reader to
          open the player. If the story has no audio yet, select <strong>Generate audio</strong>. If
          the player shows <strong>Set up audio</strong> instead, set up a voice first, as
          <a routerLink="/help/voice">Set up audio</a>
          describes.
        </p>
        <p>
          The player can pause after each sentence and play at 1×, 0.9× or 0.8× speed. To start part
          of the way through, open a sentence's details, then open the player and select
          <strong>Start from this sentence</strong>. Saved audio plays offline and costs nothing to
          replay.
        </p>
      </section>

      <section aria-labelledby="reading-manage">
        <h2 id="reading-manage">Rename or delete a story</h2>
        <p>
          In the Library, open a story's menu and select <strong>Rename</strong> or
          <strong>Delete</strong>. You can't change a story's text, and deleting a story can't be
          undone.
        </p>
      </section>

      <section aria-labelledby="reading-trust">
        <h2 id="reading-trust">If something looks wrong</h2>
        <mn-notice tone="info" icon="info">
          <p>
            AI models sometimes get the Japanese, a translation or a grammar note wrong, and sound
            sure of themselves. If a sentence looks odd, check it in a dictionary or another source.
          </p>
        </mn-notice>
      </section>
    </mn-help-article>
  `,
})
export class ReadingPageComponent {}
