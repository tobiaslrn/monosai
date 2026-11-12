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
      <section aria-labelledby="reading-lookup">
        <h2 id="reading-lookup">Looking a word up</h2>
        <p>Tap a word for its meaning and form. Lookup is local and free.</p>
      </section>

      <section aria-labelledby="reading-shape">
        <h2 id="reading-shape">Readings, spacing, and text size</h2>
        <p>
          Story options sets furigana, word spacing, sentence per line and text size for every
          story.
        </p>
      </section>

      <section aria-labelledby="reading-markers">
        <h2 id="reading-markers">The underlines</h2>
        <p>
          Orange wavy underline: a word not in your lists. Blue: grammar above your level (only
          after grammar notes exist). Treat them as hints.
        </p>
      </section>

      <section aria-labelledby="reading-sentence">
        <h2 id="reading-sentence">Translation and grammar notes</h2>
        <p>
          Tap a sentence (press and hold on a phone) for its details. Translation and grammar notes
          are AI requests that cost money, so they only run when you ask: Story options, Translate
          story or Add notes.
        </p>
      </section>

      <section aria-labelledby="reading-audio">
        <h2 id="reading-audio">Listening</h2>
        <p>
          Audio opens the player. Without audio, Story options can generate it. Playback speed is
          free. <a routerLink="/help/voice">Voice and audio</a> covers speech models.
        </p>
      </section>

      <section aria-labelledby="reading-trust">
        <h2 id="reading-trust">How much to trust it</h2>
        <mn-notice tone="warning" icon="warning">
          <p>
            Models make mistakes in the Japanese, translations and grammar, confidently. Check an
            odd sentence elsewhere.
          </p>
        </mn-notice>
      </section>
    </mn-help-article>
  `,
})
export class ReadingPageComponent {}
