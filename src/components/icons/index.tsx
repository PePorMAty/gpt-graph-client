/* Единый набор иконок интерфейса.
   Раньше SVG жили инлайном по месту использования (в основном в Flow.tsx) и
   дублировались; здесь они собраны в одном месте с общим контрактом.

   Все иконки — штриховые на сетке 24×24, наследуют currentColor и размер
   задаётся пропом `size`: в макете интерфейсная графика везде линейная.
   Единственное исключение — ResetCanvasIcon, заливочная иконка прежнего
   интерфейса: её пользователь попросил оставить как была. */

import type { FC, SVGProps } from "react";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "children"> {
  /** Сторона квадрата иконки в px. */
  size?: number;
}

type Icon = FC<IconProps>;

const base = ({ size = 18, ...rest }: IconProps) => ({
  xmlns: "http://www.w3.org/2000/svg",
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
  focusable: false,
  ...rest,
});

/* ───────────────────────── Бренд ───────────────────────── */

/** Логотип: три узла, связанные рёбрами. */
export const LogoMark: Icon = (p) => (
  <svg {...base({ ...p, size: p.size ?? 26 })} strokeWidth={2}>
    <circle cx="6" cy="7" r="2.6" fill="currentColor" stroke="none" />
    <circle cx="18" cy="6" r="2" fill="currentColor" stroke="none" opacity="0.65" />
    <circle cx="7" cy="18" r="2" fill="currentColor" stroke="none" opacity="0.65" />
    <circle cx="17.5" cy="17" r="3" fill="currentColor" stroke="none" />
    <path d="M8.2 8.6 15 15.2M8.5 7.3 15.9 6.4M6.6 9.5 6.9 15.8" opacity="0.5" />
  </svg>
);

/* ─────────────────────── Верхняя шапка ─────────────────── */

export const SearchIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

export const ExportIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M12 3v12" />
    <path d="m8 11 4 4 4-4" />
    <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
  </svg>
);

export const HelpIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.2a2.6 2.6 0 1 1 3.2 2.5c-.5.2-.7.6-.7 1.1v.6" />
    <path d="M12 16.8h.01" strokeWidth={2.2} />
  </svg>
);

export const BellIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M18 9a6 6 0 1 0-12 0c0 4.2-1.5 5.5-1.5 5.5h15S18 13.2 18 9Z" />
    <path d="M10.3 18.5a2 2 0 0 0 3.4 0" />
  </svg>
);

export const ShareIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="18" cy="5" r="2.6" />
    <circle cx="6" cy="12" r="2.6" />
    <circle cx="18" cy="19" r="2.6" />
    <path d="m8.3 10.8 7.4-4.3M8.3 13.2l7.4 4.3" />
  </svg>
);

export const ImageIcon: Icon = (p) => (
  <svg {...base(p)}>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.6" />
    <path d="m4 17 4.5-4.2a2 2 0 0 1 2.7 0L20 19.3" />
  </svg>
);

export const FileJsonIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
    <path d="M14 3v5h5" />
    <path d="M10.5 12.5c-.9 0-.9 1.3-.9 2s0 2-.9 2c.9 0 .9 1.3.9 2s0 2 .9 2" opacity="0.8" />
  </svg>
);

/* ──────────────────── Левая вертикальная панель ─────────── */

export const PlusIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

/** Связанные точки — основной режим работы с графом. */
export const GraphIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="5" r="2.4" />
    <circle cx="5.5" cy="18" r="2.4" />
    <circle cx="18.5" cy="18" r="2.4" />
    <path d="M10.6 7 6.9 15.8M13.4 7l3.7 8.8M8 18h8" />
  </svg>
);

export const DatabaseIcon: Icon = (p) => (
  <svg {...base(p)}>
    <ellipse cx="12" cy="6" rx="7.5" ry="3" />
    <path d="M4.5 6v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6" />
    <path d="M4.5 12v6c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3v-6" />
  </svg>
);

export const BookmarkIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M6.5 4.5h11a1 1 0 0 1 1 1v14.2a.5.5 0 0 1-.77.42L12 16.2l-5.73 3.92a.5.5 0 0 1-.77-.42V5.5a1 1 0 0 1 1-1Z" />
  </svg>
);

export const ClockIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 1.8" />
  </svg>
);

/* ───────────────── Панель над холстом ──────────────────── */

/** Название графа: производственная площадка. */
export const PlantIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M3 20h18" />
    <path d="M4.5 20V11l4.5 3V11l4.5 3V7.5L19.5 5v15" />
    <path d="M7.5 17h1.5M12 17h1.5M16.5 17H18" opacity="0.7" />
  </svg>
);

export const FilterIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M4 5.5h16l-6.2 7.3v5.4l-3.6 2v-7.4Z" />
  </svg>
);

export const FocusIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const IndustryDataIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M5 19V13M10 19V7M15 19v-4M20 19V10" />
  </svg>
);

/** Альтернативные маршруты: ветвление пути. */
export const BranchIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="6.5" cy="6" r="2.2" />
    <circle cx="6.5" cy="18" r="2.2" />
    <circle cx="17.5" cy="12" r="2.2" />
    <path d="M6.5 8.2v7.6M8.6 6.7c4 .6 5.4 2.4 6.6 4.5M8.6 17.3c4-.6 5.4-2.4 6.6-4.5" />
  </svg>
);

export const TrashIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M4.5 6.5h15M9.5 6.5V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v1.5" />
    <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4l.9-12.5" />
    <path d="M10.5 10v6.5M13.5 10v6.5" opacity="0.7" />
  </svg>
);

