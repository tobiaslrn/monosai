import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-reading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="reading">
      <p class="mn-prose__lead">
        The reader is where you spend your time, so it carries no navigation and no clutter. Here is
        what everything in it does.
      </p>

      <section aria-labelledby="reading-lookup">
        <h2 id="reading-lookup">Looking a word up</h2>
        <p>
          Tap or click a word to see its dictionary meaning and the form it is in, so a conjugated
          verb still leads to the entry you learned. Tap elsewhere in the text, or press Escape, to
          close it and carry on.
        </p>
        <p>
          Lookup is local. The dictionary is downloaded once and then works offline, and it costs
          nothing per use.
        </p>
      </section>

      <section aria-labelledby="reading-shape">
        <h2 id="reading-shape">Readings, spacing, and text size</h2>
        <p>
          Open Story options to show hiragana above the kanji, put space between words, or change
          the text size. These choices apply to every story on this device, so set them once the way
          you like to read.
        </p>
        <p>
          Furigana is a crutch worth removing eventually. If you can manage without it, turn it off
          and let the tap on a word be your fallback.
        </p>
      </section>

      <section aria-labelledby="reading-markers">
        <h2 id="reading-markers">The underlines</h2>
        <p>
          An underline marks a word that is not in your lists, or grammar above the level you chose.
          It tells you where to expect trouble before you hit it.
        </p>
        <p>
          Treat them as a hint rather than a verdict. A word can be marked because your Anki
          collection spells it differently, and an unmarked sentence can still be wrong. You can
          hide the markers in Story options.
        </p>
      </section>

      <section aria-labelledby="reading-sentence">
        <h2 id="reading-sentence">Translation and grammar notes</h2>
        <p>
          Click a sentence to open its details, or press and hold it on a phone. The arrow beside a
          word leads to the same place. English stays inside those details on purpose, so the page
          you are reading stays Japanese and you do not read the translation by accident.
        </p>
        <p>
          Details are only there if they have been prepared. Use Translate story or Add notes in
          Story options to request them for a whole story. Both are AI requests and both cost money,
          which is why they are never generated on their own.
        </p>
      </section>

      <section aria-labelledby="reading-audio">
        <h2 id="reading-audio">Listening</h2>
        <p>
          If a story has audio, the reader's Audio control opens the player. If it does not, Story
          options can generate it. Playback follows the sentences and stops when you leave the
          reader.
        </p>
        <p>
          Speed is adjusted during playback without changing the pitch and without generating
          anything again, so slowing a story down is free.
          <a routerLink="/help/voice">Voice and audio</a> covers which speech model to use.
        </p>
      </section>

      <section aria-labelledby="reading-trust">
        <h2 id="reading-trust">How much to trust it</h2>
        <p>
          A model can be wrong in Japanese, in a translation, and in a grammar explanation, and it
          will be wrong confidently. That is worth remembering exactly when something looks odd but
          you assume you misread it.
        </p>
        <p>
          If a sentence seems wrong, it may well be. Check it, and treat the reading aids as a
          second opinion rather than an authority.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class ReadingPageComponent {}
