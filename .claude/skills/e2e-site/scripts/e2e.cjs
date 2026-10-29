#!/usr/bin/env node
// Прогон сценариев сайта в headless Chromium.
//
//   node .claude/skills/e2e-site/scripts/e2e.cjs [флаги] <сценарий> [<сценарий>…]
//
// По умолчанию — свежая сборка клиента на http://localhost:5199, запросы
// /api/* уходят на боевой сервер; запись на сервер и вызовы модели
// заблокированы (модель отвечает подставными ответами сценария, если они
// есть). Флаги и сценарии — в SKILL.md рядом, список — `--list`.
//
// Выход: 0 — все проверки прошли, 1 — есть провалы, 2 — сценарий упал.

"use strict";

const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// Node-fetch ходит через прокси окружения только с NODE_USE_ENV_PROXY,
// а читает его при старте — перезапускаемся с ним.
if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), {
    stdio: "inherit",
    env: { ...process.env, NODE_USE_ENV_PROXY: "1", NODE_NO_WARNINGS: "1" },
  });
  process.exit(r.status ?? 2);
}

const SKILL = path.resolve(__dirname, "..");
const REPO = path.resolve(SKILL, "../../..");
const SCENARIOS = path.join(SKILL, "scenarios");
const LOCAL_ORIGIN = "http://localhost:5199";
const PROD_ORIGIN = "https://sorangptgraph.xyz";

// ---------- аргументы ----------
const opts = {
  site: "local",
  api: PROD_ORIGIN,
  liveModel: false,
  allowWrites: false,
  build: "auto",
  out: path.join(os.tmpdir(), "e2e-site"),
  timeout: 240,
  scenarios: [],
};
for (const a of process.argv.slice(2)) {
  const [k, v] = a.includes("=") ? [a.slice(0, a.indexOf("=")), a.slice(a.indexOf("=") + 1)] : [a, null];
  if (k === "--list") opts.list = true;
  else if (k === "--site") opts.site = v;
  else if (k === "--api") opts.api = v.replace(/\/+$/, "");
  else if (k === "--server-repo") opts.serverRepo = path.resolve(v);
  else if (k === "--live-model") opts.liveModel = true;
  else if (k === "--allow-writes") opts.allowWrites = true;
  else if (k === "--rebuild") opts.build = "always";
  else if (k === "--no-build") opts.build = "never";
  else if (k === "--out") opts.out = path.resolve(v);
  else if (k === "--timeout") opts.timeout = Number(v) || opts.timeout;
  else if (k.startsWith("--")) fail(`Неизвестный флаг ${k}`);
  else opts.scenarios.push(k);
}
if (!["local", "prod"].includes(opts.site)) fail("--site: local или prod");

const available = fs
  .readdirSync(SCENARIOS)
  .filter((f) => f.endsWith(".cjs"))
  .map((f) => f.replace(/\.cjs$/, ""))
  .sort();
if (opts.list || !opts.scenarios.length) {
  console.log("Сценарии:");
  for (const s of available) console.log(`  ${s.padEnd(12)} ${require(path.join(SCENARIOS, `${s}.cjs`)).description}`);
  process.exit(opts.list ? 0 : 2);
}
for (const s of opts.scenarios) if (!available.includes(s)) fail(`Нет сценария «${s}». Есть: ${available.join(", ")}`);

function fail(msg) {
  console.error(msg);
  process.exit(2);
}

// ---------- сборка ----------
const DIST = path.join(REPO, "node_modules", ".e2e-site", "dist");

function newestMtime(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return st.mtimeMs;
  let m = 0;
  for (const f of fs.readdirSync(p)) m = Math.max(m, newestMtime(path.join(p, f)));
  return m;
}

