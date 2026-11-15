import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-your-words',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="your-words">
      <p mn-lead>
        Monosai writes stories from the words you already know. Tell it which ones by adding a word
        source: your Anki collection, an Anki package or a list of words.
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
            app, or import an Anki package.
          </li>
          <li>
            <strong>AnkiMobile on iPhone or iPad.</strong> Import an Anki package. A live connection
            to Anki isn't available on iPhone and iPad.
          </li>
          <li><strong>No Anki.</strong> Type or paste a list of words.</li>
        </ul>
        <p>
          You can add more than one source, and Monosai combines them. Monosai only reads from Anki:
          it never changes your cards or your collection.
        </p>
      </section>

      <section aria-labelledby="words-desktop">
        <h2 id="words-desktop">Connect Anki on a computer</h2>
        <p>
          You need the Anki desktop app, open on the same computer as your browser. First, install
          AnkiConnect and allow Monosai to use it. You only do this once.
        </p>
        <ol>
          <li>
            In Anki, choose <strong>Tools</strong> > <strong>Add-ons</strong> >
            <strong>Get Add-ons</strong>.
          </li>
          <li>Enter the code <code>2055492159</code>, then restart Anki.</li>
          <li>
            Choose <strong>Tools</strong> > <strong>Add-ons</strong>, select AnkiConnect, then
            select <strong>Config</strong>.
          </li>
          <li>
            Change the <code>webCorsOriginList</code> line so it reads
            <code>"webCorsOriginList": ["http://localhost", "{{ origin }}"]</code>.
          </li>
          <li>Save the change, then restart Anki.</li>
        </ol>
        <p>Then, in Monosai:</p>
        <ol>
          <li>
            Open <a routerLink="/reading-level" fragment="words">Words and grammar</a> and select
            <strong>Add source</strong>.
          </li>
          <li>Select <strong>Connect to Anki</strong>.</li>
          <li>
            Check the deck, note type and <strong>Expression field</strong> that Monosai suggests,
            and the sample words below them.
          </li>
          <li>Select <strong>Confirm words</strong>.</li>
        </ol>
        <p>
          The <strong>Expression field</strong> is the field that holds the Japanese word, such as
          <span lang="ja">食べる</span>. The <strong>Meaning field</strong> is optional. If you
          change a field, or Monosai can't suggest one, select <strong>Preview vocabulary</strong>
          before you confirm.
        </p>
        <p>
          A connection reads only the deck you chose. If your words are in its subdecks, open the
          source and turn on <strong>Include the subdecks</strong>.
        </p>
      </section>

      <section aria-labelledby="words-bridge">
        <h2 id="words-bridge">Connect AnkiDroid with Monosai Bridge</h2>
        <p>
          A website can't read AnkiDroid, so Monosai Bridge, a small Android app, reads it for
          Monosai on the same phone. You need Android 16 or later, AnkiDroid 2.24 or later and
          Monosai open in Chrome.
        </p>
        <ol>
          <li>Install AnkiDroid and open your collection once.</li>
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
            Open Monosai Bridge and let it access AnkiDroid. If you declined, select
            <strong>Allow</strong>.
          </li>
          <li>Select <strong>Start</strong>.</li>
          <li>
            In Monosai, open
            <a routerLink="/reading-level" fragment="words">Words and grammar</a> and select
            <strong>Add source</strong>.
          </li>
          <li>
            Select <strong>Connect to Anki</strong>, check the suggested deck and fields, then
            select <strong>Confirm words</strong>.
          </li>
        </ol>
        <p>
          Android may warn that the bridge comes from an unknown developer, because it isn't in
          Google Play. Android also asks whether the bridge may read and write AnkiDroid, because
          AnkiDroid has no read-only permission. The bridge only reads.
        </p>
        <p>
          <strong>Restart after reboot</strong> is on at first, so the bridge starts again when your
          phone restarts. If Monosai can't find the bridge, open it and select
          <strong>Start</strong>.
        </p>
      </section>

      <section aria-labelledby="words-package">
        <h2 id="words-package">Import an Anki package</h2>
        <p>An Anki package is an export of your collection or a deck. It works on every device.</p>
        <ol>
          <li>
            Export your collection or a deck from Anki, with
            <strong>Include scheduling information</strong> turned on. In Anki on a computer, choose
            <strong>File</strong> > <strong>Export</strong>; in AnkiDroid and AnkiMobile, use the
            app's export option.
          </li>
          <li>
            In Monosai, open
            <a routerLink="/reading-level" fragment="words">Words and grammar</a> and select
            <strong>Add source</strong>.
          </li>
          <li>
            Select <strong>Import from Anki</strong>, and choose the <code>.apkg</code> or
            <code>.colpkg</code> file.
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
        <ol>
          <li>
            Open <a routerLink="/reading-level" fragment="words">Words and grammar</a> and select
            <strong>Add source</strong>.
          </li>
          <li>Select <strong>Add a word list</strong>.</li>
          <li>In <strong>List name</strong>, give the list a name.</li>
          <li>
            In <strong>Words</strong>, put one word on each line, written the way it appears in
            text, such as <span lang="ja">食べる</span>.
          </li>
          <li>Select <strong>Add source</strong>.</li>
        </ol>
        <p>Don't add readings or meanings. Anything else on a line becomes part of the word.</p>
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
          <a routerLink="/help/reading-level">Reading level</a> explains.
        </p>
      </section>

      <section aria-labelledby="words-current">
        <h2 id="words-current">Keep your words up to date</h2>
        <p>
          A connected Anki source refreshes on its own: when Monosai opens, every few minutes while
          you use it, and when you come back to it. Anki must be open, or the bridge running, at the
          time. An Anki package doesn't change on its own.
        </p>
        <p>
          To manage a source, open it in
          <a routerLink="/reading-level" fragment="words">Words and grammar</a>:
        </p>
        <ul>
          <li><strong>Refresh now</strong> reads Anki again straight away.</li>
          <li><strong>Refresh automatically</strong> turns automatic refreshing on or off.</li>
          <li>
            <strong>Replace file</strong> loads a newer Anki package. Export a new one from Anki
            first.
          </li>
          <li><strong>Edit list</strong> changes a word list.</li>
          <li>
            Turning off <strong>Count these words</strong> leaves a source out without removing it.
          </li>
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
