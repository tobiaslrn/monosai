import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared-ui/icon/icon.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-reading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, HelpArticleComponent],
  template: `
    <mn-help-article slug="reading">
      <p class="mn-prose__lead">What each control in the reader does.</p>

      <section aria-labelledby="reading-lookup">
        <h2 id="reading-lookup">Looking a word up</h2>
        <p>
          Tap or click a word to see its dictionary meaning and the form it is in, so a conjugated
          verb still leads to the entry you learned. Tap elsewhere, or press Escape, to close it.
        </p>
        <p>
          Lookup is local. The dictionary downloads once, then works offline and costs nothing per
          use.
        </p>
      </section>

      <section aria-labelledby="reading-shape">
        <h2 id="reading-shape">Readings, spacing, and text size</h2>
        <p>
          Story options can show hiragana above the kanji, put space between words, and change the
          text size. These apply to every story on this device, so set them once the way you like to
          read.
        </p>
        <p>
          Turn furigana off once you can manage without it, and let the tap on a word be your
          fallback.
        </p>
      </section>

      <section aria-labelledby="reading-markers">
        <h2 id="reading-markers">The underlines</h2>
        <p>
          Two kinds of wavy underline appear under a story, told apart by colour. An orange one
          marks a word that is not in your lists, so you can see which words will be new. A blue one
          marks grammar above your level, and only appears on a story whose grammar notes have been
          prepared, because that is where the finding comes from.
        </p>
        <p>
          Treat them as a hint. A word can be marked because your Anki collection spells it
          differently, and an unmarked sentence can still be wrong. Story options can hide them.
        </p>
      </section>

      <section aria-labelledby="reading-sentence">
        <h2 id="reading-sentence">Translation and grammar notes</h2>
        <p>
          Click a sentence to open its details, or press and hold on a phone. The arrow beside a
          word leads to the same place. English stays inside those details on purpose, so the page
          you are reading stays Japanese and you do not read the translation by accident.
        </p>
        <p>
          Details are only there if they have been prepared. Story options has Translate story and
          Add notes. Both are AI requests that cost money, which is why they never run on their own.
        </p>
      </section>

      <section aria-labelledby="reading-audio">
        <h2 id="reading-audio">Listening</h2>
        <p>
          If a story has audio, the Audio control opens the player. If it does not, Story options
          can generate it. Playback follows the sentences and stops when you leave the reader.
        </p>
        <p>
          Playback speed is adjustable and costs nothing.
          <a routerLink="/help/voice">Voice and audio</a> covers which speech model to use.
        </p>
      </section>

      <section aria-labelledby="reading-trust">
        <h2 id="reading-trust">How much to trust it</h2>
        <p class="mn-notice mn-notice--warning">
          <mn-icon name="warning" [size]="17" />
          <span>
            A model can be wrong in the Japanese, in a translation, and in a grammar explanation,
            and it will be wrong confidently. If a sentence looks odd, it may well be wrong rather
            than misread. Check it elsewhere before you learn it.
          </span>
        </p>
      </section>
    </mn-help-article>
  `,
})
export class ReadingPageComponent {}
