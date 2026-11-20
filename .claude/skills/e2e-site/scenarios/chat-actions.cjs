// Чат с ИИ: предложения этапа 4.3 (PG-MIGRATION.md) на подставном ответе
// модели. Граф — шаг «вниз» от фенола сохранёнными ответами, как в step-down:
// на нём есть преобразование «Синтез фенолоформальдегидных смол» и второе
// сырьё «Формальдегид».
//
// Проверяется: клиент объявляет серверу все виды карточек; незнакомое
// предложение пропускается; «Открыть описание» и «Открыть баланс» — карточка
// узла на этой вкладке; «Открыть окно кодов» — окно с этими продуктами;
// «Переименовать» в название продукта, который уже есть, — окно «Такой
// продукт уже есть»; «Объединить» — узел уходит, его связи — к оставшемуся;
// «Найти источники» — мастер у продукта, на экране источников; «Удалить» —
// альтернатива уходит; «Разложить» — без ошибки.
// Модель не вызывается, запись на сервер не нужна.
//
// С --live-model и --api=сервер ветки шаг остаётся подставным, а чат идёт
// через настоящий маршрут (routes/chat/) — с живой моделью или подставным
// шлюзом модели на сервере.

let lastRequest = null;

/** Поток NDJSON: предложения по id из присланного среза — как у сервера. */
function chatReply(req) {
  const g = JSON.parse(req.postData() || "{}").graph ?? {};
  const product = (label) => (g.products || []).find((p) => p.label === label);
  const phenol = product("Фенол");
  const form = product("Формальдегид");
  const synth = (g.transformations || []).find((t) => t.inputs.includes("Фенол"));
  const bisphenol = (g.alternatives || []).find((a) => a.label === "Бисфенол А");
  const proposals =
    phenol && form && synth && bisphenol
      ? [
          { kind: "codes", nodes: [phenol, form], why: "кодов нет в базе" },
          {
            kind: "balance",
            nodeId: synth.id,
            label: synth.label,
            basisId: phenol.id,
            basisLabel: phenol.label,
            knownData: "Выход смолы 98 % (e2e)",
            force: true,
          },
          { kind: "tech", nodeId: phenol.id, label: phenol.label, nodeKind: "product" },
          { kind: "rename", nodeId: form.id, label: form.label, newLabel: "Фенол", nodeKind: "product", why: "проверка окна дубля" },
          { kind: "merge", fromId: form.id, fromLabel: form.label, intoId: phenol.id, intoLabel: phenol.label },
          { kind: "sources", nodeId: phenol.id, label: phenol.label, direction: "down" },
          { kind: "delete", nodes: [{ id: bisphenol.id, label: bisphenol.label }] },
          { kind: "layout" },
          { kind: "unlayout" },
          // Сервер новее клиента: такую карточку клиент не знает.
          { kind: "future_kind", nodeId: phenol.id },
        ]
      : [];
  const events = [
    ...proposals.map((proposal) => ({ type: "proposal", proposal })),
    {
      type: "done",
      reply: "Вот что можно сделать с этим участком графа.",
      proposals,
      tools: [{ name: "graph_node", args: { name: "Фенол" }, summary: "«Фенол» на графе" }],
      usage: { requests: 2, tokens: 1500 },
      model: "qwen3.8-flash",
    },
  ];
  return { contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" };
}

module.exports = {
  description: "Чат с ИИ: карточки кодов, баланса, описания, переименования и объединения",
  canned: {
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
    "/api/graphs/gpt/step/check": "fixtures/step-check-ok.json",
    ...(process.argv.includes("--live-model") ? {} : { "/api/graphs/gpt/chat": [chatReply] }),
  },
  cannedInLive: () => true,
  async run({ page, origin, lib, check, shot, log }) {
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/gpt/chat")) lastRequest = JSON.parse(r.postData() || "{}");
    });
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    await lib.stepDownToPreview(page, "Фенол");
    await page.getByRole("button", { name: /Добавить шаг/ }).click();
    await lib.sleep(2500);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
    await lib.fitView(page);
    const products = () => page.locator(".react-flow__node-product").count();
    const before = await products();

    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    const panel = page.getByRole("complementary", { name: "Чат с ИИ" });
    await panel.waitFor({ timeout: 10000 });
    // Режим запоминается в браузере — после другого сценария мог остаться автопилот.
    await panel.getByRole("button", { name: "С подтверждением" }).click();
    await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).fill("Что ещё сделать с этим участком?");
    await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).press("Enter");
    await panel.getByText("Вот что можно сделать").waitFor({ timeout: 15000 });
    await shot("cards");

    const kinds = lastRequest?.proposals ?? [];
    check(
      "клиент объявил серверу все виды карточек",
      ["step", "show", "codes", "balance", "tech", "rename", "merge"].every((k) => kinds.includes(k)),
      kinds.join(", "),
    );
    const sent = lastRequest?.graph?.transformations ?? [];
    check(
      "альтернативы шага (фиолетовые) в срез для ИИ не идут",
      sent.length === 1 && /^Синтез/.test(sent[0].label),
      sent.map((t) => t.label).join("; "),
    );
    const titles = [
      "Коды ОКПД2 и ТН ВЭД: «Фенол», «Формальдегид»",
      "Технологическое описание: «Фенол»",
      "Переименовать «Формальдегид» → «Фенол»",
      "Объединить «Формальдегид» с «Фенол»",
      "Источники для «Фенол» вниз",
      "Удалить: «Бисфенол А»",
      "Разложить граф заново",
      "Вернуть прежнюю раскладку",
    ];
    const seen = [];
    for (const t of titles) if (await panel.getByText(t, { exact: true }).count()) seen.push(t);
    const balanceCard = panel.getByText(/^Материальный баланс: «Синтез[^»]*» на 1 т «Фенол»$/);
    const cards = await panel.getByRole("button", { name: /^(Отклонить|Скрыть)$/ }).count();
    check(
      "карточки предложений — девять, незнакомая пропущена",
      seen.length === titles.length && (await balanceCard.count()) === 1 && cards === 9,
      `заголовков ${seen.length}/${titles.length}, карточек ${cards}`,
    );

    const pressed = async (name) =>
      (await page.getByRole("button", { name, exact: true }).first().getAttribute("aria-pressed")) === "true";

    await panel.getByRole("button", { name: "Открыть описание" }).click();
    await lib.sleep(1200);
    check("«Открыть описание» — карточка «Фенола» на вкладке техописания", await pressed("Технологическое описание"));

    // «Рассчитать» — вкладка баланса и запуск расчёта (запрос к модели e2e
    // не пропускает — важна вкладка).
    await panel.getByRole("button", { name: "Рассчитать" }).click();
    await lib.sleep(1200);
    await shot("balance");
    check("«Рассчитать» — карточка преобразования на вкладке баланса", await pressed("Материальный баланс"));
    // Свои данные от ИИ — в поле «Свои данные» расчёта, как вписал бы человек.
    const known = await page.getByRole("button", { name: /^Свои данные/ }).first().innerText().catch(() => "");
    check("баланс — со своими данными от ИИ («Свои данные ✓»)", /✓/.test(known), known);

    await panel.getByRole("button", { name: "Открыть окно кодов" }).click();
    const dialog = page.getByRole("dialog", { name: "Определить коды для продуктов" });
    await dialog.waitFor({ timeout: 10000 });
    const dialogText = await dialog.innerText();
    await shot("codes");
    check("«Открыть окно кодов» — окно с этими продуктами", /Выбранные продукты \(2\)/.test(dialogText) && /Формальдегид/.test(dialogText), dialogText.slice(0, 120).replace(/\s+/g, " "));
    await dialog.getByRole("button", { name: "Закрыть" }).first().click();
    await lib.sleep(400);
    check("карточки, которые только открывают, остались", (await panel.getByRole("button", { name: "Открыть окно кодов" }).count()) === 1);

    await panel.getByRole("button", { name: "Переименовать" }).click();
    // У общего окна (ui/Modal) нет имени для экранного диктора — ищем по заголовку.
    const dup = page.getByRole("dialog").filter({ hasText: "Такой продукт уже есть на графе" });
    const dupShown = await dup.waitFor({ timeout: 8000 }).then(() => true, () => false);
    await shot("rename");
    check("переименование в продукт, который уже есть, — окно «Такой продукт уже есть»", dupShown);
    if (dupShown) await dup.getByRole("button", { name: "Оставить отдельно" }).click();
    await lib.sleep(500);
    check(
      "узел переименован, карточка предложения ушла",
      (await lib.nodeByLabel(page, "Формальдегид").count()) === 0 &&
        (await page.locator(".react-flow__node-product").filter({ has: page.getByText("Фенол", { exact: true }) }).count()) === 2 &&
        (await panel.getByText("Переименовать «Формальдегид» → «Фенол»", { exact: true }).count()) === 0,
    );

    await panel.getByRole("button", { name: "Объединить" }).click();
    await lib.sleep(1200);
    await shot("merged");
    const after = await products();
    check(
      "«Объединить» — узлов-продуктов на один меньше, остался один «Фенол»",
      after === before - 1 &&
        (await page.locator(".react-flow__node-product").filter({ has: page.getByText("Фенол", { exact: true }) }).count()) === 1,
      `продуктов было ${before}, стало ${after}`,
    );
    check("объединение — с уведомлением", (await page.getByText("Узлы объединены — «Фенол»").count()) > 0);

    // «Найти источники» — мастер у «Фенола» на экране источников, шаг не строится.
    await panel.getByRole("button", { name: "Найти источники" }).click();
    await page.getByText("Построение — «Фенол»").waitFor({ timeout: 10000 });
    const atSources = await page
      .getByRole("button", { name: /Обобщить/ })
      .first()
      .waitFor({ timeout: 60000 })
      .then(() => true, () => false);
    await shot("sources");
    check("«Найти источники» — мастер у продукта на экране источников", atSources);
    await page.keyboard.press("Escape");
    await lib.sleep(500);

    const alt = () => lib.nodeByLabel(page, "Бисфенол А", "transformation").count();
    const altBefore = await alt();
    await panel.getByRole("button", { name: "Удалить" }).click();
    await lib.sleep(800);
    check("«Удалить» — альтернатива ушла с графа", altBefore === 1 && (await alt()) === 0, `было ${altBefore}, стало ${await alt()}`);

    // Места узлов — из стора, как их держит граф (на экране — после камеры).
    const where = () =>
      page.evaluate(() =>
        [...document.querySelectorAll(".react-flow__node")].map((n) => `${n.getAttribute("data-id")}@${n.style.transform}`).sort().join("|"),
      );
    const beforeLayout = await where();
    await panel.getByRole("button", { name: "Разложить" }).click();
    await lib.sleep(1500);
    const laidOut = await where();
    check(
      "«Разложить» — граф разложен, карточка ушла",
      (await panel.getByText("Разложить граф заново", { exact: true }).count()) === 0 &&
        (await page.getByText(/граф не разложен/i).count()) === 0 &&
        laidOut !== beforeLayout,
    );
    await panel.getByRole("button", { name: "Вернуть" }).click();
    await lib.sleep(1200);
    check("«Вернуть прежнюю раскладку» — узлы на прежних местах", (await where()) === beforeLayout);
    log(`карточек: ${cards}; продуктов ${before} → ${after}`);
  },
};
