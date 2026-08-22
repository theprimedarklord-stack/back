import { PRIMITIVE_SEEDS, STANDARD_LIBRARY, type SeedChip, type SeedPort } from './standard-library';

/**
 * Перевірка стандартної бібліотеки.
 *
 * Бібліотека — це дані, і помилка в них тиха: людина відкриє `XOR`, побачить
 * схему і не зрозуміє, чому вона рахує не те. Тому тут дві перевірки.
 *
 * Перша — будова: усі дроти йдуть у порти, які справді існують, кожен порт
 * чіпа стоїть на схемі деталлю, а чіп посилається лише на те, що визначено
 * раніше (інакше засипка впаде на середині).
 *
 * Друга — сенс: комбінаційні чіпи проганяються на всіх сполученнях і
 * звіряються з таблицею. Обчислювач тут свій, навмисно найпростіший: він
 * незалежний від рушія фронтенду, і збіг двох незалежних реалізацій означає,
 * що дані правильні, а не що обидві помиляються однаково.
 *
 * Пам'ять (`D Latch`, `D Flip-Flop`, `Register 4`) перевіряється лише будовою:
 * у неї немає таблиці істинності — відповідь залежить від того, що було
 * раніше.
 */

const primitives = new Map(PRIMITIVE_SEEDS.map((seed) => [seed.name, seed]));
const chips = new Map(STANDARD_LIBRARY.map((def) => [def.key, def]));

const portsOfType = (type: string): SeedPort[] => {
  const primitive = primitives.get(type);
  if (primitive) return primitive.ports;

  const chip = chips.get(type);
  if (chip) return chip.ports;

  throw new Error(`Невідомий тип: ${type}`);
};

describe('стандартна бібліотека: будова', () => {
  it('посилається лише на раніше визначені чіпи', () => {
    const defined = new Set<string>();

    for (const def of STANDARD_LIBRARY) {
      for (const part of def.parts) {
        const known = primitives.has(part.type) || defined.has(part.type);
        expect({ chip: def.key, type: part.type, known }).toEqual({
          chip: def.key,
          type: part.type,
          known: true,
        });
      }
      defined.add(def.key);
    }
  });

  it.each(STANDARD_LIBRARY.map((def) => [def.key, def] as const))('%s зібраний правильно', (key, def: SeedChip) => {
    const refs = def.parts.map((part) => part.ref);
    expect(new Set(refs).size).toBe(refs.length);

    // Кожен порт чіпа стоїть на схемі деталлю: без неї порт нікуди не
    // під'єднати, а зовні він обіцяє з'єднання.
    for (const port of def.ports) {
      const part = def.parts.find(
        (candidate) => candidate.role === 'port' && candidate.props?.portId === port.id,
      );
      expect(part && part.type).toBe(port.dir);
    }

    const typeOf = new Map(def.parts.map((part) => [part.ref, part.type]));

    for (const [fromRef, fromPort, toRef, toPort] of def.wires) {
      expect(typeOf.has(fromRef)).toBe(true);
      expect(typeOf.has(toRef)).toBe(true);

      const from = portsOfType(typeOf.get(fromRef)!).find((port) => port.id === fromPort);
      const to = portsOfType(typeOf.get(toRef)!).find((port) => port.id === toPort);

      expect({ ref: fromRef, port: fromPort, dir: from?.dir }).toEqual({
        ref: fromRef,
        port: fromPort,
        dir: 'out',
      });
      expect({ ref: toRef, port: toPort, dir: to?.dir }).toEqual({
        ref: toRef,
        port: toPort,
        dir: 'in',
      });
    }

    // Вхід приймає рівно один дріт: два джерела на одному вході — це не схема,
    // а суперечка.
    const feeds = def.wires.map(([, , toRef, toPort]) => `${toRef}:${toPort}`);
    expect(new Set(feeds).size).toBe(feeds.length);
  });
});

/* ── Обчислювач ───────────────────────────────────────────────────────────── */

const SEQUENTIAL = new Set(['d-latch', 'd-flip-flop', 'register-4']);

/**
 * Порахувати комбінаційний чіп.
 *
 * Деталі рахуються в порядку залежностей: спершу ті, у кого входи вже готові.
 * Порядок, а не повторні проходи, — бо чіп із чотирьох АЛУ інакше рахувався б
 * стільки разів, скільки в ньому деталей, і на кожному рівні вкладеності
 * заново.
 *
 * Кільце тут означає пам'ять, а не помилку, — але таблиці істинності в неї
 * немає, тому такий чіп сюди й не подають.
 */
