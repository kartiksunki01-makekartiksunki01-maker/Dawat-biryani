// Restaurant-local (Asia/Kolkata) scheduling helpers. The server re-checks everything.
import type { RestaurantSettings } from '../data/menuSync';

const IST_OFFSET_MIN = 330;

/** Parts of a moment as seen on a clock in India. */
export function istParts(ms: number) {
  const d = new Date(ms + IST_OFFSET_MIN * 60000);
  const date = d.toISOString().slice(0, 10);
  return { date, minutes: d.getUTCHours() * 60 + d.getUTCMinutes(), dow: d.getUTCDay() };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const fmt = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

export const toIstIso = (date: string, time: string) => `${date}T${time}:00+05:30`;

export const label12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
};

const isOpenDay = (s: RestaurantSettings, date: string) => {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return s.open_days.includes(dow) && !s.closed_dates.includes(date);
};

/** Can an "as soon as possible" order be accepted right now? */
export function asapAvailable(s: RestaurantSettings, nowMs: number) {
  const n = istParts(nowMs + s.min_lead_minutes * 60000);
  return isOpenDay(s, n.date) && n.minutes >= toMin(s.opens_at) && n.minutes <= toMin(s.closes_at);
}

/** Selectable 15-minute slots for a date, respecting opening hours and the restaurant's lead time. */
export function timeSlots(s: RestaurantSettings, date: string, nowMs: number): string[] {
  if (!date || !isOpenDay(s, date)) return [];
  const earliest = istParts(nowMs + s.min_lead_minutes * 60000);
  let start = toMin(s.opens_at);
  if (date === earliest.date) start = Math.max(start, Math.ceil(earliest.minutes / 15) * 15);
  if (date < earliest.date) return [];
  const out: string[] = [];
  for (let m = Math.ceil(start / 15) * 15; m <= toMin(s.closes_at); m += 15) out.push(fmt(m));
  return out;
}

/** Open days from today up to the allowed limit. */
export function dateOptions(s: RestaurantSettings, nowMs: number): { value: string; label: string }[] {
  const out: { value: string; label: string }[] = [];
  const today = istParts(nowMs).date;
  for (let i = 0; i <= s.max_days_ahead; i++) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const v = d.toISOString().slice(0, 10);
    if (!isOpenDay(s, v) || timeSlots(s, v, nowMs).length === 0) continue;
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(d);
    out.push({ value: v, label });
  }
  return out;
}
