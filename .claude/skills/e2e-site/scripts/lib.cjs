// Общие действия сценариев e2e-site: как открыть граф, пройти шаг, что
// измерить. Селекторы — по тексту интерфейса: поменялась подпись кнопки —
// правь здесь, а не в каждом сценарии.

"use strict";

const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

async function clickIfPresent(page, name) {
  const b = page.getByRole("button", { name });
  if (await b.count()) {
    await b.first().click();
    return true;
  }
  return false;
}

/** Открыть приложение с чистого листа и дождаться интерфейса. */
async function openApp(page, origin) {
  await page.goto(`${origin}/`, { waitUntil: "load" });
  await page.getByRole("link", { name: "Библиотека" }).waitFor({ timeout: 60000 });
  await sleep(1000);
}

/** Ждать, пока число узлов на полотне перестанет меняться. */
async function waitNodesStable(page, { min = 1, timeout = 120000 } = {}) {
  await page.waitForFunction((n) => document.querySelectorAll(".react-flow__node").length >= n, min, { timeout });
  let last = -1;
  for (let i = 0; i < 40; i++) {
    const n = await page.$$eval(".react-flow__node", (e) => e.length);
    if (n === last) return n;
    last = n;
    await sleep(700);
  }
  return last;
}

/** Открыть граф из библиотеки по части названия. Возвращает число узлов/связей и время. */
async function openLibraryGraph(page, name) {
  await page.getByRole("link", { name: "Библиотека" }).click();
  await page.getByPlaceholder(/Поиск по графам/).first().fill(name);
  const row = page
    .locator("li, [role=row], button, div")
    .filter({ hasText: name })
    .filter({ hasText: "Обновлён" })
    .last();
  await row.waitFor({ state: "visible", timeout: 30000 });
  await row.click();
  const t0 = Date.now();
  await page.getByRole("button", { name: "Открыть граф" }).first().click();
  await sleep(800);
  await clickIfPresent(page, "Не сохранять");
  const nodes = await waitNodesStable(page);
  const edges = await page.$$eval(".react-flow__edge", (e) => e.length);
  return { nodes, edges, ms: Date.now() - t0 };
}

/** Новый граф «Вручную» с одним продуктом. */
async function newManualGraph(page, product) {
  await page.getByRole("link", { name: "Граф", exact: true }).click();
  await page.getByRole("button", { name: "Создать граф" }).click();
  await page.getByRole("button", { name: /^Вручную/ }).click();
  await page.getByPlaceholder("Например: Изобутилен").fill(product);
  await page.getByRole("button", { name: "Создать продукт" }).click();
  await sleep(800);
  await clickIfPresent(page, "Не сохранять");
  await page.locator(".react-flow__node-product", { hasText: product }).first().waitFor({ timeout: 30000 });
}

/** Текст мастера шага (от заголовка «Построение — «…»» до строки состояния). */
async function wizardText(page) {
  const txt = await page.locator("body").innerText();
  const a = txt.lastIndexOf("Построение — «");
  if (a < 0) return "";
  const s = txt.slice(a);
  const b = s.search(/\nПоказано узлов:/);
  return b > 0 ? s.slice(0, b) : s;
}

/** Узел по точному названию: «Фенол» — не «Фенолоформальдегидные смолы». */
function nodeByLabel(page, label, type = "product") {
  return page
    .locator(`.react-flow__node-${type}`)
    .filter({ has: page.getByText(label, { exact: true }) })
    .first();
}

/** Вписать граф в экран — узлы после шага могли уйти за край. */
async function fitView(page) {
  await page.getByRole("button", { name: "Вписать граф в экран" }).first().click().catch(() => {});
  await sleep(800);
}

/**
 * Шаг «вниз» от продукта: карточка → «Построить шаг» → вниз → источники
 * (из базы, а если в базе нет — поиск через модель) → обобщение →
 * построение → превью. Возвращает текст превью. Модель здесь вызывается
 * дважды-трижды (поиск, обобщение, построение) — в сценарии нужны подставные
 * ответы или --live-model. onSources — посмотреть список источников, пока он
 * на экране; log — куда писать, что выбрал мастер.
 */
