import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-your-words',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NoticeComponent, HelpArticleComponent],
  template: `
    <mn-help-article slug="your-words">
      <p mn-lead>
        Monosai writes stories from the words you already know. Tell it which ones by adding a word
        source: your Anki collection, an Anki export file or a list of words.
      </p>

      <section aria-labelledby="words-choose">
        <h2 id="words-choose">Choose a word source</h2>
        <p>Which source you use depends on where you study:</p>
        <ul>
          <li>
            <strong>Anki on a computer.</strong> Connect to Anki with the AnkiConnect add-on. Your
            words then stay up to date on their own.
          </li>
          <li>
            <strong>AnkiDroid on Android.</strong> Connect through Monosai Bridge, a small companion
            app, or import an export file.
          </li>
          <li>
            <strong>AnkiMobile on iPhone or iPad.</strong> Import an export file. A live connection
            to Anki isn't available on iPhone and iPad.
          </li>
          <li><strong>No Anki.</strong> Type or paste a list of words.</li>
        </ul>
        <p>You can add more than one source, and Monosai combines them.</p>
        <mn-notice tone="info" icon="info">
          <p>Monosai only reads from Anki. It never changes your cards or your collection.</p>
        </mn-notice>
      </section>

      <section aria-labelledby="words-desktop">
        <h2 id="words-desktop">Connect Anki on a computer</h2>
        <p>
          You need the Anki desktop app, open on the same computer as your browser. This is a
          one-time setup:
        </p>
        <ol>
          <li>
            In Anki, choose Tools > Add-ons > Get Add-ons, enter the code
            <code>2055492159</code>, and restart Anki. This installs AnkiConnect.
          </li>
          <li>Choose Tools > Add-ons, select AnkiConnect, then select Config.</li>
          <li>
            In <code>webCorsOriginList</code>, add <code>"{{ origin }}"</code> to the list, then
            save and restart Anki.
          </li>
          <li>
            In Monosai, open
            <a routerLink="/reading-level" fragment="words">What you can read</a>, select
            <strong>Add source</strong>, then <strong>Connect to Anki</strong>.
          </li>
          <li>
            Check the deck, note type and <strong>Expression field</strong> Monosai suggests, select
            <strong>Preview vocabulary</strong>, then <strong>Confirm words</strong>.
          </li>
        </ol>
        <p>
          The <strong>Expression field</strong> is the field that holds the Japanese word, such as
          <span lang="ja">食べる</span>. <strong>Meaning field</strong> is optional.
        </p>
      </section>

      <section aria-labelledby="words-bridge">
        <h2 id="words-bridge">Connect AnkiDroid with Monosai Bridge</h2>
        <p>
          A website can't read AnkiDroid, so Monosai Bridge, a small Android app, reads it for
          Monosai on the same phone. The bridge needs Android 16 or later and AnkiDroid 2.24 or
          later.
        </p>
        <ol>
          <li>Install AnkiDroid, and open your collection once.</li>
          <li>
            Download the bridge from the newest <code>bridge-v</code> release on the
            <a
              href="https://github.com/tobiaslrn/monosai/releases?q=bridge-v"
              target="_blank"
              rel="noopener noreferrer"
              >releases page</a
            >, and install it.
          </li>
          <li>
            Open Monosai Bridge, and allow it to access AnkiDroid. If you declined, select
            <strong>Allow</strong>.
          </li>
          <li>Select <strong>Start</strong>.</li>
          <li>
            In Monosai, open
            <a routerLink="/reading-level" fragment="words">What you can read</a>, select
            <strong>Add source</strong>, then <strong>Connect to Anki</strong>, and confirm the
            suggested deck and fields.
          </li>
        </ol>
        <p>
          Android may warn that the bridge comes from an unknown developer, because it isn't in
          Google Play. AnkiDroid asks to grant read and write access, because Android has no
          read-only option, but the bridge only reads.
        </p>
        <p>
          To keep the bridge running after your phone restarts, turn on
          <strong>Restart after reboot</strong> in the bridge. If Monosai can't find the bridge,
          open it and select <strong>Start</strong>.
        </p>
      </section>

      <section aria-labelledby="words-package">
        <h2 id="words-package">Import an Anki export file</h2>
        <p>This works on every device, and it's the only way on iPhone and iPad.</p>
        <ol>
          <li>
            In Anki, AnkiDroid or AnkiMobile, export your collection or a deck as a package, with
            <strong>Include scheduling information</strong> turned on.
          </li>
          <li>
            In Monosai, open
            <a routerLink="/reading-level" fragment="words">What you can read</a>, select
            <strong>Add source</strong>, then <strong>Import from Anki</strong>, and choose the
            <code>.apkg</code> or <code>.colpkg</code> file.
          </li>
          <li>
            If Monosai asks, choose the deck, note type and field, then select
            <strong>Import</strong>.
          </li>
        </ol>
        <p>
          Monosai reads the file on your device and never uploads it. On Android, you can also share
          the file from AnkiDroid straight to an installed Monosai.
        </p>
      </section>

      <section aria-labelledby="words-list">
        <h2 id="words-list">Add a word list</h2>
        <p>
          Select <strong>Add source</strong>, then <strong>Add a word list</strong>. Give the list a
          name, and put one word on each line, written the way it appears in text, such as
          <span lang="ja">食べる</span>. Don't add readings: anything else on the line becomes part
          of the word.
        </p>
      </section>

      <section aria-labelledby="words-known">
        <h2 id="words-known">What counts as a known word</h2>
        <p>
          From Anki, a word counts once you've reviewed one of its cards at least once, unless the
          card is suspended. Cards you haven't studied yet don't count. Every word in a word list
          counts.
        </p>
        <p>
          Particles, counters and other building blocks of grammar always count as known, as
          <a routerLink="/help/reading-level">Set your reading level</a> explains.
        </p>
      </section>

      <section aria-labelledby="words-current">
        <h2 id="words-current">Keep your words up to date</h2>
        <p>
          A connected Anki source refreshes on its own: when Monosai opens, every few minutes while
          you use it, and when you come back to it. Anki must be open, or the bridge running, at the
          time.
        </p>
        <p>
          To change this, open the source in
          <a routerLink="/reading-level" fragment="words">What you can read</a>:
        </p>
        <ul>
          <li><strong>Refresh now</strong> reads Anki again straight away.</li>
          <li><strong>Refresh automatically</strong> turns automatic refreshing on or off.</li>
          <li>
            <strong>Replace file</strong> updates an export file. Export a new file from Anki first.
          </li>
          <li><strong>Edit list</strong> changes a word list.</li>
          <li><strong>Count these words</strong> pauses a source without removing it.</li>
          <li><strong>Remove source</strong> deletes it.</li>
        </ul>
      </section>
    </mn-help-article>
  `,
})
export class YourWordsPageComponent {
  /** The address AnkiConnect must allow: whichever one this copy of Monosai is served from. */
  protected readonly origin = inject(DOCUMENT).location.origin;
}
