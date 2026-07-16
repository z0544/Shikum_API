/** משלים 0 מוביל למספרי טלפון ישראליים שאבד להם (לרוב מ-Excel שמפרש כמספר). */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let d = String(raw).trim();
  if (!d) return '';
  d = d.replace(/[^\d+]/g, '');
  if (d.startsWith('+972')) d = '0' + d.slice(4);
  else if (d.startsWith('972')) d = '0' + d.slice(3);
  d = d.replace(/\D/g, '');
  if (d && !d.startsWith('0') && (d.length === 8 || d.length === 9)) d = '0' + d;
  return d;
}

/** קישור חיוג (tel:) ממספר מנורמל, או null אם אין מספר תקין. */
export function telHref(raw: string | null | undefined): string | null {
  const n = normalizePhone(raw);
  return n ? `tel:${n}` : null;
}
