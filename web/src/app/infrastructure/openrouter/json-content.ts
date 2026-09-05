/**
 * Recovers the JSON object from a model's message content.
 *
 * Models that are asked for JSON routinely wrap it in a fenced code block or
 * add a sentence of commentary. Accepting those is not leniency about the
 * contract — the value is still validated against the schema afterwards — it
 * only avoids failing a model over packaging it could not be told to omit.
 * Anything that is not a single balanced object still fails.
 */
export function extractJsonObject(content: string): string | null {
  const withoutFences = content
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();

  const start = withoutFences.indexOf('{');
  if (start === -1) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < withoutFences.length; index += 1) {
    const character = withoutFences[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return withoutFences.slice(start, index + 1);
      }
    }
  }
  return null;
}
