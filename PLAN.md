# План: Пошаговое построение цепочки + Новая UI-навигация

## Контекст

### Проблема
1. Построение цепочки — один запрос возвращает всю цепочку. Нужен режим "1 запрос = 1 шаг" с отдельными роутами.
2. UI-навигация: левый клик = карточка, правый клик = контекстное меню с действиями.
3. Toggle "Вся цепочка / По шагам" должен быть **ДО** поиска источников (разные роуты для каждого режима).

### Ключевые решения
- Toggle появляется первым в build-панели, до любых запросов
- Режим "По шагам" использует 3 отдельных серверных роута (sources, aggregate, build)
- Формат ответа sources одинаков для обоих режимов (`TechnologySource[]`)
- Step build возвращает тот же `{ "Цепочка": [...] }` формат — переиспользуем `levelToFlow`
- Дедупликация: нечёткое сравнение (lowercase + trim + нормализация)

---

## Часть A: Новая UI-навигация

### A1. Контекстное меню (ПКМ) — `NodeContextMenu.tsx`
### A2. Модалка удаления — `ConfirmDeleteModal.tsx`
### A3. ЛКМ → card mode, ПКМ → build mode
### A4. FlowPanel: проп `mode: "card" | "build"`, `buildDirection`
### A5. Переходы между режимами

---

## Часть B: Пошаговое построение (фронтенд)

### B1. UI-поток в build-панели

```
ПКМ → "Построить вниз" → FlowPanel (build mode):

┌──────────────────────────────────────┐
│ Построить вниз от «Этанол»           │
│                                      │
│ Выберите режим:                      │
│ [Вся цепочка]  [По шагам]  ← ПЕРВЫЙ │
│                                      │
│ --- если "Вся цепочка" ---           │
│ (текущий поток без изменений:        │
│  sources → aggregate → chain)        │
│                                      │
│ --- если "По шагам" ---              │
│ (НОВЫЙ поток с другими роутами:      │
│  step/sources → step/aggregate →     │
│  step/build → превью → принять)      │
└──────────────────────────────────────┘
```

### B2. Состояние buildMode в sourcesSlice

Файл: `/src/store/slices/sourcesSlice.ts`

Добавить в `NodeSourcesState`:
```typescript
buildMode: "whole" | "step" | null;  // null = ещё не выбран

// Step-specific state
stepSourcesStatus: Status;
stepSourcesError: string | null;
stepSources: TechnologySource[];

stepAggregateStatus: Status;
stepAggregateError: string | null;
stepAggregatedText: string | null;  // markdown или "needs-sources"

stepBuildStatus: Status;
stepBuildError: string | null;
stepBuildResult: TechChain | null;
```

Новый reducer: `setBuildMode`

### B3. Три новых thunk'а — `/src/store/api/step-chain-api.ts` (новый файл)

**fetchStepSources** — `POST /graphs/gpt/step/sources`
**aggregateStepSources** — `POST /graphs/gpt/step/aggregate`
**buildStep** — `POST /graphs/gpt/step/build`

### B4. StepSession в gptSlice

```typescript
interface StepSessionData {
  direction: BuildDirection;
  existingChainText: string;
  currentTargetProduct: string;
  completedSteps: Array<{ productName: string; chain: TechChain }>;
  status: "idle" | "sources" | "aggregate" | "build" | "preview" | "done";
}
```

### B5. Принятие шага (acceptStepResult)
1. Берём stepBuildResult (TechChain)
2. Конвертируем через levelToFlow()
3. Добавляем nodes/edges
4. computeShiftX() для коллизий
5. Обновляем stepSession

### B6. Продолжение (следующий шаг)
1. Входные продукты = кандидаты для следующего
2. currentTargetProduct обновляется
3. existingChainText дополняется
4. Цикл: step/sources → step/aggregate → step/build

### B7. Превью шага
- Преобразование: название + описание
- Входные/выходные продукты
- Кнопки: "Добавить шаг", "Повторить"

---

## Часть C: Серверные роуты (JS/Express)

### C1. Структура файлов

```
routes/
  step/
    sources.js          → POST /gpt/step/sources
    aggregate.js        → POST /gpt/step/aggregate
    build.js            → POST /gpt/step/build
    utils/
      index.js
      prompt.js          → промпты (Python → JS)
```

Регистрация в `server.js`:
```javascript
const stepSources = require("./routes/step/sources");
const stepAggregate = require("./routes/step/aggregate");
const stepBuild = require("./routes/step/build");

app.use("/api/graphs", stepSources);
app.use("/api/graphs", stepAggregate);
app.use("/api/graphs", stepBuild);
```

### C2. POST `/gpt/step/sources`
- Паттерн: идентичен routes/sources/sources.js
- Другой промпт: фокус на крупных фрагментах
- Response: `{ success, product, sources: TechnologySource[] }`

