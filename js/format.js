/* Display formatting. Day keys ("YYYY-MM-DD") and clock strings ("HH:MM") are
   formatted as UTC so the phone's own time zone never shifts them. */

const usdFmt = new Intl.NumberFormat("en-US", { style:"currency", currency:"USD" });

export const fmtUSD = n => usdFmt.format(n);

/** Compact USD for axis labels: $1.5k, $40. */
export function fmtUSDc(n){
  if (Math.abs(n) >= 1000) return "$" + (n/1000).toFixed(n % 1000 === 0 ? 0 : 1) + "k";
  return "$" + (Math.round(n*100)/100).toString();
}

export function fmtLocal(amount, code){
  try { return new Intl.NumberFormat(undefined, { style:"currency", currency:code }).format(amount); }
  catch { return new Intl.NumberFormat().format(amount) + " " + code; }
}

export const fmtNum = n => new Intl.NumberFormat().format(n);

export function fmtDay(key){
  return new Date(key + "T12:00:00Z").toLocaleDateString(undefined,
    { weekday:"short", month:"short", day:"numeric", timeZone:"UTC" });
}

export function fmtDayShort(key){
  const [, m, d] = key.split("-");
  return Number(m) + "/" + Number(d);
}

export function fmtClock(hhmm){
  return new Date("1970-01-01T" + hhmm + ":00Z").toLocaleTimeString(undefined,
    { hour:"numeric", minute:"2-digit", timeZone:"UTC" });
}
