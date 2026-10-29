// Материальный баланс в процентах (percentBalance и соседи): база — масса
// сырья, продукты и прочее — от неё. Пример — аммоксидирование пропилена:
// 640 кг пропилена + 360 кг аммиака (+ 700 кг кислорода сверх графа) →
// 600 кг акрилонитрила, 100 кг синильной кислоты, 900 кг воды, 50 кг потерь.

import { describe, expect, it } from "vitest";

import type {
  BalanceAmount,
  BalanceFlow,
  BalanceRecord,
  BalanceRef,
} from "../store/api/material-balance-api";
import {
  balanceMismatches,
  formatRatio,
  formatRawPerProducts,
  formatShare,
  formatShareTotal,
  isInputSide,
  parseShareInput,
  percentBalance,
  rawToProducts,
  recipeMass,
  shareTotal,
} from "./materialBalance";

const amount = (kg: number, approx = false): BalanceAmount => ({ min: kg, max: kg, approx });

function record(
  refs: BalanceRef[],
  masses: Record<string, number | null>,
  flows: BalanceFlow[] = [],
): BalanceRecord {
  return {
    id: 1,
    createdAt: "",
    model: null,
    kind: "transformation",
    transformation: "Аммоксидирование пропилена",
    basis: "Пропилен",
    target: "Акрилонитрил",
    status: "calculated",
    statusLabel: "",
    refs,
    chain: null,
    basisText: null,
    nature: null,
    products: Object.entries(masses).map(([ref, kg]) => ({
      ref,
      name: refs.find((r) => r.ref === ref)?.name ?? ref,
      massKg: kg === null ? null : amount(kg),
      massText: "",
      label: "",
      basis: "",
    })),
    coefficients: [],
    flows,
    totals: { input: null, output: null, accumulation: null, residual: null, conclusion: null },
    sources: [],
    sections: { transitions: "", balance: "", notes: "" },
    answer: "",
  };
}

const flow = (name: string, direction: BalanceFlow["direction"], kg: number): BalanceFlow => ({
  name,
  direction,
  massKg: amount(kg),
  massText: "",
  basis: "",
});

const REFS: BalanceRef[] = [
  { ref: "P1", name: "Пропилен", role: "basis" },
  { ref: "P2", name: "Акрилонитрил", role: "target" },
  { ref: "P3", name: "Аммиак", role: "input" },
  { ref: "P4", name: "Синильная кислота", role: "output" },
  { ref: "T1", name: "Аммоксидирование пропилена", role: "transformation" },
];
const FLOWS = [
  flow("Кислород", "in", 700),
  flow("Вода", "out", 900),
  flow("Потери", "out", 50),
  flow("Итого на входе", "", 1700),
];
const acn = () => record(REFS, { P1: 640, P2: 600, P3: 360, P4: 100 }, FLOWS);

const pct = (a: BalanceAmount | null) => (a ? Math.round(a.min * 1000) / 10 : null);
const byName = (rows: { name: string; share: BalanceAmount | null }[]) =>
  Object.fromEntries(rows.map((r) => [r.name, pct(r.share)]));

describe("percentBalance: всё — от массы сырья", () => {
  it("сырьё делит 100 % между собой", () => {
    const pb = percentBalance(acn());
    expect(byName(pb.raw)).toEqual({ Пропилен: 64, Аммиак: 36 });
    expect(formatShareTotal(shareTotal(pb.raw)!)).toBe("100 %");
  });

  it("продукты — в процентах от массы сырья, не 100 % сами по себе", () => {
    const pb = percentBalance(acn());
    expect(byName(pb.products)).toEqual({ Акрилонитрил: 60 });
  });

  it("«Отдельно»: реагент сверх графа на входе, побочное и потери на выходе", () => {
    const pb = percentBalance(acn());
    expect(byName(pb.separate)).toEqual({
      Кислород: 70,
      "Синильная кислота": 10,
      Вода: 90,
      Потери: 5,
    });
    expect(pb.separate.filter(isInputSide).map((r) => r.name)).toEqual(["Кислород"]);
  });

  it("итоговые строки модели («Итого на входе») в таблицу не попадают", () => {
    const pb = percentBalance(acn());
    const names = [...pb.raw, ...pb.products, ...pb.separate].map((r) => r.name);
    expect(names).not.toContain("Итого на входе");
  });

  it("роль на графе важнее роли в расчёте: реагент и побочный — в «Отдельно»", () => {
    const pb = percentBalance(acn(), (ref) =>
      ref === "P3" ? "reagent" : ref === "P2" ? "byproduct" : undefined,
    );
    expect(pb.raw.map((r) => r.name)).toEqual(["Пропилен"]);
    expect(pb.products).toEqual([]);
    expect(pb.separate.find((r) => r.name === "Аммиак")?.kind).toBe("reagent");
    expect(pb.separate.find((r) => r.name === "Акрилонитрил")?.kind).toBe("byproduct");
  });

  it("нет массы у продукта — итог продуктов неполный", () => {
    const pb = percentBalance(record(REFS, { P1: 640, P2: null, P3: 360 }));
    expect(pb.partialProducts).toBe(false); // единственный продукт без массы — посчитать нечего
    const two = percentBalance(
      record(
        [...REFS, { ref: "P5", name: "Ацетонитрил", role: "target" }],
        { P1: 640, P2: 600, P3: 360, P5: null },
      ),
    );
    expect(two.partialProducts).toBe(true);
  });

  it("массы продуктов есть, а сырья нет — доли не из чего считать", () => {
    const pb = percentBalance(
      record(
        [
          { ref: "P2", name: "Акрилонитрил", role: "target" },
          { ref: "P3", name: "Аммиак", role: "input" },
        ],
        { P2: 600, P3: null },
      ),
    );
    expect(pb.noRawMass).toBe(true);
    expect(pb.products[0].share).toBeNull();
  });
});

