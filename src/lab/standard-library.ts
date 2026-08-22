/**
 * Стандартна бібліотека Computer Lab.
 *
 * Тут вона описана даними, а не кодом, і це головне рішення розділу: `NOT`,
 * `AND`, `OR`, `XOR` — не «магічні» вентилі, а справжні схеми з самих NAND.
 * Якби вони були примітивами, обіцянка «дійти до NAND» обривалася б на них — а
 * вона і є сенс розділу (LAB_ARCHITECTURE.md, §5).
 *
 * Порядок у масиві важливий: чіп можна поставити всередину лише після того, як
 * він створений, тому `XOR` іде після `NAND`, а `Full Adder` — після `XOR`.
 */

export interface SeedPort {
  id: string;
  name: string;
  dir: 'in' | 'out';
  bits: number;
  index: number;
}

export interface SeedPart {
  ref: string;
  /** Ім'я примітиву (`nand`, `in`, `out`) або ключ раніше створеного чіпа. */
  type: string;
  x: number;
  y: number;
  role?: 'part' | 'port';
  props?: Record<string, any>;
}

export interface SeedChip {
  key: string;
  title: string;
  ports: SeedPort[];
  parts: SeedPart[];
  /** [звідки, порт, куди, порт] */
  wires: Array<[string, string, string, string]>;
}

const p = (id: string, name: string, dir: 'in' | 'out', index: number): SeedPort => ({
  id,
  name,
  dir,
  bits: 1,
  index,
});

/** Порт схеми: усередині це деталь, зовні — порт чіпа. */
const port = (ref: string, portId: string, dir: 'in' | 'out', x: number, y: number): SeedPart => ({
  ref,
  type: dir === 'in' ? 'in' : 'out',
  role: 'port',
  x,
  y,
  props: { portId, name: portId.toUpperCase() },
});

