// Чат с ИИ, автопилот на сохранённом графе: пока скрытый мастер работает,
// человек щёлкает по другому узлу — задание не снимается (20.11, владелец:
// на «фенол_новые промты_тест» шаг и альтернативы — «остановлен»; мастер был
// привязан к выбранному узлу, и щелчок его снимал, а поиск шёл дальше).
//
// Переменные: GRAPH (граф библиотеки), PRODUCT (у кого действие), KIND
// (alternatives | step), DIRECTION, DELAY (секунд на ответ подставной модели:
// живая отвечает минутами), CLICK (по какому узлу щёлкнуть; пусто — не
// щёлкать). Подставные ответы модели, запись на сервер не нужна.

const fs = require("fs");
const path = require("path");

const requests = [];
const PRODUCT = process.env.PRODUCT || "Тримеры пропилена";
const DIRECTION = process.env.DIRECTION || "up";
const KIND = process.env.KIND || "alternatives";
const CLICK = process.env.CLICK ?? "фенол";

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
  const node = (body.graph?.products || []).find((p) => p.label.toLowerCase() === PRODUCT.toLowerCase());
  if (!node) return NDJSON([], `«${PRODUCT}» на графе нет.`);
  if (body.continuation) return NDJSON([], "Итог получен.");
  return NDJSON([{ kind: KIND, nodeId: node.id, label: node.label, direction: DIRECTION }], "Работаю.");
}

// Ответ модели — с задержкой, как у живой: щелчок успевает попасть в работу.
const slow = (file) => async () => {
  await new Promise((r) => setTimeout(r, Number(process.env.DELAY ?? 10) * 1000));
  const b = JSON.parse(fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
  return { body: b && "url" in b && "body" in b ? b.body : b };
};

module.exports = {
  description: "Чат с ИИ, автопилот на сохранённом графе: щелчок по другому узлу не снимает задание",
  canned: {
    "/api/graphs/gpt/step/aggregate": [slow("fixtures/phenol-down-aggregate.json"), slow("fixtures/phenol-down-aggregate.json")],
    "/api/graphs/gpt/step/build": [slow("fixtures/phenol-down-build.json"), slow("fixtures/phenol-down-build.json")],
    "/api/graphs/gpt/step/check": "fixtures/step-check-ok.json",
    "/api/graphs/gpt/chat": [chatReply, chatReply, chatReply, chatReply],
  },
  async run({ page, origin, env, lib, check, shot, log }) {
    await lib.openApp(page, origin);
    const g = await lib.openLibraryGraph(page, env.GRAPH || "фенол_новые промты_тест");
    log(`граф: ${g.nodes} узлов`);
    const stages = [];
    const watch = setInterval(async () => {
      const line = await page.getByText(/^мастер шага: /).first().innerText({ timeout: 100 }).catch(() => "");
      const stage = line.replace("мастер шага: ", "");
      if (stage && stages[stages.length - 1] !== stage) stages.push(stage);
    }, 150);
    await page.getByRole("button", { name: "Чат с ИИ" }).click();
    const panel = page.getByRole("complementary", { name: "Чат с ИИ" });
    await panel.waitFor({ timeout: 10000 });
    await panel.getByRole("button", { name: "Автопилот" }).click();
    await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).fill(`${KIND === "step" ? "Построй шаг от" : "Покажи альтернативы"} ${PRODUCT}`);
    await panel.getByRole("textbox", { name: "Сообщение для ИИ" }).press("Enter");
    if (CLICK) {
      await lib.sleep(4000);
      await lib.nodeByLabel(page, CLICK).first().click();
      log(`посреди работы щёлкнули по «${CLICK}»`);
      await lib.sleep(800);
      check(
        "карточка — у узла, по которому щёлкнули",
        // Название в карточке — поле правки, а не заголовок.
        await page
          .locator("input, textarea")
          .evaluateAll((els, want) => els.some((e) => e.value.trim().toLowerCase() === want), CLICK.toLowerCase()),
      );
    }
    const done = await panel.getByText("Итог получен.").waitFor({ timeout: 180000 }).then(() => true, () => false);
    clearInterval(watch);
    await shot("done");
    const text = await panel.innerText();
    const line = (text.match(/[✓✗] (шаг|альтернативы|источники)[^\n]*/) || [""])[0];
    log(`этапы: ${stages.join(" → ")}`);
    check("действие выполнено, а не «остановлено»", done && /^✓/.test(line), line.slice(0, 160));
  },
};