describe("правки вручную", () => {
  it("правка одной строки встаёт как есть и другие не меняет", () => {
    const pb = percentBalance(acn(), undefined, { P1: 70 }, "raw");
    expect(byName(pb.raw)).toEqual({ Пропилен: 70, Аммиак: 36 });
    expect(pb.raw[0].edited).toBe(true);
    expect(formatShare(pb.raw[0])).toBe("70 %");
    expect(formatShareTotal(shareTotal(pb.raw)!)).toBe("106 %");
  });

  it("правки прежней версии (от массы продуктов) переводятся на массу сырья", () => {
    // Раньше продукт был 100 % сам по себе; 600 кг продукта на 1000 кг сырья → 60 %.
    const pb = percentBalance(acn(), undefined, { P1: 70, P2: 100 });
    expect(pb.edits).toEqual({ P1: 70, P2: 60 });
    expect(byName(pb.products)).toEqual({ Акрилонитрил: 60 });
    // Сохранённые уже на массе сырья — не переводятся второй раз.
    expect(percentBalance(acn(), undefined, pb.edits, "raw").edits).toEqual({ P1: 70, P2: 60 });
  });
});

describe("соотношение сырья и продуктов", () => {
  it("1 т сырья → 0,6 т продуктов; на 1 т продуктов — 1,67 т сырья", () => {
    const r = rawToProducts(percentBalance(acn()))!;
    expect(r.productsPerRaw).toBeCloseTo(0.6);
    expect(formatRatio(r)).toBe("1 : 0,60");
    expect(formatRawPerProducts(r)).toBe("1,67");
  });

  it("оценка в массах — соотношение с «≈»", () => {
    const rec = acn();
    rec.products[0].massKg = { min: 600, max: 680, approx: true };
    const r = rawToProducts(percentBalance(rec))!;
    expect(r.approx).toBe(true);
    expect(formatRatio(r).startsWith("≈")).toBe(true);
  });

  it("продуктов нет — соотношения нет", () => {
    expect(rawToProducts({ raw: percentBalance(acn()).raw, products: [] })).toBeNull();
  });
});

describe("поле правки процента", () => {
  it.each([
    ["64,5", 64.5],
    ["64.5 %", 64.5],
    [" 100 ", 100],
    ["", undefined],
    ["abc", null],
    ["-1", null],
    ["10001", null],
  ])("«%s» → %s", (text, want) => {
    expect(parseShareInput(text)).toBe(want);
  });
});

// Расчёт капролактама 2026-10-29 (сохранён до правки сервера): в
// «Результатах» водород 1410 «кг» (тысячи м³), аммиак — норма на тонну
// продукта, серная кислота и олеум — «Часть от 1632»; в потоках — пересчёт
// на базис.
describe("противоречивый расчёт", () => {
  const refs: BalanceRef[] = [
    { ref: "P1", name: "Фенол", role: "basis" },
    { ref: "P3", name: "Водород", role: "input" },
    { ref: "P4", name: "Аммиак", role: "input" },
    { ref: "P5", name: "Серная кислота", role: "input" },
    { ref: "P6", name: "Олеум", role: "input" },
    { ref: "P2", name: "Капролактам", role: "target" },
  ];
  const capro = () => {
    const r = record(refs, { P1: 1000, P3: 1410, P4: 948, P5: 1632, P6: 1632, P2: 1080 }, [
      flow("Фенол", "in", 1000),
      flow("Водород", "in", 134),
      flow("Аммиак (P4)", "in", 1023),
      flow("Серная кислота/Олеум", "in", 1763),
      flow("Капролактам", "out", 1080),
    ]);
    const text: Record<string, string> = { P3: "≈1410*", P4: "≈948", P5: "Часть от 1632", P6: "Часть от 1632" };
    for (const p of r.products) p.massText = text[p.ref ?? ""] ?? String(p.massKg?.min ?? "");
    for (const f of r.flows) f.massText = String(f.massKg?.min ?? "");
    return r;
  };

  it("«Часть от 1632» — не масса вещества: каждому не достаётся всё число", () => {
    expect(recipeMass(capro(), "P5")).toBeNull();
    expect(recipeMass(capro(), "P6")).toBeNull();
    expect(recipeMass(capro(), "P2")?.min).toBe(1080);
  });

  it("разные массы в двух таблицах — видно, какие", () => {
    expect(balanceMismatches(capro())).toEqual([
      { name: "Водород", products: "≈1410*", flows: "134" },
      { name: "Аммиак", products: "≈948", flows: "1023" },
    ]);
  });

  it("сходящийся расчёт — без предупреждения", () => {
    expect(balanceMismatches(acn())).toEqual([]);
  });
});
