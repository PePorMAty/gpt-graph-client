import type { FC } from "react";

const INK = "var(--c-text)";
const QUIET = "var(--c-text-muted)";
const EDGE = "var(--c-border-strong)";
const BRAND = "var(--c-brand)";

/** Рамка блока схемы. */
const Box: FC<{ x: number; y: number; w: number; h: number; dashed?: boolean }> = ({
  x,
  y,
  w,
  h,
  dashed,
}) => (
  <rect
    x={x}
    y={y}
    width={w}
    height={h}
    rx={8}
    fill="none"
    stroke={EDGE}
    strokeWidth={1.25}
    strokeDasharray={dashed ? "5 4" : undefined}
  />
);

/** Название блока и строки под ним. */
const Label: FC<{ x: number; y: number; title: string; lines?: string[] }> = ({
  x,
  y,
  title,
  lines = [],
}) => (
  <>
    <text x={x} y={y} fontWeight={600} fill={INK}>
      {title}
    </text>
    {lines.map((l, i) => (
      <text key={i} x={x} y={y + 16 * (i + 1)} fontSize={11.5} fill={QUIET}>
        {l}
      </text>
    ))}
  </>
);

/** Разделы левой панели. */
const RAIL = ["Создать граф", "База данных", "Материальный баланс", "Закладки", "История действий"];

/**
 * Схема экрана для раздела «Что на экране»: граф в центре, управление по
 * краям. Цвета — из темы приложения, пример графа — как на полотне:
 * продукты голубые, преобразование оранжевое.
 */
export const ScreenDiagram: FC = () => (
  <svg
    viewBox="0 0 760 504"
    role="img"
    aria-label="Экран приложения: граф в центре, управление по его краям"
    fontSize={13}
    fontFamily="inherit"
  >
    <defs>
      <marker
        id="guide-screen-arrow"
        viewBox="0 0 10 10"
        refX={9}
        refY={5}
        markerWidth={6}
        markerHeight={6}
        orient="auto-start-reverse"
      >
        <path d="M0 0L10 5L0 10z" fill={EDGE} />
      </marker>
    </defs>
    <text x={24} y={30} fontSize={15} fontWeight={600} fill={INK}>
      Граф — в центре экрана, управление — по его краям
    </text>

    <Box x={24} y={48} w={712} h={56} />
    <Label
      x={40}
      y={72}
      title="Верхняя панель"
      lines={["вкладки «Граф» и «Библиотека» · поиск по графу (Ctrl+K) · «Экспорт» · уведомления · «?» — справка"]}
    />

    <Box x={24} y={112} w={168} h={304} />
    <Label x={40} y={136} title="Левая панель" />
    {RAIL.map((name, i) => (
      <text key={name} x={40} y={164 + 20 * i} fontSize={11.5} fill={INK}>
        {name}
      </text>
    ))}
    <text x={40} y={380} fontSize={11.5} fill={QUIET}>
      повторный щелчок
    </text>
    <text x={40} y={396} fontSize={11.5} fill={QUIET}>
      закрывает раздел
    </text>

    <Box x={200} y={112} w={536} h={72} />
    <Label
      x={216}
      y={136}
      title="Кнопки над полотном"
      lines={[
        "меню с названием графа · «Только продукты» · «Материальный баланс» ·",
        "«Фокус» и стрелка его настроек · «Промышленные данные» · «Альтернативы»",
      ]}
    />

    <rect x={200} y={192} width={400} height={224} rx={8} fill={BRAND} fillOpacity={0.07} stroke={BRAND} strokeWidth={2} />
    <text x={216} y={216} fontWeight={600} fill={INK}>
      Полотно с графом
    </text>

    <Box x={208} y={228} w={168} h={88} dashed />
    <Label
      x={224}
      y={252}
      title="Карточка узла"
      lines={["по щелчку на узле;", "на её месте — разделы", "левой панели"]}
    />

    <Box x={208} y={352} w={112} h={52} />
    <text x={264} y={382} textAnchor="middle" fontSize={11.5} fill={INK}>
      мини-карта
    </text>

    <rect x={428} y={228} width={136} height={28} rx={6} fill="var(--c-product-soft)" stroke="var(--c-product)" strokeWidth={1.25} />
    <rect x={428} y={292} width={136} height={28} rx={6} fill="var(--c-transform-soft)" stroke="var(--c-transform)" strokeWidth={1.25} />
    <rect x={428} y={356} width={136} height={28} rx={6} fill="var(--c-product-soft)" stroke="var(--c-product)" strokeWidth={1.25} />
    <path d="M496 256V290" fill="none" stroke={EDGE} strokeWidth={1.25} markerEnd="url(#guide-screen-arrow)" />
    <path d="M496 320V354" fill="none" stroke={EDGE} strokeWidth={1.25} markerEnd="url(#guide-screen-arrow)" />
    <text x={496} y={246} textAnchor="middle" fontSize={11.5} fill={INK}>
      сырьё (продукт)
    </text>
    <text x={496} y={310} textAnchor="middle" fontSize={11.5} fill={INK}>
      преобразование
    </text>
    <text x={496} y={374} textAnchor="middle" fontSize={11.5} fill={INK}>
      продукт
    </text>
    <text x={496} y={404} textAnchor="middle" fontSize={11.5} fill={QUIET}>
      читается сверху вниз
    </text>

    <Box x={608} y={192} w={128} h={136} />
    <Label
      x={620}
      y={216}
      title="Инструменты"
      lines={["указатель", "рука", "рамка", "раскладка", "сохранить", "очистить"]}
    />

    <Box x={24} y={424} w={712} h={56} />
    <Label
      x={40}
      y={448}
      title="Нижняя строка"
      lines={["узлы и связи на экране · длина цепочек · подтверждено в ГИСП · масштаб «−» «+» и «вписать в экран»"]}
    />
  </svg>
);
