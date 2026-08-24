import type { Item } from '@corvonium/shared';
import type { RxJsonSchema } from 'rxdb';

export const itemSchema: RxJsonSchema<Item> = {
  title: 'item',
  version: 0,
  description: 'Tasks and events are one document type — plan §2.1',
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    title: { type: 'string' },
    notes: { type: 'string' },
    kind: { type: 'string', enum: ['task', 'event'] },

    // scheduling
    allDay: { type: 'boolean' },
    start: { type: ['number', 'null'] },
    end: { type: ['number', 'null'] },
    startDate: { type: ['string', 'null'] },
    endDate: { type: ['string', 'null'] },
    due: { type: ['number', 'null'] },
    tzid: { type: ['string', 'null'] },

    // recurrence
    rrule: { type: ['string', 'null'] },
    seriesId: { type: ['string', 'null'] },
    originalStart: { type: ['number', 'null'] },

    // status
    status: { type: 'string', enum: ['open', 'done', 'cancelled'] },
    completedAt: { type: ['number', 'null'] },
    cancelledAt: { type: ['number', 'null'] },

    // organisation
    projectId: { type: ['string', 'null'] },
    location: { type: ['string', 'null'] },
    important: { type: 'boolean' },
    sortOrder: { type: 'string', maxLength: 100 },

    createdAt: { type: 'number' },
    updatedAt: {
      type: 'number',
      minimum: 0,
      maximum: 9999999999999,
      multipleOf: 1,
    },
  },
  required: [
    'id',
    'title',
    'notes',
    'kind',
    'allDay',
    'status',
    'important',
    'sortOrder',
    'createdAt',
    'updatedAt',
  ],
  indexes: ['updatedAt'],
};
