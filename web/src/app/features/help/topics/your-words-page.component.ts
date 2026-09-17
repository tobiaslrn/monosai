import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-your-words',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="your-words">
      <p class="mn-prose__lead">
        Monosai needs to know which words you have already learned. There are four ways to tell it,
        and they differ mostly in how much setup they cost you.
      </p>

      <section aria-labelledby="words-why">
        <h2 id="words-why">Why Monosai asks</h2>
        <p>
          A list of words you know is what separates a story you can read from a story you have to
          decode. Monosai uses it twice: to keep a generated story inside your vocabulary, and to
          underline the words in any text that you probably have not met yet.
        </p>
        <p>
          Anki is the supported source, because a review history is the only honest record of what
          you actually know rather than what you once saw. Monosai takes the words on cards you have
          reviewed, not every card in the deck. Other flashcard applications are not supported and
          are not planned. If you study somewhere else, a pasted list works.
        </p>
        <p>
          Monosai only reads. There is no write operation in the code that talks to Anki, so it
          cannot change a card, a tag, a deck, or your scheduling, even by accident.
        </p>
      </section>

      <section aria-labelledby="words-desktop">
        <h2 id="words-desktop">Anki on a computer</h2>
        <p>
          Install the AnkiConnect add-on (code <code>2055492159</code>) in Anki and restart it. Then
          open <a routerLink="/reading-level" fragment="words">What you can read</a>, add an Anki
          source, and Monosai lists your decks and note types and suggests which field holds the
          Japanese.
        </p>
        <p>
          One setting decides whether this works at all. AnkiConnect only answers pages whose exact
          address is listed in its <code>webCorsOriginList</code> config, and the address Monosai is
          served from is not there by default. In Anki, open Tools, Add-ons, AnkiConnect, Config,
          add <code>https://tobiaslrn.github.io</code> to that list, and restart Anki. Skipping this
          produces the error <code>anki/origin-not-allowed</code>.
        </p>
        <p>Anki has to be running each time you want to refresh your words.</p>
      </section>

      <section aria-labelledby="words-bridge">
        <h2 id="words-bridge">The Android bridge</h2>
        <p>
          On Android, AnkiDroid can hand its collection to other applications on the phone, but not
          to a web page. Monosai Bridge closes that gap: a small companion app that reads the
          collection through AnkiDroid's public interface and answers Monosai on this device only.
          It costs you two native installs, the Monosai app, and a permission grant. In return your
          words stay current without exporting a file every week.
        </p>
        <h3>Why it has to be a second app</h3>
        <p>
          A web page cannot read another application's data on your phone. That is a rule of the
          platform and it applies to Monosai like anything else. Only an installed Android app may
          ask AnkiDroid for the collection, so the bridge is that app. It does nothing else: it
          holds no collection of its own, and it answers only requests from this phone.
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
        <h3>What Android will say about it</h3>
        <p>
          The bridge is not distributed through the Play Store, so Play Protect does not recognise
          it and may warn you about an unknown developer or offer to scan it. Android will also ask
          you to allow installing apps from wherever you downloaded it. Both are expected for an app
          installed outside the store, and you can read the source in the repository before you
          trust it.
        </p>
        <p>
          The permission prompt says read and write access to the AnkiDroid database. AnkiDroid has
          no read-only permission to offer, so that is the only prompt it can show. The bridge
          exposes reads and nothing else.
        </p>
        <p>
          The bridge is built for Android 16 and newer. It needs AnkiDroid 2.24 or newer as well,
          because 2.23 and older cannot supply the review data that tells studied cards from
          untouched ones. Android's battery policies and Force stop can stop the bridge; open it and
          press Start if Monosai stops finding it.
        </p>
      </section>

      <section aria-labelledby="words-package">
        <h2 id="words-package">A package file</h2>
        <p>
          The simplest option, and the only one on an iPhone. Export from Anki or AnkiDroid with
          "Include scheduling information" checked, then open the
          <code>.apkg</code> or <code>.colpkg</code> file in Monosai. It is read on your device and
          never uploaded.
        </p>
        <p>
          Without scheduling information the file cannot say which cards you have studied, and
          Monosai refuses it rather than guessing. On Android you can also share an export straight
          into the installed app from AnkiDroid's share sheet.
        </p>
        <p>
          A package is a snapshot. Export again when you want Monosai to catch up with your reviews.
        </p>
      </section>

      <section aria-labelledby="words-ios">
        <h2 id="words-ios">On an iPhone</h2>
        <p>
          Packages only. AnkiMobile offers no way for another app to read its collection, and iOS
          gives no route around that, so there is no bridge and there will not be one. Export a
          package on whichever device you study on and open it in Monosai.
        </p>
        <p>
          Monosai itself is built and tested for Chrome on Windows and on Android. It may work in
          Safari, but nothing here has been checked there. See
          <a routerLink="/help/install">Installing and offline</a>.
        </p>
      </section>

      <section aria-labelledby="words-list">
        <h2 id="words-list">A pasted list</h2>
        <p>
          You can also paste words directly, one per line. It is the right choice when you study
          without Anki, when you want to try Monosai before setting anything up, or when you want to
          add a handful of words a deck does not cover.
        </p>
      </section>

      <section aria-labelledby="words-current">
        <h2 id="words-current">Keeping it current</h2>
        <p>
          Your sources do not refresh themselves. After a week of reviews, open
          <a routerLink="/reading-level" fragment="words">What you can read</a> and refresh, so the
          next story uses the words you have learned since. The page says when each source was last
          read.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class YourWordsPageComponent {}
