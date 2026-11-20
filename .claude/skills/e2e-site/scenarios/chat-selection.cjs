// Чат с ИИ, автопилот: действие для всех выделенных узлов (20.11, владелец:
// «выделить область с несколькими продуктами и сразу для всех заполнить
// описание»). Ход:
//   1) «Добавь бензол, толуол, ксилол и ацетон» — четыре новых продукта;
//   2) выделяем их с Ctrl — в чате «Выделено на графе: 4 узла»;
//   3) «Заполни карточки для всех выделенных» — в запрос ушёл список
//      выделенных; подставная модель отвечает карточкой на каждый; автопилот
//      заполняет их по три сразу (ответ fill-card — подставной, с задержкой);
//   4) следующий вопрос — в истории для модели помечено, какие действия были
//      и чем кончились: без этого модель писала «ищутся…», не вызывая их.
// Модель не вызывается, запись на сервер не нужна.

const requests = [];
const NEW = ["Бензол", "Толуол", "Ксилол", "Ацетон"];

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
  if (body.continuation) return NDJSON([], "Продукты на графе.");
  if (requests.length === 1) {
    return NDJSON(
      NEW.map((label, i) => ({ kind: "add", id: `chat-e2e-${i}`, label })),
      "Добавляю четыре продукта.",
    );
  }
  if (/выделенных/.test(body.message ?? "") && (body.graph?.selection ?? []).length) {
    return NDJSON(
      body.graph.selection.map((n) => ({ kind: "fillcard", nodeId: n.id, label: n.label, nodeKind: n.kind })),
      "Заполняю карточки выделенных.",
    );
  }
  return NDJSON([], "Готово, вопрос понял.");
}

let fillNow = 0;
let fillMax = 0;
let fillCalls = 0;
async function fillCard(req) {
  const b = JSON.parse(req.postData() || "{}");
  fillCalls++;
  fillNow++;
  fillMax = Math.max(fillMax, fillNow);
  await new Promise((r) => setTimeout(r, 1500));
  fillNow--;
  return { body: { success: true, productCard: { description: `Карточка e2e: ${b.productName}`, applications: [] } } };
}

module.exports = {
  description: "Чат с ИИ, автопилот: карточки для всех выделенных узлов — список в запросе, по три сразу, пометки в истории",
  canned: {
    "/api/graphs/gpt/chat": [chatReply, chatReply, chatReply, chatReply, chatReply],
    "/api/graphs/gpt/fill-card": Array.from({ length: 8 }, () => fillCard),
  },
  async run({ page, origin, lib, check, shot, log }) {
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    const panel = page.getByRole("complementary", { name: "Чат с ИИ" });
    await panel.waitFor({ timeout: 10000 });
    await panel.getByRole("button", { name: "Автопилот" }).click();
    const ask = async (text) => {
      await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).fill(text);
      await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).press("Enter");
    };

    await ask("Добавь бензол, толуол, ксилол и ацетон");
    await panel.getByText("Продукты на графе.").waitFor({ timeout: 30000 });
    for (const label of NEW) await lib.nodeByLabel(page, label).first().waitFor({ timeout: 10000 });

    // Выделить четыре новых продукта: первый щелчком, остальные — с Ctrl.
    await page.keyboard.press("Escape");
    for (const [i, label] of NEW.entries()) {
      await lib.nodeByLabel(page, label).first().click({ modifiers: i ? ["Control"] : [] });
      await lib.sleep(250);
    }
    const line = await panel.getByText(/^Выделено на графе: /).innerText({ timeout: 5000 }).catch(() => "");
    check("в чате — сколько выделено («Выделено на графе: 4 узла»)", /Выделено на графе: 4 узла/.test(line), line);

    await ask("Заполни карточки для всех выделенных");
    // Пока идут — у карточек «в работе», а не кнопки.
    const working = await panel.getByText("автопилот: в работе или в очереди…").first().waitFor({ timeout: 8000 }).then(() => true, () => false);
    await panel.getByText(/✓ карточка «Ацетон» заполнена|✓ карточка «Бензол» заполнена/).first().waitFor({ timeout: 60000 }).catch(() => {});
    await lib.sleep(4500);
    await shot("filled");
    const sel = requests[requests.length - 1]?.graph?.selection ?? [];
    check(
      "в запрос ушёл список выделенных",
      sel.length === 4 && NEW.every((l) => sel.some((x) => x.label === l)),
      sel.map((x) => x.label).join(", "),
    );
    const text = await panel.innerText();
    const done = NEW.filter((l) => text.includes(`✓ карточка «${l}» заполнена`));
    check("карточки заполнены у всех четырёх", done.length === 4 && fillCalls === 4, `готово: ${done.join(", ")}; запросов fill-card: ${fillCalls}`);
    check("заполняются по три сразу, а не по одной", fillMax === 3, `одновременно — до ${fillMax}`);
    check("пока шли — «в работе» вместо кнопок", working);
    check("кнопок «Заполнить» после автопилота нет", (await panel.getByRole("button", { name: /^Заполнить/ }).count()) === 0);

    await ask("Что дальше?");
    await panel.getByText("Готово, вопрос понял.").waitFor({ timeout: 30000 });
    const hist = requests[requests.length - 1]?.history ?? [];
    const note = hist.map((m) => m.content).find((c) => /\(действия этого ответа: fillcard «/.test(c)) ?? "";
    check(
      "в истории для модели — какие действия были и чем кончились",
      /fillcard «Бензол» — выполнено/.test(note),
      note.slice(note.indexOf("(действия"), note.indexOf("(действия") + 140),
    );
    log(`fill-card: ${fillCalls} запросов, одновременно до ${fillMax}`);
  },
};
