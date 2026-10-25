import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared-ui/icon/icon.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-your-words',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent, HelpArticleComponent],
  template: `
    <mn-help-article slug="your-words">
      <p class="mn-prose__lead">
        Monosai needs to know which words you have already learned. The ways to tell it differ
        mostly in how much setup they cost you.
      </p>

      <section aria-labelledby="words-why">
        <h2 id="words-why">Why Monosai asks</h2>
        <p>
          Monosai uses your word list twice: to keep a generated story inside your vocabulary, and
          to underline words in any text that you probably have not met yet.
        </p>
        <p>
          Anki is the supported source, because a review history records which cards you have
          studied rather than which you once saw. Monosai takes the words on cards you have
          reviewed, not every card in the deck. If you study somewhere else, paste a list. Other
          flashcard applications are not supported and are not planned.
        </p>
        <p class="mn-notice mn-notice--info">
          <mn-icon name="info" [size]="17" />
          <span>
            Monosai only reads. The code that talks to Anki has no write operation in it, so it
            cannot change a card, a tag, a deck, or your scheduling, even by accident.
          </span>
        </p>
      </section>

      <section aria-labelledby="words-desktop">
        <h2 id="words-desktop">Anki on a computer</h2>
        <p>
          Install the AnkiConnect add-on (code <code>2055492159</code>) and restart Anki. Then open
          <a routerLink="/reading-level" fragment="words">What you can read</a>, add an Anki source,
          and Monosai lists your decks and note types and suggests which field holds the Japanese.
        </p>
        <p class="mn-notice mn-notice--warning">
          <mn-icon name="warning" [size]="17" />
          <span>
            AnkiConnect ignores this page until you list it. In Anki, open Tools → Add-ons →
            AnkiConnect → Config, add <code>https://tobiaslrn.github.io</code> to
            <code>webCorsOriginList</code>, and restart Anki. Skipping this gives you
            <code>anki/origin-not-allowed</code>.
          </span>
        </p>
        <p>Anki has to be running each time you refresh your words.</p>
      </section>

      <section aria-labelledby="words-bridge">
        <h2 id="words-bridge">The Android bridge</h2>
        <p>
          A web page cannot read another app's data on your phone. AnkiDroid will hand its
          collection to an installed Android app, so Monosai Bridge is that app: it reads the
          collection through AnkiDroid's public interface and answers Monosai on this device only.
          It holds no collection of its own and does nothing else.
        </p>
        <p>
          The cost is two native installs and a permission grant. In return your words stay current
          without exporting a file every week.
        </p>
        <h3>Installing it</h3>
        <ol>
          <li>Install AnkiDroid and open your collection at least once.</li>
          <li>
            Download the signed APK from a <code>bridge-v</code> release on the
            <a
              href="https://github.com/tobiaslrn/monosai/releases?q=bridge-v"
              target="_blank"
              rel="noopener noreferrer"
              >releases page</a
            >
            and install it.
          </li>
          <li>Open the bridge, choose Grant AnkiDroid access, then Start bridge.</li>
          <li>
            In Monosai, add an Anki source. On Android that reaches the bridge with no port to set.
            Check the suggested deck, note type, field, and words, then confirm.
          </li>
        </ol>
        <h3>Install warnings</h3>
        <p class="mn-notice mn-notice--info">
          <mn-icon name="info" [size]="17" />
          <span>
            Two prompts are expected, because the bridge is not distributed through the Play Store.
            Play Protect may warn about an unknown developer, and Android will ask you to allow
            installing apps from wherever you downloaded it. The source is in the repository if you
            want to read it first.
          </span>
        </p>
        <p>
          AnkiDroid's permission prompt says read and write access to its database. It has no
          read-only permission to offer, so that is the only prompt it can show. The bridge exposes
          reads and nothing else.
        </p>
        <h3>Requirements</h3>
        <ul>
          <li>Android 16 or newer, even though Monosai itself runs on Android 12.</li>
          <li>
            AnkiDroid 2.24 or newer. Older versions cannot supply the review data that tells studied
            cards from untouched ones.
          </li>
        </ul>
        <p>
          Android's battery policies and Force stop can stop the bridge. Open it and press Start if
          Monosai stops finding it.
        </p>
      </section>

      <section aria-labelledby="words-package">
        <h2 id="words-package">A package file</h2>
        <p>
          The simplest option, and the only one on an iPhone. Export from Anki or AnkiDroid, then
          open the <code>.apkg</code> or <code>.colpkg</code> file in Monosai. It is read on your
          device and never uploaded.
        </p>
        <p class="mn-notice mn-notice--warning">
          <mn-icon name="warning" [size]="17" />
          <span>
            Check <strong>Include scheduling information</strong> when you export. Without it the
            file cannot say which cards you have studied, and Monosai refuses it rather than
            guessing.
          </span>
        </p>
        <p>
          A package is a snapshot, so export again when you want Monosai to catch up with your
          reviews. On Android you can share an export straight into the installed app from
          AnkiDroid's share sheet.
        </p>
      </section>

      <section aria-labelledby="words-ios">
        <h2 id="words-ios">On an iPhone</h2>
        <p>
          Packages only. AnkiMobile offers no way for another app to read its collection and iOS
          gives no route around that, so there is no bridge and there will not be one. Export a
          package on whichever device you study on and open it in Monosai.
        </p>
        <p>
          See <a routerLink="/help/install">Installing and offline</a> for what is tested where.
        </p>
      </section>

      <section aria-labelledby="words-list">
        <h2 id="words-list">A pasted list</h2>
        <p>
          You can paste words directly, one per line. Use it if you study without Anki, if you want
          to try Monosai before setting anything up, or to add a handful of words your decks do not
          cover.
        </p>
      </section>

      <section aria-labelledby="words-current">
        <h2 id="words-current">Keeping your words current</h2>
        <p>
          Sources do not refresh themselves. After a week of reviews, open
          <a routerLink="/reading-level" fragment="words">What you can read</a> and refresh, so the
          next story uses what you have learned since. The page says when each source was last read.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class YourWordsPageComponent {}
