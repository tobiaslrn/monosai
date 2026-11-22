import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { ExampleComponent } from '../../../shared-ui/example/example.component';
import { PageComponent } from '../../../shared-ui/layout/layout';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { PageHeaderComponent } from '../../../shared-ui/page-header/page-header.component';
import { ProseComponent } from '../../../shared-ui/prose/prose.component';

/** Help's column of prose, and the sample sentence that shows what a choice reads like. */
@Component({
  selector: 'mn-gallery-prose',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CardComponent,
    ExampleComponent,
    NoticeComponent,
    PageComponent,
    PageHeaderComponent,
    ProseComponent,
    RouterLink,
  ],
  template: `
    <mn-page>
      <mn-page-header heading="Prose" backTo="/gallery" backLabel="Back to gallery" />

      <mn-prose [measure]="true">
        <p mn-lead>
          Monosai writes short stories from the words you already know. This page shows how Help
          sets its text.
        </p>
        <section>
          <h2>Add your words</h2>
          <p>
            You can add words from Anki or type your own list. Open
            <a routerLink="/gallery">Words</a> and press <strong>Add words</strong>.
          </p>
          <ol>
            <li>Open <strong>Words</strong>.</li>
            <li>Press <strong>Add words</strong>.</li>
            <li>Choose where your words come from.</li>
          </ol>
          <mn-notice tone="info">
            <p>OpenRouter bills your account per request.</p>
          </mn-notice>
        </section>
        <section>
          <h2>How the levels compare</h2>
          <ul>
            <li>Starter keeps to short sentences.</li>
            <li>Plain adds everyday grammar.</li>
            <li>Rich uses longer sentences and more forms.</li>
          </ul>
          <h3>If a word is missing</h3>
          <p>Refresh your words. A new card in Anki shows up after the next refresh.</p>
        </section>
        <p mn-checked>Checked in November 2026</p>
      </mn-prose>

      <mn-card heading="Example">
        <mn-example ja="猫が好きです。" en="I like cats." />
      </mn-card>
    </mn-page>
  `,
})
export class GalleryProseComponent {}
