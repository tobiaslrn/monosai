import { fieldValueOf, type FixtureCollection, type FixtureNote } from './anki-collection';
import { PROTOCOL_COLLECTION } from './connect-protocol-collection';
import { protocolResult } from './connect-protocol';
import {
  permissionSchema,
  versionSchema,
} from '../app/infrastructure/anki/connect/connect-response.schema';

/** Actions the fake refuses to answer, so unsupported-action can be exercised. */
export interface FakeServerOptions {
  readonly unsupportedActions?: readonly string[];
  /**
   * Actions this endpoint does not implement at all.
   *
   * Distinct from `unsupportedActions`, which models an endpoint that knows the
   * action and declines it: this is how a real endpoint answers a name it has
   * never heard of, naming it back. The Android bridge answers
   * `getReviewsOfCards` this way, because AnkiDroid has no review log.
   */
  readonly unimplementedActions?: readonly string[];
  readonly failingActions?: readonly string[];
  readonly malformedActions?: readonly string[];
  readonly permission?: 'granted' | 'denied';
  readonly requireApiKey?: boolean;
  readonly version?: number;
  /**
   * What this endpoint claims to be.
   *
   * `null` models an AnkiConnect-compatible endpoint that is not the
   * first-party bridge and therefore announces no Monosai contract; the fixture
   * identity is used when nothing is given.
   */
  readonly monosaiBridge?: { readonly version: string; readonly contract: number } | null;
  /** Throws like a browser reporting a refused, blocked, or rejected request. */
  readonly transportFailure?: boolean;
  readonly delayMs?: number;
  /**
   * Search terms this endpoint rejects, as an older or unrelated bridge would.
   *
   * Distinct from an unsupported action: the endpoint knows `findCards` and
   * fails only on the syntax, which is exactly how a refresh discovers that it
   * cannot ask about recent study without losing the vocabulary itself.
   */
  readonly failingSearchTerms?: readonly string[];
  /** Fixed clock for `introduced:` search fixtures. */
  readonly now?: number;
  /**
   * Which endpoint's `cardsInfo` shape to answer with; the bridge's by default.
   *
   * The desktop add-on calls the card type `type` and carries no FSRS
   * difficulty, last answer or home deck, so a desktop test that used the
   * bridge's shape would pass against columns the real add-on never sends.
   */
  readonly cardShape?: 'bridge' | 'desktop';
}

/** Copied from a fixture card, where any optional column may be missing. */
interface ServerCard {
  readonly cardId: number;
  readonly note: number;
  readonly reps: number;
  readonly lapses?: number | undefined;
  readonly factor?: number | undefined;
  readonly queue: number;
  /** Home deck, which is what Anki's `deck:` matches even for a filtered card. */
  readonly deckName: string;
  /** Where the card sits right now, when that is not its home deck. */
  readonly filteredDeckName?: string | undefined;
  readonly noteTypeName: string;
  readonly interval?: number | undefined;
  readonly firstReviewedAt?: number | undefined;
  readonly lastAnsweredDaysAgo?: number | undefined;
  readonly answeredAgain?: boolean | undefined;
  readonly answeredHard?: boolean | undefined;
  readonly cardType?: number | undefined;
  readonly fsrsDifficulty?: number | undefined;
  readonly lastReviewedAt?: number | undefined;
}

/**
 * A deterministic stand-in for a local AnkiConnect endpoint.
 *
 * It answers the same actions the real add-on does, over the same
 * `{result, error}` envelope, so the adapters under test run their real request
 * and parsing paths. Its search implementation is intentionally literal about
 * Anki's semantics — `deck:` includes subdecks and matches both the deck a card
 * sits in and the home deck a filtered deck moved it from — because that is the
 * behaviour the adapter's query is written against.
 */
export class FakeAnkiConnectServer {
  readonly requests: { action: string; params: Record<string, unknown> }[] = [];

  private readonly cards: readonly ServerCard[];
  /** Every deck the collection names or a card sits in, by a stable id. */
  private readonly deckIds = new Map<string, number>();

