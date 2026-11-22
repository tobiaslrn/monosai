import path from 'node:path';

/** Where the setup leaves a browser that has answered the first-use notices. */
export const VISUAL_STATE = path.join(
  process.cwd(),
  'playwright',
  '.auth',
  'visual-first-use.json',
);
