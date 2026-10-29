// Цепочка вниз на живой модели: от продукта STEPS шагов по основному пути
// (каждый следующий — от нового продукта предыдущего шага; альтернативы не
// раскрываются), затем у первых BALANCES преобразований — материальный
// баланс и технологическое описание, чтобы сравнить баланс отдельным
// расчётом с полем «Материальный баланс (на тонну продукта)» описания.
//
// Нужен --live-model (и лучше --server-repo=../server — промпты и разбор шага
// ветки). Ответы модели сохраняются в папку --out: chain-*.json. SAVE=название
// — сохранить граф в библиотеку (нужен --allow-writes).
//
// REPLAY=папка прошлого прогона — переиграть его без модели: обобщение,
// разбор и техописание отвечают сохранёнными chain-*.json по очереди, а
// баланс сервер отдаёт готовым («В базе есть готовый расчёт»). Так можно
// поправить сценарий или посмотреть результат в интерфейсе бесплатно.
//
// Параметры: PRODUCT (Фенол), STEPS (3), BALANCES (2), SAVE, REPLAY.

const fs = require("fs");
const path = require("path");

const WATCH = /\/(step\/aggregate|step\/build|step\/sources|material-balance|fill-card|tech-description)(\/|$|\?)/;

/** Ответы прошлого прогона по очереди: путь запроса → файлы chain-NN-*.json. */
function replay(dir) {
  const files = fs.readdirSync(dir).filter((f) => /^chain-\d+-.*\.json$/.test(f)).sort();
  const pick = (suffix) => files.filter((f) => f.endsWith(suffix)).map((f) => path.join(dir, f));
  return {
    "/api/graphs/gpt/step/aggregate": pick("-step-aggregate.json"),
    "/api/graphs/gpt/step/build": pick("-step-build.json"),
    "/api/graphs/gpt/fill-card": pick("-gpt-fill-card.json"),
  };
}

