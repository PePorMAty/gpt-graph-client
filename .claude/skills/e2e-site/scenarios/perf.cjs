// Скорость полотна на большом графе: провести курсором по графу, навести на
// узел (подсветка цепочки), перетащить полотно. Цифры headless-браузера без
// видеокарты хуже, чем у пользователя, — сравнивай прогоны между собой.
const { DEFAULT_GRAPH } = require("./open-graph.cjs");

module.exports = {
  description: "Скорость на большом графе: курсор по графу, наведение, перетаскивание",
  async run({ page, origin, env, lib, check, shot, log }) {
    const name = env.GRAPH || DEFAULT_GRAPH;
    await lib.openApp(page, origin);
    const g = await lib.openLibraryGraph(page, name);
    log(`«${name}»: ${g.nodes} узлов, ${g.edges} связей`);

    // Приблизить к ~50 % у узла в центре — так граф смотрит пользователь.
    let scale = 0;
    for (let i = 0; i < 20 && scale < 0.5; i++) {
      const c = await lib.nodeNear(page);
      scale = await lib.wheelZoom(page, c.x, c.y, 1);
    }
    log(`масштаб ${Math.round(scale * 100)} %`);
    await shot("zoomed");

    // 1) Курсор по графу — как тянутся к нужному месту.
    await page.mouse.move(1500, 930);
    const sweep = await lib.measure(page, async () => {
      for (let i = 0; i <= 120; i++) await page.mouse.move(200 + i * 10, 200 + ((i * 37) % 600));
    });
    const sweepMax = Math.max(0, ...sweep.longTasks);
    log(`курсор по графу: длинных задач ${sweep.longTasks.length} (макс ${sweepMax} мс), кадры p90 ${sweep.frames.p90} мс`);
    check("курсор по графу без заметных пауз", sweepMax < 150, `самая длинная задача ${sweepMax} мс`);

    // 2) Наведение на узел: подсветка включается после задержки и гаснет.
    const c = await lib.nodeNear(page);
    await page.mouse.move(1500, 930);
    await lib.sleep(500);
    const hover = await lib.measure(page, async () => {
      await page.mouse.move(c.x, c.y);
      await lib.sleep(700);
    });
    // По тому, что видно, а не по именам классов: яркие — цепочка, бледные — остальное.
    const lit = await page.evaluate(() => {
      const all = [...document.querySelectorAll(".react-flow__node")];
      const faded = all.filter((n) => Number(getComputedStyle(n).opacity) < 0.5).length;
      return { chain: all.length - faded, faded };
    });
    await shot("hover");
    await page.mouse.move(1500, 930);
    await lib.sleep(700);
    const fadedAfter = await page.evaluate(() => [...document.querySelectorAll(".react-flow__node")].filter((n) => Number(getComputedStyle(n).opacity) < 0.5).length);
    const hoverSum = hover.longTasks.reduce((a, b) => a + b, 0);
    log(`наведение: цепочка ${lit.chain} узлов, бледных ${lit.faded}; длинные задачи [${hover.longTasks}] мс`);
    check("подсветка цепочки включается", lit.chain > 0 && lit.faded > 0, `${lit.chain} в цепочке, ${lit.faded} бледных`);
    check("подсветка гаснет, когда курсор ушёл", fadedAfter === 0, `бледных после ухода: ${fadedAfter}`);
    check("наведение дешёвое", hoverSum < 200, `длинные задачи в сумме ${hoverSum} мс`);

    // 3) Перетаскивание полотна.
    const box = await page.locator(".react-flow__pane").first().boundingBox();
    const cx = box.x + box.width * 0.6, cy = box.y + box.height * 0.5;
    const drag = await lib.measure(page, async () => {
      await page.mouse.move(cx, cy);
      await page.mouse.down();
      for (let i = 1; i <= 60; i++) await page.mouse.move(cx - i * 7, cy - Math.sin(i / 8) * 60);
      await page.mouse.up();
    });
    log(`перетаскивание: ${(drag.ms / 60).toFixed(1)} мс на шаг мыши, кадры p50 ${drag.frames.p50} / p90 ${drag.frames.p90} / макс ${drag.frames.max} мс`);
  },
};
