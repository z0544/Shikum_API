import { editDistance, fuzzyThreshold, normalizeHebrew } from './hebrew';

describe('hebrew — נרמול והתאמה סלחנית', () => {
  it('מאחד אותיות סופיות', () => {
    expect(normalizeHebrew('גלגלים')).toBe('גלגלימ');
    expect(normalizeHebrew('שלום')).toBe(normalizeHebrew('שלומ'));
    expect(normalizeHebrew('הטלפון')).toBe('הטלפונ');
  });

  it('מסיר מרכאות/גרשיים וניקוד ומצמצם רווחים', () => {
    expect(normalizeHebrew('דוא"ל')).toBe('דואל');
    expect(normalizeHebrew('  א   ב  ')).toBe('א ב');
    expect(normalizeHebrew('שָׁלוֹם')).toBe('שלומ');
  });

  it('מרחק עריכה (Levenshtein)', () => {
    expect(editDistance('כיסא', 'כסא')).toBe(1);
    expect(editDistance('abc', 'abc')).toBe(0);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('ממונע', 'ממנוע')).toBeLessThanOrEqual(2);
  });

  it('סף מרחק לפי אורך המילה', () => {
    expect(fuzzyThreshold('אב')).toBe(1);
    expect(fuzzyThreshold('כיסא')).toBe(2);
    expect(fuzzyThreshold('פסיכולוגי')).toBe(3);
  });
});
