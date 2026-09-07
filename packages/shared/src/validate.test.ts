import { describe, expect, it } from 'vitest';
import { scheduleError, type SchedulePart } from './validate';

const NOW = Date.UTC(2026, 7, 15, 12, 0);
const HOUR = 3600_000;

const part = (over: Partial<SchedulePart> = {}): SchedulePart => ({
  allDay: false,
  start: null,
  end: null,
  startDate: null,
  endDate: null,
  ...over,
});

describe('scheduleError', () => {
  it('accepts an item with no schedule at all', () => {
    expect(scheduleError(part())).toBeNull();
  });

  it('accepts a well-formed timed block', () => {
    expect(scheduleError(part({ start: NOW, end: NOW + HOUR }))).toBeNull();
  });

  it('rejects a block that ends before it starts', () => {
    expect(scheduleError(part({ start: NOW + HOUR, end: NOW }))).not.toBeNull();
  });

  it('rejects a zero-length block', () => {
    expect(scheduleError(part({ start: NOW, end: NOW }))).not.toBeNull();
  });

  it('rejects half a block, in either direction', () => {
    expect(scheduleError(part({ start: NOW }))).not.toBeNull();
    expect(scheduleError(part({ end: NOW }))).not.toBeNull();
  });

  it('accepts a single-day and a multi-day all-day span', () => {
    expect(scheduleError(part({ allDay: true, startDate: '2026-08-15' }))).toBeNull();
    expect(
      scheduleError(part({ allDay: true, startDate: '2026-08-13', endDate: '2026-08-18' })),
    ).toBeNull();
  });

  it('rejects an all-day span whose last day precedes its first', () => {
    expect(
      scheduleError(part({ allDay: true, startDate: '2026-08-18', endDate: '2026-08-13' })),
    ).not.toBeNull();
  });

  it('rejects an all-day item with no date chosen', () => {
    expect(scheduleError(part({ allDay: true }))).not.toBeNull();
  });

  it('ignores timed fields once the item is all-day', () => {
    // Switching mode leaves stale values behind; the form clears them on save,
    // but validation must not trip over them in the meantime.
    const stale = part({ allDay: true, startDate: '2026-08-15', start: NOW + HOUR, end: NOW });
    expect(scheduleError(stale)).toBeNull();
  });
});
