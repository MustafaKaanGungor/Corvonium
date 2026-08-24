import type { Item, ItemStatus } from './types';

export type StatusPatch = Pick<Item, 'status' | 'completedAt' | 'cancelledAt'>;

export function statusPatch(status: ItemStatus, now: number): StatusPatch {
  return {
    status,
    completedAt: status === 'done' ? now : null,
    cancelledAt: status === 'cancelled' ? now : null,
  };
}

export type ItemEdit = Partial<
  Omit<Item, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'completedAt' | 'cancelledAt'>
>;
