import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CardComponent } from '../../../shared-ui/card/card.component';
import { FactsComponent } from '../../../shared-ui/facts/facts.component';
import { StackComponent } from '../../../shared-ui/layout/layout';
import { NoticeComponent } from '../../../shared-ui/notice/notice.component';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-voice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    RouterLink,
    CardComponent,
    FactsComponent,
    HelpArticleComponent,
    NoticeComponent,
    StackComponent,
  ],
  template: `
    <mn-help-article slug="voice">
      <section aria-labelledby="voice-kinds">
        <h2 id="voice-kinds">Two kinds of speech model</h2>
        <p>
          Instruction models read in context and follow your speaking style; close to a native
          speaker. Speak-only models are fast and almost free, but flatter and misread some words.
        </p>
      </section>

      <section aria-labelledby="voice-pick">
        <h2 id="voice-pick">What to use</h2>
        <mn-stack [gap]="4">
          <mn-card heading="Kokoro 82M">
            <p><code>hexgrad/kokoro-82m</code></p>
            <mn-facts
              [facts]="[
                { label: 'Price', value: '$0.62/M characters' },
                { label: 'A 50-sentence story', value: 'Well under a cent' },
              ]"
            />
            <p>Cheap enough that cost never comes up. Misreads some words.</p>
          </mn-card>
          <mn-card heading="Gemini 3.1 Flash TTS Preview">
            <p><code>google/gemini-3.1-flash-tts-preview</code></p>
            <mn-facts
              [facts]="[
                { label: 'Price', value: '$1/M text tokens in, $20/M audio tokens out' },
                { label: 'A 50-sentence story', value: 'Around 20 cents' },
              ]"
            />
            <p>
              Natural pauses and intonation, reads kanji by sentence. A few dollars a month of daily
              use.
            </p>
          </mn-card>
        </mn-stack>
        <p mn-checked>Prices and names checked on Sep 17, 2026.</p>
      </section>

      <section aria-labelledby="voice-settings">
        <h2 id="voice-settings">Voice, pace, and style</h2>
        <p>
          Voice, pace and style are in <a routerLink="/settings/voice">Settings</a>. Audio needs a
          successful Preview first; Preview plays one test sentence.
        </p>
        <mn-notice tone="warning" icon="warning">
          <p>Preview before preparing a long story (<code>ai/audio-invalid</code>).</p>
        </mn-notice>
        <p>
          Playback speed is free. Changing voice settings keeps existing clips; regenerate from
          Story options. Audio is cached, so replays are free and offline.
        </p>
      </section>

      <section aria-labelledby="voice-readings">
        <h2 id="voice-readings">When a word is read wrong</h2>
        <p>
          Small models read each word from a fixed dictionary, so <span lang="ja">私</span> is
          always <span lang="ja">わたくし</span>. Do not learn readings from audio alone: tap the
          word. Instruction models read the sentence correctly.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class VoicePageComponent {}