module.exports = {
  description: "Живая модель: цепочка вниз (PRODUCT, STEPS), баланс и техописание у BALANCES преобразований",
  canned: (env) => (env.REPLAY ? replay(path.resolve(env.REPLAY)) : {}),
  async run({ page, origin, env, lib, log, check, shot }) {
    const steps = Number(env.STEPS || 3);
    const balances = Number(env.BALANCES || 2);
    const out = path.dirname(await shot("start"));

    // Ответы модели — в файлы: их и сравниваем.
    let n = 0;
    const saved = [];
    page.on("response", async (r) => {
      const url = r.url();
      if (!WATCH.test(new URL(url).pathname) || r.request().method() === "OPTIONS") return;
      try {
        const body = await r.json();
        // Ход расчёта баланса опрашивается каждые несколько секунд — хранить
        // только итог.
        if (/\/material-balance\/jobs\//.test(url) && /running|starting|queued/.test(String(body?.status ?? body?.job?.status ?? ""))) return;
        const kind = new URL(url).pathname.split("/").slice(-2).join("-");
        const file = path.join(out, `chain-${String(++n).padStart(2, "0")}-${kind}.json`);
        fs.writeFileSync(file, JSON.stringify({ url, status: r.status(), request: r.request().postDataJSON?.() ?? null, body }, null, 1));
        saved.push({ kind, file, body });
      } catch {
        // не JSON (поток ещё идёт) — пропускаем
      }
    });

    await lib.openApp(page, origin);
    let product = env.PRODUCT || "Фенол";
    await lib.newManualGraph(page, product);

    // ---------- шаги ----------
    const chain = [];
    for (let k = 1; k <= steps && product; k++) {
      const t0 = Date.now();
      const text = await lib.stepDownToPreview(page, product, {
        timeout: 15 * 60 * 1000,
        log,
        onSources: async () => {
          const list = await page.evaluate(() => {
            const head = [...document.querySelectorAll("*")].find((e) => /^Источники \(\d+\)/.test(e.textContent?.trim() || "") && e.children.length < 4);
            const box = head?.closest("section, div[class*=source], div[class*=Source]") || head?.parentElement?.parentElement;
            return box ? box.innerText.replace(/\n+/g, " | ").slice(0, 600) : "";
          });
          log(`  источники: ${list}`);
        },
      });
      const p = lib.parsePreview(text);
      await shot(`step${k}-preview`);
      const fmt = (l) => l.map((x) => `${x.name}${x.tag ? ` (${x.tag})` : ""}`).join(", ") || "—";
      log(`шаг ${k} от «${product}» за ${Math.round((Date.now() - t0) / 1000)} с: ${p.transformation}`);
      log(`  вход: ${fmt(p.inputs)}\n     выход: ${fmt(p.outputs)}\n     побочные: ${fmt(p.byproducts)}`);
      check(`шаг ${k}: у шага есть преобразование и выход`, p.transformation && p.outputs.length > 0, p.transformation || "нет");
      await page.getByRole("button", { name: /Добавить шаг/ }).click();
      await lib.sleep(3000);
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
      chain.push({ step: k, from: product, ...p });
      // Дальше — от нового продукта шага (основной путь).
      const next = p.outputs.find((x) => x.tag === "новый") || p.outputs[0];
      product = next?.name ?? null;
    }
    await lib.fitView(page);
    await shot("chain");
    const ov = lib.overlaps(await lib.nodeBoxes(page));
    check("узлы цепочки не налезают друг на друга", ov.length === 0, ov.join("; "));

    // ---------- баланс и техописание ----------
    // Вкладки — внутри карточки: в левом рельсе тоже есть «Материальный баланс».
    const tabs = page.locator("nav").filter({ has: page.getByRole("button", { name: "Краткое описание", exact: true }) }).first();
    const tab = (name) => tabs.getByRole("button", { name, exact: true });
    const cardText = () => tabs.locator("xpath=..").innerText().catch(() => "");
    const picked = chain.slice(0, balances);
    // Узел — по id: техописание переименовывает преобразование
    // («Синтез …» → «Производство …» из technology_name).
    const byId = (id) => page.locator(`.react-flow__node[data-id="${id.replace(/["\\]/g, "\\$&")}"]`);
    for (const c of picked) {
      await lib.fitView(page);
      const node = lib.nodeByLabel(page, c.transformation, "transformation");
      c.nodeId = await node.getAttribute("data-id");
      await node.click();
      await lib.sleep(1000);
      await tab("Материальный баланс").click();
      await lib.sleep(1000);
      const calc = page.getByRole("button", { name: /^Рассчитать( заново)?$/ });
      if (await calc.count()) {
        await calc.first().click();
        log(`«${c.transformation}»: баланс запущен`);
      } else log(`«${c.transformation}»: кнопки «Рассчитать» нет`);
      await lib.sleep(1500);
      await tab("Технологическое описание").click();
      await lib.sleep(800);
      await page.getByRole("button", { name: /^(Получить|Обновить) описание$/ }).first().click();
      log(`«${c.transformation}»: техописание запрошено`);
      const t0 = Date.now();
      while (/Получаю описание/.test(await cardText()) && Date.now() - t0 < 10 * 60 * 1000) await lib.sleep(3000);
      log(`«${c.transformation}»: техописание готово за ${Math.round((Date.now() - t0) / 1000)} с`);
      await shot(`tech-${c.step}`);
      await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
    }
    // Ждём балансы.
    for (const c of picked) {
      await lib.fitView(page);
      await byId(c.nodeId).click();
      await lib.sleep(1000);
      await tab("Материальный баланс").click();
      const t0 = Date.now();
      let text = "";
      for (;;) {
        text = await cardText();
        if (!/Считаем «/.test(text)) break;
        if (Date.now() - t0 > 20 * 60 * 1000) break;
        await lib.sleep(5000);
      }
      await lib.sleep(1500);
      text = await cardText();
      c.balanceText = text;
      await shot(`balance-${c.step}`);
      const done = /Соотношение сырьё : продукты|сырьё — 100/i.test(text);
      check(`баланс «${c.transformation}» посчитан`, done, done ? "" : text.slice(text.indexOf("Материальный баланс"), 400).replace(/\s+/g, " "));
      await page.getByRole("button", { name: "Закрыть карточку" }).click().catch(() => {});
    }

    // ---------- сравнение ----------
    const findKey = (o, key) => {
      if (!o || typeof o !== "object") return null;
      if (key in o) return o[key];
      for (const v of Object.values(o)) {
        const f = findKey(v, key);
        if (f) return f;
      }
      return null;
    };
    const cards = saved.filter((s) => s.kind.endsWith("fill-card"));
    picked.forEach((c, i) => {
      // Заголовки таблицы — заглавными (text-transform), innerText отдаёт их так же.
      const mb = (c.balanceText || "").replace(/\s+/g, " ");
      const from = mb.search(/сырьё — 100/i);
      const table = from >= 0 ? mb.slice(from, from + 1500) : mb.slice(0, 300);
      const desc = findKey(cards[i]?.body, "material_balance");
      log(`\n=== «${c.transformation}»\n  баланс (расчёт): ${table}\n  техописание, «Материальный баланс (на тонну продукта)»: ${typeof desc === "string" ? desc : JSON.stringify(desc)}`);
    });
    fs.writeFileSync(path.join(out, "chain-summary.json"), JSON.stringify(chain, null, 1));

    if (env.SAVE) {
      await page.getByRole("button", { name: "Сохранить граф" }).first().click();
      await page.locator("#save-graph-name").fill(env.SAVE);
      await page.getByRole("button", { name: /^Сохранить$/ }).last().click();
      await lib.sleep(4000);
      const ok = /Все изменения сохранены/.test(await page.locator("body").innerText());
      check(`граф сохранён как «${env.SAVE}»`, ok);
    }
    log(`ответы модели: ${saved.length} файлов в ${out}`);
  },
};
