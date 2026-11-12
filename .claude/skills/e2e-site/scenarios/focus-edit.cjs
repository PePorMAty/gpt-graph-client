// Правка в «Фокусе» — как на полном полотне (с 2026-11-12): карточка центра
// не заперта, шаг строится и сразу встаёт в окрестность, правая кнопка по
// пустому месту добавляет узел (и он не пропадает, пока не связан), по узлу —
// меню. Модель не вызывается: шаг от фенола — сохранёнными ответами, как в
// step-down.
module.exports = {
  description: "Правка в «Фокусе»: шаг из карточки центра, новый узел и меню правой кнопки",
  canned: {
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
  },
  async run({ page, origin, lib, check, shot }) {
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    const focus = page.getByRole("button", { name: "Фокус", exact: true });
    await focus.click();
    await lib.sleep(1500);
    check("«Фокус» включён", (await focus.getAttribute("aria-pressed")) === "true");

    // Шаг — из карточки центра, прямо в «Фокусе».
    await lib.stepDownToPreview(page, "Фенол");
    const body = await page.locator("body").innerText();
    check("карточка в «Фокусе» не заперта", !/только для просмотра/.test(body));
    await page.getByRole("button", { name: /Добавить шаг/ }).click();
    await lib.sleep(2500);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
    await lib.sleep(1500);
    await shot("step");
    let boxes = await lib.nodeBoxes(page);
    const has = (t) => boxes.some((b) => b.label.includes(t));
    // Окрестность — вверх и вниз от центра: второе сырьё шага («Формальдегид»)
    // подаётся в то же преобразование сбоку и в неё не входит — как и раньше.
    check("построенный шаг встал в окрестность центра", has("Синтез фенолоформальдегидных смол") && has("Фенолоформальдегидные смолы"), boxes.map((b) => b.label).join(", "));
    check("«Фокус» не выключился от правки", (await focus.getAttribute("aria-pressed")) === "true");

    // Правая кнопка по пустому месту — новый узел; он остаётся на экране.
    const before = boxes.length;
    const pane = await page.locator(".react-flow__pane").boundingBox();
    const spot = { x: pane.x + pane.width - 220, y: pane.y + pane.height - 160 };
    await page.mouse.click(spot.x, spot.y, { button: "right" });
    await page.getByRole("button", { name: "Добавить продукт" }).click();
    await lib.sleep(1500);
    await shot("added");
    boxes = await lib.nodeBoxes(page);
    check("узел, добавленный в «Фокусе», виден", boxes.length === before + 1, `${before} → ${boxes.length}`);

    // Меню правой кнопки по узлу.
    await lib.nodeByLabel(page, "Фенолоформальдегидные смолы").click({ button: "right" });
    await lib.sleep(500);
    await shot("node-menu");
    check("меню правой кнопки по узлу открывается", (await page.getByRole("button", { name: /в закладки/ }).count()) > 0);
    await page.keyboard.press("Escape");

    // Всё сделанное — в самом графе.
    await focus.click();
    await lib.sleep(1500);
    await lib.fitView(page);
    boxes = await lib.nodeBoxes(page);
    const alts = await page.$$eval(".react-flow__node.node--alt", (e) => e.length);
    await shot("full");
    check("после выхода шаг, альтернативы и новый узел — в полном графе", has("Синтез фенолоформальдегидных смол") && alts === 4 && boxes.length >= before + 1 + alts, `узлов ${boxes.length}, альтернатив ${alts}`);
  },
};
