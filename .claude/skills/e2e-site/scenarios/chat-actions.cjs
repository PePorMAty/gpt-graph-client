// Чат с ИИ: предложения этапа 4.3 (PG-MIGRATION.md) на подставном ответе
// модели. Граф — шаг «вниз» от фенола сохранёнными ответами, как в step-down:
// на нём есть преобразование «Синтез фенолоформальдегидных смол» и второе
// сырьё «Формальдегид».
//
// Проверяется: клиент объявляет серверу все виды карточек; незнакомое
// предложение пропускается; «Открыть описание» и «Открыть баланс» — карточка
// узла на этой вкладке; «Открыть окно кодов» — окно с этими продуктами;
// «Переименовать» в название продукта, который уже есть, — окно «Такой
// продукт уже есть»; «Объединить» — узел уходит, его связи — к оставшемуся.
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
  const proposals =
    phenol && form && synth
      ? [
          { kind: "codes", nodes: [phenol, form], why: "кодов нет в базе" },
          { kind: "balance", nodeId: synth.id, label: synth.label },
          { kind: "tech", nodeId: phenol.id, label: phenol.label, nodeKind: "product" },
          { kind: "rename", nodeId: form.id, label: form.label, newLabel: "Фенол", nodeKind: "product", why: "проверка окна дубля" },
          { kind: "merge", fromId: form.id, fromLabel: form.label, intoId: phenol.id, intoLabel: phenol.label },
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
    ];
    const seen = [];
    for (const t of titles) if (await panel.getByText(t, { exact: true }).count()) seen.push(t);
    const balanceCard = panel.getByText(/^Материальный баланс: «Синтез/);
    const cards = await panel.getByRole("button", { name: /^(Отклонить|Скрыть)$/ }).count();
    check(
      "карточки предложений — пять, незнакомая пропущена",
      seen.length === titles.length && (await balanceCard.count()) === 1 && cards === 5,
      `заголовков ${seen.length}/${titles.length}, карточек ${cards}`,
    );

    const pressed = async (name) =>
      (await page.getByRole("button", { name, exact: true }).first().getAttribute("aria-pressed")) === "true";

    await panel.getByRole("button", { name: "Открыть описание" }).click();
    await lib.sleep(1200);
    check("«Открыть описание» — карточка «Фенола» на вкладке техописания", await pressed("Технологическое описание"));

    await panel.getByRole("button", { name: "Открыть баланс" }).click();
    await lib.sleep(1200);
    await shot("balance");
    check("«Открыть баланс» — карточка преобразования на вкладке баланса", await pressed("Материальный баланс"));

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
    log(`карточек: ${cards}; продуктов ${before} → ${after}`);
  },
};