### C3. POST `/gpt/step/aggregate`
- Принимает `existingChain`
- SYSTEM: "дострой РОВНО ОДИН следующий шаг"
- Response: markdown или "needs-sources"

### C4. POST `/gpt/step/build`
- Копия routes/chain/chain.js с путём /gpt/step/build
- Response: `{ success, chain: TechChain, level1 }`

### C5. Промпты — routes/step/utils/prompt.js
- buildStepSourcesPrompt: крупные фрагменты, без построения цепочки
- buildStepAggregatePrompts: один шаг с existingChain

---

## Файлы для изменения / создания

### Новые (фронтенд):
| Файл | Назначение |
|------|-----------|
| `src/components/node-context-menu/NodeContextMenu.tsx` | Контекстное меню (ПКМ) |
| `src/components/node-context-menu/NodeContextMenu.module.css` | Стили |
| `src/components/confirm-delete-modal/ConfirmDeleteModal.tsx` | Модалка удаления |
| `src/components/confirm-delete-modal/ConfirmDeleteModal.module.css` | Стили |
| `src/store/api/step-chain-api.ts` | 3 thunk'а |
| `src/utils/matchExistingProduct.ts` | Нечёткое сравнение имён |

### Изменяемые (фронтенд):
| Файл | Что меняется |
|------|-------------|
| `src/Flow.tsx` | contextMenu, panelMode, step handlers |
| `src/components/flow-panel/FlowPanel.tsx` | mode prop, toggle, step flow UI |
| `src/components/flow-panel/types.ts` | Новые пропсы |
| `src/components/flow-panel/FlowPanel.module.css` | Стили |
| `src/store/types.ts` | StepSessionData |
| `src/store/slices/gptSlice.ts` | stepSessions, acceptStepResult |
| `src/store/slices/sourcesSlice.ts` | buildMode, step state, setBuildMode |

### Новые (сервер):
| Файл | Назначение |
|------|-----------|
| `routes/step/sources.js` | POST /gpt/step/sources |
| `routes/step/aggregate.js` | POST /gpt/step/aggregate |
| `routes/step/build.js` | POST /gpt/step/build |
| `routes/step/utils/index.js` | Реэкспорт |
| `routes/step/utils/prompt.js` | Промпты |

---

## Порядок реализации

### Этап 1: Серверные роуты (Часть C)
1. routes/step/utils/prompt.js
2. routes/step/sources.js
3. routes/step/aggregate.js
4. routes/step/build.js
5. server.js — регистрация

### Этап 2: UI-навигация (Часть A)
6. NodeContextMenu + ConfirmDeleteModal
7. Flow.tsx: onNodeContextMenu, panelMode
8. FlowPanel: mode prop

### Этап 3: Пошаговое построение (Часть B)
9. sourcesSlice: buildMode + step state
10. step-chain-api.ts: 3 thunk'а
11. gptSlice: stepSessions + acceptStepResult
12. FlowPanel: toggle + step flow UI
13. Flow.tsx: step handlers

---

## Переиспользуемый код

| Утилита | Откуда | Где |
|---------|--------|-----|
| `sourcesKey()` | sourcesSlice.ts | Ключи step-сессий |
| `levelToFlow()` | utils/levelToFlow.ts | Step TechChain → nodes/edges |
| `computeShiftX()` | utils/resolveChainOverlap.ts | Коллизии |
| `normalizeEdges()` | utils/normalize-edges.ts | Дедупликация рёбер |
| `TechChain` | utils/chainToFlow.ts | Формат ответа |
| `callOpenAIResponses` | routes/sources/utils/openai.js | Серверные роуты |
| `validateChain` | routes/chain/utils/validate.js | step/build |
| `buildLevel1` | routes/chain/utils/level1.js | step/build |
| `startAntiIdle` | routes/sources/sources.js | Серверные роуты |

---

## Чеклист

### Часть A:
- [ ] ПКМ → контекстное меню, ЛКМ → карточка
- [ ] "Удалить" → модалка → нода удалена
- [ ] "Построить вниз" → build mode панель

### Часть B:
- [ ] Toggle "По шагам" → UI поиска step-sources
- [ ] Step sources → список источников
- [ ] Step aggregate → markdown одного шага (или "needs-sources")
- [ ] Step build → TechChain → превью
- [ ] "Добавить шаг" → узлы на графе
- [ ] "Повторить" → новый запрос
- [ ] "Следующий шаг" → цикл для нового продукта

### Часть C:
- [ ] POST /gpt/step/sources → JSON с sources[]
- [ ] POST /gpt/step/aggregate → markdown или "needs-sources"
- [ ] POST /gpt/step/build → валидный TechChain JSON