function ensureBuild() {
  const stamp = path.join(DIST, ".stamp");
  const inputs = ["src", "public", "index.html", "vite.config.ts", "package-lock.json"]
    .map((f) => path.join(REPO, f))
    .filter((f) => fs.existsSync(f));
  const fresh =
    fs.existsSync(stamp) && fs.statSync(stamp).mtimeMs >= Math.max(...inputs.map(newestMtime));
  if (opts.build === "never" || (opts.build === "auto" && fresh)) {
    if (!fs.existsSync(path.join(DIST, "index.html"))) fail("Сборки нет — запусти без --no-build.");
    console.log(`Сборка: ${fresh ? "свежая" : "УСТАРЕЛА (--no-build)"} — ${DIST}`);
    return;
  }
  console.log("Сборка клиента…");
  const t0 = Date.now();
  const r = spawnSync("npx", ["vite", "build", "--outDir", DIST, "--emptyOutDir", "--logLevel", "error"], {
    cwd: REPO,
    stdio: "inherit",
    env: { ...process.env, VITE_BASE: "/", VITE_API_URL: "/api" },
  });
  if (r.status !== 0) fail("Сборка упала.");
  fs.writeFileSync(stamp, new Date().toISOString());
  console.log(`Сборка готова за ${((Date.now() - t0) / 1000).toFixed(0)} с`);
}

// ---------- запросы к API ----------
/** model — запрос к модели (стоит денег), write — запись на сервер, read — остальное. */
function classify(method, p) {
  if (method === "GET" || method === "HEAD") return "read";
  if (p.startsWith("/api/graphs/gpt") || p === "/api/graphs/material-balance") return "model";
  if (
    p.startsWith("/api/graph-files") ||
    p.startsWith("/api/graphs/share") ||
    p.startsWith("/api/graphs/prompt-layout") ||
    p.startsWith("/api/graphs/material-balance/jobs") ||
    p.startsWith("/api/local-sources/uploads") ||
    p.startsWith("/api/local-sources/documents")
  )
    return "write";
  return "read";
}

const stats = { read: 0, model: { canned: 0, live: 0, blocked: [] }, write: { sent: 0, blocked: [] }, bad: [], branch: 0 };
let canned = {}; // путь → файл подставного ответа текущего сценария

const json = (route, status, body) =>
  route.fulfill({ status, contentType: "application/json", body: typeof body === "string" ? body : JSON.stringify(body) });

async function forward(req, url, override) {
  const headers = { ...req.headers() };
  for (const h of ["host", "origin", "referer", "content-length"]) delete headers[h];
  const body = ["GET", "HEAD"].includes(req.method()) ? undefined : override ?? req.postDataBuffer();
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const target = opts.site === "prod" ? PROD_ORIGIN : opts.api;
      const r = await fetch(target + url.pathname + url.search, { method: req.method(), headers, body });
      return { status: r.status, type: r.headers.get("content-type"), body: Buffer.from(await r.arrayBuffer()) };
    } catch (e) {
      lastErr = e;
      await new Promise((ok) => setTimeout(ok, 1500 * attempt));
    }
  }
  throw lastErr;
}

// ---------- ветка сервера поверх боевого API (--server-repo) ----------
//
// Боевой сервер часто старее ветки. С --server-repo обобщение шага идёт с
// промптами ветки (как из окна «Редактировать промпт обобщения»), а ответ
// разбора шага боевого сервера проходит ещё раз через build.js ветки — с
// подменённой моделью, которая «отвечает» тем, что разобрал боевой сервер.
// Так видны страховки ветки (побочные продукты, второе сырьё) до выкладки.
// База источников и остальное — боевые.
let branch = null;
function serverBranch() {
  if (branch) return branch;
  const repo = opts.serverRepo;
  const { stepAggregateDefaults } = require(path.join(repo, "routes/step/utils/prompts.js"));
  const utilsPath = require.resolve(path.join(repo, "routes/sources/utils"));
  const real = require(utilsPath);
  let replies = [];
  require.cache[utilsPath].exports = {
    ...real,
    callOpenAIResponsesRaw: async () => ({ status: "completed", text: JSON.stringify(replies.shift() ?? {}) }),
    extractOutputText: (r) => r.text,
  };
  const router = require(path.join(repo, "routes/step/build.js"));
  const handle = router.stack.find((l) => l.route?.path === "/gpt/step/build").route.stack[0].handle;
  const runBuild = (body, modelReplies) =>
    new Promise((resolve) => {
      replies = modelReplies;
      let out = "";
      const res = {
        statusCode: 200,
        writableEnded: false,
        status(c) { this.statusCode = c; return this; },
        setHeader() {}, flushHeaders() {}, on() {},
        write(x) { out += x; },
        end(x) { out += x || ""; this.writableEnded = true; resolve({ status: this.statusCode, body: out.trim() }); },
        json(o) { resolve({ status: this.statusCode, body: JSON.stringify(o) }); },
      };
      handle({ body, on() {} }, res);
    });
  branch = { stepAggregateDefaults, runBuild };
  return branch;
}