export const STANDARD_LIBRARY: SeedChip[] = [
  {
    key: 'not',
    title: 'NOT',
    ports: [p('in', 'IN', 'in', 0), p('out', 'OUT', 'out', 0)],
    parts: [
      port('pin', 'in', 'in', 40, 120),
      { ref: 'n1', type: 'nand', x: 200, y: 100 },
      port('pout', 'out', 'out', 400, 120),
    ],
    // Обидва входи NAND на один сигнал: NAND(x,x) = NOT x.
    wires: [
      ['pin', 'out', 'n1', 'a'],
      ['pin', 'out', 'n1', 'b'],
      ['n1', 'out', 'pout', 'in'],
    ],
  },
  {
    key: 'and',
    title: 'AND',
    ports: [p('a', 'A', 'in', 0), p('b', 'B', 'in', 1), p('out', 'OUT', 'out', 0)],
    parts: [
      port('pa', 'a', 'in', 40, 80),
      port('pb', 'b', 'in', 40, 200),
      { ref: 'n1', type: 'nand', x: 200, y: 120 },
      { ref: 'inv', type: 'not', x: 360, y: 120 },
      port('pout', 'out', 'out', 520, 140),
    ],
    wires: [
      ['pa', 'out', 'n1', 'a'],
      ['pb', 'out', 'n1', 'b'],
      ['n1', 'out', 'inv', 'in'],
      ['inv', 'out', 'pout', 'in'],
    ],
  },
  {
    key: 'or',
    title: 'OR',
    ports: [p('a', 'A', 'in', 0), p('b', 'B', 'in', 1), p('out', 'OUT', 'out', 0)],
    parts: [
      port('pa', 'a', 'in', 40, 80),
      port('pb', 'b', 'in', 40, 220),
      { ref: 'na', type: 'not', x: 200, y: 80 },
      { ref: 'nb', type: 'not', x: 200, y: 220 },
      { ref: 'n1', type: 'nand', x: 380, y: 140 },
      port('pout', 'out', 'out', 540, 160),
    ],
    // Закон де Моргана: OR(a,b) = NAND(NOT a, NOT b).
    wires: [
      ['pa', 'out', 'na', 'in'],
      ['pb', 'out', 'nb', 'in'],
      ['na', 'out', 'n1', 'a'],
      ['nb', 'out', 'n1', 'b'],
      ['n1', 'out', 'pout', 'in'],
    ],
  },
  {
    key: 'xor',
    title: 'XOR',
    ports: [p('a', 'A', 'in', 0), p('b', 'B', 'in', 1), p('out', 'OUT', 'out', 0)],
    parts: [
      port('pa', 'a', 'in', 40, 80),
      port('pb', 'b', 'in', 40, 260),
      { ref: 'n1', type: 'nand', x: 200, y: 160 },
      { ref: 'n2', type: 'nand', x: 360, y: 80 },
      { ref: 'n3', type: 'nand', x: 360, y: 240 },
      { ref: 'n4', type: 'nand', x: 520, y: 160 },
      port('pout', 'out', 'out', 680, 180),
    ],
    // Класичні чотири NAND: перший дає NAND(a,b), два наступні — a·(a nand b)
    // та b·(a nand b), останній збирає їх у виключне «або».
    wires: [
      ['pa', 'out', 'n1', 'a'],
      ['pb', 'out', 'n1', 'b'],
      ['pa', 'out', 'n2', 'a'],
      ['n1', 'out', 'n2', 'b'],
      ['n1', 'out', 'n3', 'a'],
      ['pb', 'out', 'n3', 'b'],
      ['n2', 'out', 'n4', 'a'],
      ['n3', 'out', 'n4', 'b'],
      ['n4', 'out', 'pout', 'in'],
    ],
  },
  {
    key: 'half-adder',
    title: 'Half Adder',
    ports: [
      p('a', 'A', 'in', 0),
      p('b', 'B', 'in', 1),
      p('sum', 'SUM', 'out', 0),
      p('carry', 'CARRY', 'out', 1),
    ],
    parts: [
      port('pa', 'a', 'in', 40, 80),
      port('pb', 'b', 'in', 40, 220),
      { ref: 'x1', type: 'xor', x: 220, y: 80 },
      { ref: 'a1', type: 'and', x: 220, y: 220 },
      port('psum', 'sum', 'out', 420, 100),
      port('pcarry', 'carry', 'out', 420, 240),
    ],
    wires: [
      ['pa', 'out', 'x1', 'a'],
      ['pb', 'out', 'x1', 'b'],
      ['pa', 'out', 'a1', 'a'],
      ['pb', 'out', 'a1', 'b'],
      ['x1', 'out', 'psum', 'in'],
      ['a1', 'out', 'pcarry', 'in'],
    ],
  },
  {
    key: 'full-adder',
    title: 'Full Adder',
    ports: [
      p('a', 'A', 'in', 0),
      p('b', 'B', 'in', 1),
      p('cin', 'CIN', 'in', 2),
      p('sum', 'SUM', 'out', 0),
      p('cout', 'COUT', 'out', 1),
    ],
    parts: [
      port('pa', 'a', 'in', 40, 60),
      port('pb', 'b', 'in', 40, 180),
      port('pc', 'cin', 'in', 40, 300),
      { ref: 'h1', type: 'half-adder', x: 220, y: 80 },
      { ref: 'h2', type: 'half-adder', x: 420, y: 160 },
      { ref: 'o1', type: 'or', x: 620, y: 280 },
      port('psum', 'sum', 'out', 640, 140),
      port('pcout', 'cout', 'out', 800, 300),
    ],
    // Два напівсуматори і АБО: перший додає a і b, другий — їхню суму та
    // перенос, що прийшов; переноси об'єднуються.
    wires: [
      ['pa', 'out', 'h1', 'a'],
      ['pb', 'out', 'h1', 'b'],
      ['h1', 'sum', 'h2', 'a'],
      ['pc', 'out', 'h2', 'b'],
      ['h2', 'sum', 'psum', 'in'],
      ['h1', 'carry', 'o1', 'a'],
      ['h2', 'carry', 'o1', 'b'],
      ['o1', 'out', 'pcout', 'in'],
    ],
  },
  {
    key: 'adder-4',
    title: '4-bit Adder',
    ports: [
      p('a0', 'A0', 'in', 0),
      p('a1', 'A1', 'in', 1),
      p('a2', 'A2', 'in', 2),
      p('a3', 'A3', 'in', 3),
      p('b0', 'B0', 'in', 4),
      p('b1', 'B1', 'in', 5),
      p('b2', 'B2', 'in', 6),
      p('b3', 'B3', 'in', 7),
      p('cin', 'CIN', 'in', 8),
      p('s0', 'S0', 'out', 0),
      p('s1', 'S1', 'out', 1),
      p('s2', 'S2', 'out', 2),
      p('s3', 'S3', 'out', 3),
      p('cout', 'COUT', 'out', 4),
    ],
    parts: [
      port('pa0', 'a0', 'in', 40, 40),
      port('pb0', 'b0', 'in', 40, 100),
      port('pa1', 'a1', 'in', 40, 200),
      port('pb1', 'b1', 'in', 40, 260),
      port('pa2', 'a2', 'in', 40, 360),
      port('pb2', 'b2', 'in', 40, 420),
      port('pa3', 'a3', 'in', 40, 520),
      port('pb3', 'b3', 'in', 40, 580),
      port('pcin', 'cin', 'in', 40, 640),
      { ref: 'f0', type: 'full-adder', x: 260, y: 40 },
      { ref: 'f1', type: 'full-adder', x: 260, y: 200 },
      { ref: 'f2', type: 'full-adder', x: 260, y: 360 },
      { ref: 'f3', type: 'full-adder', x: 260, y: 520 },
      port('ps0', 's0', 'out', 520, 60),
      port('ps1', 's1', 'out', 520, 220),
      port('ps2', 's2', 'out', 520, 380),
      port('ps3', 's3', 'out', 520, 540),
      port('pcout', 'cout', 'out', 520, 640),
    ],
    // Перенос іде ланцюжком від молодшого розряду до старшого — це і є
    // послідовний суматор, найпростіший з можливих.
    wires: [
      ['pa0', 'out', 'f0', 'a'],
      ['pb0', 'out', 'f0', 'b'],
      ['pcin', 'out', 'f0', 'cin'],
      ['f0', 'sum', 'ps0', 'in'],
      ['pa1', 'out', 'f1', 'a'],
      ['pb1', 'out', 'f1', 'b'],
      ['f0', 'cout', 'f1', 'cin'],
      ['f1', 'sum', 'ps1', 'in'],
      ['pa2', 'out', 'f2', 'a'],
      ['pb2', 'out', 'f2', 'b'],
      ['f1', 'cout', 'f2', 'cin'],
      ['f2', 'sum', 'ps2', 'in'],
      ['pa3', 'out', 'f3', 'a'],
      ['pb3', 'out', 'f3', 'b'],
      ['f2', 'cout', 'f3', 'cin'],
      ['f3', 'sum', 'ps3', 'in'],
      ['f3', 'cout', 'pcout', 'in'],
    ],
  },
];

/**
 * Примітиви.
 *
 * Вони теж рядки в базі: деталь посилається на чіп зовнішнім ключем, а id у
 * рядка один на всю таблицю — двом людям однаковий не видати. Тому кожен
 * отримує свій id, а рушій упізнає примітив за `behavior.name`.
 */
export const PRIMITIVE_SEEDS: Array<{ name: string; title: string; ports: SeedPort[] }> = [
  {
    name: 'nand',
    title: 'NAND',
    ports: [p('a', 'A', 'in', 0), p('b', 'B', 'in', 1), p('out', 'OUT', 'out', 0)],
  },
  { name: 'switch', title: 'Switch', ports: [p('out', 'OUT', 'out', 0)] },
  { name: 'lamp', title: 'Lamp', ports: [p('in', 'IN', 'in', 0)] },
  { name: 'clock', title: 'Clock', ports: [p('out', 'OUT', 'out', 0)] },
  { name: 'const', title: 'Constant', ports: [p('out', 'OUT', 'out', 0)] },
  { name: 'in', title: 'Input', ports: [p('out', 'OUT', 'out', 0)] },
  { name: 'out', title: 'Output', ports: [p('in', 'IN', 'in', 0)] },
];