async function stepDownToPreview(page, product, { timeout = 180000, onSources, log = () => {} } = {}) {
  await fitView(page);
  await nodeByLabel(page, product).click();
  await sleep(800);
  await page.getByRole("button", { name: "Построить шаг", exact: true }).first().click();
  // Первая кнопка мастера: из базы, поиск через модель или к уже собранным.
  const down = page.getByRole("button", { name: /^Построить вниз/ });
  const start = page.getByRole("button", { name: /^\s*(К источникам из базы|Найти источники|К источникам)\s*$/ });
  const summarize = page.getByRole("button", { name: /Обобщить источники/ });
  const t0 = Date.now();
  // Направление мастер спрашивает не всегда: продукт, которому шаг передал
  // источники предка, открывается сразу на источниках («взяты у …»).
  while (!(await down.count()) && !(await start.count()) && !(await summarize.count())) {
    if (Date.now() - t0 > 60000) throw new Error("мастер не открылся");
    await sleep(500);
  }
  if (await down.count()) await down.click();
  while (!(await start.count()) && !(await summarize.count())) {
    if (Date.now() - t0 > 60000) throw new Error("мастер не предложил источники");
    await sleep(500);
  }
  const borrowed = await page.getByText(/^Источники взяты у «/).count();
  if (borrowed) log(`«${product}»: ${(await page.getByText(/^Источники взяты у «/).first().innerText()).trim()}`);
  if (await start.count()) {
    const how = (await start.first().innerText()).trim();
    log(`«${product}»: ${how}`);
    await start.first().click();
  } else {
    log(`«${product}»: источники уже собраны`);
  }
  // Источники готовы: «Обобщить» доступна и поиск не идёт.
  for (;;) {
    const t = await wizardText(page);
    if ((await summarize.count()) && (await summarize.first().isEnabled()) && !/Ищем/.test(t)) break;
    if (/не удалось|ошибк|заблокирован/i.test(t) && !/Ищем/.test(t) && Date.now() - t0 > 5000)
      throw new Error(`источники не получены: ${t.slice(0, 300)}`);
    if (Date.now() - t0 > timeout) throw new Error("источники не нашлись");
    await sleep(2000);
  }
  if (onSources) await onSources();
  await summarize.first().click();
  for (;;) {
    const t = await wizardText(page);
    if (/Новый производственный шаг|Что производят/.test(t) && !/Обобщаем/.test(t)) break;
    if (/ошибк|не удалось|заблокирован/i.test(t) && Date.now() - t0 > 3000 && !/Обобщаем/.test(t))
      throw new Error(`обобщение не удалось: ${t.slice(0, 300)}`);
    if (Date.now() - t0 > timeout) throw new Error("обобщение не закончилось");
    await sleep(1000);
  }
  await page.getByRole("button", { name: "Построить шаг", exact: true }).last().click();
  // Превью — или ошибка построения: у конечного продукта (готовое ПАВ)
  // продолжения нет, и ждать превью до таймаута незачем.
  const preview = page.getByText(/^Входные данные \(\d+\)$/).first();
  const t1 = Date.now();
  for (;;) {
    if (await preview.count()) break;
    const m = (await wizardText(page)).match(/(?:^|\n)\s*Ошибка: ([^\n]+)/);
    if (m && !/Построение\.\.\./.test(await wizardText(page))) {
      const e = new Error(`шаг не построен: ${m[1].trim()}`);
      e.deadEnd = true;
      e.aggregate = (await wizardText(page)).match(/Вероятно, это конечный продукт[^\n]*/)?.[0] ?? null;
      throw e;
    }
    if (Date.now() - t1 > timeout) throw new Error("превью шага не появилось");
    await sleep(1500);
  }
  await sleep(500);
  return wizardText(page);
}

/**
 * Превью шага разобранным: преобразование, входы, выходы, побочные — у
 * каждого продукта пометка («новый», «в графе: …», «раскрываемый»).
 */