/** Ответ по ветке сервера или null — запрос не про неё. */
async function viaBranch(req, url) {
  const p = url.pathname;
  const { stepAggregateDefaults, runBuild } = serverBranch();
  if (req.method() === "GET" && p.endsWith("/gpt/step/aggregate/prompt")) {
    const direction = url.searchParams.get("direction") === "up" ? "up" : "down";
    return { status: 200, body: JSON.stringify({ success: true, direction, ...stepAggregateDefaults(direction) }) };
  }
  if (req.method() === "POST" && p.endsWith("/gpt/step/aggregate")) {
    const body = JSON.parse(req.postData() || "{}");
    const d = stepAggregateDefaults(body.direction === "up" ? "up" : "down");
    body.customSystemPrompt = body.customSystemPrompt || d.system;
    body.customUserPrompt = body.customUserPrompt || d.template;
    const r = await forward(req, url, JSON.stringify(body));
    return { status: r.status, body: r.body.toString() };
  }
  if (req.method() === "POST" && p.endsWith("/gpt/step/build")) {
    const body = JSON.parse(req.postData() || "{}");
    const r = await forward(req, url);
    let prod;
    try {
      prod = JSON.parse(r.body.toString().trim());
    } catch {
      prod = null;
    }
    if (!prod?.success || !prod.step) return { status: r.status, body: r.body.toString() };
    const strip = (x) => ({ name: x.name, description: x.description || "", industry: x.industry || "", mainPurpose: x.mainPurpose || "" });
    const t = prod.step.transformation;
    const local = await runBuild(body, [
      {
        transformation: { name: t.name, description: t.description || "", industry: t.industry || "", mainPurpose: t.mainPurpose || "", notes: t.notes || [] },
        inputProducts: prod.step.inputProducts.map(strip),
        outputProducts: prod.step.outputProducts.map(strip),
        byproducts: (prod.step.byproducts || []).map(strip),
      },
      { insufficient: prod.insufficientProducts || [] },
    ]);
    return local;
  }
  return null;
}

/**
 * «Рассчитать» баланс без модели: готовый расчёт из базы сервера, если он
 * есть, — как его отдал бы сам сервер (fromCache). Ищем через /ready: это
 * чтение, и нового расчёта (запроса к модели) оно не начнёт; POST начал бы,
 * не найдя готового.
 */
async function cachedBalance(req, url) {
  if (req.method() !== "POST" || url.pathname !== "/api/graphs/material-balance") return null;
  const b = JSON.parse(req.postData() || "{}");
  if (b.force || b.knownData || b.system || b.template || !b.transformation) return null;
  const outputs = (b.outputs || []).filter((n) => !Array.isArray(b.targets) || b.targets.includes(n.id));
  const item = { transformation: b.transformation, inputs: b.inputs || [], outputs };
  const ready = new URL("/api/graphs/material-balance/ready", url);
  const r = await forward(
    { method: () => "POST", headers: () => ({ "content-type": "application/json" }) },
    ready,
    JSON.stringify({ items: [item] }),
  );
  const found = JSON.parse(r.body.toString() || "{}")?.results?.[b.transformation.id];
  return found ? { success: true, fromCache: true, ...found } : null;
}

