// Чат с ИИ в открытом графе (PG-MIGRATION.md, этап 4) на подставном ответе
// модели. Ответ строится по запросу: id узла в предложении — тот, что
// прислал срез графа, как у настоящего сервера (routes/chat/).
//
// Проверяется: панель открывается кнопкой справа; режим «С подтверждением»;
// в запрос уходят продукты графа и контекст выбранного узла; ход («карточка
// «Фенол»…») и ответ; «Построить шаг» — мастер у узла сам проходит этапы до
// превью (шаг — сохранёнными ответами, как в step-down), а «Добавить шаг» —
// за человеком; разговор переживает перезагрузку страницы. Модель не
// вызывается, запись на сервер не нужна.
//
// С --live-model и --api=сервер ветки ответ даёт настоящий маршрут чата
// (routes/chat/) — с живой моделью или подставным шлюзом модели на сервере.

let lastRequest = null;

/** Поток NDJSON, как у сервера: инструменты, предложения, итог. */
function chatReply(req) {
  const body = JSON.parse(req.postData() || "{}");
  const phenol = (body.graph?.products || []).find((p) => p.label === "Фенол");
  const proposals = phenol
    ? [
        { kind: "step", nodeId: phenol.id, label: phenol.label, direction: "down", why: "из фенола делают бисфенол А и смолы" },
        { kind: "show", nodes: [{ id: phenol.id, label: phenol.label }] },
      ]
    : [];
  const tools = [
    { name: "product_card", args: { name: "Фенол" }, summary: "карточка «Фенол»: разделов 6, графов 7, расчётов 11" },
    { name: "search_sources", args: { query: "фенол бисфенол" }, summary: "поиск в ИТС «фенол бисфенол»: 3" },
  ];
  const events = [
    ...tools.map((t) => ({ type: "tool", ...t })),
    ...proposals.map((proposal) => ({ type: "proposal", proposal })),
    {
      type: "done",
      reply: "Фенол получают кумольным способом (**ИТС 18—2023 · 3.6**, стр. 184–190). Дальше из него делают бисфенол А и фенолоформальдегидные смолы — предлагаю шаг вниз.",
      proposals,
      tools,
      usage: { requests: 3, tokens: 2400 },
      model: "qwen3.8-flash",
    },
  ];
  return { contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" };
}

module.exports = {
  description: "Чат с ИИ: панель, ход и ответ, «Построить шаг» → мастер у узла, разговор после перезагрузки",
  canned: {
    "/api/graphs/gpt/chat": [chatReply, chatReply],
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
    "/api/graphs/gpt/step/check": "fixtures/step-check-ok.json",
  },
  async run({ page, origin, lib, check, shot, log }) {
    // Запрос чата — из браузера: так он виден и с подставным ответом, и с
    // настоящим сервером.
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/gpt/chat")) lastRequest = JSON.parse(r.postData() || "{}");
    });
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");

    // Узел выбран — вопросы «об этом продукте» о нём.
    await lib.nodeByLabel(page, "Фенол").click();
    await lib.sleep(600);
    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    const panel = page.getByRole("complementary", { name: "Чат с ИИ" });
    await panel.waitFor({ timeout: 10000 });
    check("панель чата открылась", await panel.isVisible());
    check("контекст — выбранный узел", await panel.getByText("О выбранном узле: «Фенол»").isVisible());
    // Режим запоминается в браузере — после другого сценария мог остаться автопилот.
    await panel.getByRole("button", { name: "С подтверждением" }).click();

    await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).fill("Что делают из фенола?");
    await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).press("Enter");
    await panel.getByText(/кумольным способом/).waitFor({ timeout: 15000 });
    await shot("reply");
    check("ответ модели виден, ссылка на ИТС — жирным", await panel.locator("strong", { hasText: "ИТС 18—2023 · 3.6" }).isVisible());
    check("ход: что смотрел ИИ", await panel.getByText(/^Что смотрел ИИ \(\d+\)$/).isVisible());
    check("число запросов к модели под ответом", await panel.getByText(/^\d+ запрос\S* к модели$/).isVisible());
    check(
      "в запрос ушли продукты графа и выбранный узел",
      lastRequest?.graph?.products?.some((p) => p.label === "Фенол") &&
        lastRequest?.graph?.selectedLabel === "Фенол" &&
        lastRequest?.message === "Что делают из фенола?" &&
        lastRequest?.mode === "confirm",
      JSON.stringify({ products: lastRequest?.graph?.products?.length, selectedLabel: lastRequest?.graph?.selectedLabel }),
    );

    // «Показать на графе» — без ошибок, карточка предложения остаётся.
    await panel.getByRole("button", { name: "Показать" }).click();
    await lib.sleep(800);

    // «Построить шаг» — мастер у «Фенола» сам проходит этапы до превью.
    const productsBefore = await page.locator(".react-flow__node-product").count();
    await panel.getByRole("button", { name: "Построить шаг" }).click();
    await page.getByText("Построение — «Фенол»").waitFor({ timeout: 10000 });
    const reached = await page
      .getByRole("button", { name: /Добавить шаг/ })
      .waitFor({ timeout: 120000 })
      .then(() => true, () => false);
    await lib.sleep(500);
    const wiz = await lib.wizardText(page);
    await shot("wizard");
    check("«Построить шаг» — мастер у узла сам дошёл до превью", reached && wiz.startsWith("Построение — «Фенол»"), wiz.slice(0, 120).replace(/\s+/g, " "));
    check(
      "с подтверждением шаг не добавлен — «Добавить шаг» за человеком",
      (await page.locator(".react-flow__node-product").count()) === productsBefore,
    );
    // Точно заголовок карточки: «предложен шаг вниз от «Фенол»» есть ещё и в
    // свёрнутом списке «Что смотрел ИИ».
    check("выполненное предложение убрано из чата", !(await panel.getByText("Шаг вниз от «Фенол»", { exact: true }).count()));
    await page.keyboard.press("Escape");
    await lib.sleep(400);

    // Разговор живёт у графа и переживает перезагрузку.
    await page.reload();
    await page.locator(".react-flow__node-product", { hasText: "Фенол" }).first().waitFor({ timeout: 30000 });
    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    await panel.waitFor({ timeout: 10000 });
    check("разговор после перезагрузки на месте", await panel.getByText("Что делают из фенола?").isVisible());

    // Новый несохранённый граф — новый разговор: чат прежнего черновика в нём
    // не всплывает.
    await lib.newManualGraph(page, "Бензол");
    await lib.sleep(600);
    if (!(await panel.count())) await page.getByRole("button", { name: "Чат с ИИ" }).click();
    await panel.waitFor({ timeout: 10000 });
    check("новый граф — пустой разговор", (await panel.getByText("Что делают из фенола?").count()) === 0);
    log(`запрос: ${lastRequest?.graph?.products?.length} продуктов, выбранный узел «${lastRequest?.graph?.selectedLabel}» ${lastRequest?.graph?.selected ? "с контекстом" : "без контекста (у узла нет описания и соседей)"}`);
  },
};