function parsePreview(text) {
  const lines = String(text).split("\n").map((l) => l.trim()).filter(Boolean);
  const at = (re) => lines.findIndex((l) => re.test(l));
  const trIdx = at(/^Производственный шаг #\d+/);
  const block = (re) => {
    const i = at(re);
    if (i < 0) return [];
    const out = [];
    for (let j = i + 1; j < lines.length; j++) {
      const l = lines[j];
      if (/^(Входные данные|Выходные данные|Побочные продукты|Примечания|Добавить свой продукт)/.test(l)) break;
      if (/^(новый|раскрываемый|в графе)/.test(l) && out.length) out[out.length - 1].tag = l;
      else out.push({ name: l, tag: "" });
    }
    return out;
  };
  return {
    transformation: trIdx >= 0 ? lines[trIdx + 1] : null,
    inputs: block(/^Входные данные \(/),
    outputs: block(/^Выходные данные \(/),
    byproducts: block(/^Побочные продукты \(/),
  };
}

/** Прямоугольники узлов на экране и их попарные наложения. */
async function nodeBoxes(page) {
  return page.$$eval(".react-flow__node", (els) =>
    els.map((e) => {
      const r = e.getBoundingClientRect();
      return { id: e.dataset.id, label: e.innerText.replace(/\s+/g, " ").trim().slice(0, 50), x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
}

function overlaps(boxes) {
  const out = [];
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j];
      const dx = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
      const dy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
      if (dx > 1 && dy > 1) out.push(`${a.label} × ${b.label}: ${dx.toFixed(0)}×${dy.toFixed(0)} px`);
    }
  return out;
}

/** Узел, чей центр ближе всего к точке экрана (по умолчанию — к центру полотна). */
async function nodeNear(page, x = 800, y = 500) {
  return page.evaluate(([px, py]) => {
    let best = null, bd = Infinity;
    for (const n of document.querySelectorAll(".react-flow__node")) {
      const r = n.getBoundingClientRect();
      const d = Math.hypot(r.x + r.width / 2 - px, r.y + r.height / 2 - py);
      if (d < bd) { bd = d; best = { id: n.dataset.id, x: r.x + r.width / 2, y: r.y + r.height / 2, label: n.innerText.trim().split("\n").pop() }; }
    }
    return best;
  }, [x, y]);
}

/** Колесом: notches > 0 — приблизить, < 0 — отдалить. Возвращает масштаб. */
async function wheelZoom(page, x, y, notches) {
  await page.mouse.move(x, y);
  for (let i = 0; i < Math.abs(notches); i++) {
    await page.mouse.wheel(0, notches > 0 ? -100 : 100);
    await sleep(120);
  }
  await sleep(700);
  return page.evaluate(() => {
    const m = /scale\(([\d.]+)\)/.exec(document.querySelector(".react-flow__viewport")?.style.transform || "");
    return m ? Number(m[1]) : null;
  });
}

/**
 * Замер на странице: кадры (requestAnimationFrame) и длинные задачи (>50 мс)
 * за время fn. Возвращает {ms, frames:{p50,p90,max,over50}, longTasks:[…]}.
 */
async function measure(page, fn) {
  await page.evaluate(() => {
    window.__e2e = { frames: [], lt: [], rec: true };
    const f = (t) => { window.__e2e.frames.push(t); if (window.__e2e.rec) requestAnimationFrame(f); };
    requestAnimationFrame(f);
    window.__e2e.po = new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__e2e.lt.push(Math.round(e.duration)); });
    window.__e2e.po.observe({ type: "longtask" });
  });
  const t0 = Date.now();
  await fn();
  const ms = Date.now() - t0;
  await sleep(300);
  const r = await page.evaluate(() => {
    window.__e2e.rec = false;
    window.__e2e.po.disconnect();
    return { frames: window.__e2e.frames, lt: window.__e2e.lt };
  });
  const iv = r.frames.slice(1).map((t, i) => t - r.frames[i]).sort((a, b) => a - b);
  const pct = (p) => Math.round(iv[Math.min(iv.length - 1, Math.floor(iv.length * p))] ?? 0);
  return { ms, frames: { p50: pct(0.5), p90: pct(0.9), max: Math.round(iv[iv.length - 1] ?? 0), over50: iv.filter((x) => x > 50).length }, longTasks: r.lt };
}

module.exports = {
  sleep,
  clickIfPresent,
  openApp,
  waitNodesStable,
  openLibraryGraph,
  newManualGraph,
  wizardText,
  stepDownToPreview,
  parsePreview,
  nodeByLabel,
  fitView,
  nodeBoxes,
  overlaps,
  nodeNear,
  wheelZoom,
  measure,
};
