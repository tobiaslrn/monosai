import type { FixtureCollection } from './anki-collection';
import {
  cardsInfoSchema,
  nameListSchema,
  notesInfoSchema,
} from '../app/infrastructure/anki/connect/connect-response.schema';
import { protocolResult } from './connect-protocol';

const cards = cardsInfoSchema.parse(protocolResult('cardsInfo'));
const notes = notesInfoSchema.parse(protocolResult('notesInfo'));
export const PROTOCOL_COLLECTION: FixtureCollection = {
  deckNames: nameListSchema.parse(protocolResult('deckNames')),
  noteTypes: nameListSchema.parse(protocolResult('modelNames')).map((name) => ({
    name,
    fieldNames: nameListSchema.parse(protocolResult('modelFieldNames')),
  })),
  notes: notes.map((note) => ({
    id: String(note.noteId),
    noteTypeName: note.modelName,
    fieldValues: Object.values(note.fields)
      .sort((a, b) => a.order - b.order)
      .map((field) => field.value),
    cards: cards
      .filter((card) => card.note === note.noteId)
      .map((card) => ({
        deckName: card.deckName,
        reps: card.reps,
        lapses: card.lapses ?? undefined,
        factor: card.factor ?? undefined,
      })),
  })),
};
