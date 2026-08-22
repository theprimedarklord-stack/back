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

const p = (
  id: string,
  name: string,
  dir: 'in' | 'out',
  index: number,
  bits = 1,
): SeedPort => ({
  id,
  name,
  dir,
  bits,
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
  {
    key: 'mux2',
    title: 'MUX 2→1',
    ports: [
      p('a', 'A', 'in', 0),
      p('b', 'B', 'in', 1),
      p('s', 'S', 'in', 2),
      p('out', 'OUT', 'out', 0),
    ],
    parts: [
      port('pa', 'a', 'in', 40, 60),
      port('pb', 'b', 'in', 40, 200),
      port('ps', 's', 'in', 40, 340),
      { ref: 'inv', type: 'not', x: 200, y: 340 },
      { ref: 'g1', type: 'and', x: 380, y: 60 },
      { ref: 'g2', type: 'and', x: 380, y: 220 },
      { ref: 'o1', type: 'or', x: 560, y: 140 },
      port('pout', 'out', 'out', 720, 160),
    ],
    // Вибір між двома входами: S=0 пропускає A, S=1 — B. З нього збирається
    // все, де треба вибрати: від регістра до ALU.
    wires: [
      ['ps', 'out', 'inv', 'in'],
      ['pa', 'out', 'g1', 'a'],
      ['inv', 'out', 'g1', 'b'],
      ['pb', 'out', 'g2', 'a'],
      ['ps', 'out', 'g2', 'b'],
      ['g1', 'out', 'o1', 'a'],
      ['g2', 'out', 'o1', 'b'],
      ['o1', 'out', 'pout', 'in'],
    ],
  },
  {
    key: 'd-latch',
    title: 'D Latch',
    ports: [
      p('d', 'D', 'in', 0),
      p('e', 'E', 'in', 1),
      p('q', 'Q', 'out', 0),
      p('nq', 'NQ', 'out', 1),
    ],
    parts: [
      port('pd', 'd', 'in', 40, 60),
      port('pe', 'e', 'in', 40, 240),
      { ref: 'n1', type: 'nand', x: 220, y: 60 },
      { ref: 'n2', type: 'nand', x: 220, y: 220 },
      { ref: 'n3', type: 'nand', x: 420, y: 60 },
      { ref: 'n4', type: 'nand', x: 420, y: 240 },
      port('pq', 'q', 'out', 620, 80),
      port('pnq', 'nq', 'out', 620, 260),
    ],
    // Перша пам'ять у розділі. Два останні NAND замкнені один на одного —
    // саме це кільце й тримає біт, коли E гасне.
    wires: [
      ['pd', 'out', 'n1', 'a'],
      ['pe', 'out', 'n1', 'b'],
      ['n1', 'out', 'n2', 'a'],
      ['pe', 'out', 'n2', 'b'],
      ['n1', 'out', 'n3', 'a'],
      ['n4', 'out', 'n3', 'b'],
      ['n2', 'out', 'n4', 'a'],
      ['n3', 'out', 'n4', 'b'],
      ['n3', 'out', 'pq', 'in'],
      ['n4', 'out', 'pnq', 'in'],
    ],
  },
  {
    key: 'd-flip-flop',
    title: 'D Flip-Flop',
    ports: [p('d', 'D', 'in', 0), p('clk', 'CLK', 'in', 1), p('q', 'Q', 'out', 0)],
    parts: [
      port('pd', 'd', 'in', 40, 60),
      port('pclk', 'clk', 'in', 40, 260),
      { ref: 'inv', type: 'not', x: 200, y: 260 },
      { ref: 'master', type: 'd-latch', x: 360, y: 60 },
      { ref: 'slave', type: 'd-latch', x: 560, y: 140 },
      port('pq', 'q', 'out', 760, 160),
    ],
    // Дві засувки з протилежним дозволом: поки CLK=0, значення входить у
    // першу, на фронті — переходить у другу. Саме тому регістр може читати
    // сам себе й не збоїти.
    wires: [
      ['pd', 'out', 'master', 'd'],
      ['pclk', 'out', 'inv', 'in'],
      ['inv', 'out', 'master', 'e'],
      ['master', 'q', 'slave', 'd'],
      ['pclk', 'out', 'slave', 'e'],
      ['slave', 'q', 'pq', 'in'],
    ],
  },
  {
    key: 'register-4',
    title: 'Register 4',
    ports: [
      p('d0', 'D0', 'in', 0),
      p('d1', 'D1', 'in', 1),
      p('d2', 'D2', 'in', 2),
      p('d3', 'D3', 'in', 3),
      p('clk', 'CLK', 'in', 4),
      p('load', 'LOAD', 'in', 5),
      p('q0', 'Q0', 'out', 0),
      p('q1', 'Q1', 'out', 1),
      p('q2', 'Q2', 'out', 2),
      p('q3', 'Q3', 'out', 3),
    ],
    parts: [
      port('pd0', 'd0', 'in', 40, 40),
      port('pd1', 'd1', 'in', 40, 180),
      port('pd2', 'd2', 'in', 40, 320),
      port('pd3', 'd3', 'in', 40, 460),
      port('pclk', 'clk', 'in', 40, 600),
      port('pload', 'load', 'in', 40, 680),
      { ref: 'm0', type: 'mux2', x: 240, y: 40 },
      { ref: 'm1', type: 'mux2', x: 240, y: 180 },
      { ref: 'm2', type: 'mux2', x: 240, y: 320 },
      { ref: 'm3', type: 'mux2', x: 240, y: 460 },
      { ref: 'f0', type: 'd-flip-flop', x: 460, y: 40 },
      { ref: 'f1', type: 'd-flip-flop', x: 460, y: 180 },
      { ref: 'f2', type: 'd-flip-flop', x: 460, y: 320 },
      { ref: 'f3', type: 'd-flip-flop', x: 460, y: 460 },
      port('pq0', 'q0', 'out', 680, 60),
      port('pq1', 'q1', 'out', 680, 200),
      port('pq2', 'q2', 'out', 680, 340),
      port('pq3', 'q3', 'out', 680, 480),
    ],
    // LOAD=0 — кожен розряд пише сам собі те, що в ньому вже є; LOAD=1 —
    // бере з входу. Без цього кільця регістр стирався б на кожному такті.
    wires: [
      ['f0', 'q', 'm0', 'a'],
      ['pd0', 'out', 'm0', 'b'],
      ['pload', 'out', 'm0', 's'],
      ['m0', 'out', 'f0', 'd'],
      ['pclk', 'out', 'f0', 'clk'],
      ['f0', 'q', 'pq0', 'in'],
      ['f1', 'q', 'm1', 'a'],
      ['pd1', 'out', 'm1', 'b'],
      ['pload', 'out', 'm1', 's'],
      ['m1', 'out', 'f1', 'd'],
      ['pclk', 'out', 'f1', 'clk'],
      ['f1', 'q', 'pq1', 'in'],
      ['f2', 'q', 'm2', 'a'],
      ['pd2', 'out', 'm2', 'b'],
      ['pload', 'out', 'm2', 's'],
      ['m2', 'out', 'f2', 'd'],
      ['pclk', 'out', 'f2', 'clk'],
      ['f2', 'q', 'pq2', 'in'],
      ['f3', 'q', 'm3', 'a'],
      ['pd3', 'out', 'm3', 'b'],
      ['pload', 'out', 'm3', 's'],
      ['m3', 'out', 'f3', 'd'],
      ['pclk', 'out', 'f3', 'clk'],
      ['f3', 'q', 'pq3', 'in'],
    ],
  },
  {
    key: 'alu-1',
    title: 'ALU 1-bit',
    ports: [
      p('a', 'A', 'in', 0),
      p('b', 'B', 'in', 1),
      p('cin', 'CIN', 'in', 2),
      p('op0', 'OP0', 'in', 3),
      p('op1', 'OP1', 'in', 4),
      p('out', 'OUT', 'out', 0),
      p('cout', 'COUT', 'out', 1),
    ],
    parts: [
      port('pa', 'a', 'in', 40, 40),
      port('pb', 'b', 'in', 40, 160),
      port('pcin', 'cin', 'in', 40, 280),
      port('pop0', 'op0', 'in', 40, 400),
      port('pop1', 'op1', 'in', 40, 480),
      { ref: 'g_and', type: 'and', x: 240, y: 40 },
      { ref: 'g_or', type: 'or', x: 240, y: 180 },
      { ref: 'g_xor', type: 'xor', x: 240, y: 320 },
      { ref: 'g_add', type: 'full-adder', x: 240, y: 460 },
      { ref: 'm0', type: 'mux2', x: 460, y: 60 },
      { ref: 'm1', type: 'mux2', x: 460, y: 300 },
      { ref: 'm2', type: 'mux2', x: 680, y: 180 },
      port('pout', 'out', 'out', 880, 200),
      port('pcout', 'cout', 'out', 880, 480),
    ],
    // Операція не вимикає непотрібне, а вибирає потрібне: рахується все
    // одразу, MUX лише пропускає одну відповідь. OP=00 AND, 01 OR, 10 XOR,
    // 11 — сума.
    wires: [
      ['pa', 'out', 'g_and', 'a'],
      ['pb', 'out', 'g_and', 'b'],
      ['pa', 'out', 'g_or', 'a'],
      ['pb', 'out', 'g_or', 'b'],
      ['pa', 'out', 'g_xor', 'a'],
      ['pb', 'out', 'g_xor', 'b'],
      ['pa', 'out', 'g_add', 'a'],
      ['pb', 'out', 'g_add', 'b'],
      ['pcin', 'out', 'g_add', 'cin'],
      ['g_and', 'out', 'm0', 'a'],
      ['g_or', 'out', 'm0', 'b'],
      ['pop0', 'out', 'm0', 's'],
      ['g_xor', 'out', 'm1', 'a'],
      ['g_add', 'sum', 'm1', 'b'],
      ['pop0', 'out', 'm1', 's'],
      ['m0', 'out', 'm2', 'a'],
      ['m1', 'out', 'm2', 'b'],
      ['pop1', 'out', 'm2', 's'],
      ['m2', 'out', 'pout', 'in'],
      ['g_add', 'cout', 'pcout', 'in'],
    ],
  },
  {
    key: 'alu-4',
    title: 'ALU 4-bit',
    ports: [
      p('a0', 'A0', 'in', 0),
      p('a1', 'A1', 'in', 1),
      p('a2', 'A2', 'in', 2),
      p('a3', 'A3', 'in', 3),
      p('b0', 'B0', 'in', 4),
      p('b1', 'B1', 'in', 5),
      p('b2', 'B2', 'in', 6),
      p('b3', 'B3', 'in', 7),
      p('op0', 'OP0', 'in', 8),
      p('op1', 'OP1', 'in', 9),
      p('r0', 'R0', 'out', 0),
      p('r1', 'R1', 'out', 1),
      p('r2', 'R2', 'out', 2),
      p('r3', 'R3', 'out', 3),
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
      port('pop0', 'op0', 'in', 40, 680),
      port('pop1', 'op1', 'in', 40, 740),
      { ref: 'z', type: 'const', x: 40, y: 820 },
      { ref: 'u0', type: 'alu-1', x: 280, y: 40 },
      { ref: 'u1', type: 'alu-1', x: 280, y: 200 },
      { ref: 'u2', type: 'alu-1', x: 280, y: 360 },
      { ref: 'u3', type: 'alu-1', x: 280, y: 520 },
      port('pr0', 'r0', 'out', 560, 60),
      port('pr1', 'r1', 'out', 560, 220),
      port('pr2', 'r2', 'out', 560, 380),
      port('pr3', 'r3', 'out', 560, 540),
      port('pcout', 'cout', 'out', 560, 660),
    ],
    // Чотири однорозрядні, зв'язані переносом. Розгорнута ця схема дає
    // півтори сотні NAND — рівно той випадок, заради якого існує швидкий
    // режим: зняти таблицю з ALU 1-bit і рахувати її одним кроком.
    wires: [
      ['pa0', 'out', 'u0', 'a'],
      ['pb0', 'out', 'u0', 'b'],
      ['z', 'out', 'u0', 'cin'],
      ['pop0', 'out', 'u0', 'op0'],
      ['pop1', 'out', 'u0', 'op1'],
      ['u0', 'out', 'pr0', 'in'],
      ['pa1', 'out', 'u1', 'a'],
      ['pb1', 'out', 'u1', 'b'],
      ['u0', 'cout', 'u1', 'cin'],
      ['pop0', 'out', 'u1', 'op0'],
      ['pop1', 'out', 'u1', 'op1'],
      ['u1', 'out', 'pr1', 'in'],
      ['pa2', 'out', 'u2', 'a'],
      ['pb2', 'out', 'u2', 'b'],
      ['u1', 'cout', 'u2', 'cin'],
      ['pop0', 'out', 'u2', 'op0'],
      ['pop1', 'out', 'u2', 'op1'],
      ['u2', 'out', 'pr2', 'in'],
      ['pa3', 'out', 'u3', 'a'],
      ['pb3', 'out', 'u3', 'b'],
      ['u2', 'cout', 'u3', 'cin'],
      ['pop0', 'out', 'u3', 'op0'],
      ['pop1', 'out', 'u3', 'op1'],
      ['u3', 'out', 'pr3', 'in'],
      ['u3', 'cout', 'pcout', 'in'],
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
  { name: 'button', title: 'Button', ports: [p('out', 'OUT', 'out', 0)] },
  { name: 'clock', title: 'Clock', ports: [p('out', 'OUT', 'out', 0)] },
  { name: 'const', title: 'Constant', ports: [p('out', 'OUT', 'out', 0)] },
  { name: 'number', title: 'Number', ports: [p('out', 'OUT', 'out', 0, 4)] },
  { name: 'lamp', title: 'Lamp', ports: [p('in', 'IN', 'in', 0)] },
  { name: 'led', title: 'LED', ports: [p('in', 'IN', 'in', 0)] },
  { name: 'probe', title: 'Probe', ports: [p('in', 'IN', 'in', 0)] },
  { name: 'digit', title: 'Display', ports: [p('in', 'IN', 'in', 0, 4)] },
  {
    name: 'seg7',
    title: '7 Segment',
    ports: [
      p('a', 'A', 'in', 0),
      p('b', 'B', 'in', 1),
      p('c', 'C', 'in', 2),
      p('d', 'D', 'in', 3),
      p('e', 'E', 'in', 4),
      p('f', 'F', 'in', 5),
      p('g', 'G', 'in', 6),
    ],
  },
  { name: 'in', title: 'Input', ports: [p('out', 'OUT', 'out', 0)] },
  { name: 'out', title: 'Output', ports: [p('in', 'IN', 'in', 0)] },
  {
    name: 'split4',
    title: 'Split 4',
    ports: [
      p('in', 'IN', 'in', 0, 4),
      p('b0', 'B0', 'out', 0),
      p('b1', 'B1', 'out', 1),
      p('b2', 'B2', 'out', 2),
      p('b3', 'B3', 'out', 3),
    ],
  },
  {
    name: 'merge4',
    title: 'Merge 4',
    ports: [
      p('b0', 'B0', 'in', 0),
      p('b1', 'B1', 'in', 1),
      p('b2', 'B2', 'in', 2),
      p('b3', 'B3', 'in', 3),
      p('out', 'OUT', 'out', 0, 4),
    ],
  },
];
