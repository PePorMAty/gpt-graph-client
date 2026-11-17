// src/components/product-codes/ProductCodesModal.tsx
//
// «Определение кодов», второй шаг: какие коды определить, каким промптом — и
// ход по каждому продукту.
//
// Коды определяет модель по файлам классификаторов ОКПД2 и ТН ВЭД (сервер:
// routes/industry/codes.js). Продукты идут по одному запросу на продукт, по
// два сразу: так виден ход, а найденное по первым продуктам сохраняется,
// даже если окно закрыли посреди. Найденное сервер сохраняет, и в карточке
// («Промышленное знание») оно появляется сразу и дальше приходит само.

import { useEffect, useMemo, useRef, useState, type FC } from "react";

import { useStore } from "react-redux";

import { useAppDispatch } from "../../store/hooks";
import type { RootState } from "../../store/store";
import { updateNodeData } from "../../store/slices/gptSlice";
import { checkIndustry, setModelCodes } from "../../store/slices/industrySlice";
import {
  determineProductCodes,
  fetchCodePrompts,
  ProductCodesUnsupported,
  type ProductCodeKind,
  type ProductCodeResult,
  type ModelCodes,
  type ProductCodesResponse,
} from "../../store/api/product-codes-api";
import { plural } from "../../utils/plural";
import { contextSummary, type ProductContext } from "../../utils/productContext";
import { showToast } from "../toast/toastStore";
import { BarcodeIcon, ChevronDownIcon, ChevronRightIcon, CloseIcon, FlaskIcon, InfoIcon, PencilIcon } from "../icons";
import css from "./ProductCodes.module.css";

export interface CodesProduct {
  id: string;
  label: string;
  description?: string;
  /** Коды, что сейчас в карточке: подсказка серверу, где искать. */
  current?: Partial<Record<ProductCodeKind, string>>;
  /** По графу: во что продукт идёт и из чего его делают. */
  usedFor?: string[];
  madeFrom?: string[];
  /** Контекст из графа: описание, процессы рядом, путь до изделия. */
  context?: ProductContext;
}

interface Props {
  products: CodesProduct[];
  onRemove: (id: string) => void;
  /** Назад к выбору на полотне. */
  onChangeSelection: () => void;
  onClose: () => void;
}

const KINDS: { kind: ProductCodeKind; name: string; desc: string }[] = [
  { kind: "okpd2", name: "ОКПД 2", desc: "Общероссийский классификатор продукции по видам экономической деятельности" },
  { kind: "tnved", name: "ТН ВЭД", desc: "Товарная номенклатура внешнеэкономической деятельности ЕАЭС" },
];
const KIND_NAME: Record<ProductCodeKind, string> = { okpd2: "ОКПД 2", tnved: "ТН ВЭД" };

/** Свой текст промпта — до перезагрузки страницы, как правка промпта шага. */
let customPrompts: Partial<Record<ProductCodeKind, string>> = {};

type Item =
  | { state: "queued" }
  | { state: "running" }
  | { state: "done"; result: ProductCodesResponse }
  | { state: "error"; error: string };

const CONCURRENCY = 2;

const shorten = (t: string, max = 60) => (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t);

/** Строка итога по одному виду кода. */
const CodeRow: FC<{ kind: ProductCodeKind; r?: ProductCodeResult }> = ({ kind, r }) =>
  r ? (
    <div className={css.codeRow}>
      <span className={css.codeKind}>{KIND_NAME[kind]}</span>
      {r.status === "found" ? (
        <>
          <span className={css.code}>{r.display ?? r.code}</span>
          <span>{r.name}</span>
          <span className={css.codeOk}>определён</span>
        </>
      ) : (
        <span className={css.codeNone} title={r.subgroupName ?? r.reason}>
          не определён{r.subgroup ? ` (подгруппа ${r.subgroup}${r.subgroupName ? ` «${shorten(r.subgroupName)}»` : ""})` : ""}:{" "}
          {r.missing ?? r.reason}
          {r.missing ? " — уточните название продукта" : ""}
        </span>
      )}
    </div>
  ) : null;