function evaluate(key: string, inputs: Record<string, number>): Record<string, number> {
  const def = chips.get(key)!;
  const outputs = new Map<string, Record<string, number>>();
  const valueOf = (ref: string, port: string): number => outputs.get(ref)?.[port] ?? 0;

  const waitingFor = new Map<string, Set<string>>(def.parts.map((part) => [part.ref, new Set()]));
  // Множини, а не списки: два дроти від однієї деталі до однієї й тієї ж
  // (наприклад, обидва входи NAND від одного джерела) — це одна залежність.
  const feeds = new Map<string, Set<string>>(def.parts.map((part) => [part.ref, new Set()]));

  for (const [fromRef, , toRef] of def.wires) {
    waitingFor.get(toRef)!.add(fromRef);
    feeds.get(fromRef)!.add(toRef);
  }

  const queue = def.parts.filter((part) => waitingFor.get(part.ref)!.size === 0).map((p) => p.ref);
  let counted = 0;

  while (queue.length > 0) {
    const ref = queue.shift()!;
    const part = def.parts.find((candidate) => candidate.ref === ref)!;
    counted += 1;

    const incoming: Record<string, number> = {};
    for (const [fromRef, fromPort, toRef, toPort] of def.wires) {
      if (toRef === ref) incoming[toPort] = valueOf(fromRef, fromPort);
    }

    if (part.role === 'port') {
      const portId = String(part.props?.portId);
      outputs.set(ref, part.type === 'in' ? { out: inputs[portId] ?? 0 } : { in: incoming.in ?? 0 });
    } else if (part.type === 'nand') {
      outputs.set(ref, { out: incoming.a && incoming.b ? 0 : 1 });
    } else if (part.type === 'const') {
      outputs.set(ref, { out: 0 });
    } else {
      outputs.set(ref, evaluate(part.type, incoming));
    }

    for (const next of feeds.get(ref)!) {
      const pending = waitingFor.get(next)!;
      pending.delete(ref);
      if (pending.size === 0) queue.push(next);
    }
  }

  if (counted !== def.parts.length) {
    throw new Error(`У ${key} є кільце: таблиці істинності в нього немає`);
  }

  const result: Record<string, number> = {};
  for (const port of def.ports.filter((candidate) => candidate.dir === 'out')) {
    const part = def.parts.find(
      (candidate) => candidate.role === 'port' && candidate.props?.portId === port.id,
    )!;
    result[port.id] = valueOf(part.ref, 'in');
  }
  return result;
}

/** Усі сполучення входів чіпа. */
function combinations(def: SeedChip): Array<Record<string, number>> {
  const ins = def.ports.filter((port) => port.dir === 'in');
  const rows: Array<Record<string, number>> = [];

  for (let mask = 0; mask < 2 ** ins.length; mask += 1) {
    const row: Record<string, number> = {};
    ins.forEach((port, index) => {
      row[port.id] = (mask >> index) & 1;
    });
    rows.push(row);
  }

  return rows;
}

describe('стандартна бібліотека: сенс', () => {
  const expected: Record<string, (input: Record<string, number>) => Record<string, number>> = {
    not: ({ in: value }) => ({ out: value ? 0 : 1 }),
    and: ({ a, b }) => ({ out: a && b ? 1 : 0 }),
    or: ({ a, b }) => ({ out: a || b ? 1 : 0 }),
    xor: ({ a, b }) => ({ out: a !== b ? 1 : 0 }),
    'half-adder': ({ a, b }) => ({ sum: a !== b ? 1 : 0, carry: a && b ? 1 : 0 }),
    'full-adder': ({ a, b, cin }) => ({ sum: (a + b + cin) & 1, cout: a + b + cin > 1 ? 1 : 0 }),
    mux2: ({ a, b, s }) => ({ out: s ? b : a }),
    'alu-1': ({ a, b, cin, op0, op1 }) => ({
      out: op1 ? (op0 ? (a + b + cin) & 1 : a !== b ? 1 : 0) : op0 ? (a || b ? 1 : 0) : a && b ? 1 : 0,
      cout: a + b + cin > 1 ? 1 : 0,
    }),
  };

  it.each(Object.keys(expected))('%s рахує те, що обіцяє', (key) => {
    const def = chips.get(key)!;

    for (const inputs of combinations(def)) {
      expect({ inputs, got: evaluate(key, inputs) }).toEqual({
        inputs,
        got: expected[key](inputs),
      });
    }
  });

  it('4-bit Adder додає чотири розряди', () => {
    const bits = (value: number, prefix: string) => ({
      [`${prefix}0`]: value & 1,
      [`${prefix}1`]: (value >> 1) & 1,
      [`${prefix}2`]: (value >> 2) & 1,
      [`${prefix}3`]: (value >> 3) & 1,
    });

    for (let a = 0; a <= 15; a += 1) {
      for (let b = 0; b <= 15; b += 1) {
        const got = evaluate('adder-4', { ...bits(a, 'a'), ...bits(b, 'b'), cin: 0 });
        const sum = got.s0 + got.s1 * 2 + got.s2 * 4 + got.s3 * 8 + got.cout * 16;
        expect({ a, b, sum }).toEqual({ a, b, sum: a + b });
      }
    }
  });

  it('4-bit ALU повторює однорозрядне на кожному розряді', () => {
    for (const [op1, op0] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ]) {
      for (const [a, b] of [
        [0, 0],
        [5, 3],
        [15, 1],
        [9, 9],
      ]) {
        const inputs: Record<string, number> = { op0, op1 };
        for (let bit = 0; bit < 4; bit += 1) {
          inputs[`a${bit}`] = (a >> bit) & 1;
          inputs[`b${bit}`] = (b >> bit) & 1;
        }

        const got = evaluate('alu-4', inputs);
        const value = got.r0 + got.r1 * 2 + got.r2 * 4 + got.r3 * 8;

        const want =
          op1 === 0 ? (op0 === 0 ? a & b : a | b) : op0 === 0 ? a ^ b : (a + b) & 15;

        expect({ op1, op0, a, b, value }).toEqual({ op1, op0, a, b, value: want });
      }
    }
  });

  it('пам\'ять перевіряється лише будовою', () => {
    for (const key of SEQUENTIAL) expect(chips.has(key)).toBe(true);
  });
});
