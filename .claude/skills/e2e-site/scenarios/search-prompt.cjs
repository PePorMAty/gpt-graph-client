// Окно «Редактировать промпт поиска» в мастере шага показывает промпт,
// которым ищет сервер (GET /api/graphs/gpt/step/sources/prompt, с
// 2026-11-17: v4 или прежний — STEP_PROMPTS на сервере). Сервер старее (404)
// — своя копия клиента. Модель не вызывается.
module.exports = {
  description: "Промпт поиска в мастере шага — с сервера (или своя копия у старого сервера)",
  async run({ page, origin, lib, check, shot, log }) {
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    await lib.fitView(page);
    await lib.nodeByLabel(page, "Фенол").click();
    await lib.sleep(800);
    await page.getByRole("button", { name: "Построить шаг", exact: true }).first().click();
    await page.getByRole("button", { name: /^Построить вниз/ }).first().click().catch(() => {});
    await page.getByRole("button", { name: /Редактировать промпт поиска/ }).first().click();
    await lib.sleep(1500);
    // Поле промпта — самое длинное из открытых.
    const values = await page.$$eval("textarea", (els) => els.map((e) => e.value));
    const text = values.sort((a, b) => b.length - a.length)[0] ?? "";
    await shot("editor");
    // Запрос — из страницы: так он идёт тем же путём, что у клиента.
    const r = await page.evaluate(async (u) => {
      const res = await fetch(u);
      return { status: res.status, body: res.ok ? await res.json() : null };
    }, `/api/graphs/gpt/step/sources/prompt?direction=down&productName=${encodeURIComponent("Фенол")}&maxItems=5`);
    const masked = (t) => t.replace(/\d+/g, "#").trim();
    if (r.status === 200) {
      const server = r.body?.prompt || "";
      log(`сервер: версия ${r.body?.version}; в окне: «${text.slice(0, 60).replace(/\n/g, " ")}…»`);
      check("в окне — промпт поиска сервера", masked(text) === masked(server), `${text.length} и ${server.length} знаков`);
    } else {
      log(`сервер не знает запроса (HTTP ${r.status}) — своя копия`);
      check("сервер старее — в окне своя копия промпта", text.trim().length > 200 && /Фенол/.test(text), `${text.length} знаков`);
    }
  },
};
