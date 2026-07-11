import { synonymsFor } from './synonyms';

describe('synonyms — מילון נרדפות', () => {
  it('ממפה סלנג למונחים רשמיים', () => {
    expect(synonymsFor('עגלה')).toContain('כיסא גלגלים');
    expect(synonymsFor('משקפיים')).toContain('עדשות');
    expect(synonymsFor('פסיכולוג')).toContain('טיפול פסיכולוגי');
  });

  it('התאמה גם לפי מילה בתוך ביטוי', () => {
    expect(synonymsFor('צריך עגלה בבקשה')).toContain('כיסא גלגלים');
  });

  it('מחזיר ריק כשאין נרדף', () => {
    expect(synonymsFor('מונח שלא קיים בכלל')).toEqual([]);
  });
});
