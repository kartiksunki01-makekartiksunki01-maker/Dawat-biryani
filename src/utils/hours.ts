import { restaurant } from '../data/restaurant';

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

/** Current weekday + minutes-since-midnight in the restaurant's timezone (Asia/Kolkata). */
export function nowInRestaurantTz(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: restaurant.hours.timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '0';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: weekdayMap[get('weekday')] ?? 0,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export interface OpenStatus {
  open: boolean;
  label: string;
}

/** Based on the configured schedule only — actual hours may vary (holidays, festivals). */
export function getOpenStatus(date = new Date()): OpenStatus {
  const { day, minutes } = nowInRestaurantTz(date);
  const open = toMinutes(restaurant.hours.open);
  const close = toMinutes(restaurant.hours.close);
  const openToday = (restaurant.hours.days as readonly number[]).includes(day);
  if (openToday && minutes >= open && minutes < close) {
    const left = close - minutes;
    return {
      open: true,
      label: left <= 60 ? `Open now · closes in ${left} min` : 'Open now · until 10:00 PM',
    };
  }
  if (openToday && minutes < open) return { open: false, label: 'Closed now · opens 10:00 AM' };
  return { open: false, label: 'Closed now · opens 10:00 AM tomorrow' };
}
