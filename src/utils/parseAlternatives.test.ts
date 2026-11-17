// Списки продуктов из текста обобщения. Пример — живой прогон 2026-11-17:
// «Нейлон 6,6» делился по запятой на «Нейлон 6» и «6».

import { describe, expect, it } from "vitest";

import { alternativeKey, extractStepProducts, splitProductList, variantLoopsBack } from "./parseAlternatives";

describe("splitProductList", () => {
  it("запятая между цифрами — часть названия", () => {
    expect(splitProductList("Нейлон 6,6")).toEqual(["Нейлон 6,6"]);
    expect(splitProductList("1,2-Дихлорэтан, Хлор")).toEqual(["1,2-Дихлорэтан", "Хлор"]);
    expect(splitProductList("Адипиновая кислота; Гексаметилендиамин")).toEqual([
      "Адипиновая кислота",
      "Гексаметилендиамин",
    ]);
  });

  it("запятые в скобках — уточнение одного продукта", () => {
    expect(splitProductList("Смола (эпоксидная, жидкая), Отвердитель")).toEqual([
      "Смола (эпоксидная, жидкая)",
      "Отвердитель",
    ]);
  });
});

describe("варианты шага с запятой в названии", () => {
  const variant = "- **Что производят:** [Нейлон 6,6]\n- **Из чего производят:** [Волокно нейлона 6,6]";

  it("продукты варианта — целые названия", () => {
    const { inputs, outputs } = extractStepProducts(variant);
    expect(outputs).toHaveLength(1);
    expect(inputs).toHaveLength(1);
    expect(alternativeKey({ fullDescription: variant })).toContain("6,6");
  });

  it("возврат к «Нейлону 6,6» из родословной узнаётся как рециклинг", () => {
    expect(variantLoopsBack(variant, "down", ["Волокно нейлона 6,6", "Нейлон 6,6"])).toEqual(["Нейлон 6,6"]);
  });
});
