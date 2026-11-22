/**
 * Central European Time engine. Uses the IANA zone Europe/Berlin, which shares
 * CET/CEST rules with Europe/Budapest, so daylight saving is handled by Intl.
 * Light mood is driven by the real solar elevation over Berlin for the chosen
 * moment, so a November 16:30 reads as dusk and a June 16:30 as afternoon.
 */
export const CE_ZONE = 'Europe/Berlin';
const LAT = 52.52;
const LON = 13.405;

export type Phase = 'Night' | 'Morning' | 'Midday' | 'Afternoon' | 'Twilight';

export interface CEParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  offsetHours: number;
  abbr: 'CET' | 'CEST';
}

const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: CE_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

export function getCEParts(d: Date = new Date()): CEParts {
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) parts[p.type] = p.value;
  const year = +parts.year;
  const month = +parts.month;
  const day = +parts.day;
  const hour = +parts.hour % 24;
  const minute = +parts.minute;
  const second = +parts.second;
  const asUTC = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetHours = Math.round((asUTC - Math.floor(d.getTime() / 1000) * 1000) / 3600000);
  return { year, month, day, hour, minute, second, offsetHours, abbr: offsetHours >= 2 ? 'CEST' : 'CET' };
}

/** A Date for "today in CE time, at hourFloat". */
export function dateForCEHour(hourFloat: number, now: Date = new Date()): Date {
  const p = getCEParts(now);
  const h = Math.floor(hourFloat);
  const m = Math.round((hourFloat - h) * 60);
  const guess = new Date(Date.UTC(p.year, p.month - 1, p.day, h, m) - p.offsetHours * 3600000);
  // correct if that instant falls on the other side of a DST switch
  const off2 = getCEParts(guess).offsetHours;
  return off2 === p.offsetHours ? guess : new Date(guess.getTime() + (p.offsetHours - off2) * 3600000);
}

export function effectiveDate(time: { live: boolean; scrubHour: number }): Date {
  return time.live ? new Date() : dateForCEHour(time.scrubHour);
}

/** Approximate solar position (±~1°), enough for mood lighting. */
export function solar(date: Date): { elevation: number; afternoon: boolean } {
  const rad = Math.PI / 180;
  const n = date.getTime() / 86400000 + 2440587.5 - 2451545.0;
  const L = (280.46 + 0.9856474 * n) % 360;
  const g = ((357.528 + 0.9856003 * n) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const eps = (23.439 - 0.0000004 * n) * rad;
  const ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
  const dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
  const gmst = (((18.697374558 + 24.06570982441908 * n) % 24) + 24) % 24;
  let ha = (gmst * 15 + LON) * rad - ra;
  ha = Math.atan2(Math.sin(ha), Math.cos(ha)); // wrap to -pi..pi
  const lat = LAT * rad;
  const el = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(ha));
  return { elevation: el / rad, afternoon: ha > 0 };
}

export function phaseFor(date: Date): Phase {
  const { elevation, afternoon } = solar(date);
  const p = getCEParts(date);
  const hour = p.hour + p.minute / 60;
  if (elevation < -6) return 'Night';
  if (!afternoon) return hour < 10.5 ? 'Morning' : 'Midday';
  if (elevation < 6 || hour >= 19.5) return 'Twilight';
  return hour < 14 ? 'Midday' : 'Afternoon';
}

export const PHASE_LABEL: Record<Phase, string> = {
  Night: 'Night',
  Morning: 'Morning',
  Midday: 'Midday',
  Afternoon: 'Afternoon',
  Twilight: 'Twilight / Dusk',
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(1, Math.max(0, t));
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Tanner Helland's blackbody approximation, normalised so the max channel is 1. */
export function kelvinToRGB(k: number): [number, number, number] {
  const t = k / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = [r, g, b].map((v) => Math.min(255, Math.max(0, v)) / 255);
  const m = Math.max(...c);
  return [c[0] / m, c[1] / m, c[2] / m];
}

export interface LightMood {
  phase: Phase;
  kelvin: number;
  color: [number, number, number];
  intensity: number;
  ambient: [number, number, number];
  elevation: number;
}

export function lightMood(date: Date): LightMood {
  const { elevation: el, afternoon } = solar(date);
  let kelvin: number;
  if (el < -6) kelvin = 2100;
  else if (el < 0) kelvin = lerp(2100, 2600, (el + 6) / 6);
  else if (el < 10) kelvin = lerp(2600, 3600, el / 10);
  else if (el < 30) kelvin = lerp(3600, 5600, (el - 10) / 20);
  else kelvin = Math.min(6300, 5600 + (el - 30) * 25);

  let color = kelvinToRGB(kelvin);
  // twilight / dawn tint around the horizon
  const w = Math.exp(-Math.pow((el + 2) / 5.5, 2)) * 0.45;
  const tint: [number, number, number] = afternoon ? [1.0, 0.6, 0.86] : [1.0, 0.8, 0.64];
  color = [lerp(color[0], tint[0], w), lerp(color[1], tint[1], w), lerp(color[2], tint[2], w)];

  // Night stays soft and warm-dim for dark rooms.
  const intensity = 0.6 + 0.4 * smooth(-8, 14, el);
  const night = 1 - smooth(-10, 0, el);
  const ambient: [number, number, number] = [
    0.03 + 0.02 * (1 - night),
    0.026 + 0.02 * (1 - night),
    0.05 + 0.02 * (1 - night),
  ];
  return { phase: phaseFor(date), kelvin: Math.round(kelvin / 50) * 50, color, intensity, ambient, elevation: el };
}

export function formatHM(h: number, m: number): string {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
