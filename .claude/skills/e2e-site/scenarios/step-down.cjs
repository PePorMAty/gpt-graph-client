// Шаг «вниз» от фенола на ручном графе. Модель не вызывается: обобщение и
// построение отвечают сохранёнными ответами живого прогона (fixtures/) —
// основной шаг «Фенол + Формальдегид → смолы» и четыре альтернативы.
// Источники берутся из базы сервера: у «Фенола» они там есть.
module.exports = {
  description: "Шаг «вниз» от фенола на подставных ответах модели: превью и раскладка",
  canned: {
    "/api/graphs/gpt/step/aggregate": "fixtures/phenol-down-aggregate.json",
    "/api/graphs/gpt/step/build": "fixtures/phenol-down-build.json",
  },
  async run({ page, origin, lib, check, shot, log }) {
    await lib.openApp(page, origin);
    await lib.newManualGraph(page, "Фенол");
    const preview = await lib.stepDownToPreview(page, "Фенол");
    await shot("preview");
    const inputs = (preview.match(/Входные данные \(\d+\)[\s\S]*?(?=Выходные данные)/) || [""])[0].replace(/\s+/g, " ");
    const outputs = (preview.match(/Выходные данные \(\d+\)[\s\S]*?(?=Побочные продукты|Примечания|Добавить свой)/) || [""])[0].replace(/\s+/g, " ");
    log(`превью: ${inputs} | ${outputs}`);
    check("в превью виден раскрываемый продукт", /Фенол раскрываемый/.test(inputs), inputs);
    check("второе сырьё в превью", /Формальдегид/.test(inputs));
    check("продукт шага в превью", /Фенолоформальдегидные смолы/.test(outputs));

    await page.getByRole("button", { name: /Добавить шаг/ }).click();
    await lib.sleep(2500);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Вписать граф в экран" }).first().click().catch(() => {});
    await lib.sleep(1500);
    await shot("graph");
    const boxes = await lib.nodeBoxes(page);
    const ov = lib.overlaps(boxes);
    const alts = await page.$$eval(".react-flow__node.node--alt", (e) => e.length);
    const has = (t) => boxes.some((b) => b.label.includes(t));
    check("шаг лёг на полотно", has("Синтез фенолоформальдегидных смол") && has("Формальдегид"));
    check("альтернативы на полотне", alts === 4, `${alts} из 4`);
    check("узлы не налезают друг на друга", ov.length === 0, ov.join("; "));
    const m = (await page.locator("body").innerText()).match(/Длина цепочек:\s*(\d+) (\S+)/);
    const n = m ? Number(m[1]) : NaN;
    const want = n % 10 === 1 && n % 100 !== 11 ? "шаг" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "шага" : "шагов";
    check("подпись длины цепочек согласована с числом", m && m[2] === want, m ? `${m[1]} ${m[2]}` : "нет подписи");
  },
};
