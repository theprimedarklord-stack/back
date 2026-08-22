import { LabService } from './lab.service';
import { PRIMITIVE_SEEDS, STANDARD_LIBRARY } from './standard-library';

/**
 * Засипка бібліотеки.
 *
 * Перевіряється не «щось вставилось», а кількість звернень до бази. Це не
 * оптимізація заради краси: до бази ~155 мс, і рядок за рядком уся бібліотека
 * означала б понад триста кругів — майже хвилину в одному HTTP-запиті, тобто
 * обрив по таймауту замість бібліотеки. Помилка при цьому тиха: локально з
 * базою під боком усе працює.
 */

/** Клієнт, який нічого не робить, але пам'ятає, про що його просили. */
function fakeClient() {
  const calls: Array<{ sql: string; params: any[] }> = [];

  return {
    calls,
    query: jest.fn(async (sql: string, params: any[] = []) => {
      calls.push({ sql, params });
      // Обидва SELECT на початку: теки ще немає, бібліотеки теж.
      return { rows: [] as any[] };
    }),
  };
}

const USER = '00000000-0000-0000-0000-000000000001';
const ORG = '00000000-0000-0000-0000-000000000002';

describe('засипка стандартної бібліотеки', () => {
  it('укладається в десятки запитів, а не сотні', async () => {
    const client = fakeClient();

    await new LabService().seedStandardLibrary(client as any, USER, ORG);

    const inserts = client.calls.filter((call) => call.sql.includes('INSERT'));

    // Дві пачки на ноди й чіпи, по дві на схему кожного зібраного чіпа, плюс
    // тека. Рядок за рядком тут було б понад триста.
    expect(inserts.length).toBeLessThanOrEqual(2 * STANDARD_LIBRARY.length + 5);
    expect(client.calls.length).toBeLessThan(40);
  });

  it('створює всі примітиви і всі чіпи', async () => {
    const client = fakeClient();

    const result = await new LabService().seedStandardLibrary(client as any, USER, ORG);

    expect(result.added).toHaveLength(PRIMITIVE_SEEDS.length + STANDARD_LIBRARY.length);
    expect(result.seeded).toBe(true);

    const chipsInsert = client.calls.find((call) => call.sql.includes('INSERT INTO lab_chips'));
    expect(chipsInsert?.params[2]).toHaveLength(PRIMITIVE_SEEDS.length + STANDARD_LIBRARY.length);
  });

  it('дроти йдуть у деталі, які справді створені', async () => {
    const client = fakeClient();

    await new LabService().seedStandardLibrary(client as any, USER, ORG);

    const partCalls = client.calls.filter((call) => call.sql.includes('INSERT INTO lab_parts'));
    const wireCalls = client.calls.filter((call) => call.sql.includes('INSERT INTO lab_wires'));

    expect(partCalls).toHaveLength(STANDARD_LIBRARY.length);
    expect(wireCalls).toHaveLength(STANDARD_LIBRARY.length);

    partCalls.forEach((parts, index) => {
      const wires = wireCalls[index];
      const known = new Set(parts.params[3] as string[]);

      // Кінці дротів — id щойно створених деталей. `undefined` тут означав би
      // NULL у зовнішньому ключі і падіння всієї засипки посеред роботи.
      // $5 і $7 у запиті — id деталей: `from_part` і `to_part`. Порти поруч,
      // у $6 і $8, і сплутати їх легко — саме тому перевірка іменована.
      const fromParts = wires.params[4] as string[];
      const toParts = wires.params[6] as string[];

      for (const id of [...fromParts, ...toParts]) {
        expect(known.has(id)).toBe(true);
      }
    });
  });

  it('повторний виклик нічого не додає', async () => {
    const client = fakeClient();

    // База відповідає так, ніби бібліотека вже є: тека знайшлася, чіпи теж.
    client.query.mockImplementation(async (sql: string, params: any[] = []) => {
      client.calls.push({ sql, params });

      if (sql.includes("kind = 'cluster'")) return { rows: [{ id: 'cluster-1' }] };
      if (sql.includes('FROM lab_chips c')) {
        return {
          rows: [
            ...PRIMITIVE_SEEDS.map((seed) => ({
              id: `chip-${seed.name}`,
              is_primitive: true,
              prim: seed.name,
              title: seed.title,
            })),
            ...STANDARD_LIBRARY.map((def) => ({
              id: `chip-${def.key}`,
              is_primitive: false,
              prim: null,
              title: def.title,
            })),
          ],
        };
      }
      return { rows: [] };
    });

    const result = await new LabService().seedStandardLibrary(client as any, USER, ORG);

    expect(result.added).toEqual([]);
    expect(result.seeded).toBe(false);
    expect(client.calls.filter((call) => call.sql.includes('INSERT'))).toHaveLength(0);
  });
});
