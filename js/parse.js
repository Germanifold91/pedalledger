/* Amount parsing.
   People type money the way their country writes it:
     50.000   → fifty thousand (Colombia, Turkey, most of Europe)
     150,000  → a hundred and fifty thousand (US/UK style, Central Asia receipts)
     1.234,56 / 1,234.56 / 12,50 / 12.5
   Rules:
     - spaces and apostrophes are grouping marks (1 000, 1'000)
     - both "." and "," present → the LAST one is the decimal mark
     - one kind repeated (1.000.000) → it's a grouping mark
     - one mark, exactly 3 digits after, 1–3 digits before (not "0") → grouping mark,
       unless the currency really uses 3 decimals (JOD, KWD, OMR…)
     - anything else → the mark is the decimal point
   Returns NaN for anything that isn't a plain non-negative number. */

export function parseAmount(input, currency){
  if (typeof input !== "string" && typeof input !== "number") return NaN;
  let s = String(input).trim().replace(/[\s  '’]/g, "");
  if (!s || !/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return NaN;

  const dots = (s.match(/\./g) || []).length;
  const commas = (s.match(/,/g) || []).length;

  if (dots && commas) {
    const dec = s.lastIndexOf(".") > s.lastIndexOf(",") ? "." : ",";
    const grp = dec === "." ? "," : ".";
    if ((dec === "." ? dots : commas) > 1) return NaN;          // 1.2.3,4.5
    const [intPart] = s.split(dec);
    if (intPart.includes(grp) && !validGrouping(intPart, grp)) return NaN;
    s = s.split(grp).join("").replace(dec, ".");
  } else if (dots + commas > 1) {
    const grp = dots ? "." : ",";
    if (!validGrouping(s, grp)) return NaN;
    s = s.split(grp).join("");
  } else if (dots + commas === 1) {
    const mark = dots ? "." : ",";
    const [before, after] = s.split(mark);
    const looksGrouped = after.length === 3 && /^[1-9][0-9]{0,2}$/.test(before);
    s = looksGrouped && currencyDecimals(currency) !== 3
      ? before + after
      : (before || "0") + "." + after;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

/* "1.234.567" is grouped correctly; "12.34.5" is not. */
function validGrouping(s, grp){
  const parts = s.split(grp);
  if (!/^[0-9]{1,3}$/.test(parts[0])) return false;
  return parts.slice(1).every(p => /^[0-9]{3}$/.test(p));
}

export function currencyDecimals(code){
  if (!code) return 2;
  try {
    return new Intl.NumberFormat("en", { style:"currency", currency:code })
      .resolvedOptions().maximumFractionDigits;
  } catch { return 2; }
}
