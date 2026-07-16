import { GeoService } from '../geo/geo.service';
import { SearchService } from './search.service';

/** תוצאת חיפוש מזויפת ל-runAiSearch (מספיקה לענפי chat/searchReply). */
function cannedSearch(over: Record<string, unknown> = {}) {
  return {
    query: '',
    parsed: {
      product_terms: ['כיסא'],
      search_phrase: 'כיסא',
      location: null,
      location_normalized: null,
      explanation: '',
      parser: 'local',
    },
    engine: 'local',
    count: 3,
    total_makts: 42,
    user_location: null as string | null,
    results: [
      {
        catalogNumber: '27570',
        description: 'תיקון לכיסא גלגלים',
        variant_count: 1,
        supplier_count: 2,
        variants: [{ entityId: '27570-0-0-0-0' }],
        suppliers: [],
        nearest_supplier: null,
        supplier_note: null,
      },
    ] as Record<string, unknown>[],
    message: null,
    ...over,
  };
}

describe('SearchService — פירוק וסיווג (טהור)', () => {
  const geo = new GeoService();
  const service = new SearchService({} as any, geo, {} as any, { isEnabled: () => false } as any);
  const s = service as any;

  it('classifyIntent — קשר / ספקים / חיפוש', () => {
    expect(s.classifyIntent('מה הטלפון של הספק')).toBe('contact');
    expect(s.classifyIntent('הטלפון?')).toBe('contact'); // אות סופית מנורמלת
    expect(s.classifyIntent('מי מספק כיסא גלגלים')).toBe('suppliers');
    expect(s.classifyIntent('ספקים מורשים באזור')).toBe('suppliers');
    expect(s.classifyIntent('כיסא גלגלים')).toBe('search');
  });

  it('parseSmartQuery — שומר מילה מקורית ומזהה מיקום', () => {
    expect(s.parseSmartQuery('כיסא').product_terms).toEqual(['כיסא']); // לא "יסא"
    const p = s.parseSmartQuery('כיסא גלגלים בחיפה');
    expect(p.product_terms).toContain('כיסא');
    expect(p.product_terms).toContain('גלגלים');
    expect(p.location_normalized).toBe('חיפה');
  });

  it('stripIntentWords — מסיר מילות כוונה ופיסוק', () => {
    expect(s.stripIntentWords('מי מספק כיסא גלגלים?')).toBe('כיסא גלגלים');
    expect(s.stripIntentWords('מה הטלפון?')).toBe('');
  });
});

describe('SearchService — מכונת המצבים של chat()', () => {
  let geo: GeoService;
  let catalog: { getSuppliersForMakt: jest.Mock };
  let service: SearchService;
  let s: any;

  beforeEach(() => {
    geo = new GeoService();
    catalog = { getSuppliersForMakt: jest.fn().mockResolvedValue([]) };
    service = new SearchService({} as any, geo, catalog as any, { isEnabled: () => false } as any);
    s = service as any;
    jest.spyOn(geo, 'rankSuppliers').mockImplementation((_c: any, list: any) => list);
  });

  it('חיפוש ללא מיקום → שואל על יישוב ושומר הקשר', async () => {
    jest.spyOn(s, 'runAiSearch').mockResolvedValue(cannedSearch());
    jest.spyOn(s, 'resolveMakatFromText').mockResolvedValue(null);
    const r = await service.chat('כיסא גלגלים', {});
    expect(r.intent).toBe('search');
    expect(r.followup).toBe('location');
    expect(r.context.awaitingLocation).toBe(true);
    expect(r.context.product).toBe('כיסא גלגלים');
    expect(r.context.makat).toBe('27570');
    expect(r.reply).toContain('42'); // total_makts, לא count מקוצר
  });

  it('מיקום כתשובת המשך → מריץ חיפוש עם העיר ומנקה awaiting', async () => {
    const spy = jest.spyOn(s, 'runAiSearch').mockResolvedValue(cannedSearch({ user_location: 'חיפה' }));
    const r = await service.chat('חיפה', { awaitingLocation: true, product: 'כיסא גלגלים' });
    expect(spy).toHaveBeenCalledWith('כיסא גלגלים חיפה');
    expect(r.context.awaitingLocation).toBeFalsy();
    expect(r.context.location).toBe('חיפה');
  });

  it('"דלג" בשאלת המיקום → חיפוש על המוצר בלבד', async () => {
    const spy = jest.spyOn(s, 'runAiSearch').mockResolvedValue(cannedSearch());
    await service.chat('דלג', { awaitingLocation: true, product: 'כיסא גלגלים' });
    expect(spy).toHaveBeenCalledWith('כיסא גלגלים');
  });

  it('BUG1 — כפתור "מי מספק?" בזמן שאלת מיקום → ענף ספקים עם המק"ט מהזיכרון, ללא חיפוש מודבק', async () => {
    const searchSpy = jest.spyOn(s, 'runAiSearch');
    jest.spyOn(s, 'resolveMakatFromText').mockResolvedValue(null);
    catalog.getSuppliersForMakt.mockResolvedValue([{ modSupplierId: '1', city: 'חיפה' }]);
    const r = await service.chat('מי מספק?', {
      awaitingLocation: true,
      product: 'כיסא גלגלים',
      makat: '27570',
    });
    expect(r.intent).toBe('suppliers');
    expect(catalog.getSuppliersForMakt).toHaveBeenCalledWith('27570');
    expect(r.suppliers).toHaveLength(1);
    expect(searchSpy).not.toHaveBeenCalled(); // לא חיפש "כיסא גלגלים מי מספק?"
  });

  it('שינוי נושא בזמן שאלת מיקום (לא עיר) → שאילתה חדשה, לא הדבקה למוצר הישן', async () => {
    const spy = jest.spyOn(s, 'runAiSearch').mockResolvedValue(cannedSearch());
    jest.spyOn(s, 'resolveMakatFromText').mockResolvedValue(null);
    await service.chat('מכשיר שמיעה', { awaitingLocation: true, product: 'כיסא גלגלים' });
    expect(spy).toHaveBeenCalledWith('מכשיר שמיעה');
    expect(spy).not.toHaveBeenCalledWith('כיסא גלגלים מכשיר שמיעה');
  });

  it('ONE-TURN — "מי מספק כיסא גלגלים?" מחזיר ספקים בתור אחד', async () => {
    const spy = jest.spyOn(s, 'runAiSearch').mockResolvedValue(cannedSearch());
    jest.spyOn(s, 'resolveMakatFromText').mockResolvedValue(null);
    catalog.getSuppliersForMakt.mockResolvedValue([{ modSupplierId: '1', city: 'x' }]);
    const r = await service.chat('מי מספק כיסא גלגלים?', {});
    expect(r.intent).toBe('suppliers');
    expect(spy).toHaveBeenCalledWith('כיסא גלגלים');
    expect(catalog.getSuppliersForMakt).toHaveBeenCalledWith('27570');
    expect(r.suppliers).toHaveLength(1);
  });

  it('ספקים ללא מוצר וללא זיכרון → מבקש הבהרה', async () => {
    jest.spyOn(s, 'resolveMakatFromText').mockResolvedValue(null);
    const r = await service.chat('מי מספק?', {});
    expect(r.suppliers).toBeUndefined();
    expect(r.reply).toContain('על איזה מוצר');
    expect(r.quickReplies && r.quickReplies.length).toBeGreaterThan(0);
  });
});
