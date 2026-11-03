/// <reference lib="webworker" />
import { SpeechEncoderHost } from './speech-encoder-host';
import type { WebCodecsAudio } from './opus-encoding';

/**
 * Speech encoder worker entry point.
 *
 * It only wires browser globals into `SpeechEncoderHost`; all behaviour lives
 * in the host so it can be tested without a Worker. Compression runs here
 * rather than on the main thread because a clip takes long enough to be seen
 * as a dropped frame while a reading is being played.
 */
const scope = self as unknown as DedicatedWorkerGlobalScope;

const host = new SpeechEncoderHost({
  post: (message, transfer) => {
    scope.postMessage(message, transfer === undefined ? [] : [...transfer]);
  },
  codecs: (): WebCodecsAudio | null => {
    const globals = scope as unknown as {
      AudioEncoder?: typeof AudioEncoder;
      AudioData?: typeof AudioData;
    };
    if (globals.AudioEncoder === undefined || globals.AudioData === undefined) {
      return null;
    }
    return { AudioEncoder: globals.AudioEncoder, AudioData: globals.AudioData };
  },
});

scope.addEventListener('message', (event: MessageEvent<unknown>) => {
  void host.handleMessage(event.data);
});
