import { useEffect, useMemo, useRef, useState } from "react";

import { useAppDispatch, useAppSelector } from "../../store/hooks";
import {
  getGraphData,
  getPromptLayoutFromServer,
} from "../../store/api/graph-api";
import { addNode, setGraphName } from "../../store/slices/gptSlice";
import { useSaveGraph } from "../../hooks/useSaveGraph";
import { graphSignature } from "../../utils/graphSignature";
import { clearCanvas } from "../../utils/clearCanvas";
import { requestFitView } from "../../utils/requestFitView";
import { AiModelSelect } from "../ai-model-select";
import { Button } from "../ui/Button";
import { ConfirmUnsavedModal } from "../ui/ConfirmUnsavedModal";
import { ChevronDownIcon } from "../icons";
import styles from "./CreateSection.module.css";

type Mode = "prompt" | "manual";

interface CreateSectionProps {
  /** Закрыть панель после создания графа. */
  onDone: () => void;
}

/**
 * Раздел «Создать граф» левого рельса.
 *
 * Два пути. «По запросу» — прежний поток из нижней панели: шаблон промта плюс
 * описание продукта уходят на сервер, оттуда приходит готовый граф. «Вручную» —
 * на полотно кладётся один продуктовый узел без обращения к модели; дальше
 * граф достраивается по шагам из карточки узла. В обоих случаях введённый
 * текст становится названием графа в панели над холстом.
 *
 * Новый граф затирает текущий, поэтому при несохранённых правках сначала
 * спрашиваем, сохранять ли их.
 */
export const CreateSection = ({ onDone }: CreateSectionProps) => {
  const dispatch = useAppDispatch();
  const isLoading = useAppSelector((s) => s.graph.isLoading);
  const { nodes, edges } = useAppSelector((s) => s.graph.data);
  const savedSignature = useAppSelector((s) => s.savedGraphs.savedSignature);
  const { saveNew, updateOpened, openedGraphId, defaultName } = useSaveGraph();

  const [mode, setMode] = useState<Mode>("prompt");
  const [prompt, setPrompt] = useState("");
  const [manualName, setManualName] = useState("");
  const [promptLayout, setPromptLayout] = useState("");
  const [layoutOpen, setLayoutOpen] = useState(false);
  // Запрошенное создание ждёт ответа на вопрос о несохранённых правках.
  const [pending, setPending] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const dirty = useMemo(
    () => nodes.length > 0 && graphSignature(nodes, edges) !== savedSignature,
    [nodes, edges, savedSignature],
  );

  // Шаблон промта приходит с сервера один раз при открытии раздела.
  useEffect(() => {
    getPromptLayoutFromServer()
      .then(setPromptLayout)
      .catch((err) => console.error("Ошибка загрузки шаблона промта:", err));
  }, []);

  // Автовысота textarea под содержимое шаблона.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || !layoutOpen) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [promptLayout, layoutOpen]);

  const createByPrompt = (value: string) => {
    clearCanvas(dispatch);
    dispatch(getGraphData({ promptValue: value, promptLayout }));
    onDone();
  };

  const createManually = (name: string) => {
    clearCanvas(dispatch);
    dispatch(setGraphName(name));
    dispatch(addNode({ type: "product", label: name, position: { x: 0, y: 0 } }));
    onDone();
    requestFitView();
  };

  /** Создание, отложенное до ответа на вопрос о несохранённых правках. */
  const run = (action: () => void) => {
    if (dirty) setPending(() => action);
    else action();
  };

  const submitPrompt = () => {
    const value = prompt.trim();
    if (!value || isLoading) return;
    run(() => createByPrompt(value));
  };

  const submitManual = () => {
    const name = manualName.trim();
    if (!name) return;
    run(() => createManually(name));
  };

  const saveThenCreate = async () => {
    setSaving(true);
    const ok = openedGraphId ? await updateOpened() : await saveNew(defaultName);
    setSaving(false);
    if (!ok) return; // ошибку показал тост — остаёмся в вопросе
    const action = pending;
    setPending(null);
    action?.();
  };

  const discardAndCreate = () => {
    const action = pending;
    setPending(null);
    action?.();
  };

  return (
    <div className={styles.section}>
      <div className={styles.scroll}>
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

        {nodes.length > 0 && (
          <div className={styles.warning}>
            Новый граф заменит текущий на полотне.
            {dirty && " Несохранённые изменения будут потеряны — спросим перед созданием."}
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
      </div>

      <div className={styles.footer}>
        {mode === "prompt" ? (
          <Button
            variant="primary"
            block
            onClick={submitPrompt}
            disabled={!prompt.trim() || isLoading}
          >
            {isLoading ? "Создание…" : "Создать граф"}
          </Button>
        ) : (
          <Button
            variant="primary"
            block
            onClick={submitManual}
            disabled={!manualName.trim()}
          >
            Создать продукт
          </Button>
        )}
      </div>

      <ConfirmUnsavedModal
        open={pending !== null}
        action="созданием нового графа"
        confirmLabel="Сохранить и создать"
        saving={saving}
        onCancel={() => setPending(null)}
        onDiscard={discardAndCreate}
        onSave={saveThenCreate}
      />
    </div>
  );
};