  constructor(
    private readonly collection: FixtureCollection = PROTOCOL_COLLECTION,
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
          lapses: card.lapses,
          factor: card.factor,
          queue: card.queue ?? (card.suspended === true ? -1 : card.reps > 0 ? 2 : 0),
          deckName: card.deckName,
          filteredDeckName: card.filteredDeckName,
          noteTypeName: note.noteTypeName,
          interval: card.intervalDays,
          firstReviewedAt: card.firstReviewedAt,
          lastAnsweredDaysAgo: card.lastAnsweredDaysAgo,
          answeredAgain: card.answeredAgain,
          answeredHard: card.answeredHard,
          cardType: card.cardType,
          fsrsDifficulty: card.fsrsDifficulty,
          lastReviewedAt: card.lastReviewedAt,
        });
      }
    }
    this.cards = cards;
    const named = [
      ...collection.deckNames,
      ...cards.flatMap((card) => [card.deckName, card.filteredDeckName ?? card.deckName]),
    ];
    for (const name of named) {
      if (!this.deckIds.has(name)) {
        this.deckIds.set(name, 1_000 + this.deckIds.size);
      }
    }
  }

  private deckIdOf(name: string): number {
    return this.deckIds.get(name) ?? 0;
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
      return this.envelope(null, 'query-failed: collection is not open');
    }
    // A search the endpoint cannot parse fails as a query, not as an unknown
    // action: it knows `findCards` perfectly well and refuses only the syntax.
    const query = typeof params['query'] === 'string' ? params['query'] : '';
    if (this.options.failingSearchTerms?.some((term) => query.includes(term)) === true) {
      return this.envelope(null, 'query-failed: invalid search');
    }

    const result =
      this.options.unimplementedActions?.includes(action) === true
        ? undefined
        : this.answer(action, params);
    return result === undefined
      ? this.envelope(null, `unsupported action: ${action}`)
      : this.envelope(result, null);
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
        return this.options.version ?? versionSchema.parse(protocolResult('version'));
      case 'requestPermission': {
        const fixture = permissionSchema.parse(protocolResult('requestPermission'));
        const bridge =
          this.options.monosaiBridge === undefined
            ? fixture.monosaiBridge
            : this.options.monosaiBridge;
        return {
          ...fixture,
          permission: this.options.permission ?? 'granted',
          requireApiKey: this.options.requireApiKey ?? false,
          version: this.options.version ?? 6,
          ...(bridge === null ? { monosaiBridge: undefined } : { monosaiBridge: bridge }),
        };
      }
      case 'deckNames':
        return [...this.collection.deckNames];
      case 'deckNamesAndIds':
        // The desktop add-on's action; the bridge does not implement it.
        return this.options.cardShape === 'desktop'
          ? Object.fromEntries(this.collection.deckNames.map((name) => [name, this.deckIdOf(name)]))
          : undefined;
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
          .map((card) => ({
            cardId: card.cardId,
            note: card.note,
            reps: card.reps,
            ...(card.lapses === undefined ? {} : { lapses: card.lapses }),
            ...(card.factor === undefined ? {} : { factor: card.factor }),
            ...(card.interval === undefined ? {} : { interval: card.interval }),
            ...this.endpointColumns(card),
            queue: card.queue,
            // A filtered card reports where it sits. The bridge names its home
            // deck beside it; the desktop add-on does not.
            deckName: card.filteredDeckName ?? card.deckName,
            ...(card.filteredDeckName === undefined || this.options.cardShape === 'desktop'
              ? {}
              : { originalDeckName: card.deckName }),
          }));
      }
      case 'getReviewsOfCards': {
        const ids = new Set((params['cards'] as number[] | undefined) ?? []);
        const reviews: Record<string, { id: number; ease: number }[]> = {};
        for (const card of this.cards.filter((entry) => ids.has(entry.cardId))) {
          if (card.firstReviewedAt === undefined) {
            reviews[String(card.cardId)] = [];
            continue;
          }
          // A manual reschedule before the first real answer, so a test proves
          // an `ease` of zero is never mistaken for the day a word was learned.
          reviews[String(card.cardId)] = [
            { id: card.firstReviewedAt - 86_400_000, ease: 0 },
            { id: card.firstReviewedAt, ease: 3 },
            { id: card.firstReviewedAt + 86_400_000, ease: 2 },
          ];
        }
        return reviews;
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
        return undefined;
    }
  }

  /** The `cardsInfo` columns whose name or presence depends on the endpoint. */
  private endpointColumns(card: ServerCard): Record<string, number> {
    if (this.options.cardShape === 'desktop') {
      return card.cardType === undefined ? {} : { type: card.cardType };
    }
    return {
      ...(card.cardType === undefined ? {} : { cardType: card.cardType }),
      ...(card.fsrsDifficulty === undefined ? {} : { fsrsDifficulty: card.fsrsDifficulty }),
      ...(card.lastReviewedAt === undefined ? {} : { lastReviewedAt: card.lastReviewedAt }),
    };
  }

  /**
   * Anki's search, reduced to what the adapter's queries use.
   *
   * Terms combine with AND, `OR` joins alternatives, parentheses group, and a
   * leading `-` negates a term or a group. Quoted terms and bare ones both count:
   * reading only the quoted half would silently drop every `rated:` term and
   * answer the scope search instead, which is the same as claiming the learner
   * answered their whole deck today.
   */
  private findCards(query: string): number[] {
    const tokens = query.match(/\(|\)|-|"(?:[^"\\]|\\.)*"|[^\s()"]+/gu) ?? [];
    let position = 0;
    const alternatives = (): ((card: ServerCard) => boolean) => {
      const parts = [conjunction()];
      while (tokens[position] === 'OR') {
        position += 1;
        parts.push(conjunction());
      }
      return (card) => parts.some((part) => part(card));
    };
    const conjunction = (): ((card: ServerCard) => boolean) => {
      const parts: ((card: ServerCard) => boolean)[] = [];
      while (position < tokens.length && tokens[position] !== ')' && tokens[position] !== 'OR') {
        parts.push(unary());
      }
      return (card) => parts.every((part) => part(card));
    };
    const unary = (): ((card: ServerCard) => boolean) => {
      const token = tokens[position++]!;
      if (token === '-') {
        const negated = unary();
        return (card) => !negated(card);
      }
      if (token === '(') {
        const group = alternatives();
        position += 1;
        return group;
      }
      const term = unquote(token);
      return (card) => this.matchesTerm(card, term);
    };
    const matches = alternatives();
    return this.cards.filter((card) => matches(card)).map((card) => card.cardId);
  }

  private matchesTerm(card: ServerCard, term: string): boolean {
    // Anki's name for every card a filtered deck has moved, not a deck name.
    if (term === 'deck:filtered') {
      return card.filteredDeckName !== undefined;
    }
    if (term.startsWith('deck:')) {
      // Anki matches the deck a card sits in and, for a card a filtered deck has
      // moved, its home deck as well. A matching deck brings its subdecks with
      // it, which is how `deck:*` asks for the whole collection and `deck:X::*`
      // for the subdecks without the parent.
      const deck = new RegExp(`^${searchPattern(term.slice('deck:'.length))}(::.*)?$`, 'iu');
      return [card.deckName, card.filteredDeckName].some(
        (name) => name !== undefined && deck.test(name),
      );
    }
    if (term.startsWith('did:')) {
      // The same two decks by id, without subdecks.
      const ids = new Set(term.slice('did:'.length).split(',').map(Number));
      return [card.deckName, card.filteredDeckName].some(
        (name) => name !== undefined && ids.has(this.deckIdOf(name)),
      );
    }
    if (term.startsWith('cid:')) {
      return term.slice('cid:'.length).split(',').map(Number).includes(card.cardId);
    }
    if (term.startsWith('note:')) {
      const pattern = searchPattern(term.slice('note:'.length));
      return new RegExp(`^${pattern}$`, 'iu').test(card.noteTypeName);
    }
    if (term.startsWith('rated:')) {
      return this.wasRated(card, term.slice('rated:'.length));
    }
    if (term.startsWith('introduced:')) {
      return this.wasIntroduced(card, Number(term.slice('introduced:'.length)));
    }
    if (term.startsWith('prop:d>=')) {
      return this.hasDifficultyAtLeast(card, Number(term.slice('prop:d>='.length)));
    }
    return false;
  }

  /**
   * Anki's `prop:d>=X`, which compares difficulty on 0-1 as `(D - 1) / 9`.
   * A card without FSRS memory state matches no difficulty at all.
   */
  private hasDifficultyAtLeast(card: ServerCard, threshold: number): boolean {
    return (
      card.fsrsDifficulty !== undefined &&
      Number.isFinite(threshold) &&
      (card.fsrsDifficulty - 1) / 9 >= threshold
    );
  }

  /**
   * Anki's `rated:days[:ease]`.
   *
   * `rated:1` is today, so a day count is "fewer than N study days ago" rather
   * than "at most N". The optional ease narrows it to one answer button: `1` is
   * Again and `2` is Hard.
   */
  private wasRated(card: ServerCard, argument: string): boolean {
    const parts = argument.split(':');
    const within = Number(parts[0]);
    const answered = card.lastAnsweredDaysAgo;
    if (answered === undefined || !Number.isFinite(within) || answered >= within) {
      return false;
    }
    if (parts.length < 2) {
      return true;
    }
    if (parts[1] === '1') {
      return card.answeredAgain === true;
    }
    return parts[1] === '2' ? card.answeredHard === true : false;
  }

  /** Anki's `introduced:N`: first real answer within the last N study days. */
  private wasIntroduced(card: ServerCard, within: number): boolean {
    if (card.firstReviewedAt === undefined || !Number.isFinite(within)) {
      return false;
    }
    const now = this.options.now ?? Date.now();
    const daysAgo = Math.floor(Math.max(0, now - card.firstReviewedAt) / 86_400_000);
    return daysAgo < within;
  }
}

/** Strips the quotes a search term may be wrapped in, keeping its content as written. */
function unquote(term: string): string {
  return term.startsWith('"') ? term.slice(1, -1) : term;
}

/**
 * Anki's search text as a regular expression.
 *
 * `*` stands for any run of characters and `_` for any one, as they do in
 * Anki; a backslash makes the next character literal, so `\_` is an underscore.
 */
function searchPattern(value: string): string {
  let pattern = '';
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    if (char === '\\' && index + 1 < value.length) {
      index += 1;
      pattern += literal(value[index]!);
    } else if (char === '*') {
      pattern += '.*';
    } else if (char === '_') {
      pattern += '.';
    } else {
      pattern += literal(char);
    }
  }
  return pattern;
}

function literal(char: string): string {
  return char.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}
