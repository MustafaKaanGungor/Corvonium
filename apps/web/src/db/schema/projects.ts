import type { RxJsonSchema } from 'rxdb';
import type { Project } from '@corvonium/shared';

export const projectSchema: RxJsonSchema<Project> = {
  title: 'project',
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 36 },
    name: { type: 'string' },
    color: { type: 'string' },
    archived: { type: 'boolean' },
    sortOrder: { type: 'string', maxLength: 100 },
    createdAt: { type: 'number' },
    updatedAt: {
      type: 'number',
      minimum: 0,
      maximum: 9999999999999,
      multipleOf: 1,
    },
  },
  required: ['id', 'name', 'color', 'archived', 'sortOrder', 'createdAt', 'updatedAt'],
  indexes: ['updatedAt'],
};