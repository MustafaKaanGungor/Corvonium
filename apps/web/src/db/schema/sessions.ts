import type { RxJsonSchema } from 'rxdb';
import type { Session } from '@corvonium/shared';

/**
 * Segments are embedded rather than their own collection — §6.
 *
 * The rule is who writes them and when: a session is appended to by exactly one
 * device and then frozen, so no second writer ever exists and there is nothing to
 * merge. A checklist, edited on any device forever, needs separate documents; this
 * does not, and an array is the honest shape.
 */
export const sessionSchema: RxJsonSchema<Session> = {
  title: 'session',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    startedAt: { type: 'number', minimum: 0, maximum: 9999999999999, multipleOf: 1 },
    endedAt: { type: ['number', 'null'] },
    segments: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['work', 'break'] },
          itemIds: { type: 'array', items: { type: 'string' } },
          startedAt: { type: 'number' },
          endedAt: { type: ['number', 'null'] },
        },
        required: ['kind', 'itemIds', 'startedAt', 'endedAt'],
      },
    },
    lastSeenAt: { type: 'number' },
    createdAt: { type: 'number' },
    updatedAt: {
      type: 'number',
      minimum: 0,
      maximum: 9999999999999,
      multipleOf: 1,
    },
  },
  // Every field listed: Dexie will not index an optional one.
  required: ['id', 'startedAt', 'endedAt', 'segments', 'lastSeenAt', 'createdAt', 'updatedAt'],
  indexes: ['updatedAt', 'startedAt'],
};
