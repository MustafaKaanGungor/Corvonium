export type ItemKind = 'task' | 'event';
export type ItemStatus = 'open' | 'done' | 'cancelled';

export interface Item {
  id: string;
  title: string;
  notes?: string;
  kind: ItemKind;

  // scheduling — any combination, all optional
  allDay: boolean;
  start: number | null; // epoch ms, timed block begins
  end: number | null; // epoch ms, timed block ends
  startDate: string | null; // 'YYYY-MM-DD', all-day — a date, not an instant
  endDate: string | null; // 'YYYY-MM-DD', inclusive
  due: number | null; // epoch ms, deadline
  tzid: string | null;

  // recurrence
  rrule: string | null;
  seriesId: string | null;
  originalStart: number | null;

  // status
  status: ItemStatus;
  completedAt: number | null;
  cancelledAt: number | null;

  // organisation
  projectId: string | null;
  location: string | null;
  important: boolean;
  sortOrder: string; // fractional index, not a number

  createdAt: number;
  updatedAt: number;
}
