import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { CustomNode } from "../../types";
import { useAppSelector } from "../../store/hooks";
import { useGraphSearch } from "../../hooks/useGraphSearch";
import { useFocusNode } from "../../hooks/useFocusNode";
import { useDismiss } from "../../hooks/useDismiss";
import { SearchIcon, CloseIcon, ChevronRightIcon } from "../icons";
import styles from "./GraphSearchBox.module.css";

const NODE_KIND: Record<string, string> = {
  product: "Продукт",
  transformation: "Преобразование",
};

/**
 * Поиск по текущему графу в шапке. Результаты выпадают под строкой; выбор
 * центрирует камеру на узле и подсвечивает его (событие `highlight-node`,
 * которое слушает Flow).
 *
 * Фокус в строку ставится и с клавиатуры — ⌘K / Ctrl+K.
 */
export const GraphSearchBox = () => {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const results = useGraphSearch(nodes, value, 200);
  const focusNode = useFocusNode();

  const close = useCallback(() => setOpen(false), []);
  useDismiss(boxRef, close, open);

  // Сброс активной строки, когда набор результатов изменился.
  useEffect(() => setActiveIndex(0), [results]);

  // ⌘K / Ctrl+K — фокус в строку поиска из любого места приложения.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const selectNode = useCallback(
    (node: CustomNode) => {
      // Узел не только оказывается в центре, но и выделяется — как будто по
      // нему кликнули: иначе на плотном графе не видно, который нашёлся.
      focusNode(node.id);
      setOpen(false);
      inputRef.current?.blur();
    },
    [focusNode],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const node = results[activeIndex];
      if (node) selectNode(node);
    }
  };

  const hasQuery = value.trim().length > 0;
  const showDropdown = open && hasQuery;

  const emptyText = useMemo(
    () => (nodes.length ? "Ничего не найдено" : "На полотне пока нет узлов"),
    [nodes.length],
  );

  return (
    <div className={styles.box} ref={boxRef}>
      <div className={`${styles.field} ${showDropdown ? styles.fieldOpen : ""}`}>
        <SearchIcon size={16} className={styles.fieldIcon} />
        <input
          ref={inputRef}
          className={styles.input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Поиск по узлам, технологиям, веществам…"
          aria-label="Поиск по графу"
        />
        {hasQuery && (
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              setValue("");
              inputRef.current?.focus();
            }}
            aria-label="Очистить поиск"
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className={styles.dropdown} role="listbox">
          <div className={styles.dropdownHead}>
            <span>Результаты поиска по графу</span>
            <span className={styles.foundCount}>Найдено: {results.length}</span>
          </div>

          {results.length === 0 ? (
            <div className={styles.empty}>{emptyText}</div>
          ) : (
            <ul className={styles.results}>
              {results.map((node, i) => (
                <li key={node.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    className={`${styles.result} ${
                      i === activeIndex ? styles.resultActive : ""
                    }`}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => selectNode(node)}
                  >
                    <span className={styles.resultText}>
                      <span className={styles.resultLabel}>
                        {node.data.label}
                      </span>
                      <span className={styles.resultKind}>
                        {NODE_KIND[node.type ?? ""] ?? "Узел"}
                      </span>
                    </span>
                    <ChevronRightIcon size={14} className={styles.resultArrow} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};
