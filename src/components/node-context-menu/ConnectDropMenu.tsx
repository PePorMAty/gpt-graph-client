import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FC,
} from "react";

import type { CustomNode } from "../../types";
import { useDismiss } from "../../hooks/useDismiss";
import { FlaskIcon, GearIcon, SearchIcon } from "../icons";
import styles from "./ConnectDropMenu.module.css";

const KIND: Record<string, string> = {
  product: "Продукт",
  transformation: "Преобразование",
};

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .trim();

/** Сколько найденных узлов показывать. */
const LIMIT = 8;

interface Props {
  x: number;
  y: number;
  /** Откуда тянули связь. */
  from: CustomNode;
  /**
   * Куда идёт связь: down — от нижней точки (к тому, что из узла получают),
   * up — от верхней (к тому, из чего его получают).
   */
  direction: "down" | "up";
  /** Узлы, с которыми можно связать. */
  nodes: CustomNode[];
  /** Уже связанные с from — показываются, но выбрать их нельзя. */
  linked: Set<string>;
  /** Без преобразований: режим «Только продукты». */
  productsOnly?: boolean;
  onPick: (nodeId: string) => void;
  onCreate: (type: "product" | "transformation", label: string) => void;
  onClose: () => void;
}

/**
 * Связь отпустили на пустом месте полотна: связать с узлом графа — найти его
 * по названию, хоть на другом конце полотна, — или создать новый узел с
 * набранным названием там, где отпустили.
 */
export const ConnectDropMenu: FC<Props> = ({
  x,
  y,
  from,
  direction,
  nodes,
  linked,
  productsOnly = false,
  onPick,
  onCreate,
  onClose,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const close = useCallback(() => onClose(), [onClose]);
  useDismiss(ref, close, true);

  useEffect(() => inputRef.current?.focus(), []);

  // Окно не должно вылезать за край экрана.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (x + rect.width > window.innerWidth)
      el.style.left = `${window.innerWidth - rect.width - 8}px`;
    if (y + rect.height > window.innerHeight)
      el.style.top = `${Math.max(8, window.innerHeight - rect.height - 8)}px`;
  }, [x, y, query]);

  const results = useMemo(() => {
    const q = norm(query);
    if (!q) return [];
    return nodes
      .filter((n) => n.id !== from.id && norm(n.data?.label).includes(q))
      .sort((a, b) => {
        const sa = norm(a.data?.label).startsWith(q) ? 0 : 1;
        const sb = norm(b.data?.label).startsWith(q) ? 0 : 1;
        return (
          sa - sb ||
          norm(a.data?.label).localeCompare(norm(b.data?.label), "ru")
        );
      })
      .slice(0, LIMIT);
  }, [nodes, query, from.id]);

  // Строки окна: найденные узлы, потом «создать».
  const label = query.trim();
  const creates: Array<"product" | "transformation"> = productsOnly
    ? ["product"]
    : ["product", "transformation"];
  const rows = [
    ...results.map((n) => ({
      kind: "node" as const,
      node: n,
      disabled: linked.has(n.id),
    })),
    ...creates.map((type) => ({
      kind: "create" as const,
      type,
      disabled: false,
    })),
  ];
  useEffect(() => setActive(0), [query]);

  const choose = (i: number) => {
    const row = rows[i];
    if (!row || row.disabled) return;
    if (row.kind === "node") onPick(row.node.id);
    else onCreate(row.type, label);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(active);
    }
  };

  const fromLabel = String(from.data?.label ?? "").trim() || "узел";
  return (
    <div
      ref={ref}
      className={styles.menu}
      style={{ top: y, left: x }}
      role="dialog"
      aria-label="Связать с узлом"
    >
      <div className={styles.head}>
        Связать «{fromLabel}»{" "}
        {direction === "down"
          ? "↓ с тем, что из него получают"
          : "↑ с тем, из чего его получают"}
      </div>
      <div className={styles.search}>
        <SearchIcon size={14} className={styles.searchIcon} />
        <input
          ref={inputRef}
          className={styles.input}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Найти узел графа по названию…"
          aria-label="Название узла"
        />
      </div>
      {query.trim() && !results.length && (
        <div className={styles.empty}>
          На графе такого нет — создайте новый узел.
        </div>
      )}
      <ul className={styles.list} role="listbox">
        {rows.map((row, i) => (
          <li
            key={row.kind === "node" ? row.node.id : `new-${row.type}`}
            role="option"
            aria-selected={i === active}
          >
            <button
              type="button"
              className={`${styles.row} ${i === active ? styles.rowActive : ""} ${row.kind === "create" && results.length > 0 && i === results.length ? styles.rowFirstCreate : ""}`}
              disabled={row.disabled}
              onMouseEnter={() => setActive(i)}
              onClick={() => choose(i)}
            >
              {row.kind === "node" ? (
                <>
                  <span className={styles.kind}>
                    {KIND[row.node.type ?? ""] ?? "Узел"}
                  </span>
                  <span className={styles.name}>
                    {String(row.node.data?.label ?? "")}
                  </span>
                  {row.disabled && (
                    <span className={styles.note}>уже связан</span>
                  )}
                </>
              ) : (
                <>
                  {row.type === "product" ? (
                    <FlaskIcon size={15} />
                  ) : (
                    <GearIcon size={15} />
                  )}
                  <span className={styles.name}>
                    {row.type === "product"
                      ? "Новый продукт"
                      : "Новое преобразование"}
                    {label ? ` «${label}»` : ""}
                  </span>
                </>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};
