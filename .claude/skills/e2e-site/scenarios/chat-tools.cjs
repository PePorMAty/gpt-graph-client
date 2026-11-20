// Чат с ИИ, автопилот: работа с графом целиком (PG-MIGRATION.md 4.9,
// предложения владельца 20.11). Ход:
//   1) «добавь бензол» → продукт на графе; «↶ Отменить действия этого
//      ответа» — бензола нет, модели уходит «человек отменил»;
//   2) «возьми из библиотеки, что делают из фенола» → кусок цепочки из графа
//      библиотеки (GRAPH, по умолчанию «фенол_новые промты_тест») встаёт у
//      «Фенола» без запросов к модели;
//   3) «отмени» → действие undo: граф — как до вставки;
//   4) «построй цепочку до фенола» → карточка плана; автопилот её не
//      выполняет, «Выполнить план» шлёт «Выполняй план …»;
//   5) «сделай отчёт» → карточка отчёта, «Скачать .md» — файл с ответом.
// Модель не вызывается, запись на сервер не нужна.

const requests = [];
const lib = { graphId: null, graphName: null, nodeId: null };

const NDJSON = (proposals, reply) => {
  const events = [
    ...proposals.map((proposal) => ({ type: "proposal", proposal })),
    { type: "done", reply, proposals, tools: [], usage: { requests: 1, tokens: 500 }, model: "qwen3.7-plus" },
  ];
  return { contentType: "application/x-ndjson", body: events.map((e) => JSON.stringify(e)).join("\n") + "\n" };
};

function chatReply(req) {
  const body = JSON.parse(req.postData() || "{}");
  requests.push(body);
  const msg = body.message ?? "";
  const phenol = (body.graph?.products ?? []).find((p) => p.label === "Фенол");
  if (body.continuation) return NDJSON([], "Сделано.");
  if (/бензол/.test(msg)) return NDJSON([{ kind: "add", id: "chat-e2e-benz", label: "Бензол" }], "Добавляю бензол.");
  if (/библиотек/.test(msg) && phenol) {
    return NDJSON(
      [{ kind: "import", nodeId: phenol.id, label: phenol.label, direction: "down", depth: 1, graphId: lib.graphId, graphName: lib.graphName, libraryNodeId: lib.nodeId }],
      "Беру готовые шаги из библиотеки.",
    );
  }
  if (/^отмени/.test(msg)) return NDJSON([{ kind: "undo", why: "просили отменить" }], "Отменяю.");
  if (/цепочку/.test(msg)) {
    return NDJSON(
      [{ kind: "plan", title: "Цепочка до фенола", steps: ["шаг вверх от фенола", "шаг вверх от кумола", "баланс кумольного способа"], requests: 24 }],
      "Предлагаю план.",
    );
  }
  if (/^Выполняй план/.test(msg)) return NDJSON([], "Начинаю по плану.");
  if (/отчёт/.test(msg)) return NDJSON([{ kind: "report", title: "Фенол — отчёт" }], "## Фенол\n\n| Шаг | Сырьё |\n|---|---|\n| Кумольный способ | кумол |");
  return NDJSON([], "Понял.");
}

