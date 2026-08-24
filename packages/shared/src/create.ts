import type { Item } from './types';

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
    tags: [],
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
