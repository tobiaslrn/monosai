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
}

interface ServerCard {
  readonly cardId: number;
  readonly note: number;
  readonly reps: number;
  readonly lapses?: number;
  readonly factor?: number;
  readonly queue: number;
  /** Home deck, which is what Anki's `deck:` matches even for a filtered card. */
  readonly deckName: string;
  /** Where the card sits right now, when that is not its home deck. */
  readonly filteredDeckName?: string;
  readonly noteTypeName: string;
  readonly interval?: number;
  readonly firstReviewedAt?: number;
  readonly lastAnsweredDaysAgo?: number;
  readonly answeredAgain?: boolean;
  readonly answeredHard?: boolean;
  readonly cardType?: number;
  readonly fsrsDifficulty?: number;
  readonly lastReviewedAt?: number;
}

/**
 * A deterministic stand-in for a local AnkiConnect endpoint.
 *
 * It answers the same nine actions the real add-on does, over the same
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
      case 'requestPermission':
        return {
          ...permissionSchema.parse(protocolResult('requestPermission')),
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
          .map((card) => ({
            cardId: card.cardId,
            note: card.note,
            reps: card.reps,
            ...(card.lapses === undefined ? {} : { lapses: card.lapses }),
            ...(card.factor === undefined ? {} : { factor: card.factor }),
            ...(card.interval === undefined ? {} : { interval: card.interval }),
            ...(card.cardType === undefined ? {} : { cardType: card.cardType }),
            ...(card.fsrsDifficulty === undefined ? {} : { fsrsDifficulty: card.fsrsDifficulty }),
            ...(card.lastReviewedAt === undefined ? {} : { lastReviewedAt: card.lastReviewedAt }),
            queue: card.queue,
            // A filtered card reports where it sits, and its home deck beside it.
            deckName: card.filteredDeckName ?? card.deckName,
            ...(card.filteredDeckName === undefined ? {} : { originalDeckName: card.deckName }),
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

  /**
   * Anki's search, reduced to what the adapter's queries use.
   *
   * `deck:X` matches X and its descendants; a leading `-` negates a term; and
   * `note:Y` matches the note type. Terms combine with AND.
   */
  private findCards(query: string): number[] {
    // Quoted terms and bare ones both count. Reading only the quoted half would
    // silently drop every `rated:` term and answer the scope search instead,
    // which is the same as claiming the learner answered their whole deck today.
    const terms = [...query.replace(/[()]/gu, ' ').matchAll(/(-?)("[^"]*"|\S+)/gu)].map(
      (match) => ({ negated: match[1] === '-', term: unquote(match[2]) }),
    );

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
      // The home deck decides, as it does in Anki: a filtered deck moves a card
      // for a while without changing which deck it belongs to.
      const value = term.slice('deck:'.length);
      // `*` is Anki's wildcard, which is how `deck:*` asks for the whole
      // collection and `deck:X::*` for the subdecks without the parent.
      if (value.includes('*')) {
        return wildcard(value).test(card.deckName);
      }
      return card.deckName === value || card.deckName.startsWith(`${value}::`);
    }
    if (term.startsWith('note:')) {
      return card.noteTypeName === term.slice('note:'.length);
    }
    if (term.startsWith('rated:')) {
      return this.wasRated(card, term.slice('rated:'.length));
    }
    return false;
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
}

/** Strips the quotes a search term may be wrapped in, keeping its content as written. */
function unquote(term: string): string {
  return term.startsWith('"') ? term.slice(1, -1) : term;
}

/** Anki's `*`, with every other character taken literally. */
function wildcard(value: string): RegExp {
  const pattern = value
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('.*');
  return new RegExp(`^${pattern}$`, 'u');
}
