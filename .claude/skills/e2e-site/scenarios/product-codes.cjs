// «Определение кодов» (с 2026-11-17): кнопка на правом рельсе → выбор
// продуктов щелчком на полотне (панель внизу) → окно: виды кодов, свой
// промпт → коды по каждому продукту → в карточке «Промышленное знание» —
// «определён моделью».
//
// Модель не вызывается. Шаг от фенола — сохранёнными ответами, как в
// step-down. Ответ определения кодов сценарий собирает сам по названию из
// запроса (продукты идут по два сразу — очерёдность ответов не задана), а
// боевой сервер, если ещё старее ветки, дополняется: промпты по умолчанию и
// поле modelCodes в /industry/lookup — как их отдаёт новый сервер.
// Фенол — как общее название (shared: false): код только на узле, по
// названию сервер его не отдаёт; ТН ВЭД — «не определён» с причиной.
const CODES = {
  Фенол: {
    okpd2: { code: "20.14.24.111", name: "Фенол", subgroup: "20.14" },
    tnved: null,
  },
  Формальдегид: {
    okpd2: { code: "20.14.61.110", name: "Формальдегид", subgroup: "20.14" },
    tnved: { code: "2912110000", display: "2912 11 000 0", name: "метаналь (формальдегид)", subgroup: "2912" },
  },
};

