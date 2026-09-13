import { useEffect, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  getGraphData,
  getPromptLayoutFromServer,
} from "../../store/api/graph-api";
import { addNode, setGraphName } from "../../store/slices/gptSlice";
import { clearOpenedGraph } from "../../store/slices/savedGraphSlice";
import { AiModelSelect } from "../ai-model-select";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { ChevronDownIcon } from "../icons";
import styles from "./CreateGraphModal.module.css";

type Mode = "prompt" | "manual";

interface CreateGraphModalProps {
  open: boolean;
  onClose: () => void;
  /** Вписать полотно в экран после создания графа. */
  onCreated?: () => void;
}

/**
 * Окно создания графа — точка входа из левого рельса.
 *
 * Два пути. «По запросу» — прежний поток из нижней панели: шаблон промта плюс
 * описание продукта уходят на сервер, оттуда приходит готовый граф. «Вручную» —
 * на полотно кладётся один продуктовый узел без обращения к модели; дальше
 * граф достраивается по шагам из карточки узла. В обоих случаях введённый
 * текст становится названием графа в панели над холстом.
 */
export const CreateGraphModal = ({
  open,
  onClose,
  onCreated,
}: CreateGraphModalProps) => {
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector((s) => s.graph.isLoading);
  const hasNodes = useAppSelector((s) => s.graph.data.nodes.length > 0);

  const [mode, setMode] = useState<Mode>("prompt");
  const [prompt, setPrompt] = useState("");
  const [manualName, setManualName] = useState("");
  const [promptLayout, setPromptLayout] = useState("");
  const [layoutOpen, setLayoutOpen] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Шаблон промта приходит с сервера один раз при первом открытии окна.
  const layoutLoaded = useRef(false);
  useEffect(() => {
    if (!open || layoutLoaded.current) return;
    layoutLoaded.current = true;
    getPromptLayoutFromServer()
      .then(setPromptLayout)
      .catch((err) => console.error("Ошибка загрузки шаблона промта:", err));
  }, [open]);

  // Автовысота textarea под содержимое шаблона.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !layoutOpen) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [promptLayout, layoutOpen]);

  const submitPrompt = () => {
    const value = prompt.trim();
    if (!value || isLoading) return;
    dispatch(getGraphData({ promptValue: value, promptLayout }));
    onClose();
  };

  const submitManual = () => {
    const name = manualName.trim();
    if (!name) return;
    // Новый граф с нуля: привязку к сохранённому файлу снимаем, иначе
    // «Сохранить» перезаписал бы чужой граф.
    dispatch(clearOpenedGraph());
    dispatch(setGraphName(name));
    dispatch(addNode({ type: "product", label: name, position: { x: 0, y: 0 } }));
    onClose();
    onCreated?.();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Создание графа"
      subtitle="Построить цепочку по запросу или начать с одного продукта"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          {mode === "prompt" ? (
            <Button
              variant="primary"
              onClick={submitPrompt}
              disabled={!prompt.trim() || isLoading}
            >
              {isLoading ? "Создание…" : "Создать граф"}
            </Button>
          ) : (
            <Button
              variant="primary"
              onClick={submitManual}
              disabled={!manualName.trim()}
            >
              Создать продукт
            </Button>
          )}
        </>
      }
    >
      <div className={styles.modes}>
        <button
          type="button"
          className={`${styles.mode} ${mode === "prompt" ? styles.modeActive : ""}`}
          onClick={() => setMode("prompt")}
        >
          <span className={styles.modeTitle}>По запросу</span>
          <span className={styles.modeHint}>
            Модель строит цепочку целиком по описанию продукта или процесса
          </span>
        </button>
        <button
          type="button"
          className={`${styles.mode} ${mode === "manual" ? styles.modeActive : ""}`}
          onClick={() => setMode("manual")}
        >
          <span className={styles.modeTitle}>Вручную</span>
          <span className={styles.modeHint}>
            Один продукт на пустом полотне, дальше — по шагам
          </span>
        </button>
      </div>

      {hasNodes && (
        <div className={styles.warning}>
          На полотне уже есть граф. Создание нового добавит узлы к текущему —
          при необходимости сначала очистите полотно.
        </div>
      )}

      {mode === "prompt" ? (
        <div className={styles.form}>
          <label className={styles.label} htmlFor="create-graph-prompt">
            Описание продукта или процесса
          </label>
          <input
            id="create-graph-prompt"
            className={styles.input}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitPrompt()}
            placeholder="Например: производство полипропилена"
            disabled={isLoading}
            autoFocus
          />
          <div className={styles.hint}>
            Этот текст станет названием графа в панели над холстом.
          </div>

          <AiModelSelect stage="graph" />

          <button
            type="button"
            className={styles.accordion}
            onClick={() => setLayoutOpen((v) => !v)}
            aria-expanded={layoutOpen}
          >
            <ChevronDownIcon
              size={15}
              className={`${styles.accordionCaret} ${
                layoutOpen ? styles.accordionCaretOpen : ""
              }`}
            />
            Шаблон промта
          </button>

          {layoutOpen && (
            <>
              <textarea
                ref={textareaRef}
                className={styles.textarea}
                value={promptLayout}
                onChange={(e) => setPromptLayout(e.target.value)}
                placeholder="Введите или измените шаблон промта…"
                disabled={isLoading}
              />
              <Button size="s" onClick={() => setPromptLayout("")}>
                Сбросить шаблон
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className={styles.form}>
          <label className={styles.label} htmlFor="create-graph-manual">
            Название первого продукта
          </label>
          <input
            id="create-graph-manual"
            className={styles.input}
            value={manualName}
            onChange={(e) => setManualName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitManual()}
            placeholder="Например: Изобутилен"
            autoFocus
          />
          <div className={styles.hint}>
            Узел появится на пустом полотне без запроса к модели. Названием
            графа станет то же слово — его можно будет поменять позже.
          </div>
        </div>
      )}
    </Modal>
  );
};