module.exports = {
  description: "Чат с ИИ: отмена действий ИИ, кусок цепочки из библиотеки, план с кнопкой, отчёт файлом",
  canned: { "/api/graphs/gpt/chat": Array.from({ length: 12 }, () => chatReply) },
  async run({ page, origin, env, lib: e2e, check, shot, log }) {
    await e2e.openApp(page, origin);
    // Граф библиотеки и «фенол» в нём — для вставки (запрос из страницы:
    // API идёт через прокси прогона).
    Object.assign(
      lib,
      await page.evaluate(async (name) => {
        const list = await (await fetch("/api/graph-files")).json();
        const meta = (list.data ?? []).find((g) => g.name === name);
        if (!meta) return {};
        const file = await (await fetch(`/api/graph-files/${encodeURIComponent(meta.id)}`)).json();
        const graph = file.graph ?? file.data?.graph ?? { nodes: [] };
        const node = graph.nodes.find((n) => n.type === "product" && String(n.data?.label).toLowerCase() === "фенол");
        return { graphId: meta.id, graphName: meta.name, nodeId: node?.id ?? null };
      }, env.GRAPH || "фенол_новые промты_тест"),
    );
    check("граф библиотеки для вставки найден", !!lib.nodeId, `${lib.graphName ?? "—"}`);

    await e2e.newManualGraph(page, "Фенол");
    const count = (sel) => page.locator(sel).count();
    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    const panel = page.getByRole("complementary", { name: "Чат с ИИ" });
    await panel.waitFor({ timeout: 10000 });
    await panel.getByRole("button", { name: "Автопилот" }).click();
    // Ждём НОВЫЙ ответ с этим текстом: «Сделано.» бывает и от прошлых шагов.
    const ask = async (text, wait) => {
      const had = wait ? await panel.getByText(wait, { exact: true }).count() : 0;
      await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).fill(text);
      await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).press("Enter");
      if (wait) {
        for (const t0 = Date.now(); Date.now() - t0 < 60000; await e2e.sleep(200)) {
          if ((await panel.getByText(wait, { exact: true }).count()) > had) break;
        }
      }
      await e2e.sleep(600);
    };

    // 1) Действие и его отмена кнопкой.
    await ask("добавь бензол", "Сделано.");
    const withBenzene = await e2e.nodeByLabel(page, "Бензол").count();
    await panel.getByRole("button", { name: "↶ Отменить действия этого ответа" }).first().click();
    await e2e.sleep(800);
    check(
      "«Отменить действия этого ответа» — бензола нет, кнопка ушла",
      withBenzene === 1 && (await e2e.nodeByLabel(page, "Бензол").count()) === 0 && (await panel.getByRole("button", { name: /Отменить действия/ }).count()) === 0,
    );
    check("модели — что человек отменил", /Человек отменил действия ответа чата/.test(await panel.innerText()));

    // 2) Кусок цепочки из библиотеки.
    const before = await count(".react-flow__node");
    await ask("возьми из библиотеки, что делают из фенола", "Сделано.");
    await shot("import");
    const after = await count(".react-flow__node");
    const text = await panel.innerText();
    const line = (text.match(/[✓✗] (из «|в графе)[^\n]*/) || [""])[0];
    check("из библиотеки — шаги встали у фенола", after > before && /^✓ из «.+» вниз от «Фенол»: шаги «/.test(line), `узлов ${before} → ${after}; ${line.slice(0, 140)}`);

    // 3) «Отмени» — действием.
    await ask("отмени", "Сделано.");
    check("«отмени» — граф как до вставки", (await count(".react-flow__node")) === before, `узлов: ${await count(".react-flow__node")}`);

    // 4) План: автопилот не выполняет, кнопка — выполняет.
    await ask("построй цепочку до фенола", "Предлагаю план.");
    const planCard = panel.getByText("План: Цепочка до фенола");
    check(
      "план — карточка с пунктами и ценой, кнопка «Выполнить план»",
      (await planCard.count()) === 1 && /1\. шаг вверх от фенола[\s\S]*Примерно 24 запроса к модели/.test(await panel.innerText()) &&
        (await panel.getByRole("button", { name: "Выполнить план" }).count()) === 1,
    );
    await panel.getByRole("button", { name: "Выполнить план" }).click();
    await panel.getByText("Начинаю по плану.").waitFor({ timeout: 30000 });
    const planMsg = requests.find((r) => /^Выполняй план/.test(r.message ?? ""))?.message ?? "";
    check("«Выполнить план» — модели «Выполняй план» с пунктами", /Выполняй план «Цепочка до фенола»:\n1\. шаг вверх от фенола\n2\./.test(planMsg), planMsg.slice(0, 80));

    // 5) Отчёт — файлом.
    await ask("сделай отчёт по цепочке");
    await panel.getByText("Отчёт: Фенол — отчёт").waitFor({ timeout: 30000 });
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 10000 }),
      panel.getByRole("button", { name: "Скачать .md" }).click(),
    ]);
    const fs = require("fs");
    const body = fs.readFileSync(await download.path(), "utf8");
    check(
      "«Скачать .md» — файл с ответом",
      download.suggestedFilename() === "Фенол — отчёт.md" && /^# Фенол — отчёт\n\n## Фенол/.test(body) && /\| Кумольный способ \| кумол \|/.test(body),
      download.suggestedFilename(),
    );
    await shot("done");
    log(`запросов к чату: ${requests.length}`);
  },
};
