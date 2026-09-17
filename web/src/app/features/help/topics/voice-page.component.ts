import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpArticleComponent } from '../help-article.component';

@Component({
  selector: 'mn-help-voice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpArticleComponent],
  template: `
    <mn-help-article slug="voice">
      <p class="mn-prose__lead">
        Audio is the one optional feature where the two sensible choices are nowhere near each other
        in price, so it is worth knowing what you are picking between.
      </p>

      <section aria-labelledby="voice-kinds">
        <h2 id="voice-kinds">Two kinds of speech model</h2>
        <p>
          Speech models on OpenRouter fall into two groups, and they are not competing at the same
          thing.
        </p>
        <h3>Models that take instructions</h3>
        <p>
          These are large language models that happen to output audio. They read a sentence in
          context, so they put the stress in the right place, pause where a comma asks them to, and
          match the tone to what is happening. They also act on the speaking style you choose in
          Settings. On Japanese the result is close to a native speaker reading aloud.
        </p>
        <h3>Models that only speak</h3>
        <p>
          Small, dedicated text-to-speech models. They pronounce the words correctly and that is
          all: the intonation is flat in places, a name may be read oddly, and a speaking style is
          not something they understand. They are fast and they cost almost nothing.
        </p>
      </section>

      <section aria-labelledby="voice-pick">
        <h2 id="voice-pick">What to use</h2>
        <div class="mn-prose__options">
          <div class="mn-card">
            <h3>Gemini 3.1 Flash TTS Preview</h3>
            <p class="mn-prose__id"><code>google/gemini-3.1-flash-tts-preview</code></p>
            <dl class="mn-facts">
              <div>
                <dt>Price</dt>
                <dd>$1/M text tokens in, $20/M audio tokens out</dd>
              </div>
              <div>
                <dt>A 50-sentence story</dt>
                <dd>Around 20 cents</dd>
              </div>
            </dl>
            <p>
              Pauses, intonation, and a speaking style it acts on. Expensive enough that a daily
              habit shows up on your statement.
            </p>
          </div>
          <div class="mn-card">
            <h3>Kokoro 82M</h3>
            <p class="mn-prose__id"><code>hexgrad/kokoro-82m</code></p>
            <dl class="mn-facts">
              <div>
                <dt>Price</dt>
                <dd>$0.62/M characters</dd>
              </div>
              <div>
                <dt>A 50-sentence story</dt>
                <dd>Well under a cent</dd>
              </div>
            </dl>
            <p>
              Plainer and less clever, and cheap enough that the cost never comes up. Good enough to
              follow along with, which is most of the value.
            </p>
          </div>
        </div>
        <p>
          Pick by how you plan to use it. If audio is the point of your reading session, pay for the
          instruction model. If it is a companion to the text, the small model costs so little that
          you can generate audio for every story without thinking about it.
        </p>
        <p class="mn-prose__checked">Prices and names checked on Sep 17, 2026.</p>
      </section>

      <section aria-labelledby="voice-settings">
        <h2 id="voice-settings">Voice, pace, and style</h2>
        <p>
          Voice settings live under AI in <a routerLink="/settings">Settings</a>. Where OpenRouter
          advertises a model's voices, Monosai offers them as a list instead of asking you to type
          an ID. Pace is a named choice, Natural, Slow, or Very slow. Speaking style is a choice of
          Natural, Clear, or Very clear, and it is sent only to models that act on instructions.
        </p>
        <p>
          Press Preview and listen before preparing audio for a long story. Preview plays one test
          sentence, and audio can only be generated once it has passed. A speech model can return a
          clip that is empty or undecodable, reported as <code>ai/audio-invalid</code>, and you
          would rather find that out on one sentence.
        </p>
        <p>
          Reading speed during playback is adjusted on your device, with the pitch preserved, so
          slowing a story down costs nothing and needs no new request.
        </p>
        <p>
          Changing the model, the voice, or the style does not silence what you have already paid
          for. Those clips keep playing and the player prints one line, "Some audio is from older
          settings", until you regenerate the story's audio from Story options.
        </p>
      </section>

      <section aria-labelledby="voice-local">
        <h2 id="voice-local">Why there is no on-device speech</h2>
        <p>
          A small speech model could run in the browser and cost nothing at all. It was considered
          and dropped, because the cheap hosted model is already under a cent per story. Shipping a
          model into the app to save that is a large amount of complexity for a saving nobody would
          notice on their statement.
        </p>
        <p>
          Audio is cached on your device once generated, so replaying a story is free and works
          offline either way.
        </p>
      </section>
    </mn-help-article>
  `,
})
export class VoicePageComponent {}
