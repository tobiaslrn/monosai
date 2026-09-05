import path from 'node:path';

const AUTH_DIRECTORY = path.join(process.cwd(), 'playwright', '.auth');

export const TEXT_MODEL_READY_STATE = path.join(AUTH_DIRECTORY, 'text-model-ready.json');
export const TTS_READY_STATE = path.join(AUTH_DIRECTORY, 'tts-ready.json');
export const GENERATION_READY_STATE = path.join(AUTH_DIRECTORY, 'generation-ready.json');
export const INTRO_SEEN_STATE = path.join(AUTH_DIRECTORY, 'intro-seen.json');
