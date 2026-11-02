/* Time model.
   Every expense stores:
     ts — the instant, as a UTC ISO string
     tz — the UTC offset in minutes (east positive) of the place it was logged
   The day and clock time an expense belongs to are computed from ts + tz, so a
   23:30 dinner in Istanbul stays on that day even when you look at it later in
   Bishkek or Bangkok. Nothing here depends on the phone's current time zone
   except the functions that read "now". */

const MIN = 60000;

/** Minutes east of UTC for the device's zone at a given moment. */
export const offsetAt = (date = new Date()) => -date.getTimezoneOffset();

/** "YYYY-MM-DDTHH:MM" wall-clock time at the place of logging. */
export function wallClock(ts, tz){
  return new Date(Date.parse(ts) + (tz || 0) * MIN).toISOString().slice(0, 16);
}

/** Inverse of wallClock: a "YYYY-MM-DDTHH:MM" local time at offset tz → UTC ISO. */
export function fromWallClock(wall, tz){
  return new Date(Date.parse(wall + ":00Z") - (tz || 0) * MIN).toISOString();
}

export const dayOf  = e => wallClock(e.ts, e.tz).slice(0, 10);
export const timeOf = e => wallClock(e.ts, e.tz).slice(11, 16);

/** Today's date where the phone is right now. */
export function todayKey(now = new Date()){
  return wallClock(now.toISOString(), offsetAt(now)).slice(0, 10);
}

/** Current local wall-clock, for prefilling a datetime-local input. */
export function nowWallClock(now = new Date()){
  return wallClock(now.toISOString(), offsetAt(now));
}

export function addDays(key, n){
  const d = new Date(key + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Inclusive list of day keys from start to end. */
export function dayRange(start, end){
  const out = [];
  for (let k = start; k <= end; k = addDays(k, 1)) out.push(k);
  return out;
}

/** Human label for a UTC offset: +3 → "UTC+3", 330 → "UTC+5:30". */
export function fmtOffset(tz){
  const sign = tz < 0 ? "−" : "+", a = Math.abs(tz);
  const h = Math.floor(a / 60), m = a % 60;
  return "UTC" + sign + h + (m ? ":" + String(m).padStart(2, "0") : "");
}