module.exports = {
  description: "Определение кодов: выбор продуктов на полотне, окно, коды моделью в карточке",
  canned: {
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
    "/api/graphs/gpt/step/check": "fixtures/step-check-ok.json",
  },
  async run({ page, origin, lib, check, shot, log }) {
    const asked = [];
    const saved = {};
    const at = new Date().toISOString();
    await page.route("**/api/graphs/gpt/product-codes", async (route) => {
      const b = JSON.parse(route.request().postData() || "{}");
      asked.push(b);
      const codes = CODES[b.name] ?? {};
      const shared = b.name !== "Фенол";
      const out = { success: true, name: b.name, saved: {}, shared, cleared: [], requests: 0 };
      for (const k of b.kinds) {
        const c = codes[k];
        out.requests += 1;
        if (c) {
          out[k] = { status: "found", ...c };
          out.saved[k] = { ...c, model: "e2e", at };
        } else {
          out[k] = { status: "none", reason: "код зависит от степени чистоты", missing: "код зависит от степени чистоты", subgroup: "2907", subgroupName: "Фенолы; фенолоспирты" };
        }
      }
      if (shared) saved[b.name] = { ...(saved[b.name] ?? {}), ...out.saved };
      await new Promise((ok) => setTimeout(ok, 600));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
    });
    await page.route("**/api/industry/codes/prompts", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, prompts: { okpd2: "Product name: <<<PRODUCT>>>.\nОКПД2 e2e.\n<<<FRAGMENT>>>", tnved: "Product name: <<<PRODUCT>>>.\nТН ВЭД e2e.\n<<<FRAGMENT>>>" } }),
      }),
    );
    await page.route("**/api/industry/lookup", async (route) => {
      // Сборка отдаётся с localhost, API — боевой сервер.
      const res = await route.fetch({ url: `https://sorangptgraph.xyz${new URL(route.request().url()).pathname}` });
      const body = await res.json().catch(() => ({}));
      const names = JSON.parse(route.request().postData() || "{}").products ?? [];
      body.modelCodes = Object.fromEntries(names.filter((n) => saved[n]).map((n) => [n, saved[n]]));
      await route.fulfill({ response: res, body: JSON.stringify(body) });
    });

    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    await lib.stepDownToPreview(page, "Фенол");
    await page.getByRole("button", { name: /Добавить шаг/ }).click();
    await lib.sleep(2500);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
    await lib.fitView(page);

    // ---------- выбор продуктов на полотне ----------
    const tool = page.getByRole("button", { name: "Определение кодов", exact: true });
    await tool.click();
    await lib.sleep(500);
    const bar = page.getByRole("region", { name: "Выбор продуктов для определения кодов" });
    check("кнопка «Определение кодов» включает выбор продуктов", (await bar.count()) === 1 && (await tool.getAttribute("aria-pressed")) === "true");
    await lib.nodeByLabel(page, "Фенол").click();
    await lib.nodeByLabel(page, "Формальдегид").click();
    await lib.nodeByLabel(page, "Синтез фенолоформальдегидных смол", "transformation").click();
    await lib.sleep(400);
    let text = await bar.innerText();
    const picked = await page.$$eval(".react-flow__node.node--code-pick", (e) => e.length);
    await shot("pick");
    check("щелчок выбирает продукты, преобразование не выбирается", /2 продукта/.test(text) && picked === 2, `${text.replace(/\s+/g, " ")}; отмечено узлов: ${picked}`);
    check("карточка в режиме выбора не открывается", (await page.getByRole("button", { name: "Закрыть карточку" }).count()) === 0);
    await lib.nodeByLabel(page, "Формальдегид").click();
    await lib.sleep(200);
    check("повторный щелчок снимает выбор", /(^|\s)1 продукт(\s|$)/.test(await bar.innerText()));
    await lib.nodeByLabel(page, "Формальдегид").click();
    await bar.getByRole("button", { name: /Продолжить/ }).click();
    await lib.sleep(600);

    // ---------- окно ----------
    const dialog = page.getByRole("dialog", { name: "Определить коды для продуктов" });
    text = await dialog.innerText();
    check("окно: выбранные продукты и оба вида кодов", /Выбранные продукты \(2\)/.test(text) && /Фенол/.test(text) && /Формальдегид/.test(text) && (await dialog.getByRole("checkbox").count()) === 2, text.slice(0, 200).replace(/\s+/g, " "));
    await shot("modal");
    await dialog.getByRole("button", { name: /Редактировать промпт/ }).click();
    const area = dialog.getByRole("textbox", { name: "Промпт ОКПД 2" });
    await area.fill(`${await area.inputValue()}\nСвой текст e2e.`);
    check("правка промпта отмечена «свой»", (await dialog.getByRole("button", { name: /ОКПД 2 · свой/ }).count()) === 1);
    await dialog.getByRole("button", { name: "Получить коды" }).click();
    await dialog.getByText(/^Готово: 2 из 2/).waitFor({ timeout: 20000 }).catch(() => {});
    text = await dialog.innerText();
    await shot("results");
    check("коды по каждому продукту", /Готово: 2 из 2/.test(text) && /20\.14\.61\.110/.test(text) && /20\.14\.24\.111/.test(text), text.slice(0, 500).replace(/\s+/g, " "));
    check(
      "«не определён» — с подгруппой и причиной; общее название — «сохранено на узле»",
      /не определён \(подгруппа 2907 «Фенолы; фенолоспирты»\): код зависит от степени чистоты — уточните название продукта/.test(text) &&
        /сохранено на узле/.test(text) &&
        /Название общее/.test(text),
      text.slice(0, 600).replace(/\s+/g, " "),
    );
    const f = asked.find((b) => b.name === "Формальдегид") ?? {};
    check(
      "в запрос ушли виды кодов, свой промпт ОКПД2 и текущие коды",
      asked.length === 2 && f.kinds?.join() === "okpd2,tnved" && /Свой текст e2e/.test(f.prompts?.okpd2 ?? "") && !f.prompts?.tnved && "current" in f &&
        f.usedFor?.includes("Фенолоформальдегидные смолы"),
      JSON.stringify(f).slice(0, 300),
    );
    check("уведомление «Коды сохранены»", (await page.getByText("Коды сохранены в промышленном знании").count()) > 0);
    await dialog.getByRole("button", { name: "Готово" }).click();
    await lib.sleep(500);
    check("после «Готово» режим выбора выключен", (await bar.count()) === 0 && (await page.$$eval(".react-flow__node.node--code-pick", (e) => e.length)) === 0);

    // ---------- карточка ----------
    await lib.nodeByLabel(page, "Формальдегид").click();
    await lib.sleep(800);
    const tabs = page.locator("nav").filter({ has: page.getByRole("button", { name: "Краткое описание", exact: true }) }).first();
    await tabs.getByRole("button", { name: "Промышленное знание", exact: true }).click();
    await page.getByText("определён моделью").first().waitFor({ timeout: 15000 }).catch(() => {});
    const card = await tabs.locator("xpath=..").innerText();
    await shot("card");
    check("в карточке — коды «определён моделью»", /20\.14\.61\.110/.test(card) && /2912 11 000 0/.test(card) && /определён моделью/.test(card), card.slice(0, 600).replace(/\s+/g, " "));
    await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
    // Код общего названия — с самого узла: по названию сервер его не отдаёт.
    await lib.nodeByLabel(page, "Фенол").click();
    await lib.sleep(800);
    await tabs.getByRole("button", { name: "Промышленное знание", exact: true }).click();
    await page.getByText("20.14.24.111").first().waitFor({ timeout: 10000 }).catch(() => {});
    const phenol = await tabs.locator("xpath=..").innerText();
    await shot("card-node");
    check("код, записанный на узел, — в карточке узла", /20\.14\.24\.111/.test(phenol) && /определён моделью/.test(phenol), phenol.slice(0, 500).replace(/\s+/g, " "));
    log(`запросов определения кодов: ${asked.length}`);
  },
};
