import { ConfigMapService } from './config-map.service';

const SEED_ROWS = [
  { id: 1, field: 'entitledType', textValue: 'נכים', intValue: 1 },
  { id: 2, field: 'entitledType', textValue: 'יתומים', intValue: 2 },
  { id: 3, field: 'entitledType', textValue: 'אחר', intValue: 3 },
  { id: 4, field: 'amountType', textValue: 'הלוואה', intValue: 1 },
  { id: 5, field: 'amountType', textValue: 'סכום', intValue: 2 },
];

function makeService() {
  const create = jest.fn().mockResolvedValue({});
  const upsert = jest.fn().mockResolvedValue({});
  const del = jest.fn().mockResolvedValue({});
  const findUnique = jest.fn().mockResolvedValue(null);
  const count = jest.fn().mockResolvedValue(0);
  const prisma = {
    configMap: {
      findMany: jest.fn().mockResolvedValue(SEED_ROWS),
      findUnique,
      create,
      upsert,
      delete: del,
    },
    catalogItem: { count },
  };
  return { service: new ConfigMapService(prisma as any), create, upsert, del, findUnique, count };
}

describe('ConfigMapService.previewResolver', () => {
  it('resolves a known value to its existing code without persisting', async () => {
    const { service, create } = makeService();
    const resolver = await service.previewResolver();
    expect(await resolver.toInt('entitledType', 'נכים')).toBe(1);
    expect(create).not.toHaveBeenCalled();
  });

  it('assigns a provisional code to an unknown value without writing to the DB', async () => {
    const { service, create } = makeService();
    const resolver = await service.previewResolver();
    expect(await resolver.toInt('entitledType', 'מיוחד')).toBe(4);
    expect(create).not.toHaveBeenCalled();
  });

  it('gives distinct provisional codes to distinct values and is stable per value', async () => {
    const { service, create } = makeService();
    const resolver = await service.previewResolver();
    expect(await resolver.toInt('entitledType', 'מיוחד')).toBe(4);
    expect(await resolver.toInt('entitledType', 'זמני')).toBe(5);
    expect(await resolver.toInt('entitledType', 'מיוחד')).toBe(4);
    expect(create).not.toHaveBeenCalled();
  });

  it('maps empty/sentinel values to 0', async () => {
    const { service } = makeService();
    const resolver = await service.previewResolver();
    expect(await resolver.toInt('entitledType', '')).toBe(0);
    expect(await resolver.toInt('entitledType', 'NaN')).toBe(0);
  });

  it('does not pollute the shared cache — a later persisting toInt still registers the value', async () => {
    const { service, create } = makeService();
    const resolver = await service.previewResolver();
    await resolver.toInt('entitledType', 'מיוחד');
    expect(create).not.toHaveBeenCalled();

    const code = await service.toInt('entitledType', 'מיוחד');
    expect(code).toBe(4);
    expect(create).toHaveBeenCalledWith({
      data: { field: 'entitledType', textValue: 'מיוחד', intValue: 4 },
    });
  });
});

describe('ConfigMapService edit guard (entity-id drift protection)', () => {
  it('allows creating a brand-new mapping', async () => {
    const { service, upsert, findUnique } = makeService();
    findUnique.mockResolvedValue(null);
    await service.upsert('entitledType', 'חדש', 4);
    expect(upsert).toHaveBeenCalled();
  });

  it('blocks changing the code of a value already used by items', async () => {
    const { service, upsert, findUnique, count } = makeService();
    findUnique.mockResolvedValue({ id: 1, field: 'entitledType', textValue: 'נכים', intValue: 1 });
    count.mockResolvedValue(5);
    await expect(service.upsert('entitledType', 'נכים', 9)).rejects.toThrow();
    expect(upsert).not.toHaveBeenCalled();
  });

  it('allows a no-op upsert (same code) on an in-use value', async () => {
    const { service, upsert, findUnique, count } = makeService();
    findUnique.mockResolvedValue({ id: 2, field: 'entitledType', textValue: 'יתומים', intValue: 2 });
    count.mockResolvedValue(5);
    await service.upsert('entitledType', 'יתומים', 2);
    expect(upsert).toHaveBeenCalled();
  });

  it('blocks deleting a mapping still used by items', async () => {
    const { service, del, findUnique, count } = makeService();
    findUnique.mockResolvedValue({ id: 1, field: 'entitledType', textValue: 'נכים', intValue: 1 });
    count.mockResolvedValue(3);
    await expect(service.remove(1)).rejects.toThrow();
    expect(del).not.toHaveBeenCalled();
  });

  it('allows deleting an unused mapping', async () => {
    const { service, del, findUnique, count } = makeService();
    findUnique.mockResolvedValue({ id: 1, field: 'entitledType', textValue: 'ישן', intValue: 7 });
    count.mockResolvedValue(0);
    await service.remove(1);
    expect(del).toHaveBeenCalledWith({ where: { id: 1 } });
  });
});
