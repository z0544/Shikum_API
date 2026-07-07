import { GeoService } from './geo.service';

describe('GeoService — העשרת מחוז ודירוג קרבה', () => {
  const geo = new GeoService();

  it('מזהה מחוז לפי יישוב', () => {
    expect(geo.getDistrict('חיפה')).toBe('מחוז חיפה');
    expect(geo.getDistrict('באר שבע')).toBe('מחוז הדרום');
    expect(geo.getDistrict('ירושלים')).toBe('מחוז ירושלים');
  });

  it('מרחק בין אותו יישוב = 0', () => {
    expect(geo.distanceKm('באר שבע', 'באר שבע')).toBe(0);
  });

  it('מרחק חיובי בין יישובים מרוחקים', () => {
    const km = geo.distanceKm('באר שבע', 'חיפה');
    expect(km).toBeGreaterThan(150);
  });

  it('מדרג ומסמן את הספק הקרוב ביותר', () => {
    const ranked = geo.rankSuppliers('באר שבע', [
      { name: 'ספק תל אביב', city: 'תל אביב' },
      { name: 'ספק באר שבע', city: 'באר שבע' },
    ]);
    expect(ranked[0].is_nearest).toBe(true);
    expect(ranked[0].city).toBe('באר שבע');
    expect(ranked[0].proximity_label).toBe('אותו יישוב');
  });

  it('מזהה יישוב בטקסט חופשי', () => {
    expect(geo.findCityInText('כיסא גלגלים, גר בבאר שבע')).toBe('באר שבע');
    expect(geo.normalizeCity('ב"ש')).toBe('באר שבע');
  });
});