/**
 * Очистка полотна — прежняя иконка проекта: круг со стрелкой «начать заново».
 * Рисуется заливкой, поэтому не использует общий контурный base().
 */
export const ResetCanvasIcon: Icon = ({ size = 20, className, ...rest }) => (
  <svg
    {...rest}
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    width={size}
    height={size}
    viewBox="0 0 1920 1920"
    fill="currentColor"
    aria-hidden="true"
    focusable="false"
  >
    <path
      d="M960 0v112.941c467.125 0 847.059 379.934 847.059 847.059 0 467.125-379.934 847.059-847.059 847.059-467.125 0-847.059-379.934-847.059-847.059 0-267.106 126.607-515.915 338.824-675.727v393.374h112.94V112.941H0v112.941h342.89C127.058 407.38 0 674.711 0 960c0 529.355 430.645 960 960 960s960-430.645 960-960S1489.355 0 960 0"
      fillRule="evenodd"
    />
  </svg>
);

/* ───────────────── Правый рельс холста ─────────────────── */

export const CursorIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M5.5 3.6 19 11.2l-5.7 1.4-2.6 5.4Z" />
  </svg>
);

export const HandIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M9 11V5.8a1.4 1.4 0 0 1 2.8 0V11" />
    <path d="M11.8 10.6V4.6a1.4 1.4 0 0 1 2.8 0v6" />
    <path d="M14.6 10.8V6.8a1.4 1.4 0 0 1 2.8 0V14c0 3.6-2.3 6.4-5.6 6.4-3.1 0-4.6-1.7-5.7-3.9l-1.5-3a1.4 1.4 0 0 1 2.3-1.6L9 14.2V11" />
  </svg>
);

export const MarqueeIcon: Icon = (p) => (
  <svg {...base(p)} strokeDasharray="3 2.6">
    <rect x="4" y="4" width="16" height="16" rx="2.5" />
  </svg>
);

export const ZoomInIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M12 5.5v13M5.5 12h13" />
  </svg>
);

export const ZoomOutIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M5.5 12h13" />
  </svg>
);

export const FitViewIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </svg>
);

export const SaveIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M5 4.5h10.2L19.5 8.8V18a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 18V6A1.5 1.5 0 0 1 5 4.5Z" />
    <path d="M7.5 4.5v4.2h7V4.5M7.5 19.5v-5h9v5" />
  </svg>
);

export const AddNodeIcon: Icon = (p) => (
  <svg {...base(p)}>
    <rect x="3.5" y="5" width="17" height="14" rx="3" />
    <path d="M12 9v6M9 12h6" strokeWidth={2} />
  </svg>
);

/* ──────────────────── Нижняя строка ────────────────────── */

export const NodesCountIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="m12 3.5 8 4-8 4-8-4Z" />
    <path d="m4 12 8 4 8-4M4 16.5l8 4 8-4" opacity="0.65" />
  </svg>
);

export const LinkIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M10 13.8a4 4 0 0 0 5.7 0l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.4 1.4" />
    <path d="M14 10.2a4 4 0 0 0-5.7 0l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.4-1.4" />
  </svg>
);

export const ChainLengthIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="6" cy="6" r="2.2" />
    <circle cx="6" cy="18" r="2.2" />
    <circle cx="18" cy="12" r="2.2" />
    <path d="M8 7.2 15.9 11M8 16.8 15.9 13" />
  </svg>
);

export const ShieldCheckIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M12 3.5 19 6v5.6c0 4-2.9 7.5-7 8.9-4.1-1.4-7-4.9-7-8.9V6Z" />
    <path d="m9 12 2.2 2.2L15.2 10" />
  </svg>
);

/* ───────────────────────── Общее ───────────────────────── */

export const ChevronDownIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="m6 9.5 6 6 6-6" />
  </svg>
);

export const ChevronRightIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="m9.5 6 6 6-6 6" />
  </svg>
);

export const ChevronUpIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="m6 14.5 6-6 6 6" />
  </svg>
);

export const CloseIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const FlaskIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M9.5 3.5v6L4.8 17.8A1.8 1.8 0 0 0 6.4 20.5h11.2a1.8 1.8 0 0 0 1.6-2.7L14.5 9.5v-6" />
    <path d="M8.5 3.5h7M7.4 14.5h9.2" opacity="0.75" />
  </svg>
);

export const GearIcon: Icon = (p) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.55V20.5a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1.03H3.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.62 4.6V3.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08a1.7 1.7 0 0 0 1.55 1.03h1.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.55 1.03Z" />
  </svg>
);

export const PencilIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M4 20h4.2L19.6 8.6a2 2 0 0 0 0-2.8l-1.4-1.4a2 2 0 0 0-2.8 0L4 15.8Z" />
    <path d="m14.5 6.5 3 3" opacity="0.7" />
  </svg>
);

export const BookIcon: Icon = (p) => (
  <svg {...base(p)}>
    <path d="M4 5a1.5 1.5 0 0 1 1.5-1.5H10A2.5 2.5 0 0 1 12 5v14a2 2 0 0 0-1.6-1.5H5.5A1.5 1.5 0 0 1 4 16Z" />
    <path d="M20 5a1.5 1.5 0 0 0-1.5-1.5H14A2.5 2.5 0 0 0 12 5v14a2 2 0 0 1 1.6-1.5h4.9A1.5 1.5 0 0 0 20 16Z" />
  </svg>
);

export const ArrowUpIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M12 19V5M6 11l6-6 6 6" />
  </svg>
);

export const ArrowDownIcon: Icon = (p) => (
  <svg {...base(p)} strokeWidth={2}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </svg>
);
