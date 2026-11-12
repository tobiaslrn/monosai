import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-your-words',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NoticeComponent, HelpArticleComponent],
  template: `
    <mn-help-article slug="your-words">
      <section aria-labelledby="words-why">
        <h2 id="words-why">Why Monosai asks</h2>
        <p>
          Your words keep stories inside your vocabulary and mark new words in any text. Anki is the
          supported source: it records which cards you reviewed. Otherwise paste a list.
        </p>
        <mn-notice tone="info" icon="info">
          <p>Monosai only reads from Anki. It cannot change a card.</p>
        </mn-notice>
      </section>

      <section aria-labelledby="words-desktop">
        <h2 id="words-desktop">Anki on a computer</h2>
        <p>
          Install the AnkiConnect add-on (code <code>2055492159</code>) and restart Anki. Add
          <code>https://tobiaslrn.github.io</code> to <code>webCorsOriginList</code> (Tools →
          Add-ons → AnkiConnect → Config), restart Anki, then add an Anki source in
          <a routerLink="/reading-level" fragment="words">What you can read</a>. Skipping the config
          gives <code>anki/origin-not-allowed</code>. Anki must be open when you refresh.
        </p>
      </section>

      <section aria-labelledby="words-bridge">
        <h2 id="words-bridge">The Android bridge</h2>
        <p>
          A web page cannot read AnkiDroid. Monosai Bridge is a small Android app that can, on this
          device only.
        </p>
        <ol>
          <li>Install AnkiDroid and open your collection once.</li>
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
          <li>In Monosai, add an Anki source and confirm the suggested fields.</li>
        </ol>
        <p>
          Play Protect may warn about an unknown developer; the bridge is not on the Play Store.
          AnkiDroid's prompt says read and write access; the bridge only reads.
        </p>
        <p>
          Needs Android 16 or newer and AnkiDroid 2.24 or newer. If Monosai stops finding the
          bridge, open it and press Start.
        </p>
      </section>

      <section aria-labelledby="words-package">
        <h2 id="words-package">A package file</h2>
        <p>
          The simplest option, and the only one on iPhone. Export from Anki or AnkiDroid with
          <strong>Include scheduling information</strong>, then open the <code>.apkg</code> or
          <code>.colpkg</code> in Monosai. It is read on your device. Export again to refresh.
        </p>
      </section>

      <section aria-labelledby="words-list">
        <h2 id="words-list">A pasted list</h2>
        <p>One word per line. Use it without Anki or to add a few words.</p>
      </section>

      <section aria-labelledby="words-current">
        <h2 id="words-current">Keeping your words current</h2>
        <p>
          Sources do not refresh themselves. Refresh in
          <a routerLink="/reading-level" fragment="words">What you can read</a> after a week of
          reviews.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class YourWordsPageComponent {}
