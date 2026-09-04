/** One place to change when the app learns Turkish. */
const LOCALE = 'en-GB';

// Intl formatters are expensive to construct — build once, not per render.
const dmy = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' });
const dayLabel = new Intl.DateTimeFormat(LOCALE, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const hhmm = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' });

export const formatDate = (ms: number) => dmy.format(ms);
export const formatDayLabel = (ms: number) => dayLabel.format(ms);
export const formatTime = (ms: number) => hhmm.format(ms);

const pad = (n: number) => String(n).padStart(2, '0');

/** Epoch ms → the string `<input type="datetime-local">` expects, in local time. */
export function toDateTimeLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The value from `<input type="datetime-local">` → epoch ms. */
export function fromDateTimeLocal(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}
