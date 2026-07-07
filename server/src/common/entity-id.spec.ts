import { buildEntityId, normalizeCatalogNumber, normalizeIntPart } from './entity-id';

describe('entity-id (Variant ID מספרי)', () => {
  it('בונה מזהה בפורמט 642-1-1-1-0 לפי ההוראות', () => {
    expect(
      buildEntityId({ catalogNumber: 642, entitledType: 1, amountType: 1, baseLevel: 1, exceptionLevel: 0 }),
    ).toBe('642-1-1-1-0');
  });

  it('כל החלקים מספריים; טקסט/ריק/#MULTIVALUE -> 0', () => {
    expect(normalizeIntPart('1.0')).toBe('1');
    expect(normalizeIntPart(' 3 ')).toBe('3');
    expect(normalizeIntPart('')).toBe('0');
    expect(normalizeIntPart(null)).toBe('0');
    expect(normalizeIntPart('#MULTIVALUE')).toBe('0');
    expect(normalizeIntPart('נכים')).toBe('0');
  });

  it('מנרמל מק"ט מספרי אך שומר טקסט לא-מספרי', () => {
    expect(normalizeCatalogNumber('642.0')).toBe('642');
    expect(normalizeCatalogNumber('10769')).toBe('10769');
    expect(normalizeCatalogNumber('A12')).toBe('A12'); // טקסט לא-מספרי נשמר כמות שהוא
  });

  it('משלב מק"ט + שני קודים + שתי רמות', () => {
    expect(
      buildEntityId({ catalogNumber: '100', entitledType: 2, amountType: 5, baseLevel: 3, exceptionLevel: 1 }),
    ).toBe('100-2-5-3-1');
  });
});
