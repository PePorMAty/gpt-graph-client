// routes/step/utils/prompts.js
//
// Промпты для step-by-step построения цепочки.
//   - buildStepSourcesPromptDown: поиск источников для одного шага вниз
//     (JSON-вывод через json_schema, см. buildSourcesSchema в sources/utils/openai.js).
//   - buildStepAggregatePrompts: агрегирование найденных источников в РОВНО ОДИН
//     новый шаг существующей цепочки (Markdown ИЛИ "needs-sources").

function buildStepSourcesPromptDown(productName, maxItems) {
  return `
// =============================================================================
// >>> ВСТАВИТЬ СЮДА ПОЛНЫЙ ТЕКСТ ПРОМПТА buildStepSourcesPromptDown <<<
//
// Это template literal — внутри можно использовать ${productName} и ${maxItems}.
// Текст начинается с "## Роль и задача" и заканчивается секцией "## Правила честности".
// Источник: новый промпт от пользователя (обратная постановка — что производят ИЗ productName).
// =============================================================================
`;
}

// =============================================================================
// AGGREGATE: SYSTEM + USER_PROMPT_TEMPLATE
// =============================================================================
// Вывод модели: Markdown по шаблону в USER, либо ровно строка "needs-sources".
// Парсится в aggregate.js: если .trim() === "needs-sources" → ответ status="needs-sources".

const STEP_AGGREGATE_SYSTEM = `
// =============================================================================
// >>> ВСТАВИТЬ СЮДА ПОЛНЫЙ ТЕКСТ STEP_AGGREGATE_SYSTEM <<<
//
// Системный промпт для агрегации (один шаг цепочки + альтернативы).
// Начинается с "Ты — инженер-технолог и аналитик производственных цепочек..."
// Заканчивается секцией "Самопроверка перед выводом" (10 пунктов).
// =============================================================================
`;

const STEP_AGGREGATE_USER_TEMPLATE = `
// =============================================================================
// >>> ВСТАВИТЬ СЮДА ПОЛНЫЙ ТЕКСТ STEP_AGGREGATE_USER_TEMPLATE <<<
//
// User-промпт для агрегации с плейсхолдерами:
//   <<<TARGET_PRODUCT>>>  — заменяется на productName
//   <<<EXISTING_CHAIN>>>  — заменяется на JSON existingChain
//   <<<BLOCKS>>>          — заменяется на форматированные блоки источников
//
// Содержит Markdown-шаблон с # Раскрываемый продукт, ## Шаг, # Альтернативы и т.д.
// В конце .trim() применяется в buildStepAggregatePrompts.
// =============================================================================
`.trim();

function stringifyExistingChain(chain) {
  if (chain === null || chain === undefined) return "[]";
  if (typeof chain === "string") return chain.trim() || "[]";
  try {
    return JSON.stringify(chain, null, 2);
  } catch {
    return String(chain);
  }
}

function formatBlocksForPrompt(blocks) {
  const arr = Array.isArray(blocks) ? blocks : [];
  return arr
    .map((b, i) => {
      const txt = String(b || "").trim();
      if (!txt) return null;
      const first = txt.split("\n", 1)[0].trim();
      if (/^Источник\s*\d+\s*:?\s*$/i.test(first)) return txt;
      return `Источник ${i + 1}\n\n${txt}`;
    })
    .filter(Boolean)
    .join("\n\n---\n\n");
}

function buildStepAggregatePrompts({ productName, existingChain, blocks }) {
  const blocksText = formatBlocksForPrompt(blocks);
  const chainText = stringifyExistingChain(existingChain);

  const USER_PROMPT = STEP_AGGREGATE_USER_TEMPLATE
    .replace("<<<TARGET_PRODUCT>>>", String(productName || "").trim())
    .replace("<<<EXISTING_CHAIN>>>", chainText || "[]")
    .replace("<<<BLOCKS>>>", blocksText);

  return {
    SYSTEM: STEP_AGGREGATE_SYSTEM,
    USER_PROMPT,
  };
}

module.exports = {
  buildStepSourcesPromptDown,
  buildStepAggregatePrompts,
};
