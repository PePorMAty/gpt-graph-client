import { describe, expect, it } from "vitest";

import { plural } from "./plural";

describe("plural: подпись при числе", () => {
  it.each([
    [1, "шаг"],
    [2, "шага"],
    [4, "шага"],
    [5, "шагов"],
    [11, "шагов"],
    [12, "шагов"],
    [14, "шагов"],
    [21, "шаг"],
    [22, "шага"],
    [111, "шагов"],
    [0, "шагов"],
  ])("%i %s", (n, word) => {
    expect(plural(n, "шаг", "шага", "шагов")).toBe(word);
  });
});
