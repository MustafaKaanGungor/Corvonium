import type { Item, Project } from './types';

export type NewItem = Partial<Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'deleted'>> & {
  title: string;
};

export function createItem(input: NewItem, now: number, id: string): Item {
  return {
    // defaults…
    notes: '',
    kind: 'task',
    allDay: false,
    start: null,
    end: null,
    startDate: null,
    endDate: null,
    due: null,
    tzid: null,
    rrule: null,
    seriesId: null,
    originalStart: null,
    status: 'open',
    completedAt: null,
    cancelledAt: null,
    projectId: null,
    location: null,
    important: false,
    sortOrder: 'a0',

    // …then the caller overrides them…
    ...input,

    // …and these belong to the system, so they win outright.
    id,
    createdAt: now,
    updatedAt: now,
  };
}

export const PROJECT_COLOURS = [
  '#4CC26A', '#5B9BD5', '#D98C4A', '#A67CC9', '#D9614F', '#E0A040',
] as const;

export function createProject(
  name: string,
  color: string,
  now: number,
  id: string
): Project {
  return {id, name, color, archived: false, sortOrder: 'a0', createdAt: now, updatedAt: now};
}
