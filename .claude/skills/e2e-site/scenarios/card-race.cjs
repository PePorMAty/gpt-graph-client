// Закрыть карточку и сразу щёлкнуть другой узел — карточка должна показать
// новый узел, а не пустую («ID: —»): раньше её опустошал запоздавший сброс.
const { DEFAULT_GRAPH } = require("./open-graph.cjs");

module.exports = {
  description: "Быстрый переход между карточками: закрыть и сразу открыть другую",
  async run({ page, origin, env, lib, check, shot }) {
    await lib.openApp(page, origin);
    await lib.openLibraryGraph(page, env.GRAPH || DEFAULT_GRAPH);
    const picks = await page.evaluate(() =>
      [...document.querySelectorAll(".react-flow__node")]
        .map((n) => ({ r: n.getBoundingClientRect(), id: n.dataset.id }))
        .filter(({ r }) => r.x > 550 && r.x + r.width < 1450 && r.y > 150 && r.y + r.height < 900 && r.width > 20)
        .slice(0, 6)
        .map(({ r, id }) => ({ id, x: r.x + r.width / 2, y: r.y + r.height / 2 })),
    );
    check("на экране есть узлы для щелчков", picks.length >= 2, `${picks.length}`);
    const close = page.getByRole("button", { name: "Закрыть карточку" });
    for (let i = 0; i + 1 < picks.length && i < 6; i += 2) {
      await page.mouse.click(picks[i].x, picks[i].y);
      await lib.sleep(1200);
      await close.click();
      await page.mouse.click(picks[i + 1].x, picks[i + 1].y); // без паузы
      await lib.sleep(1500);
      const card = await page.evaluate(() => {
        let el = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Закрыть карточку" || b.title === "Закрыть карточку");
        while (el && el.parentElement && el.getBoundingClientRect().height < 500) el = el.parentElement;
        return el ? el.innerText.replace(/\s+/g, " ").slice(0, 120) : null;
      });
      if (i === 0) await shot("card");
      check(`пара ${i / 2 + 1}: карточка не пустая`, card && !/ID: —/.test(card), card ? card.slice(0, 60) : "карточка не открылась");
      if (await close.count()) await close.click();
      await lib.sleep(800);
    }
  },
};
