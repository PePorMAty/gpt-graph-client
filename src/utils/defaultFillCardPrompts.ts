export interface FillCardField {
  key: string;
  label: string;
  custom?: boolean;
}

export const PRODUCT_FIELDS: FillCardField[] = [
  { key: "product_name", label: "Название продукта" },
  { key: "product_type", label: "Тип продукта" },
  { key: "purity", label: "Степень чистоты" },
  { key: "main_impurities", label: "Основные примеси" },
  { key: "allowed_impurities", label: "Допустимые примеси" },
  { key: "conversion_yield", label: "Коэффициент конверсии" },
  { key: "typical_scale", label: "Типичный масштаб производства" },
  { key: "storage", label: "Условия хранения" },
  { key: "carbon_footprint", label: "Углеродный след" },
  { key: "producers", label: "Производители" },
  { key: "applications", label: "Основные применения" },
  { key: "price", label: "Цена" },
];

export const TRANSFORMATION_FIELDS: FillCardField[] = [
  { key: "technology_name", label: "Название технологии" },
  { key: "technology_short_description", label: "Краткое описание технологии" },
  { key: "equipment", label: "Оборудование" },
  { key: "conditions", label: "Условия" },
  {
    key: "constraints_or_key_property",
    label: "Ограничения или ключевое свойство технологии",
  },
  {
    key: "additional_materials_or_catalysts",
    label: "Дополнительные вещества, материалы, расходники или катализаторы",
  },
  { key: "energy", label: "Энергетика" },
  { key: "enterprise_and_plant", label: "Предприятие и завод" },
];

export function getFieldsForNodeType(nodeType: string): FillCardField[] {
  return nodeType === "transformation"
    ? TRANSFORMATION_FIELDS
    : PRODUCT_FIELDS;
}

/** Transliterate a russian label into a snake_case key */
export function labelToKey(label: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo",
    ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
    н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u",
    ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return label
    .toLowerCase()
    .split("")
    .map((c) => map[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const TRANSFORMATION_INTRO = `Ты — инженер-технолог химической и промышленной технологии.

Тебе передают производственную цепочку или её текстовое представление.
Твоя задача — самостоятельно:
1. определить первый узел преобразования;
2. понять его место в цепочке;
3. на основе всей цепочки, логики материальных потоков и внутренних инженерных знаний
   составить расширенное технологическое описание именно этого первого узла преобразования.

Очень важно:
- Код выбирается для тебя в запросе.
- Используй не только текст самого узла, но и общий контекст цепочки.
- Не пересказывай входной JSON или документ.
- Не пиши "в JSON указано", "в цепочке видно", "во входных данных написано" и т.п.
- Пиши профессионально, как инженер-технолог.
- Если какие-то детали нельзя уверенно восстановить, укажи это аккуратно, без выдумывания.
- Если в цепочке есть несколько возможных трактовок, выбирай наиболее типичную для промышленной практики.

Считай нужным узлом тот, который тебе отправили`;

const PRODUCT_INTRO = `Ты — инженер-технолог химической и промышленной технологии.

Тебе передают производственную цепочку или её текстовое представление и один из узлов цепочки.
Твоя задача — самостоятельно:

1. взять отправленный узел;
2. понять его место в цепочке;
3. на основе всей цепочки, логики материальных потоков и внутренних инженерных знаний
   составить расширенное описание именно этого первого узла продукта.

Очень важно:
- Код выбирается для тебя в запросе.
- Используй не только текст самого узла, но и общий контекст цепочки.
- Не пересказывай входной JSON или документ.
- Не пиши "в JSON указано", "в цепочке видно", "во входных данных написано" и т.п.
- Пиши профессионально, как инженер-технолог.
- Если какие-то детали нельзя уверенно восстановить, укажи это аккуратно, без выдумывания.
- Если в цепочке есть несколько возможных трактовок, выбирай наиболее типичную для промышленной практики.`;

/**
 * Builds the default system prompt for fill-card.
 * `activeFields` — the fields to include in the "return format" section.
 * If omitted, all predefined fields for the nodeType are used.
 */
export function getDefaultFillCardSystemPrompt(
  nodeType: string,
  activeFields?: FillCardField[],
): string {
  const fields =
    activeFields ?? getFieldsForNodeType(nodeType);

  const formatLines = fields
    .map((f) => `${f.label}:\n...`)
    .join("\n\n");

  const intro =
    nodeType === "transformation" ? TRANSFORMATION_INTRO : PRODUCT_INTRO;
  const prefix =
    nodeType === "transformation"
      ? "Верни ответ строго в таком виде:"
      : "Нужно вернуть ответ строго в таком виде:";

  return `${intro}\n\n${prefix}\n\n${formatLines}`;
}