export const ProductCodesModal: FC<Props> = ({ products, onRemove, onChangeSelection, onClose }) => {
  const dispatch = useAppDispatch();
  const store = useStore<RootState>();
  const [kinds, setKinds] = useState<Set<ProductCodeKind>>(() => new Set(["okpd2", "tnved"]));
  const [defaults, setDefaults] = useState<Record<ProductCodeKind, string> | null | undefined>(undefined);
  const [custom, setCustom] = useState(customPrompts);
  const [editing, setEditing] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tab, setTab] = useState<ProductCodeKind>("okpd2");
  const [items, setItems] = useState<Record<string, Item>>({});
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [fatal, setFatal] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchCodePrompts().then((p) => alive && setDefaults(p));
    return () => {
      alive = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    customPrompts = custom;
  }, [custom]);

  const chosenKinds = KINDS.map((k) => k.kind).filter((k) => kinds.has(k));
  const editedKinds = chosenKinds.filter((k) => custom[k] !== undefined && custom[k] !== defaults?.[k]);
  const promptOf = (k: ProductCodeKind) => custom[k] ?? defaults?.[k] ?? "";

  const done = useMemo(() => Object.values(items).filter((i) => i.state === "done" || i.state === "error").length, [items]);
  const requests = useMemo(
    () => Object.values(items).reduce((n, i) => n + (i.state === "done" ? i.result.requests : 0), 0),
    [items],
  );

  const toggleKind = (k: ProductCodeKind) =>
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const run = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setFatal(null);
    setPhase("running");
    setItems(Object.fromEntries(products.map((p) => [p.id, { state: "queued" } as Item])));
    const prompts = Object.fromEntries(editedKinds.map((k) => [k, custom[k]!]));
    const queue = [...products];
    let found = 0;
    let total = 0;
    let stop = false;

    const worker = async () => {
      for (let p = queue.shift(); p && !stop && !controller.signal.aborted; p = queue.shift()) {
        const product = p;
        setItems((prev) => ({ ...prev, [product.id]: { state: "running" } }));
        try {
          const result = await determineProductCodes(
            {
              name: product.label,
              description: product.description,
              kinds: chosenKinds,
              current: product.current,
              ...(product.usedFor?.length ? { usedFor: product.usedFor } : {}),
              ...(product.madeFrom?.length ? { madeFrom: product.madeFrom } : {}),
              ...(product.context ? { context: product.context } : {}),
              ...(Object.keys(prompts).length ? { prompts } : {}),
            },
            controller.signal,
          );
          total += result.requests;
          // Коды — на сам узел: они сохраняются с графом, а у общих
          // названий («Двигатель») только там и живут. Не нашлось — прежний
          // код этого вида с узла снимаем: его переспросили.
          const node = store.getState().graph.data.nodes.find((n) => n.id === product.id);
          const next: ModelCodes = { ...(node?.data?.modelCodes ?? {}) };
          for (const k of chosenKinds) {
            const code = result.saved[k];
            if (code) next[k] = code;
            else delete next[k];
          }
          dispatch(
            updateNodeData({
              nodeId: product.id,
              data: { modelCodes: next.okpd2 || next.tnved ? next : undefined },
            }),
          );
          if (Object.keys(result.saved).length) {
            found++;
            // Записаны по названию — в сведения о продукте сразу (их видят
            // одноимённые узлы); сведений ещё нет — проверка их принесёт:
            // сервер отдаёт сохранённые коды с ней.
            if (result.shared !== false) {
              dispatch(setModelCodes({ name: product.label, codes: result.saved }));
              void dispatch(checkIndustry([product.label]));
            }
          }
          setItems((prev) => ({ ...prev, [product.id]: { state: "done", result } }));
        } catch (e) {
          if (controller.signal.aborted) return;
          if (e instanceof ProductCodesUnsupported) {
            stop = true;
            setFatal(e.message);
          }
          setItems((prev) => ({
            ...prev,
            [product.id]: { state: "error", error: e instanceof Error ? e.message : String(e) },
          }));
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, products.length) }, worker));
    if (controller.signal.aborted) return;
    setPhase("done");
    if (found) {
      showToast(
        "success",
        "Коды сохранены в промышленном знании",
        `Определены для ${found} ${plural(found, "продукта", "продуктов", "продуктов")} из ${products.length}; запросов к модели — ${total}.`,
      );
    }
  };

  const stopRun = () => {
    abortRef.current?.abort();
    setPhase("done");
  };

  const running = phase === "running";

  return (
    <div className={css.overlay} onClick={running ? undefined : onClose}>
      <div className={css.window} role="dialog" aria-modal="true" aria-label="Определить коды для продуктов" onClick={(e) => e.stopPropagation()}>
        <header className={css.head}>
          <span className={css.headIcon}>
            <BarcodeIcon size={20} />
          </span>
          <h3 className={css.title}>Определить коды для продуктов</h3>
          <button type="button" className={css.iconBtn} onClick={running ? stopRun : onClose} aria-label="Закрыть">
            <CloseIcon size={18} />
          </button>
        </header>

        {phase === "idle" ? (
          <>
            <section className={css.section}>
              <div className={css.sectionHead}>
                <h4 className={css.sectionTitle}>Выбранные продукты ({products.length})</h4>
                <button type="button" className={css.linkBtn} onClick={onChangeSelection}>
                  <PencilIcon size={13} /> Изменить выбор
                </button>
              </div>
              <ul className={css.chips}>
                {products.map((p) => (
                  <li key={p.id} className={css.chip}>
                    <FlaskIcon size={14} />
                    {p.label}
                    <button type="button" className={css.chipX} onClick={() => onRemove(p.id)} aria-label={`Убрать «${p.label}»`}>
                      <CloseIcon size={12} />
                    </button>
                  </li>
                ))}
              </ul>
              {products.some((p) => p.context) && (
                <p className={css.muted}>
                  Кроме названия модель увидит, что о продукте известно по
                  графу (
                  {products
                    .filter((p) => p.context)
                    .slice(0, 3)
                    .map((p) => `${p.label}: ${contextSummary(p.context ?? null)}`)
                    .join("; ")}
                  ): по одному названию не понять, гранулы это или волокно и
                  для какого изделия деталь.
                </p>
              )}
            </section>

            <section className={css.section}>
              <h4 className={css.sectionTitle}>Какие коды определить</h4>
              <div className={css.kinds}>
                {KINDS.map(({ kind, name, desc }) => (
                  <label key={kind} className={`${css.kind} ${kinds.has(kind) ? css.kindOn : ""}`}>
                    <input type="checkbox" checked={kinds.has(kind)} onChange={() => toggleKind(kind)} />
                    <span>
                      <span className={css.kindName}>{name}</span>
                      <span className={css.kindDesc}>{desc}</span>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <section className={css.section}>
              <div className={css.sectionHead}>
                <h4 className={css.sectionTitle}>Настройка запроса</h4>
                {defaults && (
                  <button
                    type="button"
                    className={css.linkBtn}
                    onClick={() => {
                      setEditing((v) => !v);
                      if (!kinds.has(tab)) setTab(chosenKinds[0] ?? "okpd2");
                    }}
                  >
                    <PencilIcon size={13} /> {editing ? "Свернуть промпт" : "Редактировать промпт"}
                  </button>
                )}
              </div>
              {!editing ? (
                <div className={css.prompt}>
                  <button type="button" className={css.promptHead} onClick={() => setPreviewOpen((v) => !v)} aria-expanded={previewOpen}>
                    <span className={css.promptName}>
                      {editedKinds.length ? `Свой промпт: ${editedKinds.map((k) => KIND_NAME[k]).join(", ")}` : "Промпт по умолчанию"}
                    </span>
                    {previewOpen ? <ChevronDownIcon size={14} /> : <ChevronRightIcon size={14} />}
                  </button>
                  <p className={css.promptPreview}>
                    {defaults === undefined
                      ? "Загружаем текст промпта…"
                      : defaults === null
                        ? "Текст промпта хранится на сервере; посмотреть и поправить его можно, когда сервер обновлён."
                        : previewOpen
                          ? promptOf(chosenKinds[0] ?? "okpd2")
                          : "Сервер находит в файле классификатора подгруппу товара и все коды в ней, а модель выбирает из них конечный код — только из файла, без выдумывания. Код сверяется с файлом."}
                  </p>
                </div>
              ) : (
                <div className={css.prompt}>
                  <div className={css.promptTabs}>
                    {chosenKinds.map((k) => (
                      <button key={k} type="button" className={`${css.tab} ${tab === k ? css.tabOn : ""}`} onClick={() => setTab(k)}>
                        {KIND_NAME[k]}
                        {editedKinds.includes(k) ? " · свой" : ""}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className={css.textarea}
                    value={promptOf(tab)}
                    onChange={(e) => setCustom((c) => ({ ...c, [tab]: e.target.value }))}
                    aria-label={`Промпт ${KIND_NAME[tab]}`}
                  />
                  <p className={css.promptPreview}>
                    Подстановки заполняет сервер: {"<<<PRODUCT>>>"} — название, {"<<<DESCRIPTION>>>"} — описание продукта,{" "}
                    {"<<<SUBGROUP>>>"} — подгруппа, {"<<<FRAGMENT>>>"} — фрагмент файла классификатора (без неё он
                    допишется в конец).
                  </p>
                  {editedKinds.includes(tab) && (
                    <button
                      type="button"
                      className={css.linkBtn}
                      onClick={() =>
                        setCustom((c) => {
                          const next = { ...c };
                          delete next[tab];
                          return next;
                        })
                      }
                    >
                      Вернуть промпт по умолчанию
                    </button>
                  )}
                </div>
              )}
              <p className={css.info}>
                <InfoIcon size={16} className={css.infoIcon} />
                <span>
                  Найденные коды будут добавлены в раздел «Промышленное знание» выбранных продуктов и
                  сохранены: дальше они приходят сами — для этих продуктов на любом графе. Запросов к
                  модели — 1–3 на продукт и вид кода.
                </span>
              </p>
            </section>

            <div className={css.actions}>
              <button type="button" className={css.secondary} onClick={onClose}>
                Отмена
              </button>
              <button type="button" className={css.primary} onClick={() => void run()} disabled={!products.length || !chosenKinds.length}>
                Получить коды
              </button>
            </div>
          </>
        ) : (
          <>
            <section className={css.section}>
              <div className={css.sectionHead}>
                <h4 className={css.sectionTitle}>
                  {running
                    ? `Определяем коды: ${done} из ${products.length}`
                    : `Готово: ${done} из ${products.length}`}
                </h4>
                {running && <span className={css.spinner} aria-hidden />}
              </div>
              {fatal && <p className={css.error}>{fatal}</p>}
              <ul className={css.results}>
                {products.map((p) => {
                  const it = items[p.id];
                  return (
                    <li key={p.id} className={css.result}>
                      <div className={css.resultHead}>
                        <FlaskIcon size={14} />
                        {p.label}
                        <span className={css.resultState}>
                          {!it || it.state === "queued"
                            ? running
                              ? "в очереди"
                              : "не запускался"
                            : it.state === "running"
                              ? "определяем…"
                              : it.state === "error"
                                ? ""
                                : !Object.keys(it.result.saved).length
                                  ? "кодов не нашлось"
                                  : it.result.shared === false
                                    ? "сохранено на узле"
                                    : "сохранено"}
                        </span>
                      </div>
                      {it?.state === "done" && chosenKinds.map((k) => <CodeRow key={k} kind={k} r={it.result[k]} />)}
                      {it?.state === "done" && it.result.shared === false && (
                        <span className={css.note}>
                          Название общее: код зависит от изделия, поэтому записан только на этот узел и на
                          одноимённые узлы других графов не перейдёт. Чтобы переходил — уточните название,
                          например «{p.label} ({p.usedFor?.[0] ?? "Автомобиль"})».
                        </span>
                      )}
                      {it?.state === "error" && <span className={css.error}>Ошибка: {it.error}</span>}
                    </li>
                  );
                })}
              </ul>
              {requests > 0 && <p className={css.muted}>Запросов к модели: {requests}.</p>}
            </section>
            <div className={css.actions}>
              {running ? (
                <button type="button" className={css.secondary} onClick={stopRun}>
                  Остановить
                </button>
              ) : (
                <button type="button" className={css.secondary} onClick={() => setPhase("idle")}>
                  Определить ещё раз
                </button>
              )}
              <button type="button" className={css.primary} onClick={onClose} disabled={running}>
                Готово
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
