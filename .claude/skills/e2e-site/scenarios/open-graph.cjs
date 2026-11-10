// Открыть сохранённый граф из библиотеки. GRAPH — часть названия.
const DEFAULT_GRAPH = "Смазочные+Сельское"; // «ГК Титан Медицина+Нефтехимия+Смазочные+Сельское хозяйство», 687 узлов

module.exports = {
  description: "Открыть граф из библиотеки (GRAPH=часть названия; по умолчанию большой, 687 узлов)",
  DEFAULT_GRAPH,
  async run({ page, origin, env, lib, check, shot, log }) {
    const name = env.GRAPH || DEFAULT_GRAPH;
    await lib.openApp(page, origin);
    const g = await lib.openLibraryGraph(page, name);
    log(`«${name}»: ${g.nodes} узлов, ${g.edges} связей, открыт за ${(g.ms / 1000).toFixed(1)} с`);
    check("граф открылся", g.nodes > 0, `${g.nodes} узлов`);
    const status = (await page.locator("body").innerText()).match(/Показано узлов:[\s\S]*?Подтверждено в ГИСП:\s*\d+/);
    check("строка состояния на месте", !!status, status ? status[0].replace(/\s+/g, " ") : "");
    await shot("graph");
  },
};
