import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-reading-level',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="reading-level">
      <p mn-lead>
        Your reading level tells Monosai which grammar your stories may use. Start low: a story you
        can read with ease teaches you more than one you have to puzzle out.
      </p>

      <section aria-labelledby="level-choose">
        <h2 id="level-choose">Choose your level</h2>
        <ol>
          <li>
            Open <a routerLink="/reading-level" fragment="grammar">What you can read</a>, and under
            <strong>Grammar</strong>, select <strong>Reading level</strong>.
          </li>
          <li>Choose the highest level you can read without effort.</li>
          <li>Select <strong>Save level</strong>.</li>
        </ol>
        <p>
          Nothing changes until you select <strong>Save level</strong>. Every new learner starts at
          Starter forms, the easiest level.
        </p>
      </section>

      <section aria-labelledby="level-levels">
        <h2 id="level-levels">The levels</h2>
        <p>
          Each level adds to the one before it and roughly matches a level of the Japanese-Language
          Proficiency Test (JLPT), which runs from N5, the easiest, to N1.
        </p>
        <ul>
          <li>
            <strong>Starter forms</strong>, below N5. Single short sentences with
            <span lang="ja">です</span> and <span lang="ja">ます</span>, the basic particles, and
            <span lang="ja">あります</span> and <span lang="ja">います</span>.
          </li>
          <li>
            <strong>Basic forms</strong>, about N5. Past and negative forms, the て-form, and short
            sentences that join two ideas with <span lang="ja">〜から</span> or
            <span lang="ja">〜とき</span>.
          </li>
          <li>
            <strong>Everyday forms</strong>, about N4. Conditionals such as
            <span lang="ja">〜たら</span> and <span lang="ja">〜ば</span>, potential and volitional
            forms, giving and receiving, and short describing clauses.
          </li>
          <li>
            <strong>Explanatory forms</strong>, about N3. Longer sentences that explain, compare and
            reason, with forms such as <span lang="ja">〜わけだ</span> and
            <span lang="ja">〜によって</span>.
          </li>
          <li>
            <strong>Formal patterns</strong>, about N2. Written and formal style, with forms such as
            <span lang="ja">〜において</span> and <span lang="ja">〜にもかかわらず</span>.
          </li>
          <li>
            <strong>Literary patterns</strong>, about N1. No limit: literary and idiomatic writing
            is allowed.
          </li>
        </ul>
      </section>

      <section aria-labelledby="level-words">
        <h2 id="level-words">How many words each level needs</h2>
        <p>
          Harder grammar needs more words to build sentences with. If you know fewer words than your
          level usually needs, <strong>Write with AI</strong> warns you, but you can still write:
        </p>
        <ul>
          <li>Starter forms: 50 words</li>
          <li>Basic forms: 150 words</li>
          <li>Everyday forms: 400 words</li>
          <li>Explanatory forms: 700 words</li>
          <li>Formal patterns: 1,000 words</li>
          <li>Literary patterns: 1,400 words</li>
        </ul>
      </section>

      <section aria-labelledby="level-always">
        <h2 id="level-always">Always-known forms</h2>
        <p>
          Some forms appear in almost every sentence: particles, counters, punctuation, the copula
          and common endings. Monosai always counts them as known, so they're never underlined as
          new words and don't need to be in your Anki collection. To see them all, open
          <strong>Always-known forms</strong> under <strong>Grammar</strong>.
        </p>
      </section>

      <section aria-labelledby="level-change">
        <h2 id="level-change">After you change your level</h2>
        <p>
          New stories use the new level straight away. Grammar notes you already have were made for
          the old level, so their blue underlines may be out of date. To update a sentence, open it
          and select <strong>Grammar again</strong>.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class ReadingLevelHelpPageComponent {}
