// Окно «Редактировать промпт обобщения» в мастере шага показывает промпт,
// которым обобщает сервер (GET /api/graphs/gpt/step/aggregate/prompt: v4 или
// прежний — STEP_PROMPTS на сервере). Модель не вызывается: источники шага —
// подставной ответ поиска (fixtures/two-sources.json).
module.exports = {
  description: "Промпт обобщения в мастере шага — с сервера (v4 или прежний)",
  canned: { "/api/graphs/gpt/step/sources": "fixtures/two-sources.json" },
  async run({ page, origin, lib, check, shot, log }) {
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    await lib.fitView(page);
    await lib.nodeByLabel(page, "Фенол").click();
    await lib.sleep(800);
    await page.getByRole("button", { name: "Построить шаг", exact: true }).first().click();
    await page.getByRole("button", { name: /^Построить вниз/ }).first().click().catch(() => {});
    await page.getByRole("button", { name: /^\s*(К источникам из базы|Найти источники|К источникам)\s*$/ }).first().click();
    await page.getByRole("button", { name: /Редактировать промпт обобщения/ }).first().waitFor({ timeout: 60000 });
    await page.getByRole("button", { name: /Редактировать промпт обобщения/ }).first().click();
    await lib.sleep(2000);
    const values = await page.$$eval("textarea", (els) => els.map((e) => e.value));
    const text = values.sort((a, b) => b.length - a.length)[0] ?? "";
    await shot("editor");
    const r = await page.evaluate(async () => {
      const res = await fetch("/api/graphs/gpt/step/aggregate/prompt?direction=down");
      return res.ok ? res.json() : null;
    });
    const version = /единый контракт шага/.test(r?.system ?? "") ? "v4" : "прежний";
    log(`сервер: ${version}; в окне ${text.length} знаков: «${text.slice(0, 70).replace(/\n/g, " ")}…»`);
    check(
      "в окне — промпт обобщения сервера (системная часть и шаблон)",
      !!r && text.includes(r.system.trim().slice(0, 300)) && text.includes(r.template.trim().slice(0, 300)),
      `сервер: ${version}`,
    );
  },
};
