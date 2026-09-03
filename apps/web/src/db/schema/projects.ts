import type { RxJsonSchema } from 'rxdb';
import { createProject, PROJECT_COLOURS, type Project } from '@corvonium/shared';
import { getDatabase } from '../database';

export async function addProject(name: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.projects.find().exec();
  const color = PROJECT_COLOURS[existing.length % PROJECT_COLOURS.length]!;
  await db.projects.insert(createProject(name, color, Date.now(), crypto.randomUUID()));
}

export async function removeProject(id: string): Promise<void> {
  const db = await getDatabase();
  const doc = await db.projects.findOne(id).exec();
  await doc?.remove();
}

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
