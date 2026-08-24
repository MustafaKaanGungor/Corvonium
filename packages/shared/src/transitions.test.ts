import { describe, expect, it } from 'vitest';
import { statusPatch } from './transitions';

const NOW = Date.UTC(2026, 7, 15, 12, 0);

describe('statusPatch', () => {
  it('records when an item was completed', () => {
    expect(statusPatch('done', NOW)).toEqual({
      status: 'done',
      completedAt: NOW,
      cancelledAt: null,
    });
  });

  it('records when an item was cancelled', () => {
    expect(statusPatch('cancelled', NOW)).toEqual({
      status: 'cancelled',
      completedAt: null,
      cancelledAt: NOW,
    });
  });

  it('clears both timestamps when an item is reopened', () => {
    expect(statusPatch('open', NOW)).toEqual({
      status: 'open',
      completedAt: null,
      cancelledAt: null,
    });
  });
});
