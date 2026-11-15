import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PRESET_VOCABULARY_EXPECTATION } from '../../../application/generation/generation-prerequisites';
import { formatCount } from '../../../domain/shared/locale';
import { HelpArticleComponent } from '../help-article.component';

/**
 * Each 〜 below is followed by an invisible word joiner (U+2060), so a line never breaks
 * between the mark and the form it belongs to.
 */
@Component({
  selector: 'mn-help-reading-level',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="reading-level">
      <p mn-lead>
        Your reading level decides which grammar your stories use, so choose one you can read with
        ease.
      </p>

      <section aria-labelledby="level-choose">
        <h2 id="level-choose">Change your reading level</h2>
        <ol>
          <li>Open <a routerLink="/reading-level" fragment="grammar">Words and grammar</a>.</li>
          <li>Under <strong>Grammar</strong>, select <strong>Reading level</strong>.</li>
          <li>Choose the highest level you can read without effort.</li>
          <li>Select <strong>Save level</strong>.</li>
        </ol>
        <p>
          Nothing changes until you select <strong>Save level</strong>. Every new learner starts at
          Starter forms, the easiest level.
        </p>
      </section>

      <section aria-labelledby="level-levels">
        <h2 id="level-levels">How the levels compare</h2>
        <p>
          Each level adds to the one before it and roughly matches a level of the Japanese-Language
          Proficiency Test (JLPT), which runs from N5, the easiest, to N1.
        </p>
        <ul>
          <li>
            <strong>Starter forms</strong>, below N5, use single short sentences with
            <span lang="ja">です</span> and <span lang="ja">ます</span>, the basic particles, and
            <span lang="ja">あります</span> and <span lang="ja">います</span>.
          </li>
          <li>
            <strong>Basic forms</strong>, about N5, add past forms, plain negatives and the て-form,
            which links verbs. Short sentences can join two ideas with
            <span lang="ja">〜⁠から</span> or <span lang="ja">〜⁠とき</span>.
          </li>
          <li>
            <strong>Everyday forms</strong>, about N4, add conditionals such as
            <span lang="ja">〜⁠たら</span> and <span lang="ja">〜⁠ば</span>, potential and
            volitional forms, giving and receiving, and short describing clauses.
          </li>
          <li>
            <strong>Explanatory forms</strong>, about N3, add longer sentences that explain, compare
            and reason, with forms such as <span lang="ja">〜⁠わけだ</span> and
            <span lang="ja">〜⁠によって</span>.
          </li>
          <li>
            <strong>Formal patterns</strong>, about N2, add written and formal style, with forms
            such as <span lang="ja">〜⁠において</span> and <span lang="ja">〜⁠にもかかわらず</span>.
          </li>
          <li>
            <strong>Literary patterns</strong>, about N1, have no limit: literary and idiomatic
            writing is allowed.
          </li>
        </ul>
      </section>

      <section aria-labelledby="level-words">
        <h2 id="level-words">How many words you need</h2>
        <p>
          Harder grammar needs more words to build sentences with. Each level usually needs about
          this many known words. If you have fewer, <strong>Write with AI</strong> warns you, but
          you can still write.
        </p>
        <ul>
          @for (level of levels; track level.name) {
            <li>{{ level.name }} need about {{ level.words }} words.</li>
          }
        </ul>
      </section>

      <section aria-labelledby="level-always">
        <h2 id="level-always">Words that always count as known</h2>
        <p>
          Some forms appear in almost every sentence: particles, counters, punctuation, the copula
          and common endings. Monosai always counts them as known, so they're never underlined as
          new words and don't need to be in your Anki collection. To see them all, open
          <a routerLink="/reading-level" fragment="forms">Words and grammar > Always-known forms</a
          >.
        </p>
      </section>

      <section aria-labelledby="level-change">
        <h2 id="level-change">After you change your level</h2>
        <p>
          New stories use the new level straight away. Grammar notes you already have were made for
          the old level, so their blue underlines may be out of date. To update a sentence, open its
          details, as <a routerLink="/help/reading">Read a story</a> describes, and select
          <strong>Grammar again</strong>.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class ReadingLevelHelpPageComponent {
  protected readonly levels = [
    { name: 'Starter forms', words: PRESET_VOCABULARY_EXPECTATION['mn-preset-starter'] },
    { name: 'Basic forms', words: PRESET_VOCABULARY_EXPECTATION['mn-preset-basic'] },
    { name: 'Everyday forms', words: PRESET_VOCABULARY_EXPECTATION['mn-preset-everyday'] },
    { name: 'Explanatory forms', words: PRESET_VOCABULARY_EXPECTATION['mn-preset-explanatory'] },
    { name: 'Formal patterns', words: PRESET_VOCABULARY_EXPECTATION['mn-preset-formal'] },
    { name: 'Literary patterns', words: PRESET_VOCABULARY_EXPECTATION['mn-preset-literary'] },
  ].map((level) => ({ name: level.name, words: formatCount(level.words) }));
}
