import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import type { CustomNode } from "../../types";
import { useAppDispatch, useAppSelector } from "../../store/hooks";
import { checkIndustry, industryKey } from "../../store/slices/industrySlice";
import { useGraphSearch } from "../../hooks/useGraphSearch";
import {
  NODE_CODE_LABEL,
  NODE_CODE_SOURCE_LABEL,
  nodeCodes,
  parseCodeQuery,
} from "../../utils/nodeCodes";
import { useFocusNode } from "../../hooks/useFocusNode";
import { useDismiss } from "../../hooks/useDismiss";
import { SearchIcon, CloseIcon, ChevronRightIcon } from "../icons";
import styles from "./GraphSearchBox.module.css";

const NODE_KIND: Record<string, string> = {
  product: "Продукт",
  transformation: "Преобразование",
};

/**
 * Поиск по текущему графу в шапке — по названию узла и по коду продукта:
 * CAS («71-43-2»), ОКПД2 («20.14.12»), ТН ВЭД («2902 20»). Коды — те же, что
 * в карточке продукта (utils/nodeCodes.ts); у найденного по коду — какой код
 * совпал. Результаты выпадают под строкой; выбор центрирует камеру на узле и
 * подсвечивает его (событие `highlight-node`, которое слушает Flow).
 *
 * Фокус в строку ставится и с клавиатуры — ⌘K / Ctrl+K.
 */
export const GraphSearchBox = () => {
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dispatch = useAppDispatch();
  const nodes = useAppSelector((s) => s.graph.data.nodes);
  const industry = useAppSelector((s) => s.industry.results);
  const industryLoading = useAppSelector((s) => s.industry.status === "loading");
  const codesOf = useCallback(
    (n: CustomNode) =>
      n.type === "product"
        ? nodeCodes(n.data, industry[industryKey(String(n.data?.label ?? ""))])
        : [],
    [industry],
  );
  const results = useGraphSearch(nodes, value, 200, codesOf);
  const codeQuery = parseCodeQuery(value);

  // Набран код — а кодов продуктов ещё нет: их приносит проверка по реестру,
  // которую полотно делает при включённых «Промышленных данных». Выключены —
  // спросим сами; известные названия санк не переспрашивает.
  useEffect(() => {
    if (!codeQuery) return;
    const names = [
      ...new Set(
        nodes
          .filter((n) => n.type === "product")
          .map((n) => String(n.data?.label ?? "").trim())
          .filter(Boolean),
      ),
    ];
    if (names.some((n) => !industry[industryKey(n)])) void dispatch(checkIndustry(names));
    // Спрашиваем, когда набран код, — не на каждую букву.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeQuery?.kind, nodes, dispatch]);
  const focusNode = useFocusNode();
  const navigate = useNavigate();
  const location = useLocation();

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
      // Поиск идёт по графу на полотне, а строка живёт в шапке — искать можно
      // и из библиотеки. Найденный узел там не показать, поэтому сначала
      // возвращаемся на полотно, а потом ведём к нему камеру.
      if (location.pathname !== "/") navigate("/");
      // Узел не только оказывается в центре, но и выделяется — как будто по
      // нему кликнули: иначе на плотном графе не видно, который нашёлся.
      focusNode(node.id);
      setOpen(false);
      inputRef.current?.blur();
    },
    [focusNode, navigate, location.pathname],
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
      const hit = results[activeIndex];
      if (hit) selectNode(hit.node);
    }
  };

  const hasQuery = value.trim().length > 0;
  const showDropdown = open && hasQuery;

  const emptyText = useMemo(() => {
    if (!nodes.length) return "На полотне пока нет узлов";
    if (!codeQuery) return "Ничего не найдено";
    if (industryLoading) return "Загружаем коды продуктов…";
    return `Ни у одного продукта нет кода ${NODE_CODE_LABEL[codeQuery.kind]}, начинающегося с «${value.trim()}». Коды — те же, что в карточке продукта.`;
  }, [nodes.length, codeQuery, industryLoading, value]);

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
          placeholder="Поиск по названию или коду: CAS, ОКПД2, ТН ВЭД…"
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
              {results.map(({ node, code }, i) => (
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
                        {code && (
                          <>
                            {" · "}
                            <span className={styles.resultCode}>
                              {NODE_CODE_LABEL[code.kind]} {code.code}
                            </span>
                            {code.source !== "dictionary" && ` · ${NODE_CODE_SOURCE_LABEL[code.source]}`}
                          </>
                        )}
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
