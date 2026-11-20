// Чат с ИИ, автопилот: шаг продолжается с того места, где мастер стоит
// (20.11, владелец: «открыл построение шага вверх от фенола — оно висит на
// источниках»). Сначала «найди источники для фенола вниз» — мастер скрыто
// проходит только первый этап; потом «построй шаг» — мастер берёт уже
// найденные источники, обобщает (сохранённым ответом, как step-down),
// строит и добавляет шаг. Окна не открываются.
//
// Модель не вызывается, запись на сервер не нужна. Полезно гонять и на
// сборке для разработки (StrictMode): там автопилот раньше снимался сам.

const requests = [];

const NDJSON = (proposals, reply) => {
  const events = [
    ...proposals.map((proposal) => ({ type: "proposal", proposal })),
    { type: "done", reply, proposals, tools: [], usage: { requests: 1, tokens: 600 }, model: "qwen3.7-plus" },
  ];
  return { contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" };
};

function chatReply(req) {
  const body = JSON.parse(req.postData() || "{}");
  requests.push(body);
  const phenol = (body.graph?.products || []).find((p) => p.label === "Фенол");
  if (!phenol) return NDJSON([], "Фенола на графе нет.");
  if (body.continuation) return NDJSON([], requests.length <= 2 ? "Источники найдены." : "Готово: шаг вниз от фенола добавлен.");
  if (requests.length === 1) {
    return NDJSON([{ kind: "sources", nodeId: phenol.id, label: phenol.label, direction: "down" }], "Ищу источники для фенола.");
  }
  return NDJSON([{ kind: "step", nodeId: phenol.id, label: phenol.label, direction: "down" }], "Строю шаг вниз от фенола.");
}

module.exports = {
  description: "Чат с ИИ, автопилот: сначала только источники, потом шаг — с того места, где мастер стоит",
  canned: {
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
    "/api/graphs/gpt/step/check": "fixtures/step-check-ok.json",
    "/api/graphs/gpt/chat": [chatReply, chatReply, chatReply, chatReply],
  },
  async run({ page, origin, lib, check, shot, log }) {
    let aggregateCalls = 0;
    page.on("request", (r) => {
      if (r.method() === "POST" && r.url().endsWith("/gpt/step/aggregate")) aggregateCalls++;
    });
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    const products = () => page.locator(".react-flow__node-product").count();
    const before = await products();
    let wizardSeen = false;
    const watch = setInterval(async () => {
      if (await page.getByText("Построение — «Фенол»").isVisible().catch(() => false)) wizardSeen = true;
    }, 300);

    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    const panel = page.getByRole("complementary", { name: "Чат с ИИ" });
    await panel.waitFor({ timeout: 10000 });
    await panel.getByRole("button", { name: "Автопилот" }).click();
    const ask = async (text) => {
      await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).fill(text);
      await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).press("Enter");
    };

    await ask("Найди источники для фенола вниз");
    const found = await panel.getByText("Источники найдены.").waitFor({ timeout: 120000 }).then(() => true, () => false);
    const text1 = await panel.innerText();
    check(
      "источники: мастер остановился на них, шаг не строился",
      found && /✓ источники для «Фенол» \(вниз\): \d+/.test(text1) && aggregateCalls === 0 && (await products()) === before,
      (text1.match(/[✓✗] источники[^\n]*/) || [""])[0].slice(0, 160),
    );

    await ask("Построй шаг вниз от фенола");
    const added = await panel.getByText("Готово: шаг вниз от фенола добавлен.").waitFor({ timeout: 180000 }).then(() => true, () => false);
    await lib.sleep(800);
    clearInterval(watch);
    await shot("done");
    const after = await products();
    const text2 = await panel.innerText();
    check(
      "шаг — с найденных источников: обобщение, построение, добавлен",
      added && /✓ шаг вниз от «Фенол» добавлен/.test(text2) && aggregateCalls === 1 && after > before,
      `обобщений: ${aggregateCalls}, продуктов ${before} → ${after}; ${(text2.match(/[✓✗] шаг вниз[^\n]*/) || [""])[0].slice(0, 120)}`,
    );
    check("окно мастера не открывалось", !wizardSeen);
    log(`продуктов ${before} → ${after}, обобщений ${aggregateCalls}`);
  },
};
