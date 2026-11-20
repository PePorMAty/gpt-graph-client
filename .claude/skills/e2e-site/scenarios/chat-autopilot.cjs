// Чат с ИИ в режиме автопилота (PG-MIGRATION.md, 4.4) на подставных ответах
// модели: ИИ просит шаг вниз от фенола — мастер сам проходит этапы
// (источники из базы, обобщение и построение — сохранёнными ответами, как в
// step-down) и добавляет шаг; итог уходит модели, и она завершает задачу.
//
// Проверяется: переключатель режима; запрос с mode: "auto"; мастер дошёл до
// «Добавить шаг» без кликов и закрылся; на полотне новые узлы; второй запрос
// — итог автопилота (continuation) с новыми продуктами; под карточкой итог
// «✓ …» вместо кнопок. Модель не вызывается, запись на сервер не нужна.

const requests = [];

/** Первый запрос — шаг вниз от «Фенол»; итог автопилота — «готово». */
function chatReply(req) {
  const body = JSON.parse(req.postData() || "{}");
  requests.push(body);
  const phenol = (body.graph?.products || []).find((p) => p.label === "Фенол");
  const proposals = !body.continuation && phenol ? [{ kind: "step", nodeId: phenol.id, label: phenol.label, direction: "down", why: "просили шаг вниз" }] : [];
  const events = [
    ...proposals.map((proposal) => ({ type: "proposal", proposal })),
    {
      type: "done",
      reply: body.continuation ? "Готово: шаг вниз от фенола добавлен." : "Строю шаг вниз от фенола.",
      proposals,
      tools: [],
      usage: { requests: 1, tokens: 800 },
      model: "qwen3.8-flash",
    },
  ];
  return { contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" };
}

module.exports = {
  description: "Чат с ИИ, автопилот: шаг вниз от фенола строится и добавляется сам, итог — модели",
  canned: {
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
    "/api/graphs/gpt/step/check": "fixtures/step-check-ok.json",
    "/api/graphs/gpt/chat": [chatReply, chatReply, chatReply],
  },
  async run({ page, origin, lib, check, shot, log }) {
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    const products = () => page.locator(".react-flow__node-product").count();
    const before = await products();

    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    const panel = page.getByRole("complementary", { name: "Чат с ИИ" });
    await panel.waitFor({ timeout: 10000 });
    const auto = panel.getByRole("button", { name: "Автопилот" });
    await auto.click();
    check("переключатель: «Автопилот» выбран", (await auto.getAttribute("aria-pressed")) === "true");

    await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).fill("Построй шаг вниз от фенола");
    await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).press("Enter");
    // Мастер проходит этапы сам — источники из базы, обобщение, построение.
    const added = await panel
      .getByText("Готово: шаг вниз от фенола добавлен.")
      .waitFor({ timeout: 180000 })
      .then(() => true, () => false);
    await lib.sleep(800);
    await shot("done");
    const after = await products();
    check("в запрос ушёл режим автопилота", requests[0]?.mode === "auto", JSON.stringify({ mode: requests[0]?.mode }));
    check("шаг добавлен без кликов: мастер закрыт, продуктов больше", added && after > before && (await page.getByText("Построение — «Фенол»").count()) === 0, `продуктов было ${before}, стало ${after}`);
    const cont = requests[1] ?? {};
    check(
      "итог автопилота — модели: continuation с новыми продуктами",
      cont.continuation === true && /^Автопилот: шаг вниз от «Фенол» добавлен/.test(cont.message ?? "") && /Фенолоформальдегидные смолы/.test(cont.message ?? ""),
      (cont.message ?? "").slice(0, 200),
    );
    check("под карточкой — итог вместо кнопок", (await panel.getByText(/^✓ шаг вниз от «Фенол» добавлен/).count()) === 1 && (await panel.getByRole("button", { name: "Построить шаг" }).count()) === 0);
    check("строка «Автопилот: …» в разговоре", (await panel.getByText(/^Автопилот: шаг вниз/).count()) === 1);
    check("запросов к модели — два ответа, без лишних кругов", requests.length === 2, `запросов: ${requests.length}`);
    log(`продуктов ${before} → ${after}; итог: ${(cont.message ?? "").slice(0, 160)}`);
  },
};
