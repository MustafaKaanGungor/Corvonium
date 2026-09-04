import { createProject, PROJECT_COLOURS, type Project } from '@corvonium/shared';
import { getDatabase } from './database';

export async function addProject(name: string): Promise<void> {
  const db = await getDatabase();
  const existing = await db.projects.find().exec();

  // Cycle the palette so the first six projects are automatically distinct.
  const color = PROJECT_COLOURS[existing.length % PROJECT_COLOURS.length]!;

  await db.projects.insert(createProject(name, color, Date.now(), crypto.randomUUID()));
}

export async function editProject(id: string, fields: Partial<Project>): Promise<void> {
  const db = await getDatabase();
  const doc = await db.projects.findOne(id).exec();
  if (!doc) return;
  await doc.incrementalPatch({ ...fields, updatedAt: Date.now() });
}

/**
 * Tombstone via RxDB's `_deleted`. Items keep their `projectId`, which degrades
 * quietly: the colour dot stops rendering and the project filter self-heals.
 * A cascade would be a multi-document write racing against sync.
 */
export async function removeProject(id: string): Promise<void> {
  const db = await getDatabase();
  const doc = await db.projects.findOne(id).exec();
  await doc?.remove();
}
