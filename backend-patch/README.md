# backend-patch: endpoint удаления сохранённого графа

Эта папка — **временный патч для серверного репозитория**. После того как
endpoint будет применён на сервере, папку нужно удалить из ветки клиента
перед мерджем:

```bash
git rm -r backend-patch
git commit -m "chore: убрать backend-patch после применения на сервере"
```

## Что нужно сделать на сервере

Добавить новый маршрут:

```
DELETE /graph-files/:id
```

Поведение:

- Найти сохранённый граф по `id`.
- Удалить его из хранилища (файл / запись в БД).
- Вернуть `204 No Content` при успехе.
- Вернуть `404` если граф с таким `id` не существует.
- Вернуть `400` если `id` невалидный (любые символы кроме безопасного
  множества — например, для path-traversal вроде `../`).
- Вернуть `500` при внутренних ошибках I/O.

Клиент в `src/store/api/saved-graph-api.ts:35-37` уже отправляет:

```ts
export async function deleteSavedGraph(id: string): Promise<void> {
  await axios.delete(`${import.meta.env.VITE_API_URL}/graph-files/${id}`);
}
```

То есть достаточно реализовать endpoint и убедиться, что он не возвращает
ошибку — клиент игнорирует тело ответа. Однако вернуть `204 No Content`
правильнее, чем 200 с пустым телом.

## Примеры реализации

Сервер выбирает один из вариантов в зависимости от своего стека.
Если он не из этого списка — взять ближайший как шаблон.

| Файл | Стек | Хранилище |
|------|------|-----------|
| `express-fs-route.ts` | Express + TypeScript | Файлы на диске (`<dir>/<id>.json`) |
| `express-mongoose-route.ts` | Express + TypeScript | MongoDB через Mongoose |
| `express-prisma-route.ts` | Express + TypeScript | PostgreSQL/MySQL через Prisma |
| `fastify-fs-route.ts` | Fastify + TypeScript | Файлы на диске |

Все варианты подразумевают, что роут `/graph-files` уже зарегистрирован
в приложении (т.к. POST `/save`, GET `/`, GET `/:id` уже работают).
Достаточно добавить новый handler в тот же router/controller, где
определены остальные методы — обычно это файл `routes/graph-files.*`
или `controllers/graph-files.*`.

## Чек-лист после применения

- [ ] Endpoint отвечает 204 при удалении существующего графа.
- [ ] Endpoint отвечает 404 при попытке удалить несуществующий граф.
- [ ] CORS пропускает метод `DELETE` (если ещё не пропускает — добавить
      `DELETE` в `Access-Control-Allow-Methods`).
- [ ] Удалить эту папку из ветки клиента: `git rm -r backend-patch`.
