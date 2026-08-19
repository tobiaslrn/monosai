import { fieldValueOf, type FixtureCollection, type FixtureNote } from './anki-collection';

/** Actions the fake refuses to answer, so unsupported-action can be exercised. */
export interface FakeServerOptions {
  readonly unsupportedActions?: readonly string[];
  readonly failingActions?: readonly string[];
  readonly malformedActions?: readonly string[];
  readonly permission?: 'granted' | 'denied';
  readonly requireApiKey?: boolean;
  readonly version?: number;
  /** Throws like a browser reporting a refused, blocked, or rejected request. */
  readonly transportFailure?: boolean;
  readonly delayMs?: number;
}

interface ServerCard {
  readonly cardId: number;
  readonly note: number;
  readonly reps: number;
  readonly deckName: string;
  readonly noteTypeName: string;
}

/**
 * A deterministic stand-in for a local AnkiConnect endpoint.
 *
 * It answers the same eight actions the real add-on does, over the same
 * `{result, error}` envelope, so the adapters under test run their real request
 * and parsing paths. Its search implementation is intentionally literal about
 * Anki's semantics — `deck:` includes subdecks and is narrowed by subtracting
 * `deck::*` — because that is the behaviour the adapter's query is written
 * against.
 */
export class FakeAnkiConnectServer {
  readonly requests: { action: string; params: Record<string, unknown> }[] = [];

  private readonly cards: readonly ServerCard[];

  constructor(
    private readonly collection: FixtureCollection,
    private readonly options: FakeServerOptions = {},
  ) {
    const cards: ServerCard[] = [];
    let cardId = 1;
    let noteId = 1;
    for (const note of collection.notes) {
      const currentNote = noteId++;
      for (const card of note.cards) {
        cards.push({
          cardId: cardId++,
          note: currentNote,
          reps: card.reps,
          deckName: card.deckName,
          noteTypeName: note.noteTypeName,
        });
      }
    }
    this.cards = cards;
  }

  /** Note ids are assigned in declaration order, mirroring `noteId` above. */
  private noteAt(noteId: number): FixtureNote | undefined {
    return this.collection.notes[noteId - 1];
  }

  /** A `fetch` implementation the client can be constructed with. */
  readonly fetch: typeof fetch = async (_input, init) => {
    if (this.options.transportFailure === true) {
      throw new TypeError('Failed to fetch');
    }
    // A real `fetch` rejects as soon as its signal aborts, and the client's
    // timeout and cancellation both depend on that, so the delay has to be
    // abortable rather than a plain sleep.
    if (this.options.delayMs !== undefined) {
      await new Promise<void>((resolve, reject) => {
        const signal = init?.signal ?? null;
        const timer = setTimeout(resolve, this.options.delayMs);
        signal?.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            // A real `fetch` rejects with the signal's own reason.
            const reason: unknown = signal.reason;
            reject(reason instanceof Error ? reason : new DOMException('aborted', 'AbortError'));
          },
          { once: true },
        );
      });
    }

    const body = typeof init?.body === 'string' ? init.body : '{}';
    const parsed = JSON.parse(body) as { action?: string; params?: Record<string, unknown> };
    const action = parsed.action ?? '';
    const params = parsed.params ?? {};
    this.requests.push({ action, params });

    if (this.options.malformedActions?.includes(action) === true) {
      return new Response('not json at all', { status: 200 });
    }
    if (this.options.unsupportedActions?.includes(action) === true) {
      return this.envelope(null, 'unsupported action');
    }
    if (this.options.failingActions?.includes(action) === true) {
      return this.envelope(null, 'collection is not open');
    }

    return this.envelope(this.answer(action, params), null);
  };

  private envelope(result: unknown, error: string | null): Response {
    return new Response(JSON.stringify({ result, error }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  private answer(action: string, params: Record<string, unknown>): unknown {
    switch (action) {
      case 'version':
        return this.options.version ?? 6;
      case 'requestPermission':
        return {
          permission: this.options.permission ?? 'granted',
          requireApiKey: this.options.requireApiKey ?? false,
          version: this.options.version ?? 6,
        };
      case 'deckNames':
        return [...this.collection.deckNames];
      case 'modelNames':
        return this.collection.noteTypes.map((noteType) => noteType.name);
      case 'modelFieldNames': {
        const name = typeof params['modelName'] === 'string' ? params['modelName'] : '';
        const noteType = this.collection.noteTypes.find((type) => type.name === name);
        return noteType === undefined ? [] : [...noteType.fieldNames];
      }
      case 'findCards':
        return this.findCards(typeof params['query'] === 'string' ? params['query'] : '');
      case 'cardsInfo': {
        const ids = new Set((params['cards'] as number[] | undefined) ?? []);
        return this.cards
          .filter((card) => ids.has(card.cardId))
          .map(({ cardId, note, reps, deckName }) => ({ cardId, note, reps, deckName }));
      }
      case 'notesInfo': {
        const ids = (params['notes'] as number[] | undefined) ?? [];
        return ids.flatMap((id) => {
          const note = this.noteAt(id);
          if (note === undefined) {
            return [];
          }
          const noteType = this.collection.noteTypes.find(
            (type) => type.name === note.noteTypeName,
          );
          const fields: Record<string, { value: string; order: number }> = {};
          noteType?.fieldNames.forEach((fieldName, order) => {
            fields[fieldName] = {
              value: fieldValueOf(this.collection, note, fieldName) ?? '',
              order,
            };
          });
          return [{ noteId: id, modelName: note.noteTypeName, fields }];
        });
      }
      default:
        return null;
    }
  }

  /**
   * Anki's search, reduced to what the adapter's queries use.
   *
   * `deck:X` matches X and its descendants; a leading `-` negates a term; and
   * `note:Y` matches the note type. Terms combine with AND.
   */
  private findCards(query: string): number[] {
    const terms = [...query.matchAll(/(-?)"([^"]*)"/gu)].map((match) => ({
      negated: match[1] === '-',
      term: match[2],
    }));

    return this.cards
      .filter((card) =>
        terms.every(({ negated, term }) => {
          const matched = this.matchesTerm(card, term);
          return negated ? !matched : matched;
        }),
      )
      .map((card) => card.cardId);
  }

  private matchesTerm(card: ServerCard, term: string): boolean {
    if (term.startsWith('deck:')) {
      const value = term.slice('deck:'.length);
      if (value.endsWith('::*')) {
        return card.deckName.startsWith(value.slice(0, -1));
      }
      return card.deckName === value || card.deckName.startsWith(`${value}::`);
    }
    if (term.startsWith('note:')) {
      return card.noteTypeName === term.slice('note:'.length);
    }
    return false;
  }
}
