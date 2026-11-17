// Проверка шага моделью (с 2026-11-16): плашка на превью построенного шага
// с «Исправить шаг» и «Исправить шаг» из отказа расчёта баланса
// («Некорректный выбор»). Модель не вызывается: шаг от фенола — сохранёнными
// ответами, как в step-down; ответы проверки — подставные
// (fixtures/step-check-*.json), отказ баланса сценарий собирает сам по
// запросу «Рассчитать» — с id узлов этого графа.
module.exports = {
  description: "Проверка шага: «Исправить шаг» в превью и из отказа баланса",
  canned: {
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
    "/api/graphs/gpt/step/check": ["fixtures/step-check-fix.json", "fixtures/step-check-balance.json"],
  },
  async run({ page, origin, lib, check, shot, log }) {
    const checks = [];
    page.on("request", (r) => {
      if (r.method() === "POST" && /\/api\/graphs\/gpt\/step\/check$/.test(r.url())) checks.push(JSON.parse(r.postData() || "{}"));
    });
    // «Рассчитать» — сразу отказ модели, как его отдаёт сервер (fromCache).
    await page.route("**/api/graphs/material-balance", async (route) => {
      const req = route.request();
      if (req.method() !== "POST") return route.fallback();
      const b = JSON.parse(req.postData() || "{}");
      const basis = b.inputs.find((n) => n.id === b.basis.id);
      const target = b.outputs.find((n) => b.targets.includes(n.id));
      const refs = [
        { ref: "P1", id: basis.id, name: basis.name, role: "basis" },
        { ref: "P2", id: target.id, name: target.name, role: "target" },
        ...b.inputs.filter((n) => n !== basis).map((n, i) => ({ ref: `P${i + 3}`, id: n.id, name: n.name, role: "input" })),
        { ref: "T1", id: b.transformation.id, name: b.transformation.name, role: "transformation" },
      ];
      const notes = `- Выбранное преобразование некорректно: из P1 «${basis.name}» и формальдегида в щелочной среде получают резольные смолы, а не новолачные.\n- Исправьте продукт P2 на графе.`;
      const result = {
        id: 990001, createdAt: new Date().toISOString(), model: "e2e", kind: "transformation",
        title: `${b.transformation.name} → ${target.name}`, transformation: b.transformation.name,
        inputs: b.inputs.map((n) => n.name), targets: [target.name],
        basisAmount: { amount: b.basis.amount, unit: b.basis.unit }, basis: basis.name, target: target.name,
        status: "invalid_selection", statusLabel: "Некорректный выбор", refs,
        chain: null, basisText: null, nature: null, products: [], coefficients: [], steps: [], flows: [],
        totals: { input: null, output: null, accumulation: null, residual: null, conclusion: null },
        sources: [], sections: { transitions: "", balance: "", notes },
        answer: `# Материальный баланс\n- **Статус:** Некорректный выбор\n\n# Примечания\n${notes}`,
      };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, fromCache: true, result, nodeIds: Object.fromEntries(refs.map((r) => [r.ref, r.id])) }),
      });
    });

    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");

    // ---------- превью: проверка нашла ошибку, «Исправить шаг» ----------
    await lib.stepDownToPreview(page, "Фенол");
    const fixBtn = page.getByRole("button", { name: "Исправить шаг", exact: true });
    await fixBtn.waitFor({ timeout: 15000 }).catch(() => {});
    let text = await lib.wizardText(page);
    await shot("preview-check");
    check("на превью — плашка «Проверка нашла ошибку» с заменой", /Проверка нашла ошибку в шаге/.test(text) && /«Фенолоформальдегидные смолы» → «Новолачные/.test(text), text.slice(0, 300));
    check("в проверку ушли раскрываемый продукт и направление", checks[0]?.anchor === "Фенол" && checks[0]?.direction === "down" && checks[0]?.inputs?.some((p) => p.name === "Формальдегид"), JSON.stringify(checks[0] ?? {}).slice(0, 300));
    await fixBtn.click();
    await page.getByText("Исправлено по проверке:").waitFor({ timeout: 10000 }).catch(() => {});
    text = await lib.wizardText(page);
    await shot("preview-fixed");
    const outputs = (text.match(/Выходные данные \(\d+\)[\s\S]*?(?=Побочные продукты|Примечания|Добавить свой)/) || [""])[0].replace(/\s+/g, " ");
    check("после «Исправить шаг» в превью — новые названия", /Новолачные фенолоформальдегидные смолы новый/.test(outputs) && /Поликонденсация фенола с формальдегидом/.test(text), outputs);
    check("исправление записано в примечания шага", /Исправлено проверкой шага:/.test(text));

    await page.getByRole("button", { name: /Добавить шаг/ }).click();
    await lib.sleep(2500);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
    await lib.fitView(page);
    let boxes = await lib.nodeBoxes(page);
    const has = (t) => boxes.some((b) => b.label.includes(t));
    check("на полотно лёг исправленный шаг", has("Поликонденсация фенола с формальдегидом") && has("Новолачные фенолоформальдегидные смолы") && !boxes.some((b) => b.label === "Фенолоформальдегидные смолы"), boxes.map((b) => b.label).join(", "));

    // ---------- отказ баланса: «Исправить шаг» → «Применить к графу» ----------
    const tabs = page.locator("nav").filter({ has: page.getByRole("button", { name: "Краткое описание", exact: true }) }).first();
    const cardText = () => tabs.locator("xpath=..").innerText().catch(() => "");
    await lib.nodeByLabel(page, "Поликонденсация фенола с формальдегидом", "transformation").click();
    await lib.sleep(1000);
    await tabs.getByRole("button", { name: "Материальный баланс", exact: true }).click();
    await lib.sleep(1000);
    await page.getByRole("button", { name: /^Рассчитать( заново)?$/ }).first().click();
    await page.getByText("Некорректный выбор").first().waitFor({ timeout: 15000 }).catch(() => {});
    await lib.sleep(800);
    await shot("balance-refused");
    text = await cardText();
    check("отказ баланса: есть «Исправить шаг»", /Некорректный выбор/.test(text) && (await page.getByRole("button", { name: "Исправить шаг", exact: true }).count()) === 1, text.slice(0, 300).replace(/\s+/g, " "));
    await page.getByRole("button", { name: "Исправить шаг", exact: true }).click();
    const apply = page.getByRole("button", { name: "Применить к графу", exact: true });
    await apply.waitFor({ timeout: 15000 }).catch(() => {});
    await shot("balance-fix");
    const second = checks[1] ?? {};
    check(
      "в проверку ушли замечание баланса с расшифровкой P1 и запрет трогать связанные продукты",
      /отказался считать/.test(second.remark || "") && /P1 — «Фенол»/.test(second.remark || "") && !second.anchor,
      `fixed: ${JSON.stringify(second.fixed)}; remark: ${(second.remark || "").slice(0, 160)}`,
    );
    log(`fixed во второй проверке: ${JSON.stringify(second.fixed)}`);
    await apply.click();
    await lib.sleep(1200);
    await shot("balance-applied");
    text = await cardText();
    check("после «Применить к графу» — «Исправлено» и «Новый расчёт»", /Исправлено по проверке/.test(text) && /посчитайте баланс заново/.test(text), text.slice(0, 400).replace(/\s+/g, " "));
    // «Новый расчёт» из плашки — форма расчёта с теми же продуктами.
    // Первая с точной подписью — в плашке (у чипа «+ Новый расчёт» подпись другая).
    await page.getByRole("button", { name: "Новый расчёт", exact: true }).first().click();
    await lib.sleep(800);
    check("«Новый расчёт» открывает форму расчёта", /Новый расчёт — в массовых процентах/.test(await cardText()));
    await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
    await lib.fitView(page);
    boxes = await lib.nodeBoxes(page);
    check("узел на графе переименован", has("Резольные фенолоформальдегидные смолы") && !has("Новолачные"), boxes.map((b) => b.label).join(", "));
  },
};
