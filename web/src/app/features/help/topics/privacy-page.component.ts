import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-privacy',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, NoticeComponent, HelpArticleComponent],
  template: `
    <mn-help-article slug="privacy">
      <p mn-lead>
        Monosai keeps everything in this browser on this device. Only the AI features send anything
        elsewhere, and only to OpenRouter.
      </p>

      <section aria-labelledby="privacy-where">
        <h2 id="privacy-where">Where your data is stored</h2>
        <p>
          Your stories, words, settings, audio and OpenRouter key are stored in this browser.
          There's no Monosai account, no server and no sync, so another browser or device doesn't
          see them. Monosai collects no analytics.
        </p>
      </section>

      <section aria-labelledby="privacy-keep">
        <h2 id="privacy-keep">Keep your data safe</h2>
        <mn-notice tone="warning" icon="warning">
          <p>
            Clearing this site's data in your browser deletes your stories, words and settings, and
            there's no backup to restore them from.
          </p>
        </mn-notice>
        <p>
          When a device runs low on space, the browser may clear site data on its own. To ask the
          browser to keep Monosai's data, in <a routerLink="/settings">Settings</a>, under
          <strong>Storage</strong>, select <strong>Protect storage</strong>. If the row says
          <strong>Storage protection</strong> instead, it shows what the browser decided.
        </p>
        <p>
          On iPhone and iPad, Safari may delete a website's data after a week in which you don't
          open it. Add Monosai to your Home Screen, as
          <a routerLink="/help/install">Install and use offline</a> describes, to keep your data.
        </p>
      </section>

      <section aria-labelledby="privacy-key">
        <h2 id="privacy-key">Your OpenRouter key</h2>
        <p>
          Monosai sends your key only to OpenRouter. It stores the key in this browser without
          encryption, so use Monosai on a device and browser profile you trust.
        </p>
        <p>
          On <code>openrouter.ai</code>, you can give the key a credit limit, which caps what it can
          ever spend. To remove the key from Monosai, open <a routerLink="/settings">Settings</a>,
          select <strong>OpenRouter key</strong>, then select <strong>Delete key</strong> and
          confirm.
        </p>
      </section>

      <section aria-labelledby="privacy-sent">
        <h2 id="privacy-sent">What is sent to OpenRouter</h2>
        <p>
          Monosai contacts OpenRouter only when you use an AI feature, test a model or browse the
          list of models. Each request contains only what that task needs:
        </p>
        <ul>
          <li>
            <strong>Writing a story</strong> sends your known words, your reading level, the
            direction, plot, instructions and exceptions you chose, and the titles and plots of
            earlier stories.
          </li>
          <li>
            <strong>Translations and grammar notes</strong> send the sentences concerned, with the
            story's title and nearby sentences for context. This includes text you pasted.
          </li>
          <li>
            <strong>Audio</strong> sends each sentence with your voice, pace and speaking style.
          </li>
          <li><strong>Model tests</strong> send a short, fixed test text.</li>
        </ul>
        <p>
          OpenRouter passes each request on to the company that runs the model, and their privacy
          policies apply. Looking up words and reading are never sent anywhere.
        </p>
      </section>

      <section aria-labelledby="privacy-delete">
        <h2 id="privacy-delete">Delete your data</h2>
        <ul>
          <li>
            To delete one story, open its menu in the Library and select <strong>Delete</strong>.
          </li>
          <li>
            To free space, in <a routerLink="/settings">Settings</a>, under
            <strong>Storage</strong>, select <strong>Delete saved audio</strong>.
          </li>
          <li>
            To remove everything, select <strong>Delete all data</strong> in the same place. Monosai
            asks twice, deletes your stories, words, settings, key and audio, and then reloads. This
            also deletes the downloaded dictionary, so Monosai needs a connection the next time it
            opens.
          </li>
        </ul>
        <p>Deleting can't be undone.</p>
      </section>
    </mn-help-article>
  `,
})
export class PrivacyPageComponent {}
