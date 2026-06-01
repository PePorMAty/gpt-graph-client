# backend-patch: endpoint удаления сохранённого графа

Эта папка — **временный патч для серверного репозитория**. После того
как endpoint применён на сервере, папку нужно удалить из ветки клиента
перед мерджем:

```bash
git rm -r backend-patch
git commit -m "chore: убрать backend-patch после применения на сервере"
```

## Стек сервера

Из присланных файлов: Node.js + Express 5 (CommonJS), Sequelize/PG для
основных моделей, но `routes/graph-files.js` использует **файловое
хранилище** в `<repo>/data/saved-graphs/`. `id` графа — имя JSON-файла
целиком (например, `my-graph_2024-01-01t12-00-00-000z.json`).

## Что нужно сделать

В файл `routes/graph-files.js` добавить новый обработчик
`router.delete("/:id", ...)` сразу после существующего `router.get("/:id", ...)`
и перед `module.exports = router;`.

Готовый код — в `graph-files-delete.js` рядом. Скопировать блок и
вставить как есть. Дополнительных require'ов не нужно: `fs/promises`
и `path` уже импортированы в этом файле.

Клиент в `src/store/api/saved-graph-api.ts` уже отправляет:

```ts
await axios.delete(`${import.meta.env.VITE_API_URL}/graph-files/${id}`);
```

где `id` — это имя файла, как возвращает `GET /api/graph-files`
(поле `id` в каждом элементе).

## Контракт ответов

- **204 No Content** — успех (граф удалён).
- **404 Not Found** — файл с таким id не существует (ловим `ENOENT`).
- **500 Internal Server Error** — прочие ошибки I/O.

Клиент игнорирует тело ответа, ему важен только статус 2xx.

## CORS

В `server.js` CORS-заголовки от Express принудительно блокируются —
значит, CORS обрабатывается на уровне reverse proxy / nginx.
Если для других методов (POST/GET) на `/api/graph-files` запросы из
браузера проходят — `DELETE` тоже должен пройти. Если фронт ловит
preflight-ошибку, нужно убедиться, что nginx (или другой прокси)
пропускает `DELETE` в `Access-Control-Allow-Methods`.

## Чек-лист

- [ ] Скопировать блок из `graph-files-delete.js` в `routes/graph-files.js`.
- [ ] Перезапустить сервер (`npm run dev` / `pm2 reload`).
- [ ] Проверить вручную: `curl -i -X DELETE http://<host>/api/graph-files/<id>`
      → 204 для существующего, 404 для несуществующего.
- [ ] Проверить из UI: вкладка «Сохранённые» → 🗑 → подтвердить
      → элемент исчезает из списка без перезагрузки страницы.
- [ ] В ветке клиента: `git rm -r backend-patch`.
