import { buildHeaderMap, normalizeColumnName } from './columns';

describe('מיפוי כותרות XLSX', () => {
  it('מנרמל שמות עמודות (הסרת נקודות ורווחים)', () => {
    expect(normalizeColumnName('.סוג זכאי')).toBe('סוג זכאי');
    expect(normalizeColumnName('תיאור פריט.')).toBe('תיאור פריט');
    expect(normalizeColumnName('  מק"ט  ')).toBe('מק"ט');
  });

  it('ממפה כותרות קובץ הפריטים לשדות אנגליים', () => {
    const headers = [null, 'מק"ט', 'תיאור פריט.', 'תדירות זכאות.', '.סוג זכאי', 'סוג סכום.', 'רמת בסיס.', 'רמת חריגה.', 'סכום.'];
    const map = buildHeaderMap(headers, 'items');
    expect(map[1]).toBe('catalogNumber');
    expect(map[2]).toBe('description');
    expect(map[4]).toBe('entitledTypeRaw');
    expect(map[5]).toBe('amountTypeRaw');
    expect(map[8]).toBe('amount');
  });

  it('ממפה כותרות קובץ הספקים', () => {
    const headers = ['תחילת תוקף', 'מספר ספק שיקום', 'מספר ספק משהב"ט', 'שם ספק', 'ישוב קליניקה/סאפ/דואר/מגורים ספק'];
    const map = buildHeaderMap(headers, 'suppliers');
    expect(map[2]).toBe('modSupplierId');
    expect(map[3]).toBe('name');
    expect(map[4]).toBe('city');
  });
});