async function handleApi(route) {
  const req = route.request();
  const url = new URL(req.url());
  const kind = classify(req.method(), url.pathname);
  const label = `${req.method()} ${url.pathname}`;
  try {
    if (kind === "model" && !opts.liveModel) {
      const cached = await cachedBalance(req, url);
      if (cached) {
        stats.read++;
        return json(route, 200, cached);
      }
      // Список файлов — ответы по очереди: шаг за шагом цепочки.
      const entry = canned[url.pathname];
      const file = Array.isArray(entry) ? entry.shift() : entry;
      if (file) {
        stats.model.canned++;
        const body = JSON.parse(fs.readFileSync(path.resolve(SKILL, file), "utf8"));
        // Ответ, сохранённый сценарием живого прогона ({url, status, request,
        // body}), — отдаём его тело.
        return json(route, 200, body && "url" in body && "body" in body ? body.body : body);
      }
      stats.model.blocked.push(label);
      return json(route, 503, { success: false, error: "e2e: вызов модели заблокирован (нужен --live-model)" });
    }
    if (kind === "write" && !opts.allowWrites) {
      stats.write.blocked.push(label);
      return json(route, 403, { success: false, error: "e2e: запись на сервер заблокирована (нужен --allow-writes)" });
    }
    if (kind === "model") stats.model.live++;
    else if (kind === "write") stats.write.sent++;
    else stats.read++;
    if (opts.serverRepo) {
      const b = await viaBranch(req, url);
      if (b) {
        stats.branch++;
        if (b.status >= 400) stats.bad.push(`${label} → ${b.status}`);
        return json(route, b.status, b.body);
      }
    }
    if (opts.site === "prod") return route.continue();
    const r = await forward(req, url);
    if (r.status >= 400) stats.bad.push(`${label} → ${r.status}`);
    return route.fulfill({ status: r.status, headers: r.type ? { "content-type": r.type } : {}, body: r.body });
  } catch (e) {
    stats.bad.push(`${label} → ${e.message}`);
    return json(route, 502, { success: false, error: `e2e: ${e.message}` });
  }
}

function serveStatic(route) {
  const url = new URL(route.request().url());
  let p = path.join(DIST, decodeURIComponent(url.pathname));
  if (!p.startsWith(DIST) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) p = path.join(DIST, "index.html");
  return route.fulfill({ path: p });
}

