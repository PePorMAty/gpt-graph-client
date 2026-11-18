// Конфликт сохранения (сервер с версиями графов, PG-MIGRATION.md этапа 1):
// граф открыт, кто-то другой его сохранил — «Обновить» не перезаписывает
// чужую правку, а показывает окно «Граф изменили, пока вы работали».
// Проверяются оба выхода: «Сохранить мою копией» (новый граф в библиотеке,
// чужая версия цела) и «Открыть их версию»; потом — обычное сохранение без
// конфликта.
//
// ПИШЕТ на сервер: только с --allow-writes и только на свой сервер ветки
// (--api=http://localhost:…), не на боевой. Чужое сохранение сценарий делает
// сам — запросом PUT с той же версией.
//
//   GRAPH=часть названия (по умолчанию «фенол_новые промты_тест»)

module.exports = {
  description: "Конфликт сохранения: окно «Граф изменили…», копия, их версия (пишет — только свой сервер)",
  async run({ page, origin, env, lib, log, check, shot }) {
    const name = env.GRAPH || "фенол_новые промты_тест";
    const api = (method, url, body) =>
      page.evaluate(
        async ({ method, url, body }) => {
          const r = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
          return { status: r.status, body: await r.json().catch(() => null) };
        },
        { method, url, body },
      );
    /** «Чужое» сохранение: тот же граф, версия — последняя на сервере. */
    const theirSave = async (id) => {
      const g = (await api("GET", `/api/graph-files/${encodeURIComponent(id)}`)).body;
      const r = await api("PUT", `/api/graph-files/${encodeURIComponent(id)}`, {
        nodes: g.graph.nodes,
        edges: g.graph.edges,
        leaf_nodes: g.state.leaf_nodes,
        has_more: g.state.has_more,
        version: g.meta.version,
      });
      return r.body?.data?.version;
    };
    const clickSave = async (updateLabel) => {
      await page.getByRole("button", { name: "Сохранить граф" }).first().click();
      await page.getByRole("button", { name: updateLabel }).first().click();
      await lib.sleep(1500);
    };
    const conflictShown = () => page.getByText("Граф изменили, пока вы работали").first().isVisible().catch(() => false);

    await lib.openApp(page, origin);
    const list = (await api("GET", "/api/graph-files")).body?.data ?? [];
    const meta = list.find((g) => g.name.toLowerCase().includes(name.toLowerCase()));
    if (!meta) throw new Error(`в библиотеке нет графа «${name}» (GRAPH=…)`);
    check("сервер отдаёт версию графа", typeof meta.version === "number", `версия ${meta.version}`);
    const opened = await lib.openLibraryGraph(page, meta.name);
    log(`открыт «${meta.name}»: ${opened.nodes} узлов`);

    // 1) Чужое сохранение → «Обновить» → окно; «Сохранить мою копией».
    const v = await theirSave(meta.id);
    log(`чужое сохранение: версия ${v}`);
    await clickSave(new RegExp(`^Обновить «`));
    check("«Обновить» после чужого сохранения — окно «Граф изменили…»", await conflictShown());
    await shot("conflict");
    await page.getByRole("button", { name: "Сохранить мою копией" }).click();
    await lib.sleep(2500);
    const after = (await api("GET", "/api/graph-files")).body?.data ?? [];
    const copy = after.find((g) => g.name === `${meta.name} (моя копия)`);
    check("копия — новым графом в библиотеке", !!copy, copy?.id ?? "нет");
    check("окно закрылось", !(await conflictShown()));
    const theirs = after.find((g) => g.id === meta.id);
    check("их версия цела — не перезаписана", theirs?.version === v, `версия ${theirs?.version}`);

    // 2) Теперь открыта копия: чужое сохранение копии → окно → «Открыть их версию».
    const vc = await theirSave(copy.id);
    await clickSave(/^Обновить «/);
    check("второй конфликт — снова окно", await conflictShown());
    await page.getByRole("button", { name: "Открыть их версию" }).click();
    await lib.sleep(2500);
    check("«Открыть их версию» — окно закрылось, граф на полотне", !(await conflictShown()) && (await page.$$eval(".react-flow__node", (e) => e.length)) > 0);

    // 3) Без конфликта — обычное сохранение, версия растёт.
    await clickSave(/^Обновить «/);
    const final = (await api("GET", `/api/graph-files/${encodeURIComponent(copy.id)}`)).body;
    check("сохранение без конфликта проходит, версия растёт", !(await conflictShown()) && final?.meta?.version === vc + 1, `версия ${final?.meta?.version}, ожидали ${vc + 1}`);

    // Убрать копию за собой.
    await api("DELETE", `/api/graph-files/${encodeURIComponent(copy.id)}`);
  },
};
