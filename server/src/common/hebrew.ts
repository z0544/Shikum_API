/**
 * כלי נרמול והתאמה סלחנית לעברית (ללא LLM).
 * משמש את מנוע החיפוש החכם: נרמול אותיות סופיות, ניקוד, רווחים, והשוואת קרבה (Levenshtein).
 */

const FINAL_MAP: Record<string, string> = {
  ך: 'כ',
  ם: 'מ',
  ן: 'נ',
  ף: 'פ',
  ץ: 'צ',
};

/**
 * נרמול טקסט עברי להשוואה סלחנית:
 * - הסרת ניקוד (U+0591–U+05C7) וגרשיים/מרכאות
 * - איחוד אותיות סופיות (ך→כ, ם→מ, ן→נ, ף→פ, ץ→צ)
 * - צמצום רווחים, אותיות לטיניות ל-lowercase
 */
export function normalizeHebrew(text: unknown): string {
  if (text === null || text === undefined) return '';
  let s = String(text).toLowerCase();
  s = s.replace(/[֑-ׇ]/g, '');
  s = s.replace(/["'`׳״]/g, '');
  s = s.replace(/[ךםןףץ]/g, (c) => FINAL_MAP[c] || c);
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

/** מרחק עריכה (Levenshtein) בין שתי מחרוזות. */
export function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

/** סף מרחק עריכה מותר לפי אורך המילה (מילים קצרות — פחות סובלנות). */
export function fuzzyThreshold(word: string): number {
  if (word.length <= 3) return 1;
  if (word.length <= 6) return 2;
  return 3;
}