// ---------- прогон ----------
(async () => {
  if (opts.site === "local") ensureBuild();
  fs.mkdirSync(opts.out, { recursive: true });
  const origin = opts.site === "local" ? LOCAL_ORIGIN : PROD_ORIGIN;
  console.log(
    `Сайт: ${origin}${opts.site === "local" ? ` (API → ${opts.api})` : ""}; модель: ${opts.liveModel ? "ЖИВАЯ" : "заблокирована/подставная"}; запись: ${opts.allowWrites ? "РАЗРЕШЕНА" : "заблокирована"}` +
      (opts.serverRepo ? `; обобщение и разбор шага — по ветке ${opts.serverRepo}` : ""),
  );
  if (opts.site === "prod") {
    // deploy-site.sh кладёт рядом со сборкой ветку и коммит; нет файла —
    // nginx отдаёт index.html, значит сайт выложен до этой пометки.
    const v = await fetch(`${PROD_ORIGIN}/version.txt`).then((r) => r.text()).catch(() => "");
    console.log(`На сайте: ${/^\s*</.test(v) || !v.trim() ? "ветка не помечена (выложено до version.txt)" : v.trim().replace(/\n/g, " — ")}`);
  }

  const { chromium } = require("playwright");
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined;
  const browser = await chromium.launch(proxy ? { proxy } : {});
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();
  if (opts.site === "local") {
    await page.route(`${LOCAL_ORIGIN}/**`, (route) =>
      new URL(route.request().url()).pathname.startsWith("/api/") ? handleApi(route) : serveStatic(route),
    );
  } else {
    await page.route(`${PROD_ORIGIN}/api/**`, handleApi);
  }

  const pageErrors = new Map();
  const note = (m) => pageErrors.set(m, (pageErrors.get(m) || 0) + 1);
  page.on("pageerror", (e) => note(`pageerror: ${e.message.split("\n")[0]}`));
  page.on("console", (m) => {
    // «Failed to load resource» дублирует ответ API — он уже учтён в статистике.
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) note(`console: ${m.text().slice(0, 200)}`);
  });

  const lib = require("./lib.cjs");
  const results = [];
  const shots = [];
  let crashed = false;
  for (const name of opts.scenarios) {
    const scenario = require(path.join(SCENARIOS, `${name}.cjs`));
    // canned — карта или функция от переменных окружения (переиграть
    // сохранённый прогон); списки копируем: они расходуются.
    canned = Object.fromEntries(
      Object.entries((typeof scenario.canned === "function" ? scenario.canned(process.env) : scenario.canned) || {}).map(
        ([k, v]) => [k, Array.isArray(v) ? [...v] : v],
      ),
    );
    console.log(`\n=== ${name}: ${scenario.description}`);
    const ctx = {
      page,
      origin,
      env: process.env,
      lib,
      log: (...a) => console.log("  ", ...a),
      check: (title, ok, detail = "") => {
        results.push({ name, title, ok: !!ok });
        console.log(`  ${ok ? "✔" : "✘"} ${title}${detail ? ` — ${detail}` : ""}`);
        return !!ok;
      },
      shot: async (label) => {
        const file = path.join(opts.out, `${name}-${label}.png`);
        await page.screenshot({ path: file });
        shots.push(file);
        return file;
      },
    };
    const t0 = Date.now();
    try {
      await Promise.race([
        scenario.run(ctx),
        new Promise((_, no) => setTimeout(() => no(new Error(`таймаут ${opts.timeout} с`)), opts.timeout * 1000)),
      ]);
    } catch (e) {
      crashed = true;
      console.log(`  ✘ СЦЕНАРИЙ УПАЛ: ${e.message.split("\n")[0]}`);
      await ctx.shot("crash").catch(() => {});
    }
    console.log(`   (${((Date.now() - t0) / 1000).toFixed(0)} с)`);
  }
  await browser.close();

  // ---------- итог ----------
  const failed = results.filter((r) => !r.ok);
  console.log("\n=== Итог");
  console.log(`Проверки: ${results.length - failed.length}/${results.length} прошли${failed.length ? `; провалы: ${failed.map((f) => `${f.name}: ${f.title}`).join("; ")}` : ""}`);
  console.log(
    `API: чтение ${stats.read}; модель — подставных ${stats.model.canned}, живых ${stats.model.live}, заблокировано ${stats.model.blocked.length}; запись — отправлено ${stats.write.sent}, заблокировано ${stats.write.blocked.length}` +
      (opts.serverRepo ? `; по ветке сервера ${stats.branch}` : ""),
  );
  const uniq = (a) => [...new Set(a)];
  if (stats.model.blocked.length) console.log(`  заблокированные вызовы модели: ${uniq(stats.model.blocked).join(", ")}`);
  if (stats.write.blocked.length) console.log(`  заблокированная запись: ${uniq(stats.write.blocked).join(", ")}`);
  if (stats.bad.length) console.log(`  ответы с ошибкой: ${uniq(stats.bad).slice(0, 8).join("; ")}`);
  if (pageErrors.size)
    console.log(`Ошибки страницы:\n${[...pageErrors].slice(0, 8).map(([m, n]) => `  ${n}× ${m}`).join("\n")}`);
  if (shots.length) console.log(`Скриншоты (${opts.out}):\n${shots.map((s) => `  ${s}`).join("\n")}`);
  process.exit(crashed ? 2 : failed.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
