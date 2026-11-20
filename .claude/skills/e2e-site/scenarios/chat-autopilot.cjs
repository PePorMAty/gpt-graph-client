// Чат с ИИ в режиме автопилота (PG-MIGRATION.md, 4.4–4.6) на подставных
// ответах модели. Ход разговора:
//   1) «Построй шаг вниз от фенола» → шаг вниз: мастер проходит этапы СКРЫТО
//      (источники из базы, обобщение и построение — сохранёнными ответами,
//      как в step-down) и добавляет шаг; окна не открываются;
//   2) итог автопилота → модели (continuation), в срезе — последние
//      изменения графа («Шаг принят» с преобразованием); модель завершает;
//   3) «Альтернативы фенола, описание, в закладки, коды» → альтернативы без
//      шага, описание узла, закладка, коды — скрытым окном кодов (ответ
//      подбора подставной); итог → модели, она завершает.
//
// Проверяется: окно мастера не появлялось; шаг на полотне; итоги под
// карточками; пометка «не заполнен» ушла после описания. Модель не
// вызывается, запись на сервер не нужна.

const requests = [];

const NDJSON = (proposals, reply) => {
  const events = [
    ...proposals.map((proposal) => ({ type: "proposal", proposal })),
    { type: "done", reply, proposals, tools: [], usage: { requests: 1, tokens: 800 }, model: "qwen3.8-flash" },
  ];
  return { contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" };
};

function chatReply(req) {
  const body = JSON.parse(req.postData() || "{}");
  requests.push(body);
  const phenol = (body.graph?.products || []).find((p) => p.label === "Фенол");
  if (body.continuation) return NDJSON([], requests.length <= 2 ? "Готово: шаг вниз от фенола добавлен." : "Готово: альтернативы на графе, описание записано.");
  if (!phenol) return NDJSON([], "Фенола на графе нет.");
  if (requests.length === 1) {
    return NDJSON([{ kind: "step", nodeId: phenol.id, label: phenol.label, direction: "down", why: "просили шаг вниз" }], "Строю шаг вниз от фенола.");
  }
  return NDJSON(
    [
      { kind: "alternatives", nodeId: phenol.id, label: phenol.label, direction: "down" },
      { kind: "describe", nodeId: phenol.id, label: phenol.label, description: "Ароматический спирт, сырьё для смол и бисфенола А.", industry: "Химическая промышленность" },
      { kind: "bookmark", nodes: [{ id: phenol.id, label: phenol.label }] },
      { kind: "codes", nodes: [{ id: phenol.id, label: phenol.label }] },
    ],
    "Ищу альтернативы, пишу описание и ставлю закладку.",
  );
}

module.exports = {
  description: "Чат с ИИ, автопилот без окон: шаг, альтернативы без шага, описание, закладка",
  canned: {
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
    "/api/graphs/gpt/step/check": "fixtures/step-check-ok.json",
    "/api/graphs/gpt/chat": [chatReply, chatReply, chatReply, chatReply],
  },
  async run({ page, origin, lib, check, shot, log }) {
    // Подбор кодов — подставной ответ, как в product-codes: ОКПД2 найден.
    let codesAsked = 0;
    await page.route("**/api/graphs/gpt/product-codes", async (route) => {
      const b = JSON.parse(route.request().postData() || "{}");
      codesAsked++;
      const out = { success: true, name: b.name, saved: {}, shared: false, cleared: [], requests: 0 };
      for (const k of b.kinds) {
        out.requests += 1;
        if (k === "okpd2") {
          out[k] = { status: "found", code: "20.14.24.111", name: "Фенол", subgroup: "20.14" };
          out.saved[k] = { code: "20.14.24.111", name: "Фенол", subgroup: "20.14", model: "e2e", at: new Date().toISOString() };
        } else out[k] = { status: "none", reason: "e2e" };
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(out) });
    });
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    const products = () => page.locator(".react-flow__node-product").count();
    const before = await products();
    // Окно мастера шага — не должно появиться ни разу.
    // А ход скрытого мастера — строкой «мастер шага: …» в чате.
    let wizardSeen = false;
    const stages = new Set();
    const watch = setInterval(async () => {
      if (await page.getByText("Построение — «Фенол»").isVisible().catch(() => false)) wizardSeen = true;
      const line = await page.getByText(/^мастер шага: /).first().innerText({ timeout: 100 }).catch(() => "");
      if (line) stages.add(line.replace("мастер шага: ", ""));
    }, 150);

    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    const panel = page.getByRole("complementary", { name: "Чат с ИИ" });
    await panel.waitFor({ timeout: 10000 });
    const auto = panel.getByRole("button", { name: "Автопилот" });
    await auto.click();
    check("переключатель: «Автопилот» выбран", (await auto.getAttribute("aria-pressed")) === "true");

    const ask = async (text) => {
      await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).fill(text);
      await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).press("Enter");
    };
    await ask("Построй шаг вниз от фенола");
    const added = await panel
      .getByText("Готово: шаг вниз от фенола добавлен.")
      .waitFor({ timeout: 180000 })
      .then(() => true, () => false);
    await lib.sleep(800);
    await shot("step");
    const after = await products();
    check("в запрос ушёл режим автопилота", requests[0]?.mode === "auto", JSON.stringify({ mode: requests[0]?.mode }));
    check("шаг добавлен, продуктов больше", added && after > before, `продуктов было ${before}, стало ${after}`);
    check("ход мастера — строкой в чате («мастер шага: …»)", stages.size > 0, [...stages].join(" → "));
    const cont = requests[1] ?? {};
    check(
      "итог шага — модели: continuation с новыми продуктами",
      cont.continuation === true && /^Автопилот: шаг вниз от «Фенол» добавлен/.test(cont.message ?? "") && /Фенолоформальдегидные смолы/.test(cont.message ?? ""),
      (cont.message ?? "").slice(0, 160),
    );
    const recent = cont.graph?.recent ?? [];
    check(
      "в срезе — последние изменения: «Шаг принят» с преобразованием",
      recent.some((r) => r.title === "Шаг принят" && /«Синтез фенолоформальдегидных смол»: .*Фенол.* → /.test(r.details ?? "")),
      JSON.stringify(recent[0] ?? null).slice(0, 200),
    );

    await ask("Альтернативы фенола, описание и в закладки");
    const second = await panel
      .getByText("Готово: альтернативы на графе, описание записано.")
      .waitFor({ timeout: 120000 })
      .then(() => true, () => false);
    await lib.sleep(500);
    clearInterval(watch);
    await shot("extras");
    const text = await panel.innerText();
    check("окно мастера шага не открывалось", !wizardSeen && (await page.getByText("Построение — «Фенол»").count()) === 0);
    check("альтернативы без шага — итог с вариантами", second && /✓ альтернативы «Фенол» \(пути переработки\) на графе: «/.test(text), (text.match(/[✓✗] альтернативы[^\n]*/) || [""])[0].slice(0, 160));
    check("описание записано, пометка «не заполнен» ушла", /✓ описание «Фенол» записано/.test(text) && (await lib.nodeByLabel(page, "Фенол").getByText("не заполнен").count()) === 0);
    check("закладка поставлена", /✓ в закладках: «Фенол»/.test(text));
    check(
      "коды — скрытым окном, без кликов, итог в чате; окно закрылось",
      codesAsked === 1 &&
        /✓ «Фенол»: коды определены для 1 продукта из 1/.test(text) &&
        (await page.getByRole("dialog", { name: "Определить коды для продуктов" }).count()) === 0,
      (text.match(/[✓✗] «Фенол»: коды[^\n]*/) || [""])[0].slice(0, 160),
    );
    check("запросов к модели — четыре ответа, без лишних кругов", requests.length === 4, `запросов: ${requests.length}`);
    log(`продуктов ${before} → ${after}; последние изменения: ${JSON.stringify(recent[0] ?? null).slice(0, 160)}`);
  },
};